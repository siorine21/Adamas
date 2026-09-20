/* src/data/confirmed.ts のタイプを本編（PokeAPI）と突き合わせて点検する。
 *
 *   node tools/audit-types/audit-types.mjs
 *
 * ヒスイダイケンキが みず/かくとう と誤登録されていた（正しくは みず/あく）のを機に、
 * 内定352フォルム全体を機械的に検算するために書いた。
 *
 * 名前の対応は gen-confirmed.mjs と同じ考え方で、
 * 種族の日本語名（pokemon_species_names.csv）＋フォルム識別子から当方の表示名を組み立てる。
 * チャンピオンズ独自のメガ（typeVerified: false）は本編に存在しないので、
 * 照合対象外として「未照合」に分けて報告する。
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
async function fetchCsv(name) {
  const res = await fetch(`${BASE}/${name}`);
  if (!res.ok) throw new Error(`${name} の取得に失敗しました: HTTP ${res.status}`);
  return parseCsv(await res.text());
}

/** フォルム識別子 → 当方の表示名の作り方（species は種族の日本語名） */
const FORM_NAME = {
  "": (s) => s,
  "mega": (s) => `メガ${s}`,
  "mega-x": (s) => `メガ${s}X`,
  "mega-y": (s) => `メガ${s}Y`,
  "mega-z": (s) => `メガ${s}Z`,
  "alola": (s) => `アローラ${s}`,
  "galar": (s) => `ガラル${s}`,
  "hisui": (s) => `ヒスイ${s}`,
  "paldea": (s) => `パルデア${s}`,
};

/** 上の規則で作れないもの（当方の表示名 → PokeAPI の pokemon.identifier）。
 *  gen-confirmed.mjs の ADD と同じ対応表。 */
const IDENT = {
  "ストリンダー(ハイ)": "toxtricity-amped",
  "ストリンダー(ロー)": "toxtricity-low-key",
  "イエッサン(オス)": "indeedee-male",
  "イエッサン(メス)": "indeedee-female",
  "イキリンコ(グリーンフェザー)": "squawkabilly-green-plumage",
  "イキリンコ(ブルーフェザー)": "squawkabilly-blue-plumage",
  "イキリンコ(イエローフェザー)": "squawkabilly-yellow-plumage",
  "イキリンコ(ホワイトフェザー)": "squawkabilly-white-plumage",
  "パルデアケンタロス(かくとう)": "tauros-paldea-combat-breed",
  "パルデアケンタロス(ほのお)": "tauros-paldea-blaze-breed",
  "パルデアケンタロス(みず)": "tauros-paldea-aqua-breed",
  "ポワルン(たいようのすがた)": "castform-sunny",
  "ポワルン(あまみずのすがた)": "castform-rainy",
  "ポワルン(ゆきぐものすがた)": "castform-snowy",
  "ヒートロトム": "rotom-heat",
  "ウォッシュロトム": "rotom-wash",
  "フロストロトム": "rotom-frost",
  "スピンロトム": "rotom-fan",
  "カットロトム": "rotom-mow",
  "カエンジシ(オスのすがた)": "pyroar-male",
  "フラエッテ(えいえんのはな)": "floette-eternal",
  "メガフラエッテ(えいえんのはな)": "floette-mega",
  "ニャオニクス(オス)": "meowstic-male",
  "ニャオニクス(メス)": "meowstic-female",
  "メガニャオニクス(オス)": "meowstic-male-mega",
  "メガニャオニクス(メス)": "meowstic-female-mega",
  "ギルガルド(シールドフォルム)": "aegislash-shield",
  "ギルガルド(ブレードフォルム)": "aegislash-blade",
  "パンプジン(こだましゅ)": "gourgeist-small",
  "パンプジン(ちゅうだましゅ)": "gourgeist-average",
  "パンプジン(おおだましゅ)": "gourgeist-large",
  "パンプジン(ギガだましゅ)": "gourgeist-super",
  "ルガルガン(まひる)": "lycanroc-midday",
  "ルガルガン(まよなか)": "lycanroc-midnight",
  "ルガルガン(たそがれ)": "lycanroc-dusk",
  "イダイトウ(オス)": "basculegion-male",
  "イダイトウ(メス)": "basculegion-female",
  "イッカネズミ(3びきかぞく)": "maushold-family-of-three",
  "イッカネズミ(4ひきかぞく)": "maushold-family-of-four",
  "イルカマン(ナイーブ)": "palafin-zero",
  "イルカマン(マイティ)": "palafin-hero",
};

