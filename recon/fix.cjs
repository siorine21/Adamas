const { chromium } = require("playwright");
const fs = require("fs");
async function wazaOf(page, url) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(5000);
  return await page.evaluate(() => {
    const set = new Set();
    for (const tbl of document.querySelectorAll("table")) {
      const head = (tbl.querySelector("tr")?.innerText || "");
      if (!(head.includes("わざ名") && head.includes("威力"))) continue; // 覚えるワザ表のみ（"わざ名 理由"のおすすめ表は除外）
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
  const out = {}; const log = [];
  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  const page = await (await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    locale: "ja-JP",
  })).newPage();
  try {
    // ギルガルドの正しい図鑑URLを全ポケモン一覧から解決
    await page.goto("https://appmedia.jp/pokemonchampions/79783190", { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(6000);
    const ls = await page.$$eval("a", (as) => as.map((a) => ({ h: a.href, t: (a.textContent||"").trim(), alt: (a.querySelector("img")?.getAttribute("alt")||"") })));
    const g = ls.filter((l) => /pokemonchampions\/\d+/.test(l.h) && l.t === "ギルガルド" && !l.h.includes("79943590"));
    log.push("ギルガルド候補: " + g.map((x)=>x.h+"|"+x.alt).join(" , "));
    const gurl = (g.find((x)=>x.alt.includes("ポケモン")) || g[0] || {}).h;
    for (const [name, url] of [["チリーン","https://appmedia.jp/pokemonchampions/79876817"], ["ギルガルド", gurl]]) {
      if (!url) { out[name] = []; log.push(name+": URL未解決"); continue; }
      out[name] = await wazaOf(page, url);
      log.push(`${name}: ${out[name].length}技 (${url})  先頭=${out[name].slice(0,8).join("/")}`);
    }
  } catch (e) { log.push("ERR " + e.message); }
  fs.writeFileSync("recon/fix2.json", JSON.stringify(out, null, 1));
  fs.writeFileSync("recon/fix.txt", log.join("\n"));
  await browser.close();
})();
