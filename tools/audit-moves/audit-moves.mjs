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
  // レギュM-Cで解禁。本編は威力70だがチャンピオンズは威力80・急所ランク+1
  "きりさく": { power: 80 },
  // 本編は威力90だがチャンピオンズは威力100（2026/9 実機確認）
  "であいがしら": { power: 100 },
  // 本編は威力25だがチャンピオンズは威力30（AppMediaの習得表）
  "ボーンラッシュ": { power: 30 },
};
/* 命中率・PP は3段で重ねている（moveMeta → champStats → CHAMP_META）ので、
   本編との比較ではなく「重ねた結果」を GameWith の技一覧と突き合わせる。
   CHAMP_META は実機確認ぶんなので GameWith より優先し、差は記録だけ出す。 */

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

/* AppMedia の「チャンピオンズで覚える技」表に載っている威力・命中と突き合わせる。
   本編（PokeAPI）ではなくチャンピオンズ実機の値なので、ここで出た差は
   CHAMP_OVERRIDES / CHAMP_META に入れるべきチャンピオンズ独自の値。 */
const statsPath = path.join(ROOT, "tools/scrape-learnsets/champ_move_stats.json");
// moves.ts の CHAMP_META（命中・PPのチャンピオンズ独自値）も読む
const champMeta = new Map();
{
  const block = /const CHAMP_META[^{]*\{([\s\S]*?)\n\};/.exec(src);
  if (block) {
    for (const m of block[1].matchAll(/"([^"]+)":\s*\{([^}]*)\}/g)) {
      const o = {};
      for (const kv of m[2].matchAll(/(acc|pp):\s*(\d+)/g)) o[kv[1]] = Number(kv[2]);
      champMeta.set(m[1], o);
    }
  }
}
// champStats.ts（GameWith由来のチャンピオンズ値・自動生成）も読む
const champStats = new Map();
{
  const p = path.join(ROOT, "src/data/champStats.ts");
  if (fs.existsSync(p)) {
    for (const m of fs.readFileSync(p, "utf8").matchAll(/"([^"]+)":\s*\{([^}]*)\}/g)) {
      const o = {};
      for (const kv of m[2].matchAll(/(acc|pp):\s*(\d+)/g)) o[kv[1]] = Number(kv[2]);
      champStats.set(m[1], o);
    }
  }
}
/** アプリが実際に使う命中・PP（moveMeta → champStats → CHAMP_META の重ね順） */
const effective = (name) => {
  const mt = meta.get(name);
  return {
    acc: champMeta.get(name)?.acc ?? champStats.get(name)?.acc ?? mt?.[0],
    pp: champMeta.get(name)?.pp ?? champStats.get(name)?.pp ?? mt?.[1],
  };
};

let champChecked = 0;
if (fs.existsSync(statsPath)) {
  const cs = JSON.parse(fs.readFileSync(statsPath, "utf8"));
  const byName = new Map(lib.map((m) => [m.name, m]));
  for (const [name, v] of Object.entries(cs)) {
    const m = byName.get(name);
    if (!m) continue;
    champChecked += 1;
    if (v.power != null && v.power !== m.power) {
      problems.push(`威力(チャンピオンズ): ${name} アプリ=${m.power} AppMedia=${v.power}`);
    }
    const acc = effective(name).acc;
    if (v.acc != null && acc != null && acc !== v.acc) {
      problems.push(`命中(チャンピオンズ): ${name} アプリ=${acc} AppMedia=${v.acc}`);
    }
  }
}

/* GameWith の技一覧（威力・命中・PP）とも突き合わせる。PP を持つ出典はここだけ。
   CHAMP_META は実機確認ぶんなので GameWith より優先する＝差が出ても問題にしない。 */
const gwPath = path.join(ROOT, "tools/scrape-learnsets/gamewith_move_stats.json");
let gwChecked = 0;
const gwManual = [];
if (fs.existsSync(gwPath)) {
  const gw = JSON.parse(fs.readFileSync(gwPath, "utf8"));
  const byName = new Map(lib.map((m) => [m.name, m]));
  for (const [name, v] of Object.entries(gw)) {
    const m = byName.get(name);
    if (!m) continue;
    gwChecked += 1;
    if (v.power != null && v.power !== m.power) {
      problems.push(`威力(チャンピオンズ): ${name} アプリ=${m.power} GameWith=${v.power}`);
    }
    const eff = effective(name);
    const gwAcc = v.acc === null ? 0 : v.acc; // GameWith の「-」＝必中
    const manual = champMeta.get(name) ?? {};
    if (manual.acc === undefined && eff.acc !== gwAcc) {
      problems.push(`命中(チャンピオンズ): ${name} アプリ=${eff.acc} GameWith=${gwAcc}`);
    }
    if (manual.pp === undefined && eff.pp !== v.pp) {
      problems.push(`PP(チャンピオンズ): ${name} アプリ=${eff.pp} GameWith=${v.pp}`);
    }
    // 実機確認ぶんが GameWith と食い違う場合は、記録として出しておく
    if (manual.pp !== undefined && manual.pp !== v.pp) {
      gwManual.push(`${name}: 実機=${manual.pp} GameWith=${v.pp}`);
    }
  }
}

console.log(`MOVE_LIB ${lib.length}技 / moveMeta ${meta.size}技 を検証しました。`);
if (champChecked > 0) {
  console.log(`うち ${champChecked}技は AppMedia の習得表（チャンピオンズ実機の威力・命中）とも照合しました。`);
} else {
  console.log("※ champ_move_stats.json が無いため、チャンピオンズ実機の威力・命中とは照合していません。");
}
if (gwChecked > 0) {
  console.log(`GameWith の技一覧（威力・命中・PP）とは ${gwChecked}技を照合しました。`);
} else {
  console.log("※ gamewith_move_stats.json が無いため、PP は照合していません。");
}
if (gwManual.length > 0) {
  console.log(`\n実機確認を優先した技（GameWith はレギュM-C前の値とみられる）${gwManual.length}件:`);
  for (const g of gwManual) console.log("  " + g);
}
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
