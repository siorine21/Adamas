/* 技データ（src/data/moves.ts の MOVE_LIB と src/data/moveMeta.ts）が
 * 出典どおりかを検証する。技を足したり直したりしたら実行すること。
 *
 *   node tools/audit-moves/audit-moves.mjs
 *
 * 出典: PokeAPI (github.com/PokeAPI/pokeapi) の data/v2/csv
 *   moves.csv          … タイプ・威力・分類・命中率・PP
 *   move_names.csv     … 日本語名（local_language_id=1）
 *   type_names.csv     … タイプの日本語名
 *   move_flag_map.csv  … 接触フラグ（move_flag_id=1）
 *
 * 検証するのは「本編の技データと一致しているか」まで。
 * useDef / useTargetAtk / targetB / ignoreDefRank はアプリ独自の挙動なので対象外
 * （付与先は moves.ts の先頭コメントに列挙してある）。
 *
 * チャンピオンズで本編と値が違う技は CHAMP_OVERRIDES に登録する。
 * 実機で差分を見つけたら moves.ts と合わせてここにも足すこと。
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** チャンピオンズ独自の値（本編＝出典とは異なるが、これが正しい） */
const CHAMP_OVERRIDES = {
  // 本編ではくさタイプだが、チャンピオンズでははがね（2026/9 実機確認）
  "トラバサミ": { type: "はがね" },
};

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

/** 全角数字を半角にし前後の空白を落とす（MOVE_LIB 側の表記に合わせる） */
const normalize = (s) =>
  s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).trim();

async function fetchCsv(name) {
  const res = await fetch(`${BASE}/${name}`);
  if (!res.ok) throw new Error(`${name} の取得に失敗しました: HTTP ${res.status}`);
  return parseCsv(await res.text());
}

const [moves, moveNames, typeNames, flagMap] = await Promise.all([
  fetchCsv("moves.csv"), fetchCsv("move_names.csv"),
  fetchCsv("type_names.csv"), fetchCsv("move_flag_map.csv"),
]);

const jaName = new Map(
  moveNames.filter((n) => n.local_language_id === JA).map((n) => [n.move_id, normalize(n.name)]),
);
const jaType = new Map(
  typeNames.filter((t) => t.local_language_id === JA).map((t) => [t.type_id, t.name]),
);
const CAT = { 1: "変化", 2: "物理", 3: "特殊" };
const contactIds = new Set(flagMap.filter((f) => f.move_flag_id === "1").map((f) => f.move_id));

const expected = new Map();
for (const m of moves) {
  const name = jaName.get(m.id);
  if (!name) continue;
  expected.set(name, {
    type: jaType.get(m.type_id),
    power: m.power ? Number(m.power) : 0,
    cat: CAT[m.damage_class_id],
    acc: m.accuracy ? Number(m.accuracy) : 0,
    pp: m.pp ? Number(m.pp) : 0,
    contact: contactIds.has(m.id),
  });
}

// MOVE_LIB を読む: M("名前", "タイプ", 威力, "分類", {オプション})
const src = fs.readFileSync(path.join(ROOT, "src/data/moves.ts"), "utf8");
const libStart = src.indexOf("const BASE_MOVE_LIB");
const libEnd = src.indexOf("\n];", libStart);
const lib = [...src.slice(libStart, libEnd).matchAll(/M\("([^"]+)",\s*"([^"]+)",\s*(\d+),\s*"([^"]+)"(.*)\)/g)]
  .map((m) => ({ name: m[1], type: m[2], power: Number(m[3]), cat: m[4], opts: m[5] || "" }));

// moveMeta を読む: "名前": [命中, PP]
const metaSrc = fs.readFileSync(path.join(ROOT, "src/data/moveMeta.ts"), "utf8");
const meta = new Map(
  [...metaSrc.matchAll(/"([^"]+)":\s*\[(\d+),\s*(\d+)\]/g)].map((m) => [m[1], [Number(m[2]), Number(m[3])]]),
);

const problems = [];
const overridden = [];
const seen = new Set();
for (const m of lib) {
  if (seen.has(m.name)) problems.push(`重複: ${m.name}`);
  seen.add(m.name);

  const base = expected.get(m.name);
  if (!base) { problems.push(`出典に無い技名: ${m.name}`); continue; }
  // チャンピオンズ独自の値がある技は、そちらを正として比べる
  const ov = CHAMP_OVERRIDES[m.name];
  const x = ov ? { ...base, ...ov } : base;
  if (ov) overridden.push(`${m.name}: ${Object.entries(ov).map(([k, v]) => `${k}=${v}`).join(" ")}（出典: ${base.type}）`);
  if (x.type !== m.type) problems.push(`タイプ: ${m.name} アプリ=${m.type} 期待=${x.type}`);
  if (x.power !== m.power) problems.push(`威力: ${m.name} アプリ=${m.power} 期待=${x.power}`);
  if (x.cat !== m.cat) problems.push(`分類: ${m.name} アプリ=${m.cat} 期待=${x.cat}`);

  const hasContact = /contact:\s*true/.test(m.opts);
  if (x.contact !== hasContact) {
    problems.push(`接触: ${m.name} アプリ=${hasContact ? "接触" : "非接触"} 出典=${x.contact ? "接触" : "非接触"}`);
  }

  const mt = meta.get(m.name);
  if (!mt) problems.push(`命中/PP 未収録: ${m.name}`);
  else if (mt[0] !== x.acc || mt[1] !== x.pp) {
    problems.push(`命中/PP: ${m.name} アプリ=命中${mt[0]}/PP${mt[1]} 出典=命中${x.acc}/PP${x.pp}`);
  }
}

// 習得表にあるのにライブラリに無い技（＝技ドロップダウンに出てこない）
const champPath = path.join(ROOT, "tools/scrape-learnsets/champ_moves.json");
if (fs.existsSync(champPath)) {
  const champ = JSON.parse(fs.readFileSync(champPath, "utf8"));
  const libNames = new Set(lib.map((m) => m.name));
  const missing = new Set();
  for (const list of Object.values(champ)) for (const n of list) if (!libNames.has(n)) missing.add(n);
  for (const n of missing) problems.push(`習得表にあるがMOVE_LIBに無い: ${n}`);
}

console.log(`MOVE_LIB ${lib.length}技 / moveMeta ${meta.size}技 を検証しました。`);
if (overridden.length > 0) {
  console.log(`\nチャンピオンズ独自の値として扱った技 ${overridden.length}件:`);
  for (const o of overridden) console.log("  " + o);
}
if (problems.length === 0) {
  console.log("問題は見つかりませんでした。");
} else {
  console.log(`\n要確認 ${problems.length}件:`);
  for (const p of problems) console.log("  " + p);
  process.exitCode = 1;
}
