import { useMemo } from "react";
import type { RosterEntry } from "../types";
import { useStore } from "../store";
import { TYPES, TYPE_COLORS } from "../data/game";
import { CONFIRMED } from "../data/confirmed";
import { typeEffectiveness } from "../calc";
import { displayName } from "../data/roster";
import { usePersistedState } from "../uiState";

/** 打点の表示ラベル（技が無い／攻撃技を持たない場合は空欄扱い） */
function mulLabel(m: number | null): string {
  if (m === null) return "・";
  if (m === 0) return "0";
  if (m >= 4) return "×4";
  if (m > 1) return "×2";
  if (m === 1) return "—";
  if (m <= 0.25) return "¼";
  return "½";
}

/** 打点のセル色分け（抜群=緑＝良い、半減以下=赤＝通らない）。守備表とは色の意味が逆になる。 */
function mulClass(m: number | null): string {
  if (m === null) return "cv-none";
  if (m === 0) return "cv-imm";
  if (m >= 4) return "cv-x4";
  if (m > 1) return "cv-x2";
  if (m === 1) return "cv-n";
  if (m <= 0.25) return "cv-q";
  return "cv-h";
}

/** その個体が持つ攻撃技のタイプ（重複なし） */
function attackTypes(e: RosterEntry): string[] {
  const set = new Set<string>();
  for (const m of e.moves) {
    if (m.cat === "変化") continue;
    if (m.name.trim() === "") continue;
    set.add(m.type);
  }
  return [...set];
}

/** 攻撃技のタイプの組み合わせで、どのタイプに打点があるかを見る。
 *  単タイプ18種に対する最大倍率と、内定ポケモン（実際の複合タイプ）への通りの両方を出す。 */
export function CoverageTable() {
  const { roster } = useStore();
  const [open, setOpen] = usePersistedState("team.cvOpen", true, (v) => typeof v === "boolean");
  const [onlyWeakSpot, setOnlyWeakSpot] = usePersistedState("team.cvOnly", false, (v) => typeof v === "boolean");

  const team = useMemo(() => roster.filter((e) => e.starred), [roster]);
  const atkTypes = useMemo(() => team.map(attackTypes), [team]);

  // 単タイプ18種に対する各個体の最大倍率
  const rows = useMemo(
    () =>
      TYPES.map((t) => {
        const cells = atkTypes.map((types) =>
          types.length === 0 ? null : Math.max(...types.map((mt) => typeEffectiveness(mt, [t]))),
        );
        return {
          type: t,
          cells,
          super: cells.filter((m) => m !== null && m > 1).length,
        };
      }),
    [atkTypes],
  );

  // 内定ポケモン（複合タイプ込み）への通り。チーム全体で誰か1体でも抜群を取れるか。
  const vsConfirmed = useMemo(() => {
    const all = atkTypes.flat();
    if (all.length === 0) return null;
    const noSuper: string[] = [];
    let superCount = 0;
    for (const c of CONFIRMED) {
      const best = Math.max(...all.map((mt) => typeEffectiveness(mt, c.types)));
      if (best > 1) superCount += 1;
      else noSuper.push(c.name);
    }
    return { superCount, noSuper };
  }, [atkTypes]);

  const noSuperTypes = rows.filter((r) => r.super === 0).map((r) => r.type);
  const shown = onlyWeakSpot ? rows.filter((r) => r.super === 0) : rows;

  if (team.length === 0) return null;

  return (
    <div className="panel">
      <button type="button" className="wk-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className={`card-caret ${open ? "open" : ""}`}>▶</span>
        <span className="section-title" style={{ margin: 0, border: "none", padding: 0 }}>
          攻撃範囲チェック（★手持ち{team.length}体の技のタイプ）
        </span>
      </button>

      {noSuperTypes.length > 0 && (
        <div className="banner warn" style={{ marginTop: 6 }}>
          誰も抜群を取れないタイプ: {noSuperTypes.join(" / ")}
        </div>
      )}
      {vsConfirmed && (
        <div className="banner info">
          内定{CONFIRMED.length}体のうち <b>{vsConfirmed.superCount}体</b>（
          {Math.round((vsConfirmed.superCount / CONFIRMED.length) * 100)}%）に、誰かが抜群を取れます。
          {vsConfirmed.noSuper.length > 0 && (
            <>
              {" "}抜群なし {vsConfirmed.noSuper.length}体:{" "}
              <span className="muted">
                {vsConfirmed.noSuper.slice(0, 12).join("・")}
                {vsConfirmed.noSuper.length > 12 && ` ほか${vsConfirmed.noSuper.length - 12}体`}
              </span>
            </>
          )}
        </div>
      )}

      {open && (
        <>
          <div className="wk-legend">
            {team.map((e, i) => {
              const form = e.forms[e.activeForm] ?? e.forms[0];
              const types = atkTypes[i];
              return (
                <span className="small muted" key={e.key}>
                  <b className="wk-no">{i + 1}</b> {displayName(e.name, form.form)}
                  <span className="muted">（{types.length > 0 ? types.join("・") : "攻撃技なし"}）</span>
                </span>
              );
            })}
          </div>

          <label className="row tight small" style={{ cursor: "pointer", margin: "6px 0" }}>
            <input type="checkbox" checked={onlyWeakSpot} onChange={(e) => setOnlyWeakSpot(e.target.checked)} />
            抜群を取れないタイプだけ表示（{noSuperTypes.length} / {TYPES.length} タイプ）
          </label>

          <div className="table-scroll">
            <table className="wk cv">
              <thead>
                <tr>
                  <th>相手タイプ</th>
                  {team.map((_, i) => <th key={i} className="num">{i + 1}</th>)}
                  <th className="num">抜群</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.type}>
                    <td>
                      <span className="tbadge" style={{ background: TYPE_COLORS[r.type] }}>{r.type}</span>
                    </td>
                    {r.cells.map((m, i) => (
                      <td key={i} className={`num ${mulClass(m)}`}>{mulLabel(m)}</td>
                    ))}
                    <td className={`num ${r.super === 0 ? "cv-h" : ""}`}><b>{r.super}</b></td>
                  </tr>
                ))}
                {shown.length === 0 && (
                  <tr>
                    <td colSpan={team.length + 2} className="muted small">
                      18タイプすべてに、誰かが抜群を取れます。
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="small muted" style={{ marginTop: 6 }}>
            各個体の攻撃技のうち、最も相性の良い倍率を表示（×4／×2＝抜群、½／¼＝半減、0＝無効、・＝攻撃技なし）。
            単タイプ相手の倍率です。特性（もらいび・ふゆう等）による無効化や、技の威力・実数値は考慮しません。
          </div>
        </>
      )}
    </div>
  );
}