const normalize = (s) =>
  s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).trim();

const [pokemon, forms, speciesNames, pokeTypes, typeNames, pokeStats] = await Promise.all([
  fetchCsv("pokemon.csv"), fetchCsv("pokemon_forms.csv"), fetchCsv("pokemon_species_names.csv"),
  fetchCsv("pokemon_types.csv"), fetchCsv("type_names.csv"), fetchCsv("pokemon_stats.csv"),
]);

/** PokeAPI の stat_id → アプリの HABCDS */
const STAT = { 1: "H", 2: "A", 3: "B", 4: "C", 5: "D", 6: "S" };

const jaType = new Map(typeNames.filter((t) => t.local_language_id === JA)
  .map((t) => [t.type_id, normalize(t.name)]));
const jaSpecies = new Map(speciesNames.filter((s) => s.local_language_id === JA)
  .map((s) => [s.pokemon_species_id, normalize(s.name)]));

const typesOf = new Map();
for (const r of pokeTypes) {
  if (!typesOf.has(r.pokemon_id)) typesOf.set(r.pokemon_id, []);
  typesOf.get(r.pokemon_id).push(r);
}
const typeList = (pid) => (typesOf.get(pid) ?? [])
  .sort((a, b) => Number(a.slot) - Number(b.slot)).map((r) => jaType.get(r.type_id));

const statsOf = new Map();
for (const r of pokeStats) {
  if (!STAT[r.stat_id]) continue;
  if (!statsOf.has(r.pokemon_id)) statsOf.set(r.pokemon_id, {});
  statsOf.get(r.pokemon_id)[STAT[r.stat_id]] = Number(r.base_stat);
}
/** 種族値を HABCDS の順の配列で。欠けていれば null */
const statList = (pid) => {
  const s = statsOf.get(pid);
  if (!s) return null;
  const a = ["H", "A", "B", "C", "D", "S"].map((k) => s[k]);
  return a.some((x) => x === undefined) ? null : a;
};

const byIdent = new Map(pokemon.map((p) => [p.identifier, p]));

/** 表示名 → 本編のタイプ。
 *  ① 通常フォルム（is_default）を種族の日本語名で登録
 *  ② メガ・リージョンフォルムを FORM_NAME の規則で登録
 *  ③ 規則で作れないものを IDENT で登録（後勝ち） */
const ref = new Map();
const put = (name, pid, force) => {
  if (!force && ref.has(name)) return;
  ref.set(name, { types: typeList(pid), base: statList(pid) });
};
for (const p of pokemon) {
  if (p.is_default !== "1") continue;
  const sp = jaSpecies.get(p.species_id);
  if (sp) put(sp, p.id, false);
}
const byId = new Map(pokemon.map((p) => [p.id, p]));
for (const f of forms) {
  const p = byId.get(f.pokemon_id);
  if (!p) continue;
  const sp = jaSpecies.get(p.species_id);
  const make = FORM_NAME[f.form_identifier ?? ""];
  if (!sp || !make) continue;
  put(make(sp), p.id, false);
}
for (const [name, ident] of Object.entries(IDENT)) {
  const p = byIdent.get(ident);
  if (p) put(name, p.id, true);
}

