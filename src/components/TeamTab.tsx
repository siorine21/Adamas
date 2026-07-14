import { useMemo, useState } from "react";
import { useStore } from "../store";
import { MAX_STARRED } from "../data/game";
import { DEX } from "../data/dex";
import { emptyEntry, entryFromDex } from "../data/roster";
import { exportJSON, importJSON } from "../storage";
import { PokemonCard } from "./PokemonCard";

export function TeamTab() {
  const { roster, addEntry, setRoster, resetToPreset, starredCount } = useStore();
  const [addName, setAddName] = useState("");
  const [ioOpen, setIoOpen] = useState(false);
  const [ioText, setIoText] = useState("");
  const [ioMsg, setIoMsg] = useState<string | null>(null);

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
    if (res.ok && res.roster) {
      setRoster(res.roster);
      setIoMsg(`${res.roster.length}体を読み込みました。`);
    } else {
      setIoMsg(`インポート失敗: ${res.error}`);
    }
  };

  return (
    <div>
      {/* 操作パネル */}
      <div className="panel">
        <div className="row">
          <select value={addName} onChange={(e) => setAddName(e.target.value)} style={{ flex: "1 1 200px" }}>
            <option value="">＋ 図鑑から追加…</option>
            {DEX.map((d) => (
              <option key={d.name} value={d.name}>{d.name}</option>
            ))}
          </select>
          <button className="btn primary" onClick={doAdd} disabled={!addName}>追加</button>
          <button className="btn" onClick={() => addEntry(emptyEntry())} title="レギュ変更で増えた新規はがねポケモン等を空欄で作成">
            ＋ 手動個体
          </button>
          <div className="spacer" />
          <button className="btn" onClick={doExport}>エクスポート</button>
          <button className="btn" onClick={() => { setIoOpen((v) => !v); setIoMsg(null); }}>インポート</button>
          <button
            className="btn danger"
            onClick={() => { if (confirm("初期プリセット（アダマス編成）に戻します。現在の編成は失われます。よろしいですか？")) resetToPreset(); }}
          >
            初期化
          </button>
        </div>
        <div className="small muted" style={{ marginTop: 6 }}>
          ★手持ち {starredCount} / {MAX_STARRED} 体 ・ 登録 {roster.length} 体
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
      </div>

      {/* ★手持ち */}
      <div className="section-title">★ 手持ち（最大6体）</div>
      {starred.length === 0 && <div className="muted small">まだ★手持ちがいません。カードの☆をタップして登録してください。</div>}
      {starred.map((e) => (
        <PokemonCard key={e.key} entry={e} starDisabled={starDisabled} itemDuplicated={dupItems.has(e.item.trim())} />
      ))}

      {/* ベンチ・検討枠 */}
      <div className="section-title" style={{ marginTop: 16 }}>ベンチ・検討枠</div>
      {bench.length === 0 && <div className="muted small">ベンチは空です。</div>}
      {bench.map((e) => (
        <PokemonCard key={e.key} entry={e} starDisabled={starDisabled} itemDuplicated={false} />
      ))}
    </div>
  );
}
