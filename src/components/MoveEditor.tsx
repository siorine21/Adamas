import type { Move } from "../types";
import { LEARNSETS, MOVE_BY_NAME, MOVE_LIB } from "../data/moves";
import { TYPES } from "../data/game";

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

  return (
    <div className="move-row">
      <div className="move-main">
        <select
          style={{ flex: "2 1 130px" }}
          value={move?.name ?? ""}
          onChange={(e) => {
            const v = e.target.value;
            if (!v) return onChange(undefined);
            const picked = options.find((o) => o.name === v) ?? MOVE_BY_NAME[v];
            onChange(picked ? { ...picked } : { name: v, type: "ノーマル", power: 0, cat: "変化" });
          }}
        >
          <option value="">— 技を選択 / 空 —</option>
          {options.map((o) => (
            <option key={o.name} value={o.name}>
              {o.name}（{o.type}{o.power ? ` ${o.power}` : ""}）
            </option>
          ))}
        </select>
        {move && (
          <>
            <input
              style={{ flex: "1 1 80px" }}
              type="text"
              value={move.name}
              placeholder="技名"
              onChange={(e) => onChange({ ...move, name: e.target.value })}
            />
            <select
              style={{ flex: "0 1 90px" }}
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
