import { useMemo } from "react";
import type { KoResult } from "../calc";
import { searchBulk, type BulkPlan } from "../attack";
import { usePersistedState } from "../uiState";
import { Panel } from "./Panel";

interface Props {
  moveName: string;
  /** 防御に使う能力（物理技なら B、特殊技なら D） */
  defKey: "B" | "D";
  /** 今の配分 */
  current: BulkPlan;
  /** H と防御に回せるAPの合計（66 − ほかの能力に振っているぶん） */
  budget: number;
  /** H に h、防御に d 振ったとき、n回の行動を確定で耐えるか */
  survive: (h: number, d: number, n: number) => boolean;
  /** その配分での確定数（表示用） */
  koFor: (h: number, d: number) => KoResult | null;
  /** 入力が変わったときだけ計算し直すための鍵 */
  memoKey: string;
  onApply: (plan: BulkPlan) => void;
  /** AP をロックしている（誤操作防止）なら反映しない */
  locked: boolean;
}

/** 耐久調整の逆算。「この攻撃を確定で耐える」ための H と B（または D）の
 *  AP を、合計が最小になるよう探して出す。ほかの能力に振っているAPはそのまま。 */
export function BulkTuner(p: Props) {
  const [n, setN] = usePersistedState<number>("dmg.bulkN", 1, (v) => v === 1 || v === 2);

  // 探索は数十ms かかることがあるので、入力が変わったときだけやり直す
  const { plan, nowOk } = useMemo(() => ({
    plan: searchBulk((h, d) => p.survive(h, d, n), p.budget),
    nowOk: p.survive(p.current.h, p.current.d, n),
  }), [p.memoKey, n]); // eslint-disable-line react-hooks/exhaustive-deps

  const k = p.defKey;
  const fmt = (x: BulkPlan) => `H${x.h} ${k}${x.d}`;
  const summary = !plan
    ? `${n}発は確定で耐えない`
    : nowOk ? `今の配分で${n}発耐える（最小 ${fmt(plan)}）` : `${fmt(plan)} で${n}発耐える`;
  const planKo = plan ? p.koFor(plan.h, plan.d) : null;
  const same = plan && plan.h === p.current.h && plan.d === p.current.d;
  const freed = plan ? (p.current.h + p.current.d) - (plan.h + plan.d) : 0;

  return (
    <Panel id="dmg.bulk" title="耐久調整" summary={summary} defaultOpen={false}>
      <div className="small muted" style={{ marginBottom: 6 }}>
        {p.moveName} を確定で耐えるのに要る H と {k} のAP。ほかの能力と性格はそのまま、今の戦闘条件で探します。
      </div>
      <div className="seg" style={{ maxWidth: 240, marginBottom: 8 }}>
        {[1, 2].map((v) => (
          <button key={v} type="button" className={`sort-chip ${n === v ? "on" : ""}`} onClick={() => setN(v)}>
            {v}発耐え
          </button>
        ))}
      </div>

      {!plan ? (
        <div className="banner warn">
          H と {k} に振れるだけ振っても（残りAP {p.budget} の範囲で）、{n}発を確定では耐えられません。
          性格・持ち物・ほかの能力のAPを見直すか、乱数で耐える前提で考える必要があります。
        </div>
      ) : (
        <>
          <div className="bulk-plan">
            <div>
              <span className="small muted">必要なAP</span>
              <div className="bulk-num tnum">H {plan.h} ／ {k} {plan.d}<span className="small muted">（合計 {plan.h + plan.d}）</span></div>
            </div>
            <div>
              <span className="small muted">今</span>
              <div className="tnum">H {p.current.h} ／ {k} {p.current.d}<span className="small muted">（合計 {p.current.h + p.current.d}）</span></div>
            </div>
          </div>
          {planKo && (
            <div className="small" style={{ marginTop: 4 }}>
              この配分だと <b>{planKo.verdict}</b>{planKo.detail && <span className="amber"> {planKo.detail}</span>}
              <span className="muted tnum">（{planKo.minPct.toFixed(1)}〜{planKo.maxPct.toFixed(1)}%）</span>
            </div>
          )}
          <div className="small muted" style={{ marginTop: 2 }}>
            {nowOk
              ? freed > 0
                ? `今の配分でも耐えます。最小にすると ${freed} AP 浮き、ほかの能力に回せます。`
                : "今の配分でも耐えます。"
              : `今の配分では${n}発を確定では耐えません。`}
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <button
              type="button"
              className="btn primary small"
              disabled={!!same || p.locked}
              onClick={() => {
                if (!plan) return;
                // 今の配分で既に耐えていると、最小配分は「振ったAPを下げる」方向になる。
                // 1タップで大きく下がると取り返しがつきにくいので、下げるときだけ確かめる
                const down = plan.h < p.current.h || plan.d < p.current.d;
                if (down && !confirm(
                  `AP を H${p.current.h}→${plan.h} ／ ${k}${p.current.d}→${plan.d} に変更します。`
                  + `\n振っていたAPを下げます。よろしいですか？`,
                )) return;
                p.onApply(plan);
              }}
              title={p.locked ? "APがロック中です（チーム管理・AP配分の鍵で解除）" : "この個体のAPを書き換えます"}
            >
              {same ? "この配分になっています" : "この配分にする"}
            </button>
            {p.locked && <span className="small muted">APがロック中のため反映できません</span>}
          </div>
        </>
      )}
    </Panel>
  );
}
