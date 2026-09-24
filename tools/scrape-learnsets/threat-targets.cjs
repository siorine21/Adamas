/*
 * 内定ポケモン（src/data/confirmed.ts）から、習得技を取りに行く「種族」の一覧を作る。
 * scrape-threats.cjs（取得）と gen-threat-learnsets.mjs（生成）で共有する。
 *
 * メガシンカは元の姿と同じ技を覚えるので、取りに行かない（元の姿に寄せる）。
 *   メガリザードンX → リザードン、メガメガニウム → メガニウム、
 *   メガカエンジシ → カエンジシ(オスのすがた)（内定表に「カエンジシ」単体が無いため）
 * 「メガニウム」のように名前が「メガ」で始まるだけの種族はメガ扱いしない。
 */
const fs = require("fs");
const path = require("path");

const CONFIRMED_TS = path.join(__dirname, "../../src/data/confirmed.ts");

function confirmedNames() {
  const src = fs.readFileSync(CONFIRMED_TS, "utf8");
  return [...src.matchAll(/\{ no: (\d+), name: "([^"]+)"/g)].map((m) => ({ no: Number(m[1]), name: m[2] }));
}

/** メガの名前 → 元の姿の名前。メガでなければ null */
function megaBase(name, set) {
  if (!name.startsWith("メガ")) return null;
  const stripped = name.replace(/^メガ/, "").replace(/[XYZ](?=$|[(（])/, "");
  if (set.has(stripped)) return stripped;
  // 内定表に「〜(オスのすがた)」のようなフォルム付きでしか載っていない種族
  const withForm = [...set].find((n) => n.startsWith(`${stripped}(`));
  return withForm ?? null;
}

/** { targets: 取りに行く種族名[], megaOf: メガ名 → 元の姿 } */
function threatTargets() {
  const rows = confirmedNames();
  const set = new Set(rows.map((r) => r.name));
  const megaOf = {};
  const targets = [];
  for (const r of rows) {
    const base = megaBase(r.name, set);
    if (base) megaOf[r.name] = base;
    else if (!targets.includes(r.name)) targets.push(r.name);
  }
  return { targets, megaOf, noOf: Object.fromEntries(rows.map((r) => [r.name, r.no])) };
}

module.exports = { threatTargets, megaBase, confirmedNames };
