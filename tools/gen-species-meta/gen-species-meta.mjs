/* src/data/speciesMeta.ts（分類・体型・タマゴグループ・色）を再生成するスクリプト。
 *
 *   node tools/gen-species-meta/gen-species-meta.mjs
 *
 * 出典は PokeAPI の CSV（本編の図鑑データ。チャンピオンズでも種族の設定は同じ）。
 *   pokemon_species.csv       … 体型（shape_id）・色（color_id）
 *   pokemon_species_names.csv … 分類（genus。「コブラポケモン」など）
 *   pokemon_egg_groups.csv / egg_group_prose.csv … タマゴグループ
 *   pokemon_color_names.csv   … 色の日本語名
 * 体型には日本語名が無いので、下の SHAPE_JA で付ける。
 *
 * テーマ（へびパ・水生生物パ など）の候補探しに使う。図鑑番号ごとに持つので、
 * 地方のすがた・メガは元の種族と同じ値になる。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const BASE = "https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv";
const JA = "1";

function parseCsv(text) {
  const [head, ...rows] = text.trim().split("\n");
  const cols = head.split(",");
  return rows.map((r) => {
    const v = r.split(",");
    return Object.fromEntries(cols.map((c, i) => [c, v[i]]));
  });
}
const fetchCsv = async (name) => {
  const res = await fetch(`${BASE}/${name}`);
  if (!res.ok) throw new Error(`${name} の取得に失敗しました: HTTP ${res.status}`);
  return parseCsv(await res.text());
};
/** 全角数字・全角英字を半角に（「すいちゅう１」→「すいちゅう1」） */
const normalize = (s) => s.normalize("NFKC").trim();

/** 体型（PokeAPI の shape）の日本語名。ゲーム内の図鑑の「すがた」の分け方に合わせた呼び方 */
const SHAPE_JA = {
  ball: "頭だけ",
  squiggle: "へび型",
  fish: "魚型",
  arms: "腕のある体",
  blob: "不定形",
  upright: "二足（しっぽあり）",
  legs: "脚だけ",
  quadruped: "四足",
  wings: "翼",
  tentacles: "触手",
  heads: "複数の体",
  humanoid: "人型",
  "bug-wings": "虫の羽",
  armor: "甲殻",
};

/** PokeAPI に日本語の分類が無い種族（ゲーム内の表記で補う） */
const GENUS_FIX = {
  1013: "まっちゃポケモン", // ヤバソチャ
};

const [species, names, eggs, eggNames, colorNames, shapes] = await Promise.all([
  fetchCsv("pokemon_species.csv"),
  fetchCsv("pokemon_species_names.csv"),
  fetchCsv("pokemon_egg_groups.csv"),
  fetchCsv("egg_group_prose.csv"),
  fetchCsv("pokemon_color_names.csv"),
  fetchCsv("pokemon_shapes.csv"),
]);

const genusOf = new Map(names.filter((n) => n.local_language_id === JA).map((n) => [n.pokemon_species_id, normalize(n.genus ?? "")]));
const eggJa = new Map(eggNames.filter((n) => n.local_language_id === JA).map((n) => [n.egg_group_id, normalize(n.name)]));
const colorJa = new Map(colorNames.filter((n) => n.local_language_id === JA).map((n) => [n.pokemon_color_id, normalize(n.name)]));
const shapeId = new Map(shapes.map((s) => [s.id, s.identifier]));
const eggsOf = new Map();
for (const e of eggs) {
  if (!eggsOf.has(e.species_id)) eggsOf.set(e.species_id, []);
  eggsOf.get(e.species_id).push(eggJa.get(e.egg_group_id) ?? e.egg_group_id);
}

// 内定表に出てくる図鑑番号だけを出す
const confirmed = fs.readFileSync(path.join(ROOT, "src/data/confirmed.ts"), "utf8");
const nos = [...new Set([...confirmed.matchAll(/\{ no: (\d+),/g)].map((m) => m[1]))]
  .sort((a, b) => Number(a) - Number(b));

const lines = [];
const missing = [];
for (const no of nos) {
  const sp = species.find((s) => s.id === no);
  if (!sp) { missing.push(no); continue; }
  const shapeKey = shapeId.get(sp.shape_id);
  const meta = {
    genus: genusOf.get(no) || GENUS_FIX[no] || "",
    shape: SHAPE_JA[shapeKey] ?? "",
    eggs: eggsOf.get(no) ?? [],
    color: colorJa.get(sp.color_id) ?? "",
  };
  lines.push(`  ${no}: ${JSON.stringify(meta)},`);
}

const out = `/* ============================================================
   種族ごとの 分類・体型・タマゴグループ・色（図鑑番号で引く）
   出典: PokeAPI（本編の図鑑データ）。tools/gen-species-meta で生成（手で書き換えない）
   テーマ（へびパ・水生生物パ など）の候補探しと、図鑑の検索・絞り込みに使う。
   地方のすがた・メガシンカは元の種族と同じ値。
   ============================================================ */
export interface SpeciesMeta {
  /** 分類（「コブラポケモン」など） */
  genus: string;
  /** 体型（へび型・魚型・翼 など） */
  shape: string;
  /** タマゴグループ（すいちゅう1 など） */
  eggs: string[];
  /** 図鑑の色（あかいろ など） */
  color: string;
}

/** 体型の並び（絞り込みの選択肢の順） */
export const SHAPES = ${JSON.stringify(Object.values(SHAPE_JA))};

export const SPECIES_META: Record<number, SpeciesMeta> = {
${lines.join("\n")}
};
`;
fs.writeFileSync(path.join(ROOT, "src/data/speciesMeta.ts"), out);
console.log(`src/data/speciesMeta.ts を更新しました（${lines.length}種族）`);
if (missing.length) console.warn("PokeAPI に無い図鑑番号:", missing.join(" "));
