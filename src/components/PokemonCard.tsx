import type { Move, RosterEntry, StatKey } from "../types";
import { useStore } from "../store";
import {
  AP_MAX_EACH, AP_MAX_TOTAL, AP_VALUES, MAX_MOVES, NATURES, realStats,
  STAT_KEYS, STAT_LABEL,
} from "../data/game";
import { TypeBadges } from "./TypeBadge";
import { displayName } from "../data/roster";
import { MoveEditor, moveOptionsFor } from "./MoveEditor";

interface Props {
  entry: RosterEntry;
  starDisabled: boolean; // ★上限で新規に付けられない
  itemDuplicated: boolean; // ★内で持ち物重複
}

export function PokemonCard({ entry, starDisabled, itemDuplicated }: Props) {
  const { updateEntry, removeEntry } = useStore();
  const form = entry.forms[entry.activeForm] ?? entry.forms[0];
  const real = realStats(form.base, entry.ap, entry.nature);
  const apTotal = STAT_KEYS.reduce((s, k) => s + entry.ap[k], 0);
  const apOver = apTotal > AP_MAX_TOTAL;
  const abilityOpts = form.ability.split("/").map((a) => a.trim()).filter(Boolean);
  const { options, verified, status, source } = moveOptionsFor(entry.name);

  const setForm = (idx: number) => updateEntry(entry.key, { activeForm: idx });
  const setAP = (k: StatKey, v: number) =>
    updateEntry(entry.key, (e) => ({
      ...e,
      ap: { ...e.ap, [k]: Math.max(0, Math.min(AP_MAX_EACH, v || 0)) },
    }));
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
    <div className={`card ${itemDuplicated ? "warn-item" : ""}`}>
      {/* ヘッダー行 */}
      <div className="row" style={{ alignItems: "flex-start" }}>
        <button
          className="star-btn"
          title={entry.starred ? "★手持ちから外す" : starDisabled ? "★は最大6体まで" : "★手持ちに入れる"}
          disabled={!entry.starred && starDisabled}
          style={{ color: entry.starred ? "var(--amber)" : "var(--dim)", opacity: !entry.starred && starDisabled ? 0.35 : 1 }}
          onClick={() => updateEntry(entry.key, { starred: !entry.starred })}
        >
          {entry.starred ? "★" : "☆"}
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="row tight" style={{ alignItems: "baseline" }}>
            <strong style={{ color: "var(--steel-hi)" }}>{displayName(entry.name, form.form)}</strong>
            {entry.nickname && <span className="small muted">「{entry.nickname}」</span>}
            <TypeBadges types={form.types} />
          </div>
          <div className="small muted">特性: {form.ability}</div>
        </div>
        <button className="btn small danger" title="削除" onClick={() => removeEntry(entry.key)}>削除</button>
      </div>

      {itemDuplicated && <div className="banner warn">★手持ち内で持ち物が重複しています（同一アイテム所持は不可）</div>}

      {/* 基本設定 */}
      <div className="grid2" style={{ marginTop: 8 }}>
        <label className="fld">
          <span>ニックネーム</span>
          <input type="text" value={entry.nickname} onChange={(e) => updateEntry(entry.key, { nickname: e.target.value })} />
        </label>
        {entry.forms.length > 1 ? (
          <label className="fld">
            <span>フォルム</span>
            <select value={entry.activeForm} onChange={(e) => setForm(Number(e.target.value))}>
              {entry.forms.map((f, i) => (
                <option key={i} value={i}>{displayName(entry.name, f.form)}</option>
              ))}
            </select>
          </label>
        ) : (
          <label className="fld">
            <span>特性</span>
            {abilityOpts.length > 1 ? (
              <select
                value={form.ability}
                onChange={(e) => updateEntry(entry.key, (en) => {
                  const forms = en.forms.map((f, i) => i === en.activeForm ? { ...f, ability: e.target.value } : f);
                  return { ...en, forms };
                })}
              >
                {abilityOpts.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            ) : (
              <input type="text" value={form.ability} onChange={(e) => updateEntry(entry.key, (en) => {
                const forms = en.forms.map((f, i) => i === en.activeForm ? { ...f, ability: e.target.value } : f);
                return { ...en, forms };
              })} />
            )}
          </label>
        )}
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
          <select value={entry.nature} onChange={(e) => updateEntry(entry.key, { nature: e.target.value })}>
            {Object.keys(NATURES).map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      </div>

      {/* 能力値 / AP */}
      <div className="section-title">能力値・AP配分（HABCDS）</div>
      <div className="stat-grid">
        <div />
        <div className="head">種族値</div>
        <div className="head">AP(0-32)</div>
        <div className="head">実数値</div>
        {STAT_KEYS.map((k) => (
          <StatRow key={k} k={k} base={form.base[k]} ap={entry.ap[k]} real={real[k]} onAP={(v) => setAP(k, v)} />
        ))}
      </div>
      <div className={`ap-total ${apOver ? "over" : "muted"}`}>
        AP合計 {apTotal} / {AP_MAX_TOTAL}{apOver ? "（上限超過！）" : ""}
      </div>

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
      {entry.moves.map((m, i) => (
        <MoveEditor key={i} move={m} options={options} onChange={(nm) => setMove(i, nm)} />
      ))}
      {entry.moves.length < MAX_MOVES && (
        <button className="btn small" onClick={addMove}>＋ 技を追加</button>
      )}

      {/* メモ */}
      <label className="fld" style={{ marginTop: 8 }}>
        <span>メモ</span>
        <textarea rows={2} value={entry.note} onChange={(e) => updateEntry(entry.key, { note: e.target.value })} />
      </label>
    </div>
  );
}

function StatRow({ k, base, ap, real, onAP }: { k: StatKey; base: number; ap: number; real: number; onAP: (v: number) => void }) {
  return (
    <>
      <div className="lbl">{k}<span className="small muted"> {STAT_LABEL[k]}</span></div>
      <div className="base">{base}</div>
      <select value={ap} onChange={(e) => onAP(Number(e.target.value))}>
        {AP_VALUES.map((v) => <option key={v} value={v}>{v}</option>)}
      </select>
      <div className="real">{real}</div>
    </>
  );
}
