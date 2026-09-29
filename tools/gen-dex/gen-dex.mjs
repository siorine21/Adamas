/* src/data/dexAll.ts（内定ポケモン全系統の図鑑）を再生成するスクリプト。
 *
 *   node tools/gen-dex/gen-dex.mjs
 *
 * 出典は src/data/confirmed.ts（内定352フォルムの種族値・タイプ・特性）。
 * はがね図鑑（dex.ts の DEX）は一次ソースのスプレッドシートから手で起こしたもので、
 * フォルムのまとめ方（ギルガルドのシールド／ブレード等）も手で決めている。
 * そこに載っている系統はここでは出さず、残りをすべて confirmed.ts から機械的に組む。
 * （以前は あく系統だけを dexDark.ts に出していた。系統名は同じ規則なので、
 *   保存済みの個体の名前はそのまま引ける）
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
  // 内定表に同じ特性が重複して載っている行がある（カエンジシ）ので重ねない
  abilities: [...new Set([...m[5].matchAll(/"([^"]+)"/g)].map((x) => x[1]))],
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
  // 基本種が「カエンジシ(オスのすがた)」のようにフォルム名付きでしか載っていない
  const withForm = [...byName.keys()].find((n) => n.startsWith(`${rest}(`));
  if (withForm) return [withForm, "メガ"];
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

/** はがね図鑑（手で起こした DEX）に載っている系統名。ここでは出さない */
const dexSrc = fs.readFileSync(path.join(ROOT, "src/data/dex.ts"), "utf8");
const steelBlock = dexSrc.slice(dexSrc.indexOf("export const DEX:"), dexSrc.indexOf("];", dexSrc.indexOf("export const DEX:")));
const steelNames = new Set([...steelBlock.matchAll(/\{ name: "([^"]+)"/g)].map((m) => m[1]));
/** 内定表では「ギルガルド(シールドフォルム)」のようにフォルム名が付くが、
 *  はがね図鑑では「ギルガルド」に2フォルムとしてまとめている。括弧を外して照合する */
const coveredBySteel = (name) => steelNames.has(name) || steelNames.has(name.replace(/[(（].*$/, ""));

/** 図鑑番号順。同じ番号の中では内定表の並び（通常→地方のすがた等）のまま */
const rest = [...groups.values()]
  .filter((g) => !coveredBySteel(g.name))
  .sort((a, b) => a.no - b.no);
const missingSteel = [...steelNames].filter((n) => ![...groups.keys()].some((g) => g === n || g.replace(/[(（].*$/, "") === n));

const lines = rest.map((g) => {
  const forms = g.forms.map((f) =>
    `F("${f.form}", [${f.types.map((t) => `"${t}"`).join(", ")}], B(${f.base.join(", ")}), "${f.abilities.join("/")}")`);
  const head = `  { name: "${g.name}", no: ${g.no}, forms: [`;
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
   内定ポケモン全系統の図鑑データ（はがね図鑑 DEX に載っている系統を除く）
   ポケモンチャンピオンズ内定準拠・レギュM-C時点
   出典: src/data/confirmed.ts（内定352フォルム）から自動生成。
   内定表はメガを別の行として持つので、基本種にまとめ直している。
   地方のすがた・フォルム違い（ルガルガン等）は覚える技が違うので別の系統として持つ。
   ・再生成: node tools/gen-dex/gen-dex.mjs（手で書き換えない）
   ============================================================ */
export const DEX_REST: DexEntry[] = [
${lines.join("\n")}
];
`;
fs.writeFileSync(path.join(ROOT, "src/data/dexAll.ts"), out);
console.log(`src/data/dexAll.ts を更新しました（${rest.length}系統 / ${rest.reduce((n, g) => n + g.forms.length, 0)}フォルム）。`);
console.log(`はがね図鑑側 ${steelNames.size}系統`);
if (missingSteel.length) console.warn("はがね図鑑にあって内定表に無い系統:", missingSteel.join(" "));
