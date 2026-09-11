/*
 * 指定した公開ページを Playwright で描画し、本文テキストを out/ に保存するツール。
 *
 * 開発環境（Claude Code）からは攻略サイト・公式ニュースへ直接アクセスできない
 * （egress proxy が遮断する）ため、GitHub Actions のランナーから取得して
 * 結果をブランチに出し、そこから読み取るための足回り。
 *
 * 実行: .github/workflows/scrape-learnsets.yml から。
 *   ローカルなら: npm i --no-save playwright && npx playwright install chromium
 *                 node tools/fetch-pages/fetch.cjs
 *
 * 取得先は URLS に列挙する。礼儀として少量・低頻度・ページ間に待機。
 */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

/** [出力ファイル名, URL] */
const URLS = [
  // 習得技の二つ目の出典を作るための構造調査（GameWithの個別ページ）
  ["gamewith-aggron", "https://gamewith.jp/pokemon-champions/553317"],
  ["gamewith-pokelist", "https://gamewith.jp/pokemon-champions/546414"],
  ["official-mc", "https://news.pokemon-home.com/ja/page/816.html"],
  ["yakkun-mc", "https://yakkun.com/ch/zukan/reg_mc/"],
  ["gamepedia-mc", "https://gamepedia.jp/pokemonchampions/archives/665"],
  ["gamewith-mc", "https://gamewith.jp/pokemon-champions/574460"],
  ["appmedia-mc", "https://appmedia.jp/pokemonchampions/80358028"],
  ["game8-add", "https://game8.jp/pokemon-champions/778547"],
  ["gamewith-items", "https://gamewith.jp/pokemon-champions/546415"],
  ["gamepedia-megaz", "https://gamepedia.jp/pokemonchampions/archives/649"],
  ["gamewith-megalucarioz", "https://gamewith.jp/pokemon-champions/574463"],
  ["appmedia-megaz", "https://appmedia.jp/pokemonchampions/80358028"],
  // メガシンカ全体のタイプ・種族値・特性一覧（新規メガのタイプ確認用）
  ["gamewith-megalist", "https://gamewith.jp/pokemon-champions/546494"],
];

const OUT = "tools/fetch-pages/out";
const LIMIT = 200000; // 1ページあたりの保存上限（文字）

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const log = [];
  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  const page = await (await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    locale: "ja-JP",
  })).newPage();
  for (const [name, url] of URLS) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForTimeout(6000);
      // 一覧ページは遅延読み込みなので、最後まで送ってから採る
      for (let i = 0; i < 12; i++) {
        await page.evaluate(() => window.scrollBy(0, window.innerHeight * 2));
        await page.waitForTimeout(500);
      }
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(1000);
      const text = await page.evaluate(() => document.body.innerText);
      const body = text.replace(/\n{3,}/g, "\n\n").slice(0, LIMIT);
      fs.writeFileSync(path.join(OUT, `${name}.txt`), `# ${url}\n\n${body}\n`);
      // 表・見出しの構造も控える（スクレイプの抽出条件を組み立てるときに要る）
      const struct = await page.evaluate(() => {
        const out = [];
        document.querySelectorAll("h1,h2,h3,h4").forEach((h) =>
          out.push(`見出し<${h.tagName}> ${(h.textContent || "").trim().slice(0, 60)}`));
        document.querySelectorAll("table").forEach((t, i) => {
          const rows = [...t.querySelectorAll("tr")].slice(0, 3)
            .map((r) => [...r.querySelectorAll("th,td")].map((c) => (c.textContent || "").trim().replace(/\s+/g, " ").slice(0, 20)).join(" | "));
          out.push(`表#${i} 行数${t.querySelectorAll("tr").length} class=${t.className}\n    ` + rows.join("\n    "));
        });
        return out.join("\n");
      });
      fs.writeFileSync(path.join(OUT, `${name}.struct.txt`), `# ${url}\n\n${struct}\n`);
      // リンク（文字/画像alt + href）。一覧ページから個別ページのURLを引くのに要る
      const links = await page.evaluate(() =>
        [...document.querySelectorAll("a")]
          .map((a) => {
            const label = (a.textContent || "").trim().replace(/\s+/g, " ")
              || a.querySelector("img")?.getAttribute("alt")?.trim() || "";
            return label ? `${label}\t${a.href}` : "";
          })
          .filter(Boolean)
          .join("\n"));
      fs.writeFileSync(path.join(OUT, `${name}.links.txt`), `# ${url}\n\n${links}\n`);
      log.push(`${name}: ${body.length}文字`);
    } catch (e) {
      fs.writeFileSync(path.join(OUT, `${name}.txt`), `# ${url}\n\nERROR ${e.message}\n`);
      log.push(`${name}: ERROR ${e.message}`);
    }
    await page.waitForTimeout(1500);
  }
  fs.writeFileSync(path.join(OUT, "_log.txt"), log.join("\n") + "\n");
  console.log(log.join("\n"));
  await browser.close();
})();
