/* チャンピオンズの習得技データ（src/data/moves.ts の LEARNSETS）を点検する。
 *
 *   node tools/audit-learnsets/audit-learnsets.mjs
 *
 * 習得技の一次情報は AppMedia（tools/scrape-learnsets）で、
 * 機械的に「正しいか」を判定できる出典は存在しない。そこでこのスクリプトは
 * 本編（PokeAPI）の習得表と突き合わせ、**要確認の候補**を洗い出す。
 *
 *   ・本編ではどのバージョンでも覚えない技 → 掲載ミス／取り違えの疑い
 *     （ただしチャンピオンズ独自の追加なら正しいので、実機確認が必要）
 *   ・KNOWN_CHAMP_ONLY に入れた技は「独自追加として確認済み」とみなして除外する
 *
 * 実機で確認したら KNOWN_CHAMP_ONLY か、誤りなら moves.ts の LEARNSETS を直し、
 * tools/scrape-learnsets/README.md の手動修正一覧に記録すること。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** 実機で確認済みの「チャンピオンズ独自の習得技」。種族名 → 技名の配列（"*" は全種族） */
const KNOWN_CHAMP_ONLY = {
  // 例: "ボスゴドラ": ["マグネットボム"],
};

/** アプリの種族名 → PokeAPI の pokemon.identifier（メガ・フォルム違いも合算する） */
const IDENT = {
  "フォレトス": ["forretress"],
  "ハガネール": ["steelix", "steelix-mega"],
  "ハッサム": ["scizor", "scizor-mega"],
  "エアームド": ["skarmory"],
  "クチート": ["mawile", "mawile-mega"],
  "ボスゴドラ": ["aggron", "aggron-mega"],
  "チリーン": ["chimecho"],
  "メタグロス": ["metagross", "metagross-mega"],
  "エンペルト": ["empoleon"],
  "トリデプス": ["bastiodon"],
  "ルカリオ": ["lucario", "lucario-mega"],
  "ドリュウズ": ["excadrill"],
  "ガラルマッギョ": ["stunfisk-galar"],
  "ギルガルド": ["aegislash-shield", "aegislash-blade"],
  "ヒスイヌメルゴン": ["goodra-hisui"],
  "クレッフィ": ["klefki"],
  "アーマーガア": ["corviknight"],
  "ニャイキング": ["perrserker"],
  "デカヌチャン": ["tinkaton"],
  "ミミズズ": ["orthworm"],
  "ドドゲザン": ["kingambit"],
  "サーフゴー": ["gholdengo"],
  "ブリジュラス": ["archaludon"],
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

const normalize = (s) =>
  s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).trim();

async function fetchCsv(name) {
  const res = await fetch(`${BASE}/${name}`);
  if (!res.ok) throw new Error(`${name} の取得に失敗しました: HTTP ${res.status}`);
  return parseCsv(await res.text());
}

const [moveNames, pokemon, pokemonMoves] = await Promise.all([
  fetchCsv("move_names.csv"), fetchCsv("pokemon.csv"), fetchCsv("pokemon_moves.csv"),
]);

const jaMove = new Map(
  moveNames.filter((n) => n.local_language_id === JA).map((n) => [n.move_id, normalize(n.name)]),
);
const idOf = new Map(pokemon.map((p) => [p.identifier, p.id]));
// 本編で覚える技（全バージョン合算）
const learnable = new Map();
for (const r of pokemonMoves) {
  let set = learnable.get(r.pokemon_id);
  if (!set) learnable.set(r.pokemon_id, (set = new Set()));
  const n = jaMove.get(r.move_id);
  if (n) set.add(n);
}

// LEARNSETS を読む
const src = fs.readFileSync(path.join(ROOT, "src/data/moves.ts"), "utf8");
const learnsets = [...src.matchAll(/^ {2}"([^"]+)": \{ status: "(\w+)", source: "([^"]*)", moves: \[([^\]]*)\] \},$/gm)]
  .map((m) => ({
    name: m[1],
    status: m[2],
    moves: m[4].split(",").map((s) => s.trim().replace(/^"|"$/g, "")).filter(Boolean),
  }));

const total = learnsets.reduce((s, e) => s + e.moves.length, 0);
console.log(`LEARNSETS ${learnsets.length}種族 / 技 ${total}件 を点検しました。`);

let candidates = 0;
const dupWithin = [];
for (const e of learnsets) {
  // 同じ種族の中に同じ技が2回出ていないか（スクレイプの取り込みミス）
  const seen = new Set();
  for (const n of e.moves) {
    if (seen.has(n)) dupWithin.push(`${e.name}: ${n}`);
    seen.add(n);
  }

  const idents = IDENT[e.name];
  if (!idents) {
    console.log(`\n${e.name}: PokeAPI との対応が未設定（IDENT に追加してください）`);
    continue;
  }
  const union = new Set();
  for (const ident of idents) {
    const pid = idOf.get(ident);
    if (!pid) { console.log(`\n${e.name}: identifier "${ident}" が PokeAPI に見つかりません`); continue; }
    for (const n of learnable.get(pid) ?? []) union.add(n);
  }
  const known = new Set([...(KNOWN_CHAMP_ONLY[e.name] ?? []), ...(KNOWN_CHAMP_ONLY["*"] ?? [])]);
  const suspect = e.moves.filter((n) => !union.has(n) && !known.has(n));
  candidates += suspect.length;
  if (suspect.length > 0) {
    console.log(`\n${e.name}（${e.moves.length}技） 本編では習得不可 ${suspect.length}件:`);
    console.log("  " + suspect.join(" / "));
  }
}

if (dupWithin.length > 0) {
  console.log(`\n同一種族内で技が重複 ${dupWithin.length}件:`);
  for (const d of dupWithin) console.log("  " + d);
}

console.log(`\n要確認の候補: ${candidates}件`);
console.log("※ チャンピオンズ独自の追加なら正しいので、実機で確認してから直してください。");
console.log("   確認できたものは KNOWN_CHAMP_ONLY に登録すると、次回から出なくなります。");
