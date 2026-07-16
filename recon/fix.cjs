const { chromium } = require("playwright");
const fs = require("fs");
(async () => {
  const out = [];
  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  const page = await (await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    locale: "ja-JP",
  })).newPage();
  try {
    // チリーン URL 探索: はがね一覧＋全ポケモン一覧 から チリーン を含むリンク
    for (const listUrl of ["https://appmedia.jp/pokemonchampions/79917367","https://appmedia.jp/pokemonchampions/79783190"]) {
      await page.goto(listUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForTimeout(6000);
      const ls = await page.$$eval("a", (as) => as.map((a) => ({ h: a.href, t: (a.textContent||"").trim() })));
      out.push(`[${listUrl.split("/").pop()}] チリーン系リンク:`);
      ls.filter((l) => /pokemonchampions\/\d+/.test(l.h) && l.t.includes("チリーン")).forEach((l) => out.push("  " + l.h + " | " + l.t));
    }
    // ギルガルド ページ debug（長め待機＋テーブル調査）
    await page.goto("https://appmedia.jp/pokemonchampions/79943590", { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(9000);
    const dbg = await page.evaluate(() => {
      const tbls = [...document.querySelectorAll("table")];
      const info = tbls.map((t, i) => `#${i} hasWaza=${t.innerText.includes("わざ名")} rows=${t.querySelectorAll("tr").length} head="${(t.querySelector("tr")?.innerText||"").replace(/\s+/g," ").slice(0,60)}"`);
      const b = document.body.innerText;
      const gi = b.indexOf("覚える");
      return { tableCount: tbls.length, info, around: gi>=0 ? b.slice(gi, gi+300) : "(覚える無し)", len: b.length };
    });
    out.push("\n[ギルガルド] tables=" + dbg.tableCount + " bodyLen=" + dbg.len);
    out.push(dbg.info.join("\n"));
    out.push("覚える周辺: " + dbg.around.replace(/\s+/g, " "));
  } catch (e) { out.push("ERR " + e.message); }
  fs.writeFileSync("recon/fix.txt", out.join("\n"));
  await browser.close();
})();
