/** 検索語の表記ゆれを吸収する。
 *
 *  ポケモン名・技名・もちもの名はカタカナが多いが、スマホのフリック入力では
 *  ひらがなのまま打つほうが速い。「ぼすごどら」で「ボスゴドラ」に当たるよう、
 *  照合の前に両側を同じ形へ寄せる。
 *
 *  揃えるもの:
 *    ・ひらがな → カタカナ（ぁ〜ゖ）
 *    ・半角カナ・全角英数 → NFKC で通常形へ
 *    ・英字の大文字小文字
 */
export function normalizeKana(s: string): string {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));
}

/** 検索語から照合関数を作る。検索語は1回だけ正規化する。
 *  空の検索語は「絞り込まない」を意味するので常に true。 */
export function kanaMatcher(q: string): (text: string | null | undefined) => boolean {
  const needle = normalizeKana(q.trim());
  if (!needle) return () => true;
  return (text) => !!text && normalizeKana(text).includes(needle);
}
