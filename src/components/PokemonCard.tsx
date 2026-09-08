import type { Move, RosterEntry, StatKey } from "../types";
import { useStore } from "../store";
import {
  AP_MAX_EACH, AP_MAX_TOTAL, MAX_MOVES, NATURES, realStats,
  STAT_KEYS, STAT_LABEL,
} from "../data/game";
import { TypeBadges } from "./TypeBadge";
import { displayName, findDex } from "../data/roster";
import { MoveEditor, moveOptionsFor } from "./MoveEditor";
import { SelectMenu } from "./SelectMenu";
import { ApSlider } from "./ApSlider";
import { LockButton } from "./LockButton";

interface Props {
  entry: RosterEntry;
  starDisabled: boolean; // ★上限で新規に付けられない
  itemDuplicated: boolean; // ★内で持ち物重複
  collapsed: boolean; // 折りたたみ中は概要のみ表示
  onToggle: () => void;
}

export function PokemonCard({ entry, starDisabled, itemDuplicated, collapsed, onToggle }: Props) {
  const { updateEntry, removeEntry } = useStore();
  const form = entry.forms[entry.activeForm] ?? entry.forms[0];
  const real = realStats(form.base, entry.ap, entry.nature);
  const apTotal = STAT_KEYS.reduce((s, k) => s + entry.ap[k], 0);
  const apOver = apTotal > AP_MAX_TOTAL;
  const apRemaining = AP_MAX_TOTAL - apTotal;
  const maxFor = (k: StatKey) => Math.min(AP_MAX_EACH, entry.ap[k] + Math.max(0, apRemaining));
  // 特性の候補は図鑑（マスタ）から取る。個体側の ability は選ぶと1つに確定するので、
  // 個体側だけを見ていると2回目以降にドロップダウンが出せなくなる。
  const dexForms = findDex(entry.name)?.forms;
  const dexAbility = (dexForms?.find((f) => f.form === form.form) ?? dexForms?.[entry.activeForm])?.ability;
  const abilityOpts = (() => {
    const list = (dexAbility ?? form.ability).split("/").map((a) => a.trim()).filter(Boolean);
    const cur = form.ability.trim();
    // 手動で入れた特性・図鑑に無い特性も候補として残す
    if (cur && !cur.includes("/") && !list.includes(cur)) list.push(cur);
    return list;
  })();
  const { options, verified, status, source } = moveOptionsFor(entry.name);
  // 同じ技を2つ以上入れられないように、他の枠で使っている技名を持っておく
  const moveNameCount = entry.moves.reduce<Record<string, number>>((acc, m) => {
    const n = m.name.trim();
    if (n) acc[n] = (acc[n] ?? 0) + 1;
    return acc;
  }, {});
  const dupMoves = Object.keys(moveNameCount).filter((n) => moveNameCount[n] > 1);

  const setForm = (idx: number) => updateEntry(entry.key, { activeForm: idx });
  const setAbility = (v: string) =>
    updateEntry(entry.key, (en) => ({
      ...en,
      forms: en.forms.map((f, i) => (i === en.activeForm ? { ...f, ability: v } : f)),
    }));
  // 各32まで かつ 合計66まで。残りAPを超える入力は自動で頭打ちにする
  const setAP = (k: StatKey, v: number) =>
    updateEntry(entry.key, (e) => {
      const total = STAT_KEYS.reduce((s, kk) => s + e.ap[kk], 0);
      const remaining = AP_MAX_TOTAL - total;
      const max = Math.min(AP_MAX_EACH, e.ap[k] + Math.max(0, remaining));
      return { ...e, ap: { ...e.ap, [k]: Math.max(0, Math.min(max, v || 0)) } };
    });
  const setMove = (idx: number, m: Move | undefined) =>
    updateEntry(entry.key, (e) => {
      const moves = [...e.moves];
      if (m === undefined) moves.splice(idx, 1);
      else moves[idx] = m;
      return { ...e, moves };
    });
  const addMove = () =>
    updateEntry(entry.key, (e) => (e.moves.length >= MAX_MOVES ? e : { ...e, moves: [...e.moves, { name: "", type: "ノーマル", power: 0, cat: "変化" as const }] }));

  return (
    <div className={`card ${itemDuplicated ? "warn-item" : ""} ${collapsed ? "collapsed" : ""}`}>
      {/* ヘッダー行（名前部分をタップで開閉） */}
      <div className="row card-hd">
        <button
          className="star-btn"
          title={entry.starred ? "★手持ちから外す" : starDisabled ? "★は最大6体まで" : "★手持ちに入れる"}
          disabled={!entry.starred && starDisabled}
          style={{ color: entry.starred ? "var(--amber)" : "var(--dim)", opacity: !entry.starred && starDisabled ? 0.35 : 1 }}
          onClick={() => updateEntry(entry.key, { starred: !entry.starred })}
        >
          {entry.starred ? "★" : "☆"}
        </button>
        <button
          type="button"
          className="card-toggle"
          aria-expanded={!collapsed}
          title={collapsed ? "開く" : "たたむ"}
          onClick={onToggle}
        >
          <span className={`card-caret ${collapsed ? "" : "open"}`}>▶</span>
          <span className="card-head">
            <span className="row tight" style={{ alignItems: "baseline" }}>
              <strong style={{ color: "var(--steel-hi)" }}>{displayName(entry.name, form.form)}</strong>
              {entry.nickname && <span className="small muted">「{entry.nickname}」</span>}
              <TypeBadges types={form.types} />
            </span>
            {collapsed ? (
              <>
                <span className="small muted card-sum">
                  {entry.nature.replace(/（.*/, "")} / {entry.item || "持ち物なし"} ・ AP {apTotal}/{AP_MAX_TOTAL}
                </span>
                <span className="small muted tnum card-sum">
                  {STAT_KEYS.map((k) => `${k}${real[k]}`).join(" ")}
                </span>
                {entry.moves.length > 0 && (
                  <span className="small muted card-sum">
                    {entry.moves.map((m) => m.name || "（未設定）").join("・")}
                  </span>
                )}
              </>
            ) : (
              <span className="small muted card-sum">
                特性: {form.ability.includes("/")
                  ? <span className="amber">未選択</span>
                  : form.ability || "—"}
              </span>
            )}
          </span>
        </button>
        <button
          className="btn small danger"
          title="削除"
          onClick={() => {
            // AP・技まで組んだ個体が誤タップ1回で消えないよう確認する
            if (confirm(`「${displayName(entry.name, form.form)}」を削除します。よろしいですか？`)) removeEntry(entry.key);
          }}
        >
          削除
        </button>
      </div>

      {itemDuplicated && <div className="banner warn">★手持ち内で持ち物が重複しています（同一アイテム所持は不可）</div>}

      {collapsed ? null : (
      <>
      {/* 基本設定 */}
      <div className="grid2" style={{ marginTop: 8 }}>
        <label className="fld">
          <span>ニックネーム</span>
          <input type="text" value={entry.nickname} onChange={(e) => updateEntry(entry.key, { nickname: e.target.value })} />
        </label>
        {entry.forms.length > 1 && (
          <label className="fld">
            <span>フォルム</span>
            <SelectMenu
              items={entry.forms.map((f, i) => ({ value: String(i), label: displayName(entry.name, f.form) }))}
              value={String(entry.activeForm)}
              onChange={(v) => setForm(Number(v))}
            />
          </label>
        )}
        <label className="fld">
          <span>特性</span>
          {abilityOpts.length > 1 ? (
            <SelectMenu
              items={abilityOpts.map((a) => ({ value: a, label: a }))}
              value={form.ability}
              placeholder="特性を選択…"
              onChange={setAbility}
            />
          ) : (
            <input type="text" value={form.ability} onChange={(e) => setAbility(e.target.value)} />
          )}
        </label>
        <label className="fld">
          <span>持ち物</span>
          <input
            type="text"
            className={itemDuplicated ? "warn" : ""}
            value={entry.item}
            placeholder="（自由入力）"
            onChange={(e) => updateEntry(entry.key, { item: e.target.value })}
          />
        </label>
        <label className="fld">
          <span>性格</span>
          <SelectMenu
            items={Object.keys(NATURES).map((n) => ({ value: n, label: n }))}
            value={entry.nature}
            onChange={(v) => updateEntry(entry.key, { nature: v })}
          />
        </label>
      </div>

      {/* 能力値 / AP */}
      <div className="section-title">能力値・AP配分（HABCDS）</div>
      <div className={`ap-budget ${apOver ? "over" : ""}`}>
        <div className="ap-bar">
          <div className="fill" style={{ width: `${Math.min(100, (apTotal / AP_MAX_TOTAL) * 100)}%` }} />
        </div>
        <span className="small nowrap">
          AP <b className="tnum">{apTotal}</b> / {AP_MAX_TOTAL}
          <span className="muted">　残り <b className="tnum">{Math.max(0, apRemaining)}</b></span>
        </span>
        {/* スクロール中にスライダーへ触れて配分が変わるのを防ぐロック */}
        <LockButton
          locked={!!entry.apLocked}
          onToggle={() => updateEntry(entry.key, { apLocked: !entry.apLocked })}
        />
      </div>
      {STAT_KEYS.map((k) => (
        <div className="ap-row" key={k}>
          <div className="ap-head">
            <span className="ap-k">{k}<span className="small muted"> {STAT_LABEL[k]}</span></span>
            <span className="small muted">種族 {form.base[k]}</span>
            <span className="ap-real small">実数 <b>{real[k]}</b></span>
          </div>
          <ApSlider value={entry.ap[k]} max={maxFor(k)} locked={entry.apLocked} onChange={(v) => setAP(k, v)} />
        </div>
      ))}

      {/* 技構成 */}
      <div className="section-title">技構成（最大4）</div>
      {!verified && (
        <div className="banner warn">習得可否 未検証の種族です。全技ライブラリを表示しています。実機・攻略サイトで要確認。</div>
      )}
      {verified && status === "partial" && (
        <div className="banner info">習得技（部分収録）: 一部のみ検証済み。{source}</div>
      )}
      {verified && status === "full" && (
        <div className="banner info">習得技（全収録）: {source}</div>
      )}
      {dupMoves.length > 0 && (
        <div className="banner warn">
          同じ技が重複しています（{dupMoves.join("・")}）。1体につき同じ技は1つまでです。
        </div>
      )}
      {entry.moves.map((m, i) => {
        // 他の枠で選んでいる技は候補から外す（自分の枠の技は残す）
        const used = new Set(entry.moves.filter((_, j) => j !== i).map((x) => x.name.trim()).filter(Boolean));
        return (
          <MoveEditor
            key={i}
            move={m}
            options={options.filter((o) => !used.has(o.name))}
            duplicated={moveNameCount[m.name.trim()] > 1}
            onChange={(nm) => setMove(i, nm)}
          />
        );
      })}
      {entry.moves.length < MAX_MOVES && (
        <button className="btn small" onClick={addMove}>＋ 技を追加</button>
      )}

      {/* メモ */}
      <label className="fld" style={{ marginTop: 8 }}>
        <span>メモ</span>
        <textarea rows={2} value={entry.note} onChange={(e) => updateEntry(entry.key, { note: e.target.value })} />
      </label>
      </>
      )}
    </div>
  );
}

