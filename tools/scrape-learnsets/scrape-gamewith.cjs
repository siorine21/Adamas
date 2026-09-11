/*
 * 習得技の「二つ目の出典」。GameWith のチャンピオンズ各ポケモンページから
 * 覚える技を取得し、AppMedia 由来のデータ（champ_moves.json）と突き合わせるために使う。
 *
 * 出典が1つだとサイト側の誤りに気づけない。実際、AppMedia の
 * 「チャンピオンズで覚える技」表に本編どおりの技が並んでいる疑いが出たため追加した。
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

/** 覚える技の表から技名を拾う。見出しに「技」「威力」を含む表だけを対象にする */
async function wazaOf(page, url) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(5000);
  return await page.evaluate(() => {
    const tables = [];
    for (const tbl of document.querySelectorAll("table")) {
      const head = tbl.querySelector("tr")?.innerText || "";
      if (!(/技|わざ/.test(head) && head.includes("威力"))) continue;
      const set = new Set();
      for (const row of tbl.querySelectorAll("tr")) {
        const c = row.querySelector("td");
        if (!c) continue;
        const nm = (c.textContent || "").trim().split("\n")[0].trim();
        if (nm && nm.length <= 12 && /[ぁ-んァ-ヶ一-龠]/.test(nm)) set.add(nm);
      }
      let caption = "";
      for (let el = tbl.previousElementSibling; el && !caption; el = el.previousElementSibling) {
        if (/^H[1-6]$/.test(el.tagName)) caption = (el.textContent || "").trim();
      }
      if (set.size > 0) tables.push({ caption, moves: [...set] });
    }
    return tables;
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
      const hit = links.find((l) => /pokemon-champions\/\d+/.test(l.href) && l.text === t);
      if (hit) url[t] = hit.href;
    }
    for (const t of TARGETS) {
      if (!url[t]) { result[t] = []; log.push(`${t}: URL未解決`); continue; }
      try {
        const tables = await wazaOf(page, url[t]);
        result[t] = [...new Set(tables.flatMap((x) => x.moves))];
        log.push(`${t}: ${result[t].length}技 / 表 ${tables.map((x) => `[${x.caption || "見出し不明"}:${x.moves.length}]`).join("")} (${url[t]})`);
      } catch (e) { result[t] = []; log.push(`${t}: ERROR ${e.message}`); }
      await page.waitForTimeout(1500);
    }
  } catch (e) { log.push("FATAL " + e.message); }
  const outDir = "tools/scrape-learnsets";
  fs.writeFileSync(outDir + "/gamewith_moves.json", JSON.stringify(result, null, 1));
  fs.writeFileSync(outDir + "/scrape_gamewith_log.txt", log.join("\n"));
  console.log(log.join("\n"));
  await browser.close();
})();
