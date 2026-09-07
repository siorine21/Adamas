import { useEffect, useRef, useState, type CSSProperties } from "react";
import { usePopupPlacement } from "./popupPlacement";

interface Props {
  values: number[];
  value: number;
  onChange: (v: number) => void;
  /** 表示用の整形（ランクの "+1" など） */
  format?: (v: number) => string;
  /** グリッドの列数（既定6） */
  cols?: number;
  style?: CSSProperties;
}

/** 数値をグリッドから1タップで選ぶポップアップ。
 *  Android/iOS のネイティブ<select>は選択肢が多いと全画面ダイアログになり、
 *  AP(0〜32)のような連番を選ぶのに何度もスクロールが必要なため自前で描画する。 */
export function NumberMenu({ values, value, onChange, format, cols = 6, style }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  // セルがタップしやすい幅を確保（狭い列に置かれても画面内で広く開く）
  const popStyle = usePopupPlacement(open, ref, { minWidth: cols * 46 });
  const fmt = format ?? ((v: number) => String(v));

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

  return (
    <div className="mvsel numsel" ref={ref} style={style}>
      <button type="button" className="mvsel-btn numsel-btn" onClick={() => setOpen((o) => !o)}>
        <span className="numsel-val">{fmt(value)}</span>
        <span className="mvsel-caret">▾</span>
      </button>
      {open && (
        <div className="mvsel-pop numgrid-pop" style={popStyle}>
          <div className="numgrid" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
            {values.map((v) => (
              <button
                type="button"
                key={v}
                className={`numgrid-cell ${v === value ? "sel" : ""}`}
                onClick={() => { onChange(v); setOpen(false); }}
              >
                {fmt(v)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
