import { useState } from "react";
import type { Move } from "../types";
import { BANNED_MOVES, LEARNSETS, MOVE_BY_NAME, MOVE_LIB } from "../data/moves";
import { MEGA_BASE, THREAT_LEARNSETS } from "../data/threatLearnsets";
import { TYPES, TYPE_COLORS } from "../data/game";
import { MoveSelect } from "./MoveSelect";
import { SelectMenu } from "./SelectMenu";
import { NumberInput } from "./NumberInput";

/** その種族の技ドロップダウン候補（習得技のみ or 全ライブラリ）と検証状況。
 *  レギュレーションで使用禁止になった技は候補から外し、banned で理由表示に使う。 */
export function moveOptionsFor(speciesName: string): {
  options: Move[];
  verified: boolean;
  status?: "full" | "partial";
  source?: string;
  banned: string[];
} {
  const banned = BANNED_MOVES[speciesName] ?? [];
  const ls = LEARNSETS[speciesName];
  if (ls) {
    const options = ls.moves
      .filter((n) => !banned.includes(n))
      .map((n) => MOVE_BY_NAME[n])
      .filter((m): m is Move => Boolean(m));
    return { options, verified: true, status: ls.status, source: ls.source, banned };
  }
  return { options: MOVE_LIB, verified: false, banned };
}

/** 仮想敵（内定ポケモン）の攻撃技の候補。被ダメ計算で「実際に覚える技」から選べるようにする。
 *
 *  引く順番:
 *    1. メガは元の姿に寄せる（習得技は同じ）
 *    2. はがね・あく系統は LEARNSETS（AppMedia＋実機確認の手当てつき）を優先
 *       （内定表は「ギルガルド(シールドフォルム)」のようにフォルム名が付くので、外しても引く）
 *    3. それ以外は THREAT_LEARNSETS（GameWith から全種族を取得）
 *  どれにも無ければ全技ライブラリ（verified: false）。変化技は計算に使わないので外す。 */
export function threatMoveOptions(confirmedName: string): {
  options: Move[];
  verified: boolean;
  source?: string;
} {
  const base = MEGA_BASE[confirmedName] ?? confirmedName;
  const noForm = base.replace(/[(（].*$/, "");
  const damaging = (names: string[]) => names
    .filter((n) => !(BANNED_MOVES[base] ?? BANNED_MOVES[noForm] ?? []).includes(n))
    .map((n) => MOVE_BY_NAME[n])
    .filter((m): m is Move => !!m && m.cat !== "変化");
  const ls = LEARNSETS[base] ?? LEARNSETS[noForm];
  if (ls) return { options: damaging(ls.moves), verified: true, source: ls.source };
  const gw = THREAT_LEARNSETS[base];
  if (gw) return { options: damaging(gw.split(" ")), verified: true, source: "GameWith個別ページ（チャンピオンズで覚える技）" };
  return { options: MOVE_LIB.filter((m) => m.cat !== "変化"), verified: false };
}

interface Props {
  move: Move | undefined;
  options: Move[];
  onChange: (m: Move | undefined) => void;
  /** 同じ技が他の枠にもある（手動入力で重複した場合の警告表示用） */
  duplicated?: boolean;
  /** 他の枠で使っている技名（候補から除外する） */
  exclude?: string[];
}

const CATS: Move["cat"][] = ["物理", "特殊", "変化"];

export function MoveEditor({ move, options, onChange, duplicated, exclude }: Props) {
  // 習得表が実機と食い違うことがあるので、全技ライブラリからも選べるようにする
  const [showAll, setShowAll] = useState(false);
  const inLearnset = !!move && options.some((o) => o.name === move.name);
  const inLib = !!move && !!MOVE_BY_NAME[move.name];
  // 習得表に無いがライブラリにはある技（実機に合わせて選んだ技）
  const offList = !!move && move.name !== "" && !inLearnset && inLib;
  const used = new Set(exclude ?? []);
  const pool = (showAll || offList ? MOVE_LIB : options)
    .filter((o) => o.name === move?.name || !used.has(o.name));
  // 候補が多い（全ライブラリ等）の時はポップアップ内に検索欄を出す
  const useSearch = pool.length > 150;
  // ライブラリにも無い名前＝完全な手動入力
  const isCustom = !!move && move.name !== "" && !inLib;
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
    const picked = pool.find((o) => o.name === v) ?? MOVE_BY_NAME[v];
    if (picked) return onChange({ ...picked });
    onChange(move ? { ...move, name: v } : { name: v, type: "ノーマル", power: 0, cat: "変化" });
  };

  return (
    <div className={`move-row ${duplicated ? "dup" : ""}`}>
      {/* ダメージ計算と同じ全幅のタイプ色付きドロップダウン（削除は「空にする」で行う） */}
      <MoveSelect
        moves={pool}
        value={showName ? "" : move?.name ?? ""}
        searchable={useSearch}
        placeholder="覚える技から選択 / 空"
        clearLabel="— 空にする —"
        extraLabel={showAll || offList ? undefined : `習得表に無い技も選ぶ（全${MOVE_LIB.length}技）`}
        onExtra={() => setShowAll(true)}
        manualLabel="手動入力（リスト外の技）"
        manualActive={showName}
        onChange={(v) => { setManual(false); commitName(v); }}
        onClear={() => { setManual(false); onChange(undefined); }}
        onManual={() => {
          setManual(true);
          if (!move) onChange({ name: "", type: "ノーマル", power: 0, cat: "変化" });
        }}
      />
      {offList && !showName && (
        <div className="small amber">
          習得表には無い技です（実機に合わせて選択中）。
        </div>
      )}

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
              <NumberInput
                value={move.power}
                onChange={(v) => onChange({ ...move, power: v })}
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
              <NumberInput
                value={move.acc ?? 0}
                max={100}
                allowEmpty
                onChangeEmpty={() => onChange({ ...move, acc: undefined })}
                onChange={(v) => onChange({ ...move, acc: v })}
              />
            </label>
            <label className="mini" title="空欄は不明">
              PP
              <NumberInput
                value={move.pp ?? 0}
                allowEmpty
                onChangeEmpty={() => onChange({ ...move, pp: undefined })}
                onChange={(v) => onChange({ ...move, pp: v })}
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
          <NumberInput
            style={{ flex: "0 1 80px" }}
            value={move.power}
            title="威力"
            onChange={(v) => onChange({ ...move, power: v })}
          />
        </div>
      )}
    </div>
  );
}
