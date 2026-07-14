import { TYPE_COLORS } from "../data/game";

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
