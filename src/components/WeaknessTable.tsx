import { useMemo } from "react";
import { useStore } from "../store";
import { TYPES, TYPE_COLORS } from "../data/game";
import { typeEffectiveness } from "../calc";
import { displayName } from "../data/roster";
import { usePersistedState } from "../uiState";

/** 倍率の表示ラベル（1は「—」＝等倍） */
function mulLabel(m: number): string {
  if (m === 0) return "0";
  if (m >= 4) return "×4";
  if (m > 1) return "×2";
  if (m === 1) return "—";
  if (m <= 0.25) return "¼";
  return "½";
}

/** 倍率のセル色分け（弱点=赤系、半減以下=緑系） */
function mulClass(m: number): string {
  if (m === 0) return "wk-imm";
  if (m >= 4) return "wk-x4";
  if (m > 1) return "wk-x2";
  if (m === 1) return "wk-n";
  if (m <= 0.25) return "wk-q";
  return "wk-h";
}

/** ★手持ちの防御相性を18タイプ×6体の表で見る。
 *  はがね統一は弱点が ほのお/じめん/かくとう に偏るため、重なりの把握が構成の要になる。 */
export function WeaknessTable() {
  const { roster } = useStore();
  const [open, setOpen] = usePersistedState("team.weakOpen", true, (v) => typeof v === "boolean");
  const [onlyWeak, setOnlyWeak] = usePersistedState("team.weakOnly", true, (v) => typeof v === "boolean");

  const team = useMemo(() => roster.filter((e) => e.starred), [roster]);

  const rows = useMemo(
    () =>
      TYPES.map((t) => {
        const cells = team.map((e) => {
          const form = e.forms[e.activeForm] ?? e.forms[0];
          return typeEffectiveness(t, form.types);
        });
        return {
          type: t,
          cells,
          weak: cells.filter((m) => m > 1).length,
          quad: cells.filter((m) => m >= 4).length,
        };
      }),
    [team],
  );

  const shown = onlyWeak ? rows.filter((r) => r.weak > 0) : rows;
  // 半数以上が弱点を突かれるタイプ＝抜けている（構成上の穴）
  const risky = rows.filter((r) => team.length > 0 && r.weak * 2 >= team.length && r.weak >= 2);

  if (team.length === 0) return null;

  return (
    <div className="panel">
      <button type="button" className="wk-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className={`card-caret ${open ? "open" : ""}`}>▶</span>
        <span className="section-title" style={{ margin: 0, border: "none", padding: 0 }}>
          弱点チェック（★手持ち{team.length}体の防御相性）
        </span>
      </button>

      {risky.length > 0 && (
        <div className="banner warn" style={{ marginTop: 6 }}>
          半数以上が弱点:{" "}
          {risky.map((r) => `${r.type}(${r.weak}体${r.quad > 0 ? `・4倍${r.quad}` : ""})`).join(" / ")}
        </div>
      )}

      {open && (
        <>
          <div className="wk-legend">
            {team.map((e, i) => {
              const form = e.forms[e.activeForm] ?? e.forms[0];
              return (
                <span className="small muted" key={e.key}>
                  <b className="wk-no">{i + 1}</b> {displayName(e.name, form.form)}
                </span>
              );
            })}
          </div>

          <label className="row tight small" style={{ cursor: "pointer", margin: "6px 0" }}>
            <input type="checkbox" checked={onlyWeak} onChange={(e) => setOnlyWeak(e.target.checked)} />
            弱点のあるタイプだけ表示（{rows.filter((r) => r.weak > 0).length} / {TYPES.length} タイプ）
          </label>

          <div className="table-scroll">
            <table className="wk">
              <thead>
                <tr>
                  <th>攻撃タイプ</th>
                  {team.map((_, i) => <th key={i} className="num">{i + 1}</th>)}
                  <th className="num">弱点</th>
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
                    <td className={`num ${r.weak * 2 >= team.length && r.weak >= 2 ? "wk-x2" : ""}`}>
                      <b>{r.weak}</b>
                      {r.quad > 0 && <span className="small"> (4倍{r.quad})</span>}
                    </td>
                  </tr>
                ))}
                {shown.length === 0 && (
                  <tr><td colSpan={team.length + 2} className="muted small">弱点を突かれるタイプはありません。</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="small muted" style={{ marginTop: 6 }}>
            ×4／×2 = 弱点、½／¼ = 半減、0 = 無効。特性（もらいび・ふゆう等）は含みません。
          </div>
        </>
      )}
    </div>
  );
}
