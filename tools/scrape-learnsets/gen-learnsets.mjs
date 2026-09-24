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
const missing = [];

/* AppMedia の表には無いが、二つ目の出典（GameWith）にはある技。
   AppMedia のページはレギュM-Cで解禁された技が反映されていないことがある。
   champ_moves.json は再取得で上書きされるので、追加はここに置く。
   ※ 片方の出典にしか無いものを足すので、根拠を必ずコメントに書くこと。 */
const EXTRA = {
  // きりさく: レギュM-Cで解禁（本編威力70→80・急所ランク+1）。
  // GameWith の個別ページでは下の5系統に載っているが、AppMedia の表は未更新。
  "ハッサム": ["きりさく", "ダブルウイング"], // ダブルウイング: 2026/9 実機確認
  "エアームド": ["きりさく"],
  "ドリュウズ": ["きりさく"],
  "ドドゲザン": ["きりさく"],
  "ブリジュラス": ["きりさく"],
  "メタグロス": ["でんじふゆう"], // 2026/9 実機確認（AppMediaは「でんじは」と誤記）
  // きりさく: 上と同じレギュM-C解禁。ギルガルドは以前 GameWith のページを引けず
  // 突き合わせていなかったが、内定全種族の取得（scrape-threats.cjs）で GameWith に載っていると判明
  "ギルガルド": ["きりさく"],
};

/* AppMedia の表にあるが、実機では覚えない技。
   AppMedia の誤記・古い記載を打ち消す。EXTRA と同じく再取得では消えない。
   ※ 必ず実機かGameWithの裏取りを添えること。 */
const EXCLUDE = {
  // 2026/9 実機確認。技おしえ画面で でんき欄は「かみなりパンチ / でんじふゆう」のみ
  "メタグロス": ["でんじは"],
  // 2026/9 実機確認。技おしえ画面で
  //   かくとう＝かわらわり・きあいだま のみ／ひこう＝つばめがえし のみ／
  //   エスパー＝ねむる のみ／じめんは どろかけ で終端（まきびし無し）。
  //   もろはのずつき は画面外だが GameWith にも無いため併せて外す。
  "ドリュウズ": ["きあいパンチ", "ばかぢから", "インファイト", "まきびし",
    "エアスラッシュ", "サイコカッター", "もろはのずつき"],
};

/** はがね24系統。AppMedia（champ_moves.json）を主、GameWith を裏取りに使う */
const STEEL = ["フォレトス","ハガネール","ハッサム","エアームド","クチート","ボスゴドラ","チリーン",
 "メタグロス","エンペルト","トリデプス","ルカリオ","ドリュウズ","ガラルマッギョ","ギルガルド",
 "ヒスイヌメルゴン","クレッフィ","グソクムシャ","アーマーガア","ニャイキング","デカヌチャン","ミミズズ","ドドゲザン","サーフゴー","ブリジュラス"];

/** あく系統。AppMedia 側のあく一覧URLが未調査なので、こちらは GameWith を主にする。
 *  ドドゲザン（あく/はがね）は STEEL 側で既に出しているのでここには入れない。 */
const DARK = ["アローラペルシアン","ブラッキー","ヘルガー","バンギラス","ヤミラミ","サメハダー","アブソル",
 "ミカルゲ","マニューラ","レパルダス","ワルビアル","ズルズキン","ゾロアーク","サザンドラ","ゲッコウガ",
 "ゴロンダ","カラマネロ","ガオガエン","フォクスライ","オーロンゲ","モルペコ","マスカーニャ","マフィティフ",
 "ヒスイダイケンキ","ハリーマン","ギャラドス"];

/** GameWith 由来（裏取り用・あくの主データ）。
 *  scrape-gamewith.cjs で引けなかった系統（アローラペルシアン等）は、
 *  内定全種族の取得（scrape-threats.cjs → gamewith_threat_moves.json）で補う */
const gw = (() => {
  const read = (p) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : {});
  const base = read("tools/scrape-learnsets/gamewith_moves.json");
  const threats = read("tools/scrape-learnsets/gamewith_threat_moves.json");
  for (const [t, v] of Object.entries(threats)) {
    if (!(base[t]?.length) && v.moves?.length) base[t] = v.moves;
  }
  return base;
})();

const clean = (names, t) => {
  const drop = new Set(EXCLUDE[t] || []);
  return [...new Set(names)]
    .filter((m) => libset.has(m) && !drop.has(m))
    .sort((a, b) => (order.get(a) ?? 9999) - (order.get(b) ?? 9999));
};

const blocks = [
  ...STEEL.map((t) => {
    const mv = clean([...(cm[t] || []), ...(EXTRA[t] || [])], t);
    const src = EXTRA[t] || EXCLUDE[t]
      ? "AppMedia個別ページ＋補正（GameWith・実機確認）2026/9"
      : "AppMedia個別ページ（チャンピオンズ覚えるワザ）2026/9";
    return `  "${t}": { status: "full", source: "${src}", moves: [${mv.map((m) => `"${m}"`).join(", ")}] },`;
  }),
  ...DARK.map((t) => {
    const mv = clean([...(gw[t] || []), ...(EXTRA[t] || [])], t);
    // 取得できなかった系統は収録しない（空の習得表を置くと「覚える技なし」に見えるため）
    if (mv.length === 0) { missing.push(t); return null; }
    return `  "${t}": { status: "full", source: "GameWith個別ページ（チャンピオンズ覚えるワザ）2026/9", moves: [${mv.map((m) => `"${m}"`).join(", ")}] },`;
  }).filter(Boolean),
];

const ls = `/* ============================================================
   種族別習得技データベース（ポケモンチャンピオンズ準拠）
   出典: はがね系統は AppMedia、あく系統は GameWith の
        チャンピオンズ各ポケモン個別ページの「チャンピオンズで覚える技」表。
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
if (missing.length) console.warn("取得できず未収録:", missing.join(", "));
