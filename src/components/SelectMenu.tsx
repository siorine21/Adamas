import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { usePopupPlacement } from "./popupPlacement";
import { kanaMatcher } from "../search";

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
  /** 補足（sub）を名前の下の行に出す。説明が長い持ち物の一覧など */
  stacked?: boolean;
  style?: CSSProperties;
  disabled?: boolean;
}

/** ネイティブ<select>の代わりに使う、その場で開く検索付きドロップダウン。
 *  iOS等でフルスクリーンのピッカーが出るのを避け、画面内に収まる小さなメニューにする。 */
export function SelectMenu({
  items, value, onChange, placeholder, searchable, searchPlaceholder, stacked, style, disabled,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const { style: popStyle, sheet } = usePopupPlacement(open, ref);
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
    if (!query.trim()) return items;
    const hit = kanaMatcher(query);
    return items.filter((i) => hit(i.label) || hit(i.sub));
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
      {open && sheet && (
        /* 画面下部のシートで開いているときの背景。タップで閉じる */
        <div className="mvsel-veil" onClick={(e) => { e.preventDefault(); setOpen(false); }} />
      )}
      {open && (
        <div
          className={`mvsel-pop ${sheet ? "sheet" : ""}`}
          role="listbox"
          style={popStyle}
          // このメニューは <label> の中に置かれることがある。ラベル内のクリックは
          // ラベルの対象コントロール（＝開閉ボタン）へ転送され、選んだ直後に
          // メニューが開き直してしまうため、既定動作を止めておく。
          onClick={(e) => e.preventDefault()}
        >
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
          <div className="mvsel-list">
          {filtered.map((i) => (
            <button
              type="button"
              key={i.value}
              role="option"
              aria-selected={i.value === value}
              className={`mvsel-opt ${i.value === value ? "sel" : ""} ${stacked ? "stacked" : ""}`}
              onClick={() => { onChange(i.value); setOpen(false); }}
            >
              <span className="mvsel-row">
                {i.swatch
                  ? <span className="tbadge" style={{ background: i.swatch }}>{i.label}</span>
                  : <span className="mvsel-name">{i.label}</span>}
                {i.note}
                {i.sub && !stacked && <span className="mvsel-meta">{i.sub}</span>}
              </span>
              {/* 説明は名前の下に1行で出す。長さで高さが変わらないよう省略する */}
              {stacked && <span className="mvsel-desc">{i.sub ?? ""}</span>}
            </button>
          ))}
          {filtered.length === 0 && <div className="mvsel-empty muted">該当なし</div>}
          </div>
        </div>
      )}
    </div>
  );
}