/* ---- confirmed.ts を読む ---- */
const src = fs.readFileSync(path.join(ROOT, "src/data/confirmed.ts"), "utf8");
const RE = /\{ no: (\d+), name: "([^"]+)", types: \[([^\]]*)\], base: B\(([^)]*)\).*?typeVerified: (true|false) \}/g;
const rows = [...src.matchAll(RE)].map((m) => ({
  no: Number(m[1]),
  name: m[2],
  types: [...m[3].matchAll(/"([^"]+)"/g)].map((x) => x[1]),
  base: m[4].split(",").map((s) => Number(s.trim())),
  verified: m[5] === "true",
}));

const same = (a, b) => !!a && !!b && a.length === b.length && a.every((x, i) => x === b[i]);

const typeNg = [], statNg = [], unmatched = [];
let typeOk = 0;
for (const r of rows) {
  if (r.name === "手動入力") continue;
  const want = ref.get(r.name);
  if (!want) { unmatched.push(r); continue; }
  if (same(r.types, want.types)) typeOk++; else typeNg.push({ ...r, want: want.types });
  if (want.base && !same(r.base, want.base)) statNg.push({ ...r, want: want.base });
}

console.log(`照合できた ${typeOk + typeNg.length}件 / タイプ一致 ${typeOk}件`);

console.log(`\n■ タイプ不一致 ${typeNg.length}件`);
for (const m of typeNg) {
  console.log(`  No.${m.no} ${m.name}: 当方 ${m.types.join("/")} → 本編 ${m.want.join("/")}`
    + (m.verified ? "" : "  (typeVerified:false)"));
}

console.log(`\n■ 種族値不一致 ${statNg.length}件（参考。チャンピオンズ独自調整の可能性もある）`);
for (const m of statNg) {
  console.log(`  No.${m.no} ${m.name}: 当方 ${m.base.join("-")} → 本編 ${m.want.join("-")}`
    + (m.verified ? "" : "  (typeVerified:false)"));
}

console.log(`\n■ 本編に対応が見つからず未照合 ${unmatched.length}件`);
if (unmatched.length) console.log("  " + unmatched.map((r) => r.name).join(", "));

/* ---- はがね図鑑（dex.ts）は一次ソースから手で起こしたものなので、
       内定表（PokeAPI 照合済み）とも食い違っていないか見る。
       あく図鑑は confirmed.ts から自動生成なので照合不要。 ---- */
const confByName = new Map(rows.map((r) => [r.name, r]));
const dexSrc = fs.readFileSync(path.join(ROOT, "src/data/dex.ts"), "utf8");
const dexNg = [];
let dexN = 0;
for (const [, sp, body] of dexSrc.matchAll(/\{ name: "([^"]+)",(?:[^}]*?)forms: \[([\s\S]*?)\] \},/g)) {
  for (const f of body.matchAll(/F\("([^"]+)", \[([^\]]*)\], B\(([^)]*)\)/g)) {
    const [, form, t, b] = f;
    // 図鑑のフォルム名 → 内定表の行名。メガ以外のフォルム（シールド等）は
    // 内定表の行名と対応が付かないので飛ばす。
    const name = form === "通常" ? sp
      : form === "メガ" ? `メガ${sp}`
      : /^メガ[XYZ]$/.test(form) ? `メガ${sp}${form.slice(2)}` : null;
    if (!name) continue;
    dexN++;
    const c = confByName.get(name);
    if (!c) { dexNg.push(`${name}: 内定表に無い`); continue; }
    const types = [...t.matchAll(/"([^"]+)"/g)].map((x) => x[1]);
    const base = b.split(",").map((s) => Number(s.trim()));
    if (!same(types, c.types)) dexNg.push(`${name}: タイプ 図鑑 ${types.join("/")} / 内定 ${c.types.join("/")}`);
    if (!same(base, c.base)) dexNg.push(`${name}: 種族値 図鑑 ${base.join("-")} / 内定 ${c.base.join("-")}`);
  }
}
console.log(`\n■ はがね図鑑(dex.ts) ${dexN}フォルムを内定表と照合 / 差分 ${dexNg.length}件`);
for (const m of dexNg) console.log(`  ${m}`);
