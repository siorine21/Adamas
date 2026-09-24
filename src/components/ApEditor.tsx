import type { RosterEntry, StatKey } from "../types";
import { useStore } from "../store";
import { AP_MAX_EACH, AP_MAX_TOTAL, STAT_KEYS, STAT_LABEL, realStats } from "../data/game";
import { ApSlider } from "./ApSlider";
import { LockButton } from "./LockButton";

/** この個体の AP 合計・残り・各能力の上限。
 *  各32まで かつ 合計66まで。残りAPを超える入力は自動で頭打ちにする。 */
export function apBudget(entry: RosterEntry) {
  const total = STAT_KEYS.reduce((s, k) => s + entry.ap[k], 0);
  const remaining = AP_MAX_TOTAL - total;
  return {
    total,
    remaining,
    over: total > AP_MAX_TOTAL,
    maxFor: (k: StatKey) => Math.min(AP_MAX_EACH, entry.ap[k] + Math.max(0, remaining)),
  };
}

/** AP を1つ書き換える。上限の頭打ちは更新時点の値で判定する */
export function useSetAp() {
  const { updateEntry } = useStore();
  return (key: string, k: StatKey, v: number) =>
    updateEntry(key, (e) => {
      const total = STAT_KEYS.reduce((s, kk) => s + e.ap[kk], 0);
      const max = Math.min(AP_MAX_EACH, e.ap[k] + Math.max(0, AP_MAX_TOTAL - total));
      return { ...e, ap: { ...e.ap, [k]: Math.max(0, Math.min(max, v || 0)) } };
    });
}

/** AP の残量バーとロック。個体そのものを書き換えるので、どの画面から触っても
 *  チーム管理の手持ち・控えにそのまま反映される。 */
export function ApBudgetBar({ entry }: { entry: RosterEntry }) {
  const { updateEntry } = useStore();
  const { total, remaining, over } = apBudget(entry);
  return (
    <div className={`ap-budget ${over ? "over" : ""}`}>
      <div className="ap-bar">
        <div className="fill" style={{ width: `${Math.min(100, (total / AP_MAX_TOTAL) * 100)}%` }} />
      </div>
      <span className="small nowrap">
        AP <b className="tnum">{total}</b> / {AP_MAX_TOTAL}
        <span className="muted">　残り <b className="tnum">{Math.max(0, remaining)}</b></span>
      </span>
      {/* スクロール中にスライダーへ触れて配分が変わるのを防ぐロック */}
      <LockButton
        locked={!!entry.apLocked}
        onToggle={() => updateEntry(entry.key, { apLocked: !entry.apLocked })}
      />
    </div>
  );
}

interface Props {
  entry: RosterEntry;
  /** 表示する能力。省略すると HABCDS すべて（素早さ比較では S だけ出す） */
  keys?: StatKey[];
}

/** 能力値・AP配分の入力。チーム管理・ダメージ計算・素早さ比較で共通に使う。
 *  値は個体（roster）に直接書くので、どの画面で変えても同じ個体に残る。 */
export function ApEditor({ entry, keys = STAT_KEYS }: Props) {
  const setAp = useSetAp();
  const form = entry.forms[entry.activeForm] ?? entry.forms[0];
  const real = realStats(form.base, entry.ap, entry.nature);
  const { maxFor } = apBudget(entry);
  return (
    <>
      {keys.map((k) => (
        <div className="ap-row" key={k}>
          <div className="ap-head">
            <span className="ap-k">{k}<span className="small muted"> {STAT_LABEL[k]}</span></span>
            <span className="small muted">種族 {form.base[k]}</span>
            <span className="ap-real small">実数値 <b>{real[k]}</b></span>
          </div>
          <ApSlider
            value={entry.ap[k]}
            max={maxFor(k)}
            locked={entry.apLocked}
            onChange={(v) => setAp(entry.key, k, v)}
          />
        </div>
      ))}
    </>
  );
}
