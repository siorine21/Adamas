/*
 * ポケモンチャンピオンズ はがね22系統の「覚えるワザ」を AppMedia から取得するツール。
 * AppMedia のポケモン個別ページ（公開・robots許可・Cloudflare無し）を Playwright で
 * 描画し、覚えるワザ表の技名を抽出して champ_moves.json に出力する。
 *
 * 実行: GitHub Actions（.github/workflows/scrape-learnsets.yml）で手動起動。
 *   ローカルなら: npm i -D playwright && npx playwright install chromium && node tools/scrape-learnsets/scrape.cjs
 *
 * 礼儀: 低頻度・少量（22ページ）・ページ間に待機。robots.txt は /pokemonchampions/ を許可。
 * 注意: AppMedia の HTML 構造が変わると要調整。取得後は必ず内容を目視確認すること。
 */
const { chromium } = require("playwright");
const fs = require("fs");

const LIST = "https://appmedia.jp/pokemonchampions/79917367"; // はがねタイプ一覧
const TARGETS = ["フォレトス","ハガネール","ハッサム","エアームド","クチート","ボスゴドラ","チリーン",
 "メタグロス","エンペルト","トリデプス","ルカリオ","ドリュウズ","ガラルマッギョ","ギルガルド",
 "ヒスイヌメルゴン","クレッフィ","アーマーガア","デカヌチャン","ミミズズ","ドドゲザン","サーフゴー","ブリジュラス",
 "ニャイキング"]; // ニャイキングはレギュM-Cで追加
// はがね一覧に正しい図鑑リンクが無い/誤リンクの系統は個別ページURLを直接指定
const OVERRIDE = {
  "チリーン": "https://appmedia.jp/pokemonchampions/79876817",    // 一覧にはメガチリーンしか無い
  "ギルガルド": "https://appmedia.jp/pokemonchampions/79877570",  // 一覧リンクが育成論記事を指すため図鑑ページを直指定
};

async function wazaOf(page, url) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(5000);
  return await page.evaluate(() => {
    const set = new Set();
    for (const tbl of document.querySelectorAll("table")) {
      const head = tbl.querySelector("tr")?.innerText || "";
      if (!(head.includes("わざ名") && head.includes("威力"))) continue; // 覚えるワザ表のみ
      for (const row of tbl.querySelectorAll("tr")) {
        const c = row.querySelector("td");
        if (!c) continue;
        const nm = (c.textContent || "").trim();
        if (nm && nm.length <= 12 && /[ぁ-んァ-ヶ一-龠]/.test(nm)) set.add(nm);
      }
    }
    return [...set];
  });
}

(async () => {
  const result = {}, log = [];
  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  const page = await (await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    locale: "ja-JP",
  })).newPage();
  try {
    await page.goto(LIST, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(6000);
    const links = await page.$$eval("a", (as) => as.map((a) => ({ href: a.href, text: (a.textContent || "").trim() })));
    const url = {};
    for (const t of TARGETS) {
      url[t] = OVERRIDE[t] || (links.find((l) => /pokemonchampions\/\d+/.test(l.href) && l.text === t) || {}).href;
    }
    for (const t of TARGETS) {
      if (!url[t]) { result[t] = []; log.push(`${t}: URL未解決`); continue; }
      try {
        result[t] = await wazaOf(page, url[t]);
        log.push(`${t}: ${result[t].length}技`);
      } catch (e) { result[t] = []; log.push(`${t}: ERROR ${e.message}`); }
      await page.waitForTimeout(1500);
    }
  } catch (e) { log.push("FATAL " + e.message); }
  const outDir = "tools/scrape-learnsets";
  fs.writeFileSync(outDir + "/champ_moves.json", JSON.stringify(result, null, 1));
  fs.writeFileSync(outDir + "/scrape_log.txt", log.join("\n"));
  console.log(log.join("\n"));
  await browser.close();
})();
