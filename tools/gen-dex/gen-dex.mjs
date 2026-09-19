/* src/data/dexDark.ts（あくタイプ図鑑）を再生成するスクリプト。
 *
 *   node tools/gen-dex/gen-dex.mjs
 *
 * 出典は src/data/confirmed.ts（内定352フォルムの種族値・タイプ・特性）。
 * はがね図鑑（dex.ts）は一次ソースのスプレッドシートから手で起こしたものだが、
 * あくは同じ情報が confirmed.ts に既に揃っているので、そこから機械的に組む。
 *
 * 内定表はメガを別の行（「メガ○○」）として持つので、ここで基本種にまとめ直す。
 * 「メガニウム」のようにメガで始まる基本種があるため、接頭辞を外した名前が
 * 内定表に基本種として存在するときだけメガとして扱う。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const src = fs.readFileSync(path.join(ROOT, "src/data/confirmed.ts"), "utf8");

/** confirmed.ts を素のテキストとして読む（gen-learnsets と同じ作法） */
const RE = /\{ no: (\d+), name: "([^"]+)", types: \[([^\]]*)\], base: B\(([^)]*)\), abilities: \[([^\]]*)\]/g;
const list = [...src.matchAll(RE)].map((m) => ({
  no: Number(m[1]),
  name: m[2],
  types: [...m[3].matchAll(/"([^"]+)"/g)].map((x) => x[1]),
  base: m[4].split(",").map((s) => Number(s.trim())),
  abilities: [...m[5].matchAll(/"([^"]+)"/g)].map((x) => x[1]),
}));
const byName = new Map(list.map((c) => [c.name, c]));

/** 「メガ○○」「メガ○○Z」を (基本種, フォルム名) に分ける。
 *  メガでなければ (その名前, "通常")。 */
function split(name) {
  if (!name.startsWith("メガ")) return [name, "通常"];
  const rest = name.slice(2);
  if (byName.has(rest)) return [rest, "メガ"];
  // 末尾1文字が派生記号（Z/X/Y）のもの
  const head = rest.slice(0, -1);
  const tail = rest.slice(-1);
  if ("ZXY".includes(tail) && byName.has(head)) return [head, `メガ${tail}`];
  return [name, "通常"]; // メガニウム等、メガで始まる基本種
}

/** 系統ごとにフォルムをまとめる。並びは 通常 → メガ → メガZ */
const FORM_ORDER = { "通常": 0, "メガ": 1 };
const groups = new Map();
for (const c of list) {
  if (c.name === "手動入力") continue;
  const [sp, form] = split(c.name);
  if (!groups.has(sp)) groups.set(sp, { name: sp, no: byName.get(sp)?.no ?? c.no, forms: [] });
  groups.get(sp).forms.push({ form, ...c });
}
for (const g of groups.values()) {
  g.forms.sort((a, b) => (FORM_ORDER[a.form] ?? 2) - (FORM_ORDER[b.form] ?? 2)
    || a.form.localeCompare(b.form));
}

/** あくを持つフォルムが1つでもある系統。図鑑番号順に並べる */
const dark = [...groups.values()]
  .filter((g) => g.forms.some((f) => f.types.includes("あく")))
  .sort((a, b) => a.no - b.no);

const lines = dark.map((g) => {
  // 通常フォルムが非あく＝メガで初めてあくが付く（はがね図鑑の megaOnly と同じ意味）
  const baseForm = g.forms.find((f) => f.form === "通常");
  const megaOnly = !!baseForm && !baseForm.types.includes("あく");
  const forms = g.forms.map((f) =>
    `F("${f.form}", [${f.types.map((t) => `"${t}"`).join(", ")}], B(${f.base.join(", ")}), "${f.abilities.join("/")}")`);
  const head = `  { name: "${g.name}",${megaOnly ? " megaOnly: true," : ""} forms: [`;
  return g.forms.length === 1
    ? `${head}${forms[0]}] },`
    : `${head}\n    ${forms.join(",\n    ")}] },`;
});

const out = `import type { DexEntry, DexForm, StatBlock } from "../types";

const B = (h: number, a: number, b: number, c: number, d: number, s: number): StatBlock =>
  ({ H: h, A: a, B: b, C: c, D: d, S: s });
const F = (form: string, types: string[], base: StatBlock, ability: string): DexForm =>
  ({ form, types, base, ability });

/* ============================================================
   あくタイプ図鑑データ（ポケモンチャンピオンズ内定準拠・レギュM-C時点）
   出典: src/data/confirmed.ts（内定352フォルム）から自動生成。
   内定表はメガを別の行として持つので、基本種にまとめ直している。
   megaOnly: true = メガシンカで初めてあくが付く系統（通常フォルムは非あく）
   ・再生成: node tools/gen-dex/gen-dex.mjs
   ============================================================ */
export const DEX_DARK: DexEntry[] = [
${lines.join("\n")}
];
`;
fs.writeFileSync(path.join(ROOT, "src/data/dexDark.ts"), out);
console.log(`src/data/dexDark.ts を更新しました（${dark.length}系統 / ${dark.reduce((n, g) => n + g.forms.length, 0)}フォルム）。`);
