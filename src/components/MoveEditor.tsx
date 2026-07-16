import { useState } from "react";
import type { Move } from "../types";
import { LEARNSETS, MOVE_BY_NAME, MOVE_LIB } from "../data/moves";
import { TYPES } from "../data/game";
import { typeSelectStyle } from "./TypeBadge";
import { MoveSelect } from "./MoveSelect";

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
  // 候補が多い（全ライブラリ等）の時はポップアップ内に検索欄を出す
  const useSearch = options.length > 150;
  // 選択中の技が候補に無い（かつ空でない）＝手動入力扱い
  const isCustom = !!move && move.name !== "" && !options.some((o) => o.name === move.name);
  const [manual, setManual] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const showName = manual || isCustom;
  // 威力可変技（威力0の攻撃技）や手動入力時は詳細編集欄を自動で開く
  const needEdit = showName || (!!move && move.cat !== "変化" && move.power === 0);
  const editOpen = !!move && (showEdit || needEdit);

  const commitName = (v: string) => {
    if (!v) return onChange(undefined);
    const picked = options.find((o) => o.name === v) ?? MOVE_BY_NAME[v];
    if (picked) return onChange({ ...picked });
    onChange(move ? { ...move, name: v } : { name: v, type: "ノーマル", power: 0, cat: "変化" });
  };

  return (
    <div className="move-row">
      {/* ダメージ計算と同じ全幅のタイプ色付きドロップダウン */}
      <div className="move-main">
        <MoveSelect
          style={{ flex: "1 1 auto", minWidth: 0 }}
          moves={options}
          value={showName ? "" : move?.name ?? ""}
          searchable={useSearch}
          placeholder="覚える技から選択 / 空"
          clearLabel="— 空にする —"
          manualLabel="手動入力（リスト外の技）"
          manualActive={showName}
          onChange={(v) => { setManual(false); commitName(v); }}
          onClear={() => { setManual(false); onChange(undefined); }}
          onManual={() => {
            setManual(true);
            if (!move) onChange({ name: "", type: "ノーマル", power: 0, cat: "変化" });
          }}
        />
        {move && (
          <>
            <button
              className={`btn small ${editOpen ? "primary" : ""}`}
              title="威力・タイプ・分類などを編集"
              onClick={() => setShowEdit((v) => !v)}
            >
              詳細
            </button>
            <button className="btn small danger" title="この技を消す" onClick={() => onChange(undefined)}>
              ×
            </button>
          </>
        )}
      </div>

      {/* 詳細編集（手動入力・威力可変技のとき自動表示 / それ以外は「詳細」で開閉） */}
      {editOpen && (
        <>
          {showName && (
            <input
              type="text"
              value={move.name}
              placeholder="技名を入力"
              onChange={(e) => onChange({ ...move, name: e.target.value })}
            />
          )}
          <div className="move-edit">
            <select
              style={{ flex: "0 1 100px", ...typeSelectStyle(move.type) }}
              value={move.type}
              onChange={(e) => onChange({ ...move, type: e.target.value })}
            >
              {TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <input
              style={{ flex: "0 1 70px" }}
              type="number"
              min={0}
              value={move.power}
              title="威力"
              onChange={(e) => onChange({ ...move, power: Math.max(0, Number(e.target.value) || 0) })}
            />
            <select
              className={`chip ${catClass}`}
              style={{ flex: "0 1 70px", width: "auto" }}
              value={move.cat}
              onChange={(e) => onChange({ ...move, cat: e.target.value as Move["cat"] })}
            >
              {CATS.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
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
        </>
      )}
    </div>
  );
}
