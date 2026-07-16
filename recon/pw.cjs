// yakkun 図鑑ページを Playwright で開き、Cloudflare通過後に「覚える技」構造を確認する
const { chromium } = require("playwright");
const fs = require("fs");

(async () => {
  const out = [];
  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  const ctx = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    locale: "ja-JP",
  });
  const page = await ctx.newPage();
  const url = "https://yakkun.com/ch/zukan/n306"; // ボスゴドラ
  out.push("GOTO " + url);
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
    // Cloudflare「Just a moment」が消えるまで待つ
    for (let i = 0; i < 15; i++) {
      const title = await page.title().catch(() => "");
      out.push(`try${i} title="${title}"`);
      if (!/just a moment|attention required|checking/i.test(title) && title.length > 0) break;
      await page.waitForTimeout(2500);
    }
    await page.waitForTimeout(2000);
    const finalTitle = await page.title().catch(() => "");
    out.push("FINAL title=" + finalTitle);
    const bodyText = await page.evaluate(() => document.body.innerText).catch(() => "");
    out.push("bodyText length=" + bodyText.length);
    // 「覚える技」周辺のテキストを抽出
    const idx = bodyText.indexOf("覚える");
    out.push("覚える idx=" + idx);
    if (idx >= 0) out.push("--- 覚える 周辺テキスト ---\n" + bodyText.slice(idx, idx + 1500));
    // 技名リンク(a[href*=waza] など)の構造
    const links = await page.$$eval("a", (as) =>
      as
        .filter((a) => /waza|move|move_/.test(a.getAttribute("href") || ""))
        .slice(0, 40)
        .map((a) => (a.getAttribute("href") || "") + " | " + a.textContent.trim())
    ).catch((e) => ["link eval err " + e]);
    out.push("--- waza-like links ---\n" + links.join("\n"));
    fs.writeFileSync("recon/pages_boss.html", (await page.content()).slice(0, 500000));
  } catch (e) {
    out.push("ERROR " + e.message);
  }
  fs.writeFileSync("recon/yakkun.txt", out.join("\n"));
  await browser.close();
})();
