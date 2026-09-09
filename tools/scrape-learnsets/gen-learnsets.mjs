/*
 * champ_moves.json（scrape.cjs の出力）から src/data/moves.ts の LEARNSETS ブロックを
 * 再生成する。MOVE_LIB に存在する技名のみを、MOVE_LIB の並び順で収録する。
 * 実行: node tools/scrape-learnsets/gen-learnsets.mjs
 */
import fs from "node:fs";

const MOVES = "src/data/moves.ts";
const cm = JSON.parse(fs.readFileSync("tools/scrape-learnsets/champ_moves.json", "utf8"));
const src = fs.readFileSync(MOVES, "utf8");
const head = src.slice(0, src.indexOf("/* ===="));
const lib = [...head.matchAll(/M\("([^"]+)"/g)].map((m) => m[1]);
const order = new Map(lib.map((n, i) => [n, i]));
const libset = new Set(lib);

const TARGETS = ["フォレトス","ハガネール","ハッサム","エアームド","クチート","ボスゴドラ","チリーン",
 "メタグロス","エンペルト","トリデプス","ルカリオ","ドリュウズ","ガラルマッギョ","ギルガルド",
 "ヒスイヌメルゴン","クレッフィ","グソクムシャ","アーマーガア","ニャイキング","デカヌチャン","ミミズズ","ドドゲザン","サーフゴー","ブリジュラス"];

const blocks = TARGETS.map((t) => {
  const mv = [...new Set(cm[t] || [])].filter((m) => libset.has(m))
    .sort((a, b) => (order.get(a) ?? 9999) - (order.get(b) ?? 9999));
  const arr = mv.map((m) => `"${m}"`).join(", ");
  return `  "${t}": { status: "full", source: "AppMedia個別ページ（チャンピオンズ覚えるワザ）2026/9", moves: [${arr}] },`;
});

const ls = `/* ============================================================
   種族別習得技データベース（ポケモンチャンピオンズ準拠）
   出典: AppMedia のチャンピオンズ各ポケモン個別ページの「チャンピオンズで覚える技」表。
        tools/scrape-learnsets で描画取得したデータから自動生成。
        （同ページに並ぶ本編の技マシン／タマゴ技表は含めない＝チャンピオンズでは使えない）
        メガ/フォルムは基本種の習得を共有。
   ※レギュレーションで使用禁止の技は別管理（このファイルの BANNED_MOVES）。
   ※未収録の種族は全技ライブラリ＋「習得可否未検証」警告で表示。
   ============================================================ */
export const LEARNSETS: Record<string, Learnset> = {
${blocks.join("\n")}
};
`;
fs.writeFileSync(MOVES, head + ls);
console.log("LEARNSETS regenerated for", blocks.length, "species");
