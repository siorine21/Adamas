import { useId } from "react";
import type { Move } from "../types";
import { LEARNSETS, MOVE_BY_NAME, MOVE_LIB } from "../data/moves";
import { TYPES } from "../data/game";
import { typeSelectStyle } from "./TypeBadge";

/** その種族の技ドロップダウン候補（習得技のみ or 全ライブラリ）と検証状況 */
export function moveOptionsFor(speciesName: string): {
  options: Move[];
  verified: boolean;
  status?: "full" | "partial";
  source?: string;
} {
  const ls = LEARNSETS[speciesName];
  if (ls) {
    const options = ls.moves
      .map((n) => MOVE_BY_NAME[n])
      .filter((m): m is Move => Boolean(m));
    return { options, verified: true, status: ls.status, source: ls.source };
  }
  return { options: MOVE_LIB, verified: false };
}

interface Props {
  move: Move | undefined;
  options: Move[];
  onChange: (m: Move | undefined) => void;
}

const CATS: Move["cat"][] = ["物理", "特殊", "変化"];

export function MoveEditor({ move, options, onChange }: Props) {
  const catClass = move?.cat === "物理" ? "phys" : move?.cat === "特殊" ? "spec" : "stat";
  const listId = useId();

  const commitName = (v: string) => {
    if (!v) return onChange(undefined);
    // 候補（種族別 or 全ライブラリ）に一致すれば技データを自動補完、無ければ手動入力扱い
    const picked = options.find((o) => o.name === v) ?? MOVE_BY_NAME[v];
    if (picked) return onChange({ ...picked });
    onChange(move ? { ...move, name: v } : { name: v, type: "ノーマル", power: 0, cat: "変化" });
  };

  return (
    <div className="move-row">
      <div className="move-main">
        <input
          style={{ flex: "2 1 150px" }}
          type="text"
          list={listId}
          value={move?.name ?? ""}
          placeholder="技を検索 / 入力…"
          onChange={(e) => commitName(e.target.value)}
        />
        <datalist id={listId}>
          {options.map((o) => (
            <option key={o.name} value={o.name}>
              {o.type}{o.power ? ` ${o.power}` : ""} {o.cat}
            </option>
          ))}
        </datalist>
        {move && (
          <>
            <select
              style={{ flex: "0 1 90px", ...typeSelectStyle(move.type) }}
              value={move.type}
              onChange={(e) => onChange({ ...move, type: e.target.value })}
            >
              {TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <input
              style={{ flex: "0 1 62px" }}
              type="number"
              min={0}
              value={move.power}
              title="威力"
              onChange={(e) => onChange({ ...move, power: Math.max(0, Number(e.target.value) || 0) })}
            />
            <select
              className={`chip ${catClass}`}
              style={{ flex: "0 1 64px", width: "auto" }}
              value={move.cat}
              onChange={(e) => onChange({ ...move, cat: e.target.value as Move["cat"] })}
            >
              {CATS.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <button className="btn small danger" title="この技を消す" onClick={() => onChange(undefined)}>
              ×
            </button>
          </>
        )}
      </div>
      {move && (
        <div className="flags">
          <label>
            <input type="checkbox" checked={!!move.contact} onChange={(e) => onChange({ ...move, contact: e.target.checked })} />
            接触
          </label>
          <label>
            <input type="checkbox" checked={!!move.useDef} onChange={(e) => onChange({ ...move, useDef: e.target.checked })} />
            B参照
          </label>
          <label>
            <input type="checkbox" checked={!!move.targetB} onChange={(e) => onChange({ ...move, targetB: e.target.checked })} />
            対B
          </label>
          <label>
            <input type="checkbox" checked={!!move.ignoreDefRank} onChange={(e) => onChange({ ...move, ignoreDefRank: e.target.checked })} />
            ランク無視
          </label>
        </div>
      )}
    </div>
  );
}
