/* src/data/moveMeta.ts（技の命中率・PP）を再生成するスクリプト。
 *
 *   node tools/gen-move-meta/gen-move-meta.mjs
 *
 * 出典は PokeAPI のCSV（github.com/PokeAPI/pokeapi の data/v2/csv）。
 * MOVE_LIB の威力・タイプ・分類と同じデータ源なので、値の整合が取れる。
 * MOVE_LIB に収録されている技だけを出力するので、技を追加したら再実行すること。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const BASE = "https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv";
const JA = "1"; // move_names.csv の local_language_id（日本語）

/** 引用符を含まない単純CSV（このCSV2種は該当）を行オブジェクトの配列にする */
function parseCsv(text) {
  const [head, ...rows] = text.trim().split("\n");
  const cols = head.split(",");
  return rows.map((r) => {
    const v = r.split(",");
    return Object.fromEntries(cols.map((c, i) => [c, v[i]]));
  });
}

/** 全角数字を半角にし前後の空白を落とす（MOVE_LIB 側の表記に合わせる） */
const normalize = (s) =>
  s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).trim();

const fetchCsv = async (name) => {
  const res = await fetch(`${BASE}/${name}`);
  if (!res.ok) throw new Error(`${name} の取得に失敗しました: HTTP ${res.status}`);
  return parseCsv(await res.text());
};

const [moves, names] = await Promise.all([fetchCsv("moves.csv"), fetchCsv("move_names.csv")]);

const jaById = new Map(
  names.filter((n) => n.local_language_id === JA).map((n) => [n.move_id, normalize(n.name)]),
);
const meta = new Map(); // 日本語名 -> [命中率, PP]
for (const m of moves) {
  const ja = jaById.get(m.id);
  if (ja) meta.set(ja, [m.accuracy ? Number(m.accuracy) : 0, m.pp ? Number(m.pp) : 0]);
}

// アプリの技ライブラリに載っている技名を moves.ts から拾う
const src = fs.readFileSync(path.join(ROOT, "src/data/moves.ts"), "utf8");
const libStart = src.indexOf("const BASE_MOVE_LIB");
const libEnd = src.indexOf("\n];", libStart);
const lib = [...src.slice(libStart, libEnd).matchAll(/M\("([^"]+)"/g)].map((m) => m[1]);

const missing = lib.filter((n) => !meta.has(n));
if (missing.length) {
  console.warn(`PokeAPI に見つからない技が ${missing.length} 件あります:`, missing.join(", "));
}

const lines = lib
  .filter((n) => meta.has(n))
  .map((n) => `  "${n}": [${meta.get(n)[0]}, ${meta.get(n)[1]}],`);

const out = `import type { MoveMeta } from "../types";

/* ---------- 技の命中率・PP ----------
   出典: PokeAPI (github.com/PokeAPI/pokeapi) の data/v2/csv/moves.csv（accuracy・pp）と
        move_names.csv（日本語名 local_language_id=1）。全角数字は半角化して照合。
   ・[命中率, PP] の順。命中率 0 は「必中（命中判定なし）」を表す。
   ・PP はポイントアップ未使用の基本値。
   ・MOVE_LIB に収録している技のみを保持（${lines.length}技）。
   ・再生成: node tools/gen-move-meta/gen-move-meta.mjs */
export const MOVE_META: Record<string, MoveMeta> = {
${lines.join("\n")}
};
`;
fs.writeFileSync(path.join(ROOT, "src/data/moveMeta.ts"), out);
console.log(`src/data/moveMeta.ts を更新しました（${lines.length}技）。`);
