/*
 * 習得技・技データの「二つ目の出典」。GameWith のチャンピオンズ各ポケモンページから
 * 「〜が覚える技」を取得し、AppMedia 由来のデータ（champ_moves.json）と突き合わせる。
 *
 * 出典が1つだとサイト側の誤りに気づけない。
 * 加えて GameWith は PP 列を持つ（AppMedia には無い）ので、
 * チャンピオンズの PP を直せる唯一の出典でもある。
 *
 * 技の一覧は <table> ではなく、技名/威力/命中/PP が縦に並ぶだけの DOM なので、
 * innerText を「その4行が揃っている箇所」として行単位で読む。
 *
 * 取得するもの:
 *   gamewith_move_stats.json … 技一覧ページ＋各個別ページの 威力/命中/PP
 *   gamewith_moves.json      … 種族ごとの「チャンピオンズで覚える技」
 *
 * 実行: .github/workflows/scrape-learnsets.yml から。
 *   ローカルなら: npm i --no-save playwright && npx playwright install chromium
 *                 node tools/scrape-learnsets/scrape-gamewith.cjs
 *
 * 礼儀: 低頻度・少量（50ページ強）・ページ間に待機。
 */
const { chromium } = require("playwright");
const fs = require("fs");

/** 技（わざ）一覧。チャンピオンズ全技の 威力・命中・PP が1ページに載っている。
 *  PP は AppMedia に列が無いので、ここが唯一の出典。 */
const MOVE_LIST = "https://gamewith.jp/pokemon-champions/546417";

/** 個別ページのURLを引くための一覧。内定ポケモン一覧だけでは後半の世代が出ないので、
 *  はがねタイプ一覧と8/9世代一覧も見る。 */
const LINK_SOURCES = [
  "https://gamewith.jp/pokemon-champions/546414", // 内定ポケモン一覧
  "https://gamewith.jp/pokemon-champions/553006", // はがねタイプ一覧
  "https://gamewith.jp/pokemon-champions/553007", // あくタイプ一覧
  "https://gamewith.jp/pokemon-champions/553083", // 8世代
  "https://gamewith.jp/pokemon-champions/553082", // 9世代
];

/** はがね24系統。メガでしかはがねが付かない系統も含む */
const STEEL = ["フォレトス","ハガネール","ハッサム","エアームド","クチート","ボスゴドラ","チリーン",
 "メタグロス","エンペルト","トリデプス","ルカリオ","ドリュウズ","ガラルマッギョ","ギルガルド",
 "ヒスイヌメルゴン","クレッフィ","アーマーガア","デカヌチャン","ミミズズ","ドドゲザン","サーフゴー","ブリジュラス",
 "グソクムシャ","ニャイキング"];

/** あく26系統。ドドゲザンは あく/はがね なので STEEL と重複する（下で重複を除く）。
 *  ギャラドスは素がみず/ひこうで、メガであくが付く（はがねのグソクムシャと同じ扱い）。 */
const DARK = ["アローラペルシアン","ブラッキー","ヘルガー","バンギラス","ヤミラミ","サメハダー","アブソル",
 "ミカルゲ","マニューラ","レパルダス","ワルビアル","ズルズキン","ゾロアーク","サザンドラ","ゲッコウガ",
 "ゴロンダ","カラマネロ","ガオガエン","フォクスライ","オーロンゲ","モルペコ","マスカーニャ","マフィティフ",
 "ヒスイダイケンキ","ハリーマン","ドドゲザン","ギャラドス"];

const TARGETS = [...new Set([...STEEL, ...DARK])];

/** 一覧ページから引けなかったときの直接指定 */
const OVERRIDE_URL = {
  "ボスゴドラ": "https://gamewith.jp/pokemon-champions/553317",
};

/** GameWith 上の表記が当方と違うもの（当方の名前 → GameWith 側の候補）。
 *  括弧の全角/半角や「〜のすがた」の有無が一定しないので、候補を並べて総当たりする。 */
const GW_NAME = {
  "ガラルマッギョ": ["マッギョ(ガラル)", "マッギョ（ガラル）", "マッギョ(ガラルのすがた)"],
  "アローラペルシアン": ["ペルシアン(アローラ)", "ペルシアン（アローラ）", "ペルシアン(アローラのすがた)"],
  "ヒスイヌメルゴン": ["ヌメルゴン(ヒスイ)", "ヌメルゴン（ヒスイ）", "ヌメルゴン(ヒスイのすがた)"],
  "ヒスイダイケンキ": ["ダイケンキ(ヒスイ)", "ダイケンキ（ヒスイ）", "ダイケンキ(ヒスイのすがた)"],
};
/** その系統を指しうる名前をすべて返す（当方の名前そのものも候補に含める） */
const nameCandidates = (t) => [t, ...(GW_NAME[t] ?? [])];

