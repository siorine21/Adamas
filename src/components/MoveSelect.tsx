import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { Move } from "../types";
import { TYPE_COLORS } from "../data/game";
import { usePopupPlacement } from "./popupPlacement";

interface Props {
  moves: Move[];
  value: string; // 選択中の技名
  onChange: (name: string) => void;
  placeholder?: string;
  style?: CSSProperties; // ラッパー（flexレイアウト等）
  searchable?: boolean; // ポップアップ内に検索欄を出す（候補が多い時）
  clearLabel?: string; // 先頭に「空にする」行を出す
  onClear?: () => void;
  manualLabel?: string; // 末尾に「手動入力」行を出す
  onManual?: () => void;
  manualActive?: boolean; // 手動入力モード表示
}

/** タイプ色バッジ付きのカスタム技ドロップダウン。
 *  ネイティブ <select> は option に背景色が付けられない（特にiOS）ため自前で描画する。 */
export function MoveSelect({
  moves, value, onChange, placeholder, style, searchable,
  clearLabel, onClear, manualLabel, onManual, manualActive,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const popStyle = usePopupPlacement(open, ref);
  const selected = moves.find((m) => m.name === value);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("touchstart", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("touchstart", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    // タッチ端末では自動フォーカスしない（ソフトキーボードで一覧が隠れるため）
    const coarse = window.matchMedia?.("(pointer: coarse)").matches;
    if (open && searchable && !coarse) searchRef.current?.focus();
    if (!open) setQuery("");
  }, [open, searchable]);

  const filtered = useMemo(() => {
    const q = query.trim();
    return q ? moves.filter((m) => m.name.includes(q)) : moves;
  }, [moves, query]);

  const close = () => setOpen(false);

  return (
    <div className="mvsel" ref={ref} style={style}>
      <button type="button" className="mvsel-btn" onClick={() => setOpen((o) => !o)}>
        {manualActive ? (
          <span className="muted">✏️ {manualLabel ?? "手動入力"}</span>
        ) : selected ? (
          <MoveRow m={selected} />
        ) : (
          <span className="muted">{placeholder ?? "技を選択"}</span>
        )}
        <span className="mvsel-caret">▾</span>
      </button>
      {open && (
        <div
          className="mvsel-pop"
          role="listbox"
          style={popStyle}
          // このメニューは <label> の中に置かれることがある。ラベル内のクリックは
          // ラベルの対象コントロール（＝開閉ボタン）へ転送され、選んだ直後に
          // メニューが開き直してしまうため、既定動作を止めておく。
          onClick={(e) => e.preventDefault()}
        >
          {searchable && (
            <input
              ref={searchRef}
              className="mvsel-search"
              type="text"
              placeholder="技を検索…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          )}
          {clearLabel && onClear && !query && (
            <button type="button" className="mvsel-opt special" onClick={() => { onClear(); close(); }}>
              {clearLabel}
            </button>
          )}
          {filtered.map((m) => (
            <button
              type="button"
              key={m.name}
              role="option"
              aria-selected={m.name === value}
              className={`mvsel-opt ${m.name === value ? "sel" : ""}`}
              onClick={() => { onChange(m.name); close(); }}
            >
              <MoveRow m={m} />
            </button>
          ))}
          {filtered.length === 0 && <div className="mvsel-empty muted">該当なし</div>}
          {manualLabel && onManual && !query && (
            <button type="button" className="mvsel-opt special" onClick={() => { onManual(); close(); }}>
              ✏️ {manualLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function MoveRow({ m }: { m: Move }) {
  const color = TYPE_COLORS[m.type] ?? "#666";
  return (
    <span className="mvsel-row">
      <span className="tbadge" style={{ background: color }}>{m.type}</span>
      <span className="mvsel-name">{m.name}</span>
      <span className="mvsel-meta">{m.power > 0 ? m.power : "—"}・{m.cat}</span>
    </span>
  );
}
