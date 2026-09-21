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
  /** スライダーを出さず ＋/− ボタンだけにする。
   *
   *  Android Chrome の <input type=range> はトラックを触っただけで つまみが
   *  そこへ飛ぶので、スクロール中に指がバーをかすめると値が変わってしまう。
   *  （iOS Safari は「つまみから始めたドラッグ」しか受け付けないので起きない。
   *   touch-action: pan-y で真下へのスワイプは逃がしているが、少し斜めに
   *   滑らせると横ドラッグと見なされる。）
   *  刻みが少なく（能力ランクは13段階）、値が狂うと計算結果ごと変わる入力は
   *  バーを持たず、押した場所でしか効かないボタンだけにする。 */
  noSlider?: boolean;
}

/** 「− / スライダー / ＋ / 現在値」の数値入力。
 *  AP配分と能力ランクで同じ操作にするための共通部品。
 *  noSlider を付けるとバーが消え、「− 現在値 ＋」になる。 */
export function StepSlider({
  value, min, max, onChange, limitMax, format, atCap, capTitle, locked, ariaLabel,
  valueWidth, noSlider,
}: Props) {
  const hardMax = limitMax ?? max;
  const label = format ? format(value) : String(value);

  const valueEl = (
    <span
      className={`ap-val tnum ${atCap ? "cap" : ""}`}
      style={valueWidth ? { flexBasis: valueWidth } : undefined}
      title={atCap ? capTitle : undefined}
    >
      {label}
    </span>
  );

  return (
    <div className={`ap-ctl ${locked ? "locked" : ""} ${noSlider ? "nobar" : ""}`}>
      <button
        type="button"
        className="ap-step"
        aria-label="1減らす"
        disabled={locked || value <= min}
        onClick={() => onChange(value - 1)}
      >
        −
      </button>
      {/* バー無しのときは値を真ん中に置いて、左右のボタンと対で読めるようにする */}
      {noSlider ? valueEl : (
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
      )}
      <button
        type="button"
        className="ap-step"
        aria-label="1増やす"
        disabled={locked || value >= hardMax}
        onClick={() => onChange(value + 1)}
      >
        ＋
      </button>
      {noSlider ? null : valueEl}
    </div>
  );
}
