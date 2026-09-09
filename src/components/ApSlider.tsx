import { AP_MAX_EACH } from "../data/game";
import { StepSlider } from "./StepSlider";

interface Props {
  value: number;
  /** この能力に振れる上限（＝min(32, 現在値＋残りAP)）。超える操作はここで止まる */
  max: number;
  onChange: (v: number) => void;
  /** ロック中は操作を受け付けない（スクロール時の誤操作防止） */
  locked?: boolean;
}

/** AP配分の入力。操作方法は能力ランクと共通（StepSlider）。
 *  合計66を超える値は max で頭打ちになる。 */
export function ApSlider({ value, max, onChange, locked }: Props) {
  return (
    <StepSlider
      value={value}
      min={0}
      max={AP_MAX_EACH}
      limitMax={max}
      onChange={onChange}
      locked={locked}
      ariaLabel="AP"
      atCap={!locked && value >= max && max < AP_MAX_EACH}
      capTitle="残りAPが無いためここが上限です"
    />
  );
}
