import { useState } from "react";
import type { Move } from "../types";
import { LEARNSETS, MOVE_BY_NAME, MOVE_LIB } from "../data/moves";
import { TYPES, TYPE_COLORS } from "../data/game";
import { MoveSelect } from "./MoveSelect";
import { SelectMenu } from "./SelectMenu";

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
  // 候補が多い（全ライブラリ等）の時はポップアップ内に検索欄を出す
  const useSearch = options.length > 150;
  // 選択中の技が候補に無い（かつ空でない）＝手動入力扱い
  const isCustom = !!move && move.name !== "" && !options.some((o) => o.name === move.name);
  const [manual, setManual] = useState(false);
  const showName = manual || isCustom;
  // 手動入力（リスト外の技）のときだけ、タイプ/威力/分類などの編集欄を出す。
  // ライブラリ技はゲーム側の値が確定しているので編集欄は不要（ドロップダウンに表示済み）。
  const editOpen = !!move && showName;
  // ライブラリ上の威力が0＝威力変動技（ハードプレス・ジャイロボール等）。
  // ユーザーが威力を入れても元技の威力で判定するので、入力欄は出したまま。
  const libBase = move ? MOVE_BY_NAME[move.name] : undefined;
  const isVariablePower = !!move && !showName && move.cat !== "変化" && !!libBase && libBase.power === 0;

  const commitName = (v: string) => {
    if (!v) return onChange(undefined);
    const picked = options.find((o) => o.name === v) ?? MOVE_BY_NAME[v];
    if (picked) return onChange({ ...picked });
    onChange(move ? { ...move, name: v } : { name: v, type: "ノーマル", power: 0, cat: "変化" });
  };

  return (
    <div className="move-row">
      {/* ダメージ計算と同じ全幅のタイプ色付きドロップダウン（削除は「空にする」で行う） */}
      <MoveSelect
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

      {/* 手動入力（リスト外の技）のときだけ詳細編集欄を表示 */}
      {editOpen && (
        <>
          <input
            type="text"
            value={move.name}
            placeholder="技名を入力"
            onChange={(e) => onChange({ ...move, name: e.target.value })}
          />
          <div className="move-edit">
            <SelectMenu
              style={{ flex: "0 1 130px" }}
              items={TYPES.map((t) => ({ value: t, label: t, swatch: TYPE_COLORS[t] }))}
              value={move.type}
              onChange={(v) => onChange({ ...move, type: v })}
            />
            <label className="mini">
              威力
              <input
                type="number"
                min={0}
                value={move.power}
                onChange={(e) => onChange({ ...move, power: Math.max(0, Number(e.target.value) || 0) })}
              />
            </label>
            <SelectMenu
              style={{ flex: "0 1 90px" }}
              items={CATS.map((c) => ({ value: c, label: c }))}
              value={move.cat}
              onChange={(v) => onChange({ ...move, cat: v as Move["cat"] })}
            />
            <label className="mini" title="0で必中、空欄は不明">
              命中
              <input
                type="number"
                min={0}
                max={100}
                value={move.acc ?? ""}
                onChange={(e) => onChange({ ...move, acc: e.target.value === "" ? undefined : Math.max(0, Math.min(100, Number(e.target.value) || 0)) })}
              />
            </label>
            <label className="mini" title="空欄は不明">
              PP
              <input
                type="number"
                min={0}
                value={move.pp ?? ""}
                onChange={(e) => onChange({ ...move, pp: e.target.value === "" ? undefined : Math.max(0, Number(e.target.value) || 0) })}
              />
            </label>
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
              <input type="checkbox" checked={!!move.useTargetAtk} onChange={(e) => onChange({ ...move, useTargetAtk: e.target.checked })} />
              相手A参照
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

      {/* 威力変動技：ライブラリ技でも威力の自由入力欄を出す */}
      {isVariablePower && (
        <div className="move-edit">
          <span className="small muted" style={{ flex: "1 1 auto" }}>威力変動技 — 威力を入力</span>
          <input
            style={{ flex: "0 1 80px" }}
            type="number"
            min={0}
            value={move.power}
            title="威力"
            onChange={(e) => onChange({ ...move, power: Math.max(0, Number(e.target.value) || 0) })}
          />
        </div>
      )}
    </div>
  );
}
