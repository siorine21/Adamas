import type { CSSProperties } from "react";
import { TYPE_COLORS } from "../data/game";

/** タイプ名を表示する <select>/コントロールに、そのタイプ色の背景を付けるスタイル */
export function typeSelectStyle(type: string): CSSProperties {
  const bg = TYPE_COLORS[type] ?? "#666";
  return {
    background: bg,
    color: "#14171c",
    fontWeight: 600,
    borderColor: bg,
  };
}

export function TypeBadge({ type }: { type: string }) {
  const color = TYPE_COLORS[type] ?? "#666";
  return (
    <span className="tbadge" style={{ background: color }}>
      {type}
    </span>
  );
}

export function TypeBadges({ types }: { types: string[] }) {
  return (
    <span className="row tight" style={{ display: "inline-flex" }}>
      {types.map((t) => (
        <TypeBadge key={t} type={t} />
      ))}
    </span>
  );
}
