import { useEffect, useRef, useState } from "react";
import type { Move } from "../types";
import { TYPE_COLORS } from "../data/game";

interface Props {
  moves: Move[];
  value: string; // 選択中の技名
  onChange: (name: string) => void;
  placeholder?: string;
}

/** タイプ色バッジ付きのカスタム技ドロップダウン。
 *  ネイティブ <select> は option に背景色が付けられない（特にiOS）ため自前で描画する。 */
export function MoveSelect({ moves, value, onChange, placeholder }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = moves.find((m) => m.name === value) ?? moves[0];

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

  return (
    <div className="mvsel" ref={ref}>
      <button type="button" className="mvsel-btn" onClick={() => setOpen((o) => !o)}>
        {selected ? <MoveRow m={selected} /> : <span className="muted">{placeholder ?? "技を選択"}</span>}
        <span className="mvsel-caret">▾</span>
      </button>
      {open && (
        <div className="mvsel-pop" role="listbox">
          {moves.map((m) => (
            <button
              type="button"
              key={m.name}
              role="option"
              aria-selected={m.name === selected?.name}
              className={`mvsel-opt ${m.name === selected?.name ? "sel" : ""}`}
              onClick={() => {
                onChange(m.name);
                setOpen(false);
              }}
            >
              <MoveRow m={m} />
            </button>
          ))}
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