/** ページ全体を下まで送って遅延読み込みを終わらせる */
async function scrollAll(page) {
  for (let i = 0; i < 12; i++) {
    await page.evaluate(() => window.scrollBy(0, window.innerHeight * 2));
    await page.waitForTimeout(500);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(800);
}

/** 技名として通す形。「10まんボルト」「アイアンヘッド」「ＤＤラリアット」など。
 *  数字を弾くと 10まんボルト 等が落ちるので、数字始まりも許す。 */
const NAME_RE = /^[0-9ぁ-んァ-ヶ一-龠々ー・Ａ-Ｚ]{2,12}$/;
const NUM_RE = /^\d{1,3}$/;
const DASH_RE = /^[-ー―]$/;

/** 技名 / 威力 / 命中 / PP が連続4行で並ぶ形を拾う（誤検出を避けるため4行揃いに限る）。
 *  start..end の範囲だけを見る。 */
function parseRows(lines, start, end) {
  const num = NUM_RE, dash = DASH_RE, name = NAME_RE;
  const out = [];
  for (let i = start; i < end - 3; i++) {
    const [n, p, a, pp] = lines.slice(i, i + 4);
    if (!name.test(n)) continue;
    if (!(num.test(p) || dash.test(p))) continue;
    if (!(num.test(a) || dash.test(a))) continue;
    if (!num.test(pp) || Number(pp) > 40) continue;
    out.push({
      name: n,
      power: num.test(p) ? Number(p) : null,
      acc: num.test(a) ? Number(a) : null, // null = 必中／命中判定なし
      pp: Number(pp),
    });
    i += 3;
  }
  return out;
}

const lineup = (text) => text.split("\n").map((s) => s.trim());

(async () => {
  const moves = {}, stats = {}, log = [];
  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  const page = await (await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    locale: "ja-JP",
  })).newPage();

  // ① 技一覧ページ（全技の 威力・命中・PP）
  try {
    await page.goto(MOVE_LIST, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(5000);
    await scrollAll(page);
    const lines = lineup(await page.evaluate(() => document.body.innerText));
    for (const r of parseRows(lines, 0, lines.length)) {
      if (!stats[r.name]) stats[r.name] = { power: r.power, acc: r.acc, pp: r.pp };
    }
    log.push(`技一覧: ${Object.keys(stats).length}技 (${MOVE_LIST})`);
  } catch (e) { log.push(`技一覧: ERROR ${e.message}`); }

  // ② 個別ページのURLを集める
  const url = { ...OVERRIDE_URL };
  for (const src of LINK_SOURCES) {
    if (TARGETS.every((t) => url[t])) break;
    try {
      await page.goto(src, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForTimeout(4000);
      await scrollAll(page);
      // 一覧は画像リンクなので、文字だけでなく img の alt も見る
      const links = await page.$$eval("a", (as) => as.map((a) => ({
        href: a.href,
        text: (a.textContent || "").trim().replace(/\s+/g, " "),
        alt: a.querySelector("img")?.getAttribute("alt")?.trim() || "",
      })));
      let got = 0;
      for (const t of TARGETS) {
        if (url[t]) continue;
        const wants = nameCandidates(t);
        const hit = links.find((l) => /pokemon-champions\/\d+/.test(l.href)
          && wants.some((w) => l.text === w || l.alt === w || l.alt.includes(`${w}のアイコン`)));
        if (hit) { url[t] = hit.href; got++; }
      }
      log.push(`${src}: リンク${links.length}件 → 新たに${got}件解決`);
    } catch (e) { log.push(`${src}: ERROR ${e.message}`); }
    await page.waitForTimeout(1500);
  }
  log.push(`URL解決 ${Object.keys(url).length}/${TARGETS.length}`);

  // ③ 個別ページの「〜が覚える技」
  for (const t of TARGETS) {
    if (!url[t]) { moves[t] = []; log.push(`${t}: URL未解決`); continue; }
    try {
      await page.goto(url[t], { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForTimeout(4000);
      await scrollAll(page);
      const lines = lineup(await page.evaluate(() => document.body.innerText));
      const start = lines.findIndex((s) => /が覚える技$/.test(s));
      if (start < 0) { moves[t] = []; log.push(`${t}: 覚える技の見出しが無い (${url[t]})`); continue; }
      let end = lines.findIndex((s, i) => i > start && s === "関連ページ");
      if (end < 0) end = lines.length;
      const rows = parseRows(lines, start + 1, end);
      moves[t] = rows.map((r) => r.name);
      for (const r of rows) if (!stats[r.name]) stats[r.name] = { power: r.power, acc: r.acc, pp: r.pp };
      log.push(`${t}: ${rows.length}技 (${url[t]})`);
    } catch (e) { moves[t] = []; log.push(`${t}: ERROR ${e.message}`); }
    await page.waitForTimeout(1500);
  }
  const outDir = "tools/scrape-learnsets";
  fs.writeFileSync(outDir + "/gamewith_moves.json", JSON.stringify(moves, null, 1));
  fs.writeFileSync(outDir + "/gamewith_move_stats.json", JSON.stringify(stats, null, 1));
  fs.writeFileSync(outDir + "/scrape_gamewith_log.txt", log.join("\n") + "\n");
  console.log(log.join("\n"));
  await browser.close();
})();
