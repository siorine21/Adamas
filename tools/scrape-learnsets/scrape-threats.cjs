/*
 * 内定ポケモン全種族の「チャンピオンズで覚える技」を GameWith の個別ページから取得する。
 * 被ダメ計算で「仮想敵が実際に覚える技」から選べるようにするためのデータ。
 *
 * はがね・あく系統は scrape.cjs（AppMedia）/ scrape-gamewith.cjs が実機確認つきで
 * 別に持っているので、アプリ側ではそちらを優先する（ここでも取るのは突き合わせ用）。
 *
 * 取得の流れ:
 *   ① 一覧ページのリンク（文字・画像の alt）を全部集める → gamewith_links.json
 *      名前の表記ゆれ（「ライチュウ(アローラ)」「〜のすがた」等）で引けなかった種族は、
 *      このファイルを見て OVERRIDE_URL / GW_NAME に足し、ONLY_MISSING=1 で取り直す。
 *   ② 種族ごとに個別ページを開き「〜が覚える技」の下の 技名/威力/命中/PP を読む
 *      → gamewith_threat_moves.json（{ 種族: { url, heading, moves } }）
 *
 * フォルム違いで個別ページが無いもの（パンプジンの大きさ等）は、フォルム名を外した
 * 名前でも引く。そのときはログに「共有」と出す。地方のすがたは技が違うので外さない。
 *
 * 実行: .github/workflows/scrape-learnsets.yml（threats を選んで手動起動）
 *   ONLY_MISSING=1 … 既存の gamewith_threat_moves.json で技が取れていない種族だけ取り直す
 *
 * 礼儀: ページ間に待機を入れて順番に取る（並列にしない）。
 */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const { threatTargets } = require("./threat-targets.cjs");

const OUT_DIR = __dirname;
const OUT = path.join(OUT_DIR, "gamewith_threat_moves.json");
const LINKS_OUT = path.join(OUT_DIR, "gamewith_links.json");
const LOG_OUT = path.join(OUT_DIR, "scrape_threats_log.txt");

/** 個別ページのURLを引くための一覧 */
const LINK_SOURCES = [
  "https://gamewith.jp/pokemon-champions/546414", // 内定ポケモン一覧（5〜7世代の多くが載らない）
  "https://gamewith.jp/pokemon-champions/553081", // 1世代
  "https://gamewith.jp/pokemon-champions/553089", // 2世代
  "https://gamewith.jp/pokemon-champions/553088", // 3世代
  "https://gamewith.jp/pokemon-champions/553087", // 4世代
  "https://gamewith.jp/pokemon-champions/553086", // 5世代
  "https://gamewith.jp/pokemon-champions/553085", // 6世代
  "https://gamewith.jp/pokemon-champions/553084", // 7世代
  "https://gamewith.jp/pokemon-champions/553083", // 8世代
  "https://gamewith.jp/pokemon-champions/553082", // 9世代
  "https://gamewith.jp/pokemon-champions/546494", // メガシンカ一覧
  "https://gamewith.jp/pokemon-champions/574460", // レギュM-Cの追加ポケモン一覧
  "https://gamewith.jp/pokemon-champions/553006", // はがねタイプ一覧
  "https://gamewith.jp/pokemon-champions/553007", // あくタイプ一覧
];

/** 一覧から引けない／誤って引くものの直接指定（当方の名前 → URL） */
const OVERRIDE_URL = {
  "ボスゴドラ": "https://gamewith.jp/pokemon-champions/553317",
};

/** GameWith 側の表記が当方と大きく違うもの（当方の名前 → GameWith 側の候補） */
const GW_NAME = {
  "ガラルマッギョ": ["マッギョ(ガラル)", "マッギョ(ガラルのすがた)"],
};

const REGIONS = ["アローラ", "ガラル", "ヒスイ", "パルデア"];

/** 表記ゆれを吸収した比較用の名前。括弧・空白・「のすがた」「フォルム」などを落とす */
function norm(s) {
  return String(s).normalize("NFKC")
    .replace(/のアイコン$/, "")
    .replace(/のすがた|すがた|の姿|フォルム|フォーム/g, "")
    .replace(/[()（）［］\[\]「」『』・\s\-－―]/g, "");
}

