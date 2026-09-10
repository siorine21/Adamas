/*
 * ポケモンチャンピオンズ はがね24系統の「覚えるワザ」を AppMedia から取得するツール。
 * AppMedia のポケモン個別ページ（公開・robots許可・Cloudflare無し）を Playwright で
 * 描画し、覚えるワザ表の技名を抽出して champ_moves.json に出力する。
 *
 * 重要: 個別ページには「チャンピオンズで覚える技」の表のほかに、本編（SV・剣盾・LEGENDS）の
 * 「基本/進化時/レベル」「技マシン」「タマゴ技」「技レコード」「DLC」表も並んでいる。
 * これらを合算するとチャンピオンズでは使えない技まで入ってしまうため
 * （ヒスイヌメルゴンの「とける」がその例）、チャンピオンズの表だけを採用する。
 *
 * 実行: GitHub Actions（.github/workflows/scrape-learnsets.yml）で手動起動。
 *   ローカルなら: npm i -D playwright && npx playwright install chromium && node tools/scrape-learnsets/scrape.cjs
 *
 * 礼儀: 低頻度・少量（24ページ）・ページ間に待機。robots.txt は /pokemonchampions/ を許可。
 * 注意: AppMedia の HTML 構造が変わると要調整。取得後は必ず内容を目視確認すること。
 */
const { chromium } = require("playwright");
const fs = require("fs");

const LIST = "https://appmedia.jp/pokemonchampions/79917367"; // はがねタイプ一覧
const TARGETS = ["フォレトス","ハガネール","ハッサム","エアームド","クチート","ボスゴドラ","チリーン",
 "メタグロス","エンペルト","トリデプス","ルカリオ","ドリュウズ","ガラルマッギョ","ギルガルド",
 "ヒスイヌメルゴン","クレッフィ","アーマーガア","デカヌチャン","ミミズズ","ドドゲザン","サーフゴー","ブリジュラス",
 "グソクムシャ","ニャイキング"]; // グソクムシャ（メガではがね）・ニャイキングはレギュM-Cで追加
// はがね一覧に正しい図鑑リンクが無い/誤リンクの系統は個別ページURLを直接指定
const OVERRIDE = {
  "チリーン": "https://appmedia.jp/pokemonchampions/79876817",    // 一覧にはメガチリーンしか無い
  "ギルガルド": "https://appmedia.jp/pokemonchampions/79877570",  // 一覧リンクが育成論記事を指すため図鑑ページを直指定
  // グソクムシャは素がむし/みずなので、はがね一覧には載らない（メガではがねになる）
  "グソクムシャ": "https://appmedia.jp/pokemonchampions/79877792",
};

/** 覚えるワザ表を1つずつ取る。ページによっては進化前など別ポケモンの表も載るので、
 *  表ごとに分けて返し、呼び出し側（とログ）で混入に気づけるようにする。 */
async function wazaOf(page, url) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(5000);
  return await page.evaluate(() => {
    const tables = [];
    for (const tbl of document.querySelectorAll("table")) {
      const head = tbl.querySelector("tr")?.innerText || "";
      if (!(head.includes("わざ名") && head.includes("威力"))) continue; // 覚えるワザ表のみ
      // 見出しの列名から「威力」「命中」の位置を割り出す（列順はページで変わりうる）
      const cols = [...(tbl.querySelector("tr")?.querySelectorAll("th,td") ?? [])]
        .map((c) => (c.textContent || "").trim());
      const powCol = cols.findIndex((c) => c.includes("威力"));
      const accCol = cols.findIndex((c) => c.includes("命中"));
      const set = new Set();
      const stats = {};
      for (const row of tbl.querySelectorAll("tr")) {
        const cells = [...row.querySelectorAll("td")];
        const c = cells[0];
        if (!c) continue;
        const nm = (c.textContent || "").trim();
        if (!(nm && nm.length <= 12 && /[ぁ-んァ-ヶ一-龠]/.test(nm))) continue;
        set.add(nm);
        // 威力・命中も控えて、アプリの技ライブラリと突き合わせられるようにする
        const num = (i) => {
          if (i < 0 || !cells[i]) return null;
          const t = (cells[i].textContent || "").trim();
          return /^\d+$/.test(t) ? Number(t) : null;
        };
        const pow = num(powCol), acc = num(accCol);
        if (pow !== null || acc !== null) stats[nm] = { power: pow, acc };
      }
      // 表の直前の見出しも拾う（「ニャースが覚えるワザ」等の判別用）
      let caption = "";
      for (let el = tbl.previousElementSibling; el && !caption; el = el.previousElementSibling) {
        if (/^H[1-6]$/.test(el.tagName)) caption = (el.textContent || "").trim();
      }
      if (set.size > 0) tables.push({ caption, moves: [...set], stats });
    }
    return tables;
  });
}

(async () => {
  const result = {}, stats = {}, log = [];
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
        const tables = await wazaOf(page, url[t]);
        // 個別ページには本編（SV・剣盾等）の「技マシン」「タマゴ技」表も並んでいる。
        // チャンピオンズで使えるのは「チャンピオンズで覚える技」の表だけなので、それだけを採る。
        const champ = tables.filter((x) => x.caption.includes("チャンピオンズ"));
        const use = champ.length > 0 ? champ : tables; // 見出しが変わったときは従来どおり全部
        result[t] = [...new Set(use.flatMap((x) => x.moves))];
        // 威力・命中はチャンピオンズ表のものだけ集める（本編の表と混ざると意味が無い）
        for (const x of champ) for (const [n, v] of Object.entries(x.stats)) stats[n] = v;
        log.push(`${t}: ${result[t].length}技`
          + (champ.length === 0 ? "（※チャンピオンズ表が見つからず全表を採用）" : "")
          + ` / 全表 ${tables.map((x) => `[${x.caption || "見出し不明"}:${x.moves.length}]`).join("")}`);
      } catch (e) { result[t] = []; log.push(`${t}: ERROR ${e.message}`); }
      await page.waitForTimeout(1500);
    }
  } catch (e) { log.push("FATAL " + e.message); }
  const outDir = "tools/scrape-learnsets";
  fs.writeFileSync(outDir + "/champ_moves.json", JSON.stringify(result, null, 1));
  // 技名 → {威力, 命中}。tools/audit-moves がアプリの技ライブラリと突き合わせる
  fs.writeFileSync(outDir + "/champ_move_stats.json", JSON.stringify(stats, null, 1));
  fs.writeFileSync(outDir + "/scrape_log.txt", log.join("\n"));
  console.log(log.join("\n"));
  await browser.close();
})();
