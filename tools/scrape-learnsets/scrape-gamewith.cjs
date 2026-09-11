/*
 * 習得技・技データの「二つ目の出典」。GameWith のチャンピオンズ各ポケモンページから
 * 「〜が覚える技」を取得し、AppMedia 由来のデータ（champ_moves.json）と突き合わせる。
 *
 * 出典が1つだとサイト側の誤りに気づけない。
 * 加えて GameWith は PP 列を持つ（AppMedia には無い）ので、
 * チャンピオンズの PP を直せる唯一の出典でもある。
 *
 * 覚える技の一覧は <table> ではなく、技名/威力/命中/PP が
 * 縦に並ぶだけの DOM なので、見出し以降の innerText を行単位で読む。
 *
 * 実行: .github/workflows/scrape-learnsets.yml から。
 *   ローカルなら: npm i --no-save playwright && npx playwright install chromium
 *                 node tools/scrape-learnsets/scrape-gamewith.cjs
 *
 * 礼儀: 低頻度・少量（24ページ）・ページ間に待機。
 */
const { chromium } = require("playwright");
const fs = require("fs");

const LIST = "https://gamewith.jp/pokemon-champions/546414"; // 内定ポケモン一覧
const TARGETS = ["フォレトス","ハガネール","ハッサム","エアームド","クチート","ボスゴドラ","チリーン",
 "メタグロス","エンペルト","トリデプス","ルカリオ","ドリュウズ","ガラルマッギョ","ギルガルド",
 "ヒスイヌメルゴン","クレッフィ","アーマーガア","デカヌチャン","ミミズズ","ドドゲザン","サーフゴー","ブリジュラス",
 "グソクムシャ","ニャイキング"];

/** 一覧ページから引けなかったときの直接指定 */
const OVERRIDE_URL = {
  "ボスゴドラ": "https://gamewith.jp/pokemon-champions/553317",
};

/** ページ全体を下まで送って遅延読み込みを終わらせる */
async function scrollAll(page) {
  for (let i = 0; i < 12; i++) {
    await page.evaluate(() => window.scrollBy(0, window.innerHeight * 2));
    await page.waitForTimeout(500);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(800);
}

/** 「〜が覚える技」の節を行単位で読む。
 *  技名 / 威力 / 命中 / PP が連続4行で並ぶ形に限って拾う（誤検出を避けるため）。 */
function parseMoves(bodyText) {
  const lines = bodyText.split("\n").map((s) => s.trim());
  const start = lines.findIndex((s) => /が覚える技$/.test(s));
  if (start < 0) return null;
  let end = lines.findIndex((s, i) => i > start && s === "関連ページ");
  if (end < 0) end = lines.length;

  const num = /^\d{1,3}$/;
  const dash = /^[-ー―]$/;
  const name = /^[ぁ-んァ-ヶ一-龠々ー]{2,12}$/;
  const out = [];
  for (let i = start + 1; i < end - 3; i++) {
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

(async () => {
  const moves = {}, stats = {}, log = [];
  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  const page = await (await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    locale: "ja-JP",
  })).newPage();
  try {
    await page.goto(LIST, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(5000);
    await scrollAll(page);
    // 一覧は画像リンクなので、文字だけでなく img の alt も見る
    const links = await page.$$eval("a", (as) => as.map((a) => ({
      href: a.href,
      text: (a.textContent || "").trim().replace(/\s+/g, " "),
      alt: a.querySelector("img")?.getAttribute("alt")?.trim() || "",
    })));
    const url = { ...OVERRIDE_URL };
    for (const t of TARGETS) {
      if (url[t]) continue;
      const hit = links.find((l) => /pokemon-champions\/\d+/.test(l.href)
        && (l.text === t || l.alt === t || l.alt.includes(`${t}のアイコン`)));
      if (hit) url[t] = hit.href;
    }
    log.push(`一覧リンク ${links.length}件 / URL解決 ${Object.keys(url).length}/${TARGETS.length}`);

    for (const t of TARGETS) {
      if (!url[t]) { moves[t] = []; log.push(`${t}: URL未解決`); continue; }
      try {
        await page.goto(url[t], { waitUntil: "domcontentloaded", timeout: 60000 });
        await page.waitForTimeout(4000);
        await scrollAll(page);
        const body = await page.evaluate(() => document.body.innerText);
        const rows = parseMoves(body);
        if (!rows) { moves[t] = []; log.push(`${t}: 覚える技の見出しが無い (${url[t]})`); continue; }
        moves[t] = rows.map((r) => r.name);
        for (const r of rows) {
          // 同じ技が種族をまたいで出るが、値は同じはずなので先勝ちで良い
          if (!stats[r.name]) stats[r.name] = { power: r.power, acc: r.acc, pp: r.pp };
        }
        log.push(`${t}: ${rows.length}技 (${url[t]})`);
      } catch (e) { moves[t] = []; log.push(`${t}: ERROR ${e.message}`); }
      await page.waitForTimeout(1500);
    }
  } catch (e) { log.push("FATAL " + e.message); }
  const outDir = "tools/scrape-learnsets";
  fs.writeFileSync(outDir + "/gamewith_moves.json", JSON.stringify(moves, null, 1));
  fs.writeFileSync(outDir + "/gamewith_move_stats.json", JSON.stringify(stats, null, 1));
  fs.writeFileSync(outDir + "/scrape_gamewith_log.txt", log.join("\n") + "\n");
  console.log(log.join("\n"));
  await browser.close();
})();
