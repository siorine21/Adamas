import { useEffect, useMemo, useState } from "react";
import { useStore } from "../store";
import { MAX_STARRED, TYPE_COLORS } from "../data/game";
import { ALL_DEX, DEX_BY_TYPE, DEX_TYPES } from "../data/dex";
import { dexFitsMainType, emptyEntry, entryFitsMainType, entryFromDex } from "../data/roster";
import { PRESET_TEAMS } from "../data/teams";
import { exportJSON, importJSON } from "../storage";
import { Panel } from "./Panel";
import { PokemonCard } from "./PokemonCard";
import { TypeBadges } from "./TypeBadge";
import { SelectMenu } from "./SelectMenu";
import { WeaknessTable } from "./WeaknessTable";
import { CoverageTable } from "./CoverageTable";

const EXPANDED_KEY = "adamas-koubou/team-expanded/v1";

function loadExpanded(): Set<string> {
  try {
    const raw = localStorage.getItem(EXPANDED_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? new Set(arr.filter((v) => typeof v === "string")) : new Set();
  } catch {
    return new Set();
  }
}

function saveExpanded(s: Set<string>) {
  try {
    localStorage.setItem(EXPANDED_KEY, JSON.stringify([...s]));
  } catch {
    /* 保存できなくても表示には影響しない */
  }
}

export function TeamTab() {
  const {
    roster, addEntry, setRoster, resetToPreset, starredCount,
    teams, activeTeamId, activeTeam, setActiveTeam,
    createTeam, duplicateTeam, renameTeam, removeTeam, loadPresetTeam, mainType,
  } = useStore();
  // このチームに入れられる系統だけを「図鑑から追加」に出す
  const addable = useMemo(
    () => ALL_DEX.filter((d) => dexFitsMainType(d, mainType)),
    [mainType],
  );
  const [addName, setAddName] = useState("");
  const [presetId, setPresetId] = useState("");
  const [ioOpen, setIoOpen] = useState(false);
  const [ioText, setIoText] = useState("");
  const [ioMsg, setIoMsg] = useState<string | null>(null);
  // 展開中のカード（key の集合）。既定は全部畳む＝一覧性を優先。
  const [expanded, setExpanded] = useState<Set<string>>(() => loadExpanded());

  useEffect(() => { saveExpanded(expanded); }, [expanded]);

  const toggleCard = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  // ★内で重複している持ち物の集合
  const dupItems = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of roster) {
      if (!e.starred) continue;
      const it = e.item.trim();
      if (!it) continue;
      counts.set(it, (counts.get(it) ?? 0) + 1);
    }
    return new Set([...counts.entries()].filter(([, n]) => n > 1).map(([k]) => k));
  }, [roster]);

  const starDisabled = starredCount >= MAX_STARRED;

  // ★を先頭に、その中では元順を維持
  const sorted = useMemo(() => {
    return [...roster].sort((a, b) => (a.starred === b.starred ? 0 : a.starred ? -1 : 1));
  }, [roster]);
  const starred = sorted.filter((e) => e.starred);
  const bench = sorted.filter((e) => !e.starred);

  const doAdd = () => {
    if (!addName) return;
    const e = entryFromDex(addName);
    if (e) addEntry(e);
    setAddName("");
  };

  const doExport = async () => {
    const json = exportJSON(roster);
    setIoText(json);
    setIoOpen(true);
    try {
      await navigator.clipboard.writeText(json);
      setIoMsg("クリップボードにコピーしました。");
    } catch {
      setIoMsg("コピーできませんでした。下のテキストを手動で選択してください。");
    }
  };

  const doImport = () => {
    const res = importJSON(ioText);
    if (!res.ok || !res.roster) {
      setIoMsg(`インポート失敗: ${res.error}`);
      return;
    }
    // 統一の軸から外れる個体は入れない。黙って落とすと気づけないので名前を出す
    const fit = res.roster.filter((e) => entryFitsMainType(e, mainType));
    const off = res.roster.filter((e) => !entryFitsMainType(e, mainType));
    setRoster(fit);
    setIoMsg(off.length === 0
      ? `${fit.length}体を読み込みました。`
      : `${fit.length}体を読み込みました。${mainType}を持たない${off.length}体は除外しました: `
        + off.map((e) => e.name || "（無名）").join("・"));
  };

  const doAddPreset = () => {
    if (!presetId) return;
    loadPresetTeam(presetId);
    setPresetId("");
  };

  /** 手持ち・控えのカードをまとめて開閉する。グループごとに効く */
  const setGroupOpen = (list: typeof roster, open: boolean) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      for (const e of list) { if (open) next.add(e.key); else next.delete(e.key); }
      return next;
    });
  const groupActions = (list: typeof roster) => list.length > 0 && (
    <>
      <button className="btn small" onClick={() => setGroupOpen(list, true)} disabled={list.every((e) => expanded.has(e.key))}>
        すべて開く
      </button>
      <button className="btn small" onClick={() => setGroupOpen(list, false)} disabled={!list.some((e) => expanded.has(e.key))}>
        すべて畳む
      </button>
    </>
  );
  const renderCard = (e: (typeof roster)[number], dup: boolean) => (
    <PokemonCard
      key={e.key}
      entry={e}
      starDisabled={starDisabled}
      itemDuplicated={dup}
      collapsed={!expanded.has(e.key)}
      onToggle={() => toggleCard(e.key)}
    />
  );

  return (
    <div>
      {/* チーム選択・管理。よく使う操作だけを表に出し、入出力・削除・初期化は奥の「管理」に */}
      <Panel id="team.manage" title="チーム" summary={`${activeTeam?.name ?? ""}・${mainType}統一・全${teams.length}チーム`}>
        <div className="row">
          <SelectMenu
            style={{ flex: "1 1 200px", minWidth: 0 }}
            items={teams.map((t) => ({
              value: t.id,
              label: t.name,
              sub: `${t.roster.filter((e) => e.starred).length}/${t.roster.length}体`,
            }))}
            value={activeTeamId}
            onChange={setActiveTeam}
          />
          <SelectMenu
            style={{ flex: "0 1 190px", minWidth: 150 }}
            items={DEX_TYPES.map((t) => ({
              value: t, label: t, swatch: TYPE_COLORS[t],
              sub: `${DEX_BY_TYPE[t].length}系統`,
            }))}
            value=""
            onChange={(t) => createTeam(t)}
            placeholder="＋新規（メインタイプ）"
          />
          <button className="btn" onClick={duplicateTeam} title="このチームを複製">複製</button>
          <button
            className="btn"
            onClick={() => { const n = prompt("チーム名", activeTeam?.name ?? ""); if (n) renameTeam(n); }}
          >
            名前変更
          </button>
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <SelectMenu
            style={{ flex: "1 1 220px", minWidth: 0 }}
            items={PRESET_TEAMS.map((p) => ({ value: p.id, label: p.name, sub: p.note }))}
            value={presetId}
            onChange={setPresetId}
            placeholder="＋ プリセットからチーム追加…"
          />
          <button className="btn primary" onClick={doAddPreset} disabled={!presetId}>追加</button>
        </div>
        <div className="small muted" style={{ marginTop: 6 }}>
          このチームのメインタイプは{" "}
          <span className="tbadge" style={{ background: TYPE_COLORS[mainType] }}>{mainType}</span>
          {" "}です。{mainType}を持たないポケモンは登録できません
          （メガシンカで初めて付く枠は登録できます）。
          <br />
          チームは複数保存できます。別チームであれば同じポケモンも使えます（各チーム独立）。
        </div>

        {/* めったに使わず、押し間違えると困る操作はここにまとめて畳んでおく */}
        <Panel id="team.admin" title="管理" summary="入出力・初期化・チーム削除" defaultOpen={false}>
          <div className="row">
            <button className="btn" onClick={doExport}>エクスポート</button>
            <button className="btn" onClick={() => { setIoOpen((v) => !v); setIoMsg(null); }}>インポート</button>
          </div>
          {ioOpen && (
            <div style={{ marginTop: 10 }}>
              <div className="small muted">
                JSONを貼り付けて「読み込む」で復元／端末間移行できます。エクスポート時は自動でクリップボードにコピーされます。
              </div>
              <textarea
                className="json"
                value={ioText}
                placeholder='ここにJSONを貼り付け…'
                onChange={(e) => setIoText(e.target.value)}
              />
              <div className="row">
                <button className="btn primary" onClick={doImport} disabled={!ioText.trim()}>読み込む</button>
                <button className="btn" onClick={() => { setIoText(""); setIoMsg(null); }}>クリア</button>
                {ioMsg && <span className="small amber">{ioMsg}</span>}
              </div>
            </div>
          )}
          {!ioOpen && ioMsg && <div className="small amber" style={{ marginTop: 6 }}>{ioMsg}</div>}
          <div className="danger-zone">
            <button
              className="btn small danger"
              onClick={() => { if (confirm("初期プリセット（アダマス編成）に戻します。現在の編成は失われます。よろしいですか？")) resetToPreset(); }}
            >
              編成を初期化
            </button>
            <button
              className="btn small danger"
              disabled={teams.length <= 1}
              title={teams.length <= 1 ? "最後の1チームは削除できません" : "このチームを削除"}
              onClick={() => { if (confirm(`チーム「${activeTeam?.name}」を削除します。よろしいですか？`)) removeTeam(); }}
            >
              このチームを削除
            </button>
          </div>
        </Panel>
      </Panel>

      {/* 個体の追加 */}
      <Panel id="team.ops" title="ポケモンを追加" summary={`手持ち ${starredCount}/${MAX_STARRED}・登録 ${roster.length}体`}>
        <div className="row">
          <SelectMenu
            style={{ flex: "1 1 200px", minWidth: 0 }}
            items={addable.map((d) => {
              // メインタイプを持つフォルムを見せる。メガで初めて付く系統は
              // 通常フォルムを見せても「なぜ入れられるのか」が分からないため
              const f = d.forms.find((x) => x.types.includes(mainType)) ?? d.forms[0];
              return {
                value: d.name,
                label: d.name,
                note: <TypeBadges types={f.types} />,
                sub: f.form === "通常" ? undefined : `${f.form}で${mainType}`,
              };
            })}
            value={addName}
            onChange={setAddName}
            placeholder="＋ 図鑑から追加…"
          />
          <button className="btn primary" onClick={doAdd} disabled={!addName}>追加</button>
          <button className="btn" onClick={() => addEntry(emptyEntry(mainType))} title={`レギュ変更で増えた新規${mainType}ポケモン等を空欄で作成`}>
            ＋ 手動個体
          </button>
        </div>
      </Panel>

      {/* 個体カード。チームの中身がこの画面の主役なので、分析（弱点・攻撃範囲）より上に置く */}
      <Panel id="team.starred" title="★ 手持ち" summary={`${starred.length} / ${MAX_STARRED}体`} actions={groupActions(starred)}>
        {starred.length === 0 && <div className="muted small">まだ★手持ちがいません。カードの☆をタップして登録してください。</div>}
        {starred.map((e) => renderCard(e, dupItems.has(e.item.trim())))}
      </Panel>

      <Panel id="team.bench" title="◆ 控え" summary={`${bench.length}体`} actions={groupActions(bench)}>
        {bench.length === 0 && <div className="muted small">控えは空です。</div>}
        {bench.map((e) => renderCard(e, false))}
      </Panel>

      {/* チーム全体の弱点チェック・攻撃範囲チェック */}
      <WeaknessTable />
      <CoverageTable />
    </div>
  );
}
