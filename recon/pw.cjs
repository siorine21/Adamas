// AppMedia(JS描画・Cloudflare無し) を Playwright で描画し、ボスゴドラの覚える技構造を確認
const { chromium } = require("playwright");
const fs = require("fs");

(async () => {
  const out = [];
  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  const page = await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    locale: "ja-JP",
  }).then((c) => c.newPage());

  try {
    // 1) はがね一覧を描画して、ボスゴドラの個別ページURLを得る
    await page.goto("https://appmedia.jp/pokemonchampions/79917367", { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForTimeout(2500);
    const links = await page.$$eval("a", (as) =>
      as.map((a) => ({ href: a.href, text: (a.textContent || "").trim(), alt: (a.querySelector("img") ? a.querySelector("img").getAttribute("alt") : "") || "" }))
    );
    out.push("total anchors: " + links.length);
    const steel = ["ボスゴドラ","メタグロス","サーフゴー","ハガネール","ギルガルド"];
    const found = links.filter((l) => /pokemonchampions\/\d+/.test(l.href) && steel.some((s) => l.text === s || l.alt === s));
    out.push("steel-name links found: " + found.length);
    found.slice(0, 20).forEach((l) => out.push(`  ${l.href}  text="${l.text}" alt="${l.alt}"`));

    const boss = found.find((l) => l.text === "ボスゴドラ" || l.alt === "ボスゴドラ");
    if (boss) {
      out.push("BOSS URL: " + boss.href);
      // 2) 個別ページを描画して覚える技を確認
      await page.goto(boss.href, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForTimeout(5000);
      const body = await page.evaluate(() => document.body.innerText);
      const idx = body.indexOf("覚える");
      out.push("body length: " + body.length + " / 覚える idx: " + idx);
      if (idx >= 0) out.push("--- 覚える 周辺 innerText(2000) ---\n" + body.slice(idx, idx + 2000));
      const moves = await page.$$eval("a, td, th", (els) =>
        els.map((e) => (e.textContent || "").trim()).filter((t) => /^[ぁ-んァ-ヶ一-龠ー0-9]{2,10}$/.test(t))
      );
      out.push("--- move-like tokens (first 80) ---\n" + [...new Set(moves)].slice(0, 80).join(", "));
    } else {
      out.push("ボスゴドラの個別リンクが見つかりませんでした。pokemonchampions リンク上位30:");
      links.filter((l) => /pokemonchampions\/\d+/.test(l.href)).slice(0, 30).forEach((l) => out.push(`  ${l.href} text="${l.text}" alt="${l.alt}"`));
    }
  } catch (e) {
    out.push("ERROR " + e.message);
  }
  fs.writeFileSync("recon/appmedia.txt", out.join("\n"));
  await browser.close();
})();
