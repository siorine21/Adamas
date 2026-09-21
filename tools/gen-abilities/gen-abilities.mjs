/* src/data/abilityText.ts（特性のゲーム内説明文）を生成する。
 *
 *   node tools/gen-abilities/gen-abilities.mjs
 *
 * 出典は PokeAPI の ability_flavor_text.csv（日本語＝language_id 1）。
 * 本編のゲーム内でそのまま出る文なので、プレイヤーが見慣れた言い回しになる。
 * 版によって文言が変わるので、いちばん新しい version_group のものを採る。
 *
 * ただしゲーム内表記は「いりょくが　あがる」のように倍率を書かないことが多い。
 * ダメージ計算で効いてくる特性は数字が要るので、src/data/abilities.ts の
 * ABILITY_META で上書きする（持ち物・技データと同じ「自動生成＋手動で上書き」の作り）。
 *
 * 内定データに出てくる特性だけを出力する（全特性を持っても使わないので）。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const BASE = "https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv";
const JA = "1";

/** 引用符・改行を含む列があるので、素朴な split では読めない */
function parseCsv(text) {
  const rows = [];
  let row = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cur); cur = ""; }
    else if (c === "\n") { row.push(cur); cur = ""; rows.push(row); row = []; }
    else if (c !== "\r") cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows;
}
async function fetchCsv(name) {
  const res = await fetch(`${BASE}/${name}`);
  if (!res.ok) throw new Error(`${name} の取得に失敗しました: HTTP ${res.status}`);
  return parseCsv(await res.text());
}

/** ゲーム内表記は分かち書き（全角スペース）と改行で整形されている。
 *  1行に均すが、区切りは半角スペースとして残す（全部詰めるとかなの塊になって読めない）。 */
const flatten = (s) => s.replace(/[\n\r　\s]+/g, " ").trim();

/* ---- 内定データに出てくる特性を集める ---- */
const need = new Set();
for (const f of ["src/data/confirmed.ts", "src/data/dex.ts", "src/data/dexDark.ts"]) {
  const t = fs.readFileSync(path.join(ROOT, f), "utf8");
  // confirmed.ts: abilities: ["いかく", "だっぴ"]
  for (const m of t.matchAll(/abilities: \[([^\]]*)\]/g)) {
    for (const a of m[1].matchAll(/"([^"]+)"/g)) need.add(a[1]);
  }
  // dex.ts / dexDark.ts: F("通常", [...], B(...), "いかく/だっぴ")
  for (const m of t.matchAll(/B\([^)]*\), "([^"]*)"\)/g)) {
    for (const a of m[1].split("/")) if (a.trim()) need.add(a.trim());
  }
}

const [names, flavor] = await Promise.all([
  fetchCsv("ability_names.csv"), fetchCsv("ability_flavor_text.csv"),
]);

const idByJa = new Map();
for (const r of names.slice(1)) if (r[1] === JA) idByJa.set(r[2].trim(), r[0]);

/** ability_id → いちばん新しい版の日本語説明 */
const textById = new Map();
for (const r of flavor.slice(1)) {
  if (r[2] !== JA) continue;
  const id = r[0], vg = Number(r[1]);
  const prev = textById.get(id);
  if (!prev || vg > prev.vg) textById.set(id, { vg, text: flatten(r[3]) });
}

const out = [], missing = [];
for (const a of [...need].sort()) {
  const id = idByJa.get(a);
  const t = id && textById.get(id);
  if (!t) { missing.push(a); continue; }
  out.push(`  "${a}": "${t.text.replace(/"/g, '\\"')}",`);
}

const src = `/* ============================================================
   特性のゲーム内説明文（本編の表記）
   出典: PokeAPI ability_flavor_text.csv の日本語（いちばん新しい版）
   ・再生成: node tools/gen-abilities/gen-abilities.mjs
   ・自動生成なので直接編集しない。文言を変えたい特性や、
     ダメージ計算で効く倍率を書きたい特性は src/data/abilities.ts の
     ABILITY_META に書く（そちらが優先される）。
   ============================================================ */
export const ABILITY_TEXT: Record<string, string> = {
${out.join("\n")}
};
`;
fs.writeFileSync(path.join(ROOT, "src/data/abilityText.ts"), src);
console.log(`src/data/abilityText.ts を更新しました（${out.length}件）。`);

// PokeAPI に日本語が無いぶんは abilities.ts の ABILITY_META で埋めている。
// 埋め忘れ（＝アプリ上で説明が出ない特性）だけを残して報告する。
const meta = fs.readFileSync(path.join(ROOT, "src/data/abilities.ts"), "utf8");
const unwritten = missing.filter((a) => !meta.includes(`"${a}":`));
if (missing.length) {
  console.log(`\nPokeAPI に日本語の説明が無い ${missing.length}件（うち ABILITY_META 未記入 ${unwritten.length}件）:`);
  console.log("  " + missing.join(", "));
}
if (unwritten.length) {
  console.log(`\n※ 説明が出ない特性があります。src/data/abilities.ts の ABILITY_META に追記してください:`);
  console.log("  " + unwritten.join(", "));
}
