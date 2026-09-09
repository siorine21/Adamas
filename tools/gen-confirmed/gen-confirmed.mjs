/* レギュレーション追加ポケモンの CONFIRMED 行を PokeAPI から生成する。
 *
 *   node tools/gen-confirmed/gen-confirmed.mjs
 *
 * 新レギュレーションで解禁された本編既存ポケモンは、種族値・タイプ・特性が
 * 本編と同じなので PokeAPI から機械的に作れる。ADD に
 * 「アプリ内の表示名 → PokeAPI の pokemon.identifier」を並べて実行し、
 * 出力を src/data/confirmed.ts に貼る（No.順に差し込む）。
 *
 * チャンピオンズ独自のメガシンカ（Z-A 由来のメガZ など）は本編に無いため
 * ここでは作れない。攻略サイトの値を手で書き、typeVerified: false にする。
 */

/** 表示名 → PokeAPI identifier（レギュレーションM-Cの追加ぶん） */
const ADD = [
  ["プクリン", "wigglytuff"],
  ["ペルシアン", "persian"],
  ["アローラペルシアン", "persian-alola"],
  ["カモネギ", "farfetchd"],
  ["バリヤード", "mr-mime"],
  ["マルノーム", "swalot"],
  ["ボーマンダ", "salamence"],
  ["メガボーマンダ", "salamence-mega"],
  ["ゴーゴート", "gogoat"],
  ["グソクムシャ", "golisopod"],
  ["ゴリランダー", "rillaboom"],
  ["エースバーン", "cinderace"],
  ["インテレオン", "inteleon"],
  ["フォクスライ", "thievul"],
  ["ストリンダー(ハイ)", "toxtricity-amped"],
  ["ストリンダー(ロー)", "toxtricity-low-key"],
  ["オトスパス", "grapploct"],
  ["ニャイキング", "perrserker"],
  ["ネギガナイト", "sirfetchd"],
  ["バチンウニ", "pincurchin"],
  ["イエッサン(オス)", "indeedee-male"],
  ["イエッサン(メス)", "indeedee-female"],
  ["パーモット", "pawmot"],
  ["オリーヴァ", "arboliva"],
  ["イキリンコ(グリーンフェザー)", "squawkabilly-green-plumage"],
  ["イキリンコ(ブルーフェザー)", "squawkabilly-blue-plumage"],
  ["イキリンコ(イエローフェザー)", "squawkabilly-yellow-plumage"],
  ["イキリンコ(ホワイトフェザー)", "squawkabilly-white-plumage"],
  ["マフィティフ", "mabosstiff"],
  ["セグレイブ", "baxcalibur"],
];

const BASE = "https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv";
const JA = "1";
/** PokeAPI の stat_id → アプリの HABCDS */
const STAT = { 1: "H", 2: "A", 3: "B", 4: "C", 5: "D", 6: "S" };

function parseCsv(text) {
  const [head, ...rows] = text.trim().split("\n");
  const cols = head.split(",");
  return rows.map((r) => {
    const v = r.split(",");
    return Object.fromEntries(cols.map((c, i) => [c, v[i]]));
  });
}

const normalize = (s) =>
  s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).trim();

async function fetchCsv(name) {
  const res = await fetch(`${BASE}/${name}`);
  if (!res.ok) throw new Error(`${name} の取得に失敗しました: HTTP ${res.status}`);
  return parseCsv(await res.text());
}

const [pokemon, types, typeNames, stats, abilities, abilityNames] = await Promise.all([
  fetchCsv("pokemon.csv"), fetchCsv("pokemon_types.csv"), fetchCsv("type_names.csv"),
  fetchCsv("pokemon_stats.csv"), fetchCsv("pokemon_abilities.csv"), fetchCsv("ability_names.csv"),
]);

const jaType = new Map(typeNames.filter((t) => t.local_language_id === JA).map((t) => [t.type_id, normalize(t.name)]));
const jaAbility = new Map(abilityNames.filter((a) => a.local_language_id === JA).map((a) => [a.ability_id, normalize(a.name)]));
const byIdent = new Map(pokemon.map((p) => [p.identifier, p]));

const group = (rows, key) => {
  const m = new Map();
  for (const r of rows) {
    let a = m.get(r[key]);
    if (!a) m.set(r[key], (a = []));
    a.push(r);
  }
  return m;
};
const typesOf = group(types, "pokemon_id");
const statsOf = group(stats, "pokemon_id");
const abilsOf = group(abilities, "pokemon_id");

const lines = [];
for (const [name, ident] of ADD) {
  const p = byIdent.get(ident);
  if (!p) { console.error(`${name}: identifier "${ident}" が見つかりません`); continue; }
  const t = (typesOf.get(p.id) ?? []).sort((a, b) => a.slot - b.slot).map((r) => jaType.get(r.type_id));
  const s = {};
  for (const r of statsOf.get(p.id) ?? []) if (STAT[r.stat_id]) s[STAT[r.stat_id]] = Number(r.base_stat);
  const ab = (abilsOf.get(p.id) ?? []).sort((a, b) => a.slot - b.slot).map((r) => jaAbility.get(r.ability_id));
  const uniq = [...new Set(ab)];
  const total = ["H", "A", "B", "C", "D", "S"].reduce((x, k) => x + s[k], 0);
  lines.push(
    `  { no: ${p.species_id}, name: "${name}", types: [${t.map((x) => `"${x}"`).join(", ")}], ` +
    `base: B(${s.H}, ${s.A}, ${s.B}, ${s.C}, ${s.D}, ${s.S}), ` +
    `abilities: [${uniq.map((x) => `"${x}"`).join(", ")}], total: ${total}, typeVerified: true },`,
  );
}
console.log(lines.join("\n"));
console.error(`\n${lines.length}件を生成しました。`);
