interface Props {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  /** 入力できる上限（AP残量など、スライダーの max より手前で止めたいとき） */
  limitMax?: number;
  /** 値の表示（ランクの "+2" など） */
  format?: (v: number) => string;
  /** 値が上限に張り付いていることを強調する */
  atCap?: boolean;
  capTitle?: string;
  /** ロック中は操作を受け付けない（スクロール時の誤操作防止） */
  locked?: boolean;
  ariaLabel?: string;
  /** 値の桁数に応じた幅（"32" と "+6" で幅を揃えたいので指定できる） */
  valueWidth?: number;
}

/** 「− / スライダー / ＋ / 現在値」の数値入力。
 *  AP配分と能力ランクで同じ操作にするための共通部品。
 *  ドロップダウンを開かずその場で調整でき、縦スワイプはページのスクロールに渡す。 */
export function StepSlider({
  value, min, max, onChange, limitMax, format, atCap, capTitle, locked, ariaLabel, valueWidth,
}: Props) {
  const hardMax = limitMax ?? max;
  const label = format ? format(value) : String(value);
  return (
    <div className={`ap-ctl ${locked ? "locked" : ""}`}>
      <button
        type="button"
        className="ap-step"
        aria-label="1減らす"
        disabled={locked || value <= min}
        onClick={() => onChange(value - 1)}
      >
        −
      </button>
      <input
        className="ap-slider"
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        aria-label={ariaLabel}
        disabled={locked}
        // 上限を超えてドラッグしても hardMax で止める
        onChange={(e) => onChange(Math.min(hardMax, Number(e.target.value)))}
      />
      <button
        type="button"
        className="ap-step"
        aria-label="1増やす"
        disabled={locked || value >= hardMax}
        onClick={() => onChange(value + 1)}
      >
        ＋
      </button>
      <span
        className={`ap-val tnum ${atCap ? "cap" : ""}`}
        style={valueWidth ? { flexBasis: valueWidth } : undefined}
        title={atCap ? capTitle : undefined}
      >
        {label}
      </span>
    </div>
  );
}
