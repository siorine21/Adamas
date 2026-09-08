import { AP_MAX_EACH } from "../data/game";

interface Props {
  value: number;
  /** この能力に振れる上限（＝min(32, 現在値＋残りAP)）。超える操作はここで止まる */
  max: number;
  onChange: (v: number) => void;
  /** ロック中は操作を受け付けない（スクロール時の誤操作防止） */
  locked?: boolean;
}

/** AP配分の入力。ポップアップを開かずその場でドラッグ／±で調整でき、
 *  合計66を超える値は max で頭打ちになる。 */
export function ApSlider({ value, max, onChange, locked }: Props) {
  const atCap = !locked && value >= max && max < AP_MAX_EACH;
  return (
    <div className={`ap-ctl ${locked ? "locked" : ""}`}>
      <button
        type="button"
        className="ap-step"
        aria-label="1減らす"
        disabled={locked || value <= 0}
        onClick={() => onChange(value - 1)}
      >
        −
      </button>
      <input
        className="ap-slider"
        type="range"
        min={0}
        max={AP_MAX_EACH}
        step={1}
        value={value}
        aria-label="AP"
        disabled={locked}
        // 上限を超えてドラッグしても max で止める（残りAPが無ければ動かない）
        onChange={(e) => onChange(Math.min(max, Number(e.target.value)))}
      />
      <button
        type="button"
        className="ap-step"
        aria-label="1増やす"
        disabled={locked || value >= max}
        onClick={() => onChange(value + 1)}
      >
        ＋
      </button>
      <span className={`ap-val tnum ${atCap ? "cap" : ""}`} title={atCap ? "残りAPが無いためここが上限です" : undefined}>
        {value}
      </span>
    </div>
  );
}
