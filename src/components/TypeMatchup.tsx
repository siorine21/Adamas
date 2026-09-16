import { useMemo } from "react";
import { TYPES, TYPE_COLORS } from "../data/game";
import { typeEffectiveness } from "../calc";

/** 受ける側の相性を倍率ごとにまとめたもの */
export interface Matchup {
  x4: string[];
  x2: string[];
  n: string[];
  h: string[];
  q: string[];
  z: string[];
}

/** 色は弱点表と同じ意味づけ（赤＝痛い／緑＝助かる） */
const ROWS: { key: keyof Matchup; label: string; cls: string }[] = [
  { key: "x4", label: "4倍", cls: "wk-x4" },
  { key: "x2", label: "2倍", cls: "wk-x2" },
  { key: "n", label: "等倍", cls: "wk-n" },
  { key: "h", label: "半減", cls: "wk-h" },
  { key: "q", label: "¼", cls: "wk-q" },
  { key: "z", label: "無効", cls: "wk-imm" },
];

export function matchupOf(defTypes: string[]): Matchup {
  const g: Matchup = { x4: [], x2: [], n: [], h: [], q: [], z: [] };
  for (const t of TYPES) {
    const m = typeEffectiveness(t, defTypes);
    const k = m === 0 ? "z" : m >= 4 ? "x4" : m > 1 ? "x2" : m === 1 ? "n" : m <= 0.25 ? "q" : "h";
    g[k].push(t);
  }
  return g;
}

interface Props {
  types: string[];
  /** 該当なしの倍率も行として出す（ツールの一覧表示用）。
   *  false なら中身のある倍率だけ出す（ダメージ計算に添えるとき用） */
  showEmpty?: boolean;
  /** 等倍は情報量が多いわりに使わないので、必要なときだけ出す */
  showNeutral?: boolean;
}

/** タイプの組み合わせが受ける相性を、倍率ごとに並べて表示する。
 *  ツールの「防御相性チェック」と、ダメージ計算の仮想敵の両方から使う。 */
export function TypeMatchup({ types, showEmpty = false, showNeutral = false }: Props) {
  const g = useMemo(() => matchupOf(types), [types]);
  const rows = ROWS
    .filter((r) => showNeutral || r.key !== "n")
    .filter((r) => showEmpty || g[r.key].length > 0);

  return (
    <div className="tool-rows">
      {rows.map((r) => (
        <div className="tool-row" key={r.key}>
          <span className={`tool-row-key ${r.cls}`}>{r.label}</span>
          <span className="tool-row-types">
            {g[r.key].length === 0
              ? <span className="small muted">なし</span>
              : g[r.key].map((t) => (
                <span key={t} className="tbadge" style={{ background: TYPE_COLORS[t] }}>{t}</span>
              ))}
          </span>
        </div>
      ))}
    </div>
  );
}
