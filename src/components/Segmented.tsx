import type { CSSProperties, ReactNode } from "react";

export interface SegOption<T extends string | number> {
  value: T;
  label: ReactNode;
  /** ボタンの下に小さく添える補足（倍率など） */
  sub?: ReactNode;
  /** タイプ色などの色見本。ラベルの左に小さな丸で出す */
  swatch?: string;
  title?: string;
  disabled?: boolean;
}

interface Props<T extends string | number> {
  options: SegOption<T>[];
  value: T;
  onChange: (v: T) => void;
  /** "lg" は画面内の大きな切替（与ダメ／被ダメ、ツールの種類など）、"sm" は項目の中の小さな切替 */
  size?: "lg" | "sm";
  ariaLabel?: string;
  style?: CSSProperties;
}

/** 1つだけ選ぶ切替。
 *
 *  以前は画面ごとに「大きなボタン」「黄色枠のチップ」「タイプ色のボタン」と
 *  見た目がばらばらだったので、択一の切替はすべてこれにそろえる。
 *  複数選べる絞り込み（タイプなど）はチップのまま。 */
export function Segmented<T extends string | number>({
  options, value, onChange, size = "sm", ariaLabel, style,
}: Props<T>) {
  return (
    <div className={`segmented ${size}`} role="radiogroup" aria-label={ariaLabel} style={style}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={on}
            className={on ? "on" : ""}
            disabled={o.disabled}
            title={o.title}
            onClick={() => onChange(o.value)}
          >
            {o.swatch && <i className="seg-swatch" style={{ background: o.swatch }} />}
            {o.label}
            {o.sub != null && <small>{o.sub}</small>}
          </button>
        );
      })}
    </div>
  );
}
