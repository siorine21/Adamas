interface Props {
  locked: boolean;
  onToggle: () => void;
}

/** AP配分のロック切替。アイコンだけで状態が分かるよう、
 *  解錠＝輪郭のみ（薄いグレー）／施錠＝塗り（アンバー）で描き分ける。
 *  絵文字ではなくアプリの配色に乗るインラインSVGにしている。 */
export function LockButton({ locked, onToggle }: Props) {
  const label = locked ? "AP配分のロックを解除する" : "AP配分をロックする";
  return (
    <button
      type="button"
      className={`lock-btn ${locked ? "on" : ""}`}
      aria-pressed={locked}
      aria-label={label}
      title={label}
      onClick={onToggle}
    >
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        {/* つる（解錠時は右上に開く） */}
        <path
          d={locked ? "M8 10.5V7a4 4 0 0 1 8 0v3.5" : "M8 10.5V7a4 4 0 0 1 7.7-1.4"}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
        {/* 錠の本体 */}
        <rect
          x="4.6" y="10.5" width="14.8" height="9.4" rx="2.2"
          fill={locked ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth="2"
        />
        {/* 鍵穴（施錠時は本体が塗られているので抜き色で見せる） */}
        <circle cx="12" cy="14.6" r="1.5" fill={locked ? "var(--panel2)" : "currentColor"} />
      </svg>
    </button>
  );
}
