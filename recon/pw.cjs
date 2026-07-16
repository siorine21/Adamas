// AppMedia を Playwright で描画し、はがね22系統の「覚えるワザ」を取得して JSON 出力
const { chromium } = require("playwright");
const fs = require("fs");

const TARGETS = ["フォレトス","ハガネール","ハッサム","エアームド","クチート","ボスゴドラ","チリーン",
 "メタグロス","エンペルト","トリデプス","ルカリオ","ドリュウズ","ガラルマッギョ","ギルガルド",
 "ヒスイヌメルゴン","クレッフィ","アーマーガア","デカヌチャン","ミミズズ","ドドゲザン","サーフゴー","ブリジュラス"];

(async () => {
  const log = [];
  const result = {};
  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  const ctx = await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    locale: "ja-JP",
  });
  const page = await ctx.newPage();
  try {
    // 一覧を描画して 名前→個別URL を取得
    await page.goto("https://appmedia.jp/pokemonchampions/79917367", { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(6000);
    const links = await page.$$eval("a", (as) =>
      as.map((a) => ({ href: a.href, text: (a.textContent || "").trim() }))
    );
    const name2url = {};
    for (const t of TARGETS) {
      const hit = links.find((l) => /pokemonchampions\/\d+/.test(l.href) && l.text === t);
      if (hit) name2url[t] = hit.href;
    }
    log.push("resolved URLs: " + Object.keys(name2url).length + "/" + TARGETS.length);
    for (const t of TARGETS) if (!name2url[t]) log.push("  URL NOT FOUND: " + t);

    // 各個別ページから覚えるワザ表の第1列(わざ名)を抽出
    for (const t of TARGETS) {
      const url = name2url[t];
      if (!url) { result[t] = []; continue; }
      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
        await page.waitForTimeout(4500);
        const moves = await page.evaluate(() => {
          const set = new Set();
          for (const tbl of document.querySelectorAll("table")) {
            if (!tbl.innerText.includes("わざ名")) continue;
            for (const row of tbl.querySelectorAll("tr")) {
              const c = row.querySelector("td");
              if (!c) continue;
              const nm = (c.textContent || "").trim();
              if (nm && nm.length <= 12 && /[ぁ-んァ-ヶ一-龠]/.test(nm)) set.add(nm);
            }
          }
          return [...set];
        });
        result[t] = moves;
        log.push(`${t}: ${moves.length}技  (${url.split("/").pop()})`);
      } catch (e) {
        result[t] = [];
        log.push(`${t}: ERROR ${e.message}`);
      }
      await page.waitForTimeout(1500); // 礼儀的な間隔
    }
  } catch (e) {
    log.push("FATAL " + e.message);
  }
  fs.writeFileSync("recon/champ_moves.json", JSON.stringify(result, null, 1));
  fs.writeFileSync("recon/champ_log.txt", log.join("\n"));
  await browser.close();
})();
