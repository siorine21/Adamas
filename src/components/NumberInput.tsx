import { useState, type CSSProperties } from "react";

interface Props {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  style?: CSSProperties;
  className?: string;
  title?: string;
  placeholder?: string;
  /** 空欄を許す場合（未設定＝不明を表せる命中・PP等）。空欄時は undefined を返す */
  allowEmpty?: boolean;
  onChangeEmpty?: () => void;
}

/** 数値入力。初期値0のまま数字を打つと「0120」のように0の右から入るので、
 *  フォーカス時にいったん空にして打ち直せるようにしている（何も入れずに離れたら元の値に戻る）。 */
export function NumberInput({
  value, onChange, min = 0, max, style, className, title, placeholder,
  allowEmpty, onChangeEmpty,
}: Props) {
  // 編集中だけ文字列を保持する（null＝非編集中で、表示は value そのもの）
  const [draft, setDraft] = useState<string | null>(null);
  const clamp = (n: number) => {
    let v = n;
    if (min !== undefined) v = Math.max(min, v);
    if (max !== undefined) v = Math.min(max, v);
    return v;
  };

  return (
    <input
      type="number"
      inputMode="numeric"
      className={className}
      style={style}
      title={title}
      placeholder={placeholder}
      min={min}
      max={max}
      value={draft ?? String(value)}
      onFocus={(e) => {
        setDraft(""); // 0を消してから打てるようにする
        e.currentTarget.select();
      }}
      onChange={(e) => {
        const t = e.target.value;
        setDraft(t);
        if (t === "") {
          if (allowEmpty) onChangeEmpty?.();
          return; // 空欄のうちは値を変えない（消してから打ち直せる）
        }
        const n = Number(t);
        if (Number.isFinite(n)) onChange(clamp(n));
      }}
      onBlur={() => setDraft(null)} // 何も入れずに離れたら元の値に戻す
    />
  );
}
