import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { usePopupPlacement } from "./popupPlacement";

export interface MenuItem {
  value: string;
  label: string;
  sub?: string; // 右側に薄く出す補足（種族値合計など）
  note?: ReactNode; // ラベル横のバッジ等
  swatch?: string; // 指定するとラベルを色付きバッジで表示（タイプ色など）
}

interface Props {
  items: MenuItem[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** 検索欄を出す（既定: 候補が12件超なら自動で出す） */
  searchable?: boolean;
  searchPlaceholder?: string;
  style?: CSSProperties;
  disabled?: boolean;
}

/** ネイティブ<select>の代わりに使う、その場で開く検索付きドロップダウン。
 *  iOS等でフルスクリーンのピッカーが出るのを避け、画面内に収まる小さなメニューにする。 */
export function SelectMenu({
  items, value, onChange, placeholder, searchable, searchPlaceholder, style, disabled,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const popStyle = usePopupPlacement(open, ref);
  const showSearch = searchable ?? items.length > 12;
  const selected = items.find((i) => i.value === value);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
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
    // タッチ端末では自動フォーカスしない（ソフトキーボードが出て一覧が隠れ、
    // スクロールできなくなるため）。絞り込みたいときは検索欄を直接タップする。
    const coarse = window.matchMedia?.("(pointer: coarse)").matches;
    if (open && showSearch && !coarse) searchRef.current?.focus();
    if (!open) setQuery("");
  }, [open, showSearch]);

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return items;
    return items.filter((i) => i.label.includes(q) || i.sub?.includes(q));
  }, [items, query]);

  return (
    <div className="mvsel" ref={ref} style={style}>
      <button type="button" className="mvsel-btn" disabled={disabled} onClick={() => setOpen((o) => !o)}>
        {selected ? (
          <span className="mvsel-row">
            {selected.swatch
              ? <span className="tbadge" style={{ background: selected.swatch }}>{selected.label}</span>
              : <span className="mvsel-name">{selected.label}</span>}
            {selected.note}
            {selected.sub && <span className="mvsel-meta">{selected.sub}</span>}
          </span>
        ) : (
          <span className="muted">{placeholder ?? "選択…"}</span>
        )}
        <span className="mvsel-caret">▾</span>
      </button>
      {open && (
        <div className="mvsel-pop" role="listbox" style={popStyle}>
          {showSearch && (
            <input
              ref={searchRef}
              className="mvsel-search"
              type="text"
              placeholder={searchPlaceholder ?? "名前で絞り込み…"}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          )}
          {filtered.map((i) => (
            <button
              type="button"
              key={i.value}
              role="option"
              aria-selected={i.value === value}
              className={`mvsel-opt ${i.value === value ? "sel" : ""}`}
              onClick={() => { onChange(i.value); setOpen(false); }}
            >
              <span className="mvsel-row">
                {i.swatch
                  ? <span className="tbadge" style={{ background: i.swatch }}>{i.label}</span>
                  : <span className="mvsel-name">{i.label}</span>}
                {i.note}
                {i.sub && <span className="mvsel-meta">{i.sub}</span>}
              </span>
            </button>
          ))}
          {filtered.length === 0 && <div className="mvsel-empty muted">該当なし</div>}
        </div>
      )}
    </div>
  );
}