/** その種族を指しうる名前（正規化後）。先頭ほど優先 */
function candidates(t) {
  const out = [t, ...(GW_NAME[t] ?? [])];
  const paren = t.match(/^(.*?)[(（](.*)[)）]$/);
  const body = paren ? paren[1] : t;
  const form = paren ? paren[2] : "";
  const region = REGIONS.find((r) => body.startsWith(r) && body.length > r.length);
  if (region) {
    const base = body.slice(region.length);
    // 「ライチュウ(アローラ)」「ケンタロス(パルデア・かくとう)」の形
    out.push(`${base}(${region})`, `${base}(${region}${form})`, `${base}(${form})${region}`, `${base}${region}${form}`);
  }
  // 「ウォッシュロトム」→「ロトム(ウォッシュ)」
  const rotom = t.match(/^(.+)ロトム$/);
  if (rotom) out.push(`ロトム(${rotom[1]})`, `ロトム(${rotom[1]}ロトム)`);
  return [...new Set(out.map(norm))];
}

/** フォルム名を外した名前（ページを共有しているフォルム用）。地方のすがたは外さない */
function sharedName(t) {
  const m = t.match(/^(.*?)[(（].*[)）]$/);
  return m ? norm(m[1]) : null;
}

/** ページ全体を下まで送って遅延読み込みを終わらせる */
async function scrollAll(page, n = 10) {
  for (let i = 0; i < n; i++) {
    await page.evaluate(() => window.scrollBy(0, window.innerHeight * 2));
    await page.waitForTimeout(400);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(600);
}

/* 技名 / 威力 / 命中 / PP が縦に4行並ぶ形を読む（scrape-gamewith.cjs と同じ） */
const NAME_RE = /^[0-9ぁ-んァ-ヶ一-龠々ー・Ａ-Ｚ]{2,12}$/;
const NUM_RE = /^\d{1,3}$/;
const DASH_RE = /^[-ー―]$/;
function parseRows(lines, start, end) {
  const out = [];
  for (let i = start; i < end - 3; i++) {
    const [n, p, a, pp] = lines.slice(i, i + 4);
    if (!NAME_RE.test(n)) continue;
    if (!(NUM_RE.test(p) || DASH_RE.test(p))) continue;
    if (!(NUM_RE.test(a) || DASH_RE.test(a))) continue;
    if (!NUM_RE.test(pp) || Number(pp) > 40) continue;
    out.push(n);
    i += 3;
  }
  return out;
}
const lineup = (text) => text.split("\n").map((s) => s.trim());

(async () => {
  const { targets } = threatTargets();
  const onlyMissing = process.env.ONLY_MISSING === "1";
  const prev = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : {};
  const result = onlyMissing ? { ...prev } : {};
  const todo = targets.filter((t) => !(onlyMissing && prev[t]?.moves?.length));
  const log = [`対象 ${targets.length}種族 / 今回取る ${todo.length}種族${onlyMissing ? "（ONLY_MISSING）" : ""}`];

  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  const page = await (await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    locale: "ja-JP",
  })).newPage();

  // ① リンクを集める。画像リンク（alt が「〜のアイコン」）を図鑑ページとみなして優先する
  const links = new Map(); // href → { text, alt }
  const collect = async (src, wait) => {
    await page.goto(src, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForTimeout(wait);
    await scrollAll(page, 14);
    const got = await page.$$eval("a", (as) => as.map((a) => ({
      href: a.href.split("#")[0],
      text: (a.textContent || "").trim().replace(/\s+/g, " "),
      alt: a.querySelector("img")?.getAttribute("alt")?.trim() || "",
    })));
    let n = 0;
    for (const l of got) {
      if (!/pokemon-champions\/\d+$/.test(l.href)) continue;
      const cur = links.get(l.href) ?? { text: "", alt: "" };
      links.set(l.href, { text: cur.text || l.text, alt: cur.alt || l.alt });
      n++;
    }
    return { n, all: got.length, title: await page.title() };
  };
  for (const src of LINK_SOURCES) {
    try {
      let r = await collect(src, 4000);
      // 読み込みが遅くてリンクが0件のことがある（7世代で発生）。待ち時間を延ばして1回だけやり直す
      if (r.n === 0) { await page.waitForTimeout(3000); r = await collect(src, 12000); r.retried = true; }
      log.push(`${src}: 個別ページらしきリンク ${r.n}件（a要素 ${r.all}・「${r.title}」${r.retried ? "・再試行" : ""}）`);
    } catch (e) { log.push(`${src}: ERROR ${e.message}`); }
    await page.waitForTimeout(1500);
  }
  const linkList = [...links.entries()].map(([href, v]) => ({ href, ...v }));
  fs.writeFileSync(LINKS_OUT, JSON.stringify(linkList, null, 1));

  // 正規化した名前 → URL。アイコン（alt）由来を先に登録して優先させる
  const byName = new Map();
  for (const l of linkList) if (l.alt) { const k = norm(l.alt); if (!byName.has(k)) byName.set(k, l.href); }
  for (const l of linkList) if (l.text) { const k = norm(l.text); if (!byName.has(k)) byName.set(k, l.href); }

  const resolve = (t) => {
    if (OVERRIDE_URL[t]) return { url: OVERRIDE_URL[t], how: "直接指定" };
    for (const c of candidates(t)) if (byName.has(c)) return { url: byName.get(c), how: "一覧" };
    const s = sharedName(t);
    if (s && byName.has(s)) return { url: byName.get(s), how: "共有（フォルム名を外して一致）" };
    // 別フォルムのページしか無い（「ギルガルド(シールド)」しか無いときのブレード等）
    if (s) {
      const other = [...byName.keys()].find((k) => k.startsWith(s) && !k.startsWith(`メガ${s}`));
      if (other) return { url: byName.get(other), how: `共有（別フォルム「${other}」のページ）` };
    }
    // メガの個別ページしか一覧に無い種族。覚える技は元の姿と同じ
    const mega = norm(`メガ${t}`);
    if (byName.has(mega)) return { url: byName.get(mega), how: "共有（メガのページ）" };
    return null;
  };

  // ② 個別ページ。同じURLは1回だけ開く（フォルムでページを共有している場合）
  const cache = new Map();
  let ok = 0;
  for (const t of todo) {
    const r = resolve(t);
    if (!r) { result[t] = { url: null, heading: "", moves: [] }; log.push(`${t}: URL未解決`); continue; }
    try {
      let got = cache.get(r.url);
      if (!got) {
        await page.goto(r.url, { waitUntil: "domcontentloaded", timeout: 60000 });
        await page.waitForTimeout(3000);
        await scrollAll(page);
        const lines = lineup(await page.evaluate(() => document.body.innerText));
        // 見出しは「〜が覚える技」が基本だが「〜の覚える技」のページもありうる
        const start = lines.findIndex((s) => /^.{1,24}[がの]覚える技(一覧)?$/.test(s));
        if (start < 0) {
          got = { heading: "", moves: [] };
          // 見出しの形が違うページを直せるよう、「覚える」を含む行をログに残す
          log.push(`  （${t}: 見出し候補 ${lines.filter((x) => x.includes("覚える") && x.length < 40).slice(0, 5).join(" / ") || "なし"}）`);
        }
        else {
          let end = lines.findIndex((s, i) => i > start && s === "関連ページ");
          if (end < 0) end = lines.length;
          got = { heading: lines[start], moves: [...new Set(parseRows(lines, start + 1, end))] };
        }
        cache.set(r.url, got);
        await page.waitForTimeout(1500);
      }
      result[t] = { url: r.url, heading: got.heading, moves: got.moves };
      if (got.moves.length) ok++;
      log.push(`${t}: ${got.moves.length}技 [${r.how}] 「${got.heading || "見出し無し"}」 ${r.url}`);
    } catch (e) {
      result[t] = { url: r.url, heading: "", moves: [] };
      log.push(`${t}: ERROR ${e.message}`);
    }
  }
  const have = targets.filter((t) => result[t]?.moves?.length).length;
  log.unshift(`取得できた種族 ${have}/${targets.length}（今回 ${ok}/${todo.length}）`);
  fs.writeFileSync(OUT, JSON.stringify(result, null, 1));
  fs.writeFileSync(LOG_OUT, log.join("\n") + "\n");
  console.log(log.join("\n"));
  await browser.close();
})();
