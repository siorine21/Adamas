/* アダマス工房の computeDamage を、本家 @smogon/calc と突き合わせる差分テスト。
 *
 *   npm i --no-save @smogon/calc esbuild
 *   npx esbuild src/calc.ts --bundle --format=esm --outfile=tools/verify-damage/ours.mjs
 *   node tools/verify-damage/verify-damage.mjs
 *
 * チャンピオンズは本編（第9世代）と同じダメージ計算式なので、補正の順番・丸めが
 * 合っているかは本家の実装と突き合わせれば機械的に確かめられる。
 * 技の威力やチャンピオンズ独自の特性は対象外（そちらは tools/audit-moves で検証）。
 *
 * ours.mjs は生成物なので .gitignore 済み。計算式をいじったら必ずこれを通すこと。
 */
import pkg from "@smogon/calc";
const { Generations, Pokemon, Move, Field, calculate } = pkg;
import { computeDamage } from "./ours.mjs";

const gen = Generations.get(9);
const JP_TYPE = {
  Normal: "ノーマル", Fire: "ほのお", Water: "みず", Electric: "でんき", Grass: "くさ",
  Ice: "こおり", Fighting: "かくとう", Poison: "どく", Ground: "じめん", Flying: "ひこう",
  Psychic: "エスパー", Bug: "むし", Rock: "いわ", Ghost: "ゴースト", Dragon: "ドラゴン",
  Dark: "あく", Steel: "はがね", Fairy: "フェアリー",
};

let pass = 0, fail = 0;
const failures = [];

function run(name, sc) {
  const attacker = new Pokemon(gen, sc.atk, sc.atkOpts ?? {});
  const defender = new Pokemon(gen, sc.def, sc.defOpts ?? {});
  const move = new Move(gen, sc.move, sc.moveOpts ?? {});
  const field = new Field(sc.field ?? {});
  const res = calculate(gen, attacker, defender, move, field);
  const want = Array.isArray(res.damage) ? res.damage : [res.damage];
  if (want.length !== 16) { console.log(`SKIP ${name}: 乱数16個でない`); return; }

  const physical = move.category === "Physical";
  const crit = !!sc.moveOpts?.isCrit;
  // 急所のときは本家も攻撃側の下降ランク／防御側の上昇ランクを無視する
  const atkStat = physical ? attacker.rawStats.atk : attacker.rawStats.spa;
  const defStat = physical ? defender.rawStats.def : defender.rawStats.spd;

  const got = computeDamage({
    power: move.bp,
    moveName: sc.jpMove ?? "＿",
    atkStat, defStat,
    atkRank: sc.atkOpts?.boosts?.[physical ? "atk" : "spa"] ?? 0,
    defRank: sc.defOpts?.boosts?.[physical ? "def" : "spd"] ?? 0,
    moveType: JP_TYPE[move.type],
    atkTypes: attacker.types.map((t) => JP_TYPE[t]),
    defTypes: defender.types.map((t) => JP_TYPE[t]),
    category: physical ? "物理" : "特殊",
    item: sc.jpItem ?? "（なし）",
    defItem: sc.jpDefItem ?? "（なし）",
    crit,
    weather: sc.jpWeather ?? "なし",
    field: sc.jpField ?? "なし",
    burn: attacker.status === "brn" && physical,
    wall: !!(field.defenderSide.isReflect || field.defenderSide.isLightScreen),
    contact: !!move.flags?.contact,
    atkAbility: sc.jpAtkAbility ?? "（補正なし）",
    defAbility: sc.jpDefAbility ?? "（補正なし）",
    defHPFull: (sc.defOpts?.curHP ?? defender.maxHP()) >= defender.maxHP(),
    helpingHand: !!field.attackerSide?.isHelpingHand,
    spread: !!sc.spread,
    atkStatused: !!attacker.status,
    defStatused: !!defender.status,
    atkPinch: !!sc.atkPinch,
    atkMovesLast: !!sc.atkMovesLast,
    rivalry: sc.rivalry ?? "なし",
    protect: false,
    extraMul: 1,
  });
  const g = got?.rolls ?? [];
  const ok = g.length === 16 && g.every((v, i) => v === want[i]);
  if (ok) { pass++; return; }
  fail++;
  failures.push(`${name}\n    本家: ${want.join(",")}\n    当方: ${g.join(",")}`);
}

const S = { level: 50, nature: "Adamant", evs: { atk: 252 } };
const D = { level: 50, nature: "Bold", evs: { hp: 252, def: 252 } };

run("素の物理（一致なし）", { atk: "Golisopod", atkOpts: S, def: "Chandelure", defOpts: D, move: "Liquidation", jpMove: "アクアブレイク" });
run("タイプ一致", { atk: "Golisopod", atkOpts: S, def: "Chandelure", defOpts: D, move: "First Impression", jpMove: "であいがしら" });
run("かたいツメ＋接触", { atk: "Golisopod", atkOpts: { ...S, ability: "Tough Claws" }, def: "Chandelure", defOpts: D, move: "First Impression", jpMove: "であいがしら", jpAtkAbility: "かたいツメ" });
run("テクニシャン（威力40）", { atk: "Scizor", atkOpts: { ...S, ability: "Technician" }, def: "Chandelure", defOpts: D, move: "Bullet Punch", jpMove: "バレットパンチ", jpAtkAbility: "テクニシャン" });
run("てつのこぶし（パンチ）", { atk: "Scizor", atkOpts: { ...S, ability: "Iron Fist" }, def: "Chandelure", defOpts: D, move: "Bullet Punch", jpMove: "バレットパンチ", jpAtkAbility: "てつのこぶし" });
run("ちからずく", { atk: "Excadrill", atkOpts: { ...S, ability: "Sheer Force" }, def: "Chandelure", defOpts: D, move: "Iron Head", jpMove: "アイアンヘッド", jpAtkAbility: "ちからずく" });
run("いのちのたま", { atk: "Golisopod", atkOpts: { ...S, item: "Life Orb" }, def: "Chandelure", defOpts: D, move: "Liquidation", jpMove: "アクアブレイク", jpItem: "いのちのたま" });
run("たつじんのおび（効果抜群）", { atk: "Scizor", atkOpts: { ...S, item: "Expert Belt" }, def: "Klefki", defOpts: D, move: "Bullet Punch", jpMove: "バレットパンチ", jpItem: "たつじんのおび" });
run("こだわりハチマキ", { atk: "Golisopod", atkOpts: { ...S, item: "Choice Band" }, def: "Chandelure", defOpts: D, move: "Liquidation", jpMove: "アクアブレイク", jpItem: "こだわりハチマキ" });
run("タイプ強化アイテム", { atk: "Scizor", atkOpts: { ...S, item: "Metal Coat" }, def: "Klefki", defOpts: D, move: "Iron Head", jpMove: "アイアンヘッド", jpItem: "タイプ強化アイテム" });
run("こんじょう＋やけど", { atk: "Ursaring", atkOpts: { ...S, ability: "Guts", status: "brn" }, def: "Klefki", defOpts: D, move: "Facade", jpMove: "からげんき", jpAtkAbility: "こんじょう" });
run("やけど（補正なし）", { atk: "Golisopod", atkOpts: { ...S, status: "brn" }, def: "Chandelure", defOpts: D, move: "Liquidation", jpMove: "アクアブレイク" });
run("ピンチ特性（もうか）", { atk: "Charizard", atkOpts: { level: 50, nature: "Modest", evs: { spa: 252 }, ability: "Blaze", curHP: 1 }, def: "Klefki", defOpts: D, move: "Flamethrower", jpMove: "かえんほうしゃ", jpAtkAbility: "もうか", atkPinch: true });
run("マルチスケイル", { atk: "Golisopod", atkOpts: S, def: "Dragonite", defOpts: { ...D, ability: "Multiscale" }, move: "Liquidation", jpMove: "アクアブレイク", jpDefAbility: "マルチスケイル" });
run("フィルター（効果抜群）", { atk: "Scizor", atkOpts: S, def: "Aggron", defOpts: { ...D, ability: "Filter" }, move: "Close Combat", jpMove: "インファイト", jpDefAbility: "フィルター／ハードロック／プリズムアーマー" });
run("ファーコート", { atk: "Golisopod", atkOpts: S, def: "Furfrou", defOpts: { ...D, ability: "Fur Coat" }, move: "Liquidation", jpMove: "アクアブレイク", jpDefAbility: "ファーコート" });
run("あついしぼう", { atk: "Charizard", atkOpts: { level: 50, nature: "Modest", evs: { spa: 252 } }, def: "Snorlax", defOpts: { ...D, ability: "Thick Fat" }, move: "Flamethrower", jpMove: "かえんほうしゃ", jpDefAbility: "あついしぼう" });
run("たいねつ", { atk: "Charizard", atkOpts: { level: 50, nature: "Modest", evs: { spa: 252 } }, def: "Bronzong", defOpts: { ...D, ability: "Heatproof" }, move: "Flamethrower", jpMove: "かえんほうしゃ", jpDefAbility: "たいねつ" });
run("こおりのりんぷん", { atk: "Charizard", atkOpts: { level: 50, nature: "Modest", evs: { spa: 252 } }, def: "Frosmoth", defOpts: { ...D, ability: "Ice Scales" }, move: "Flamethrower", jpMove: "かえんほうしゃ", jpDefAbility: "こおりのりんぷん" });
run("もふもふ（接触）", { atk: "Golisopod", atkOpts: S, def: "Bewear", defOpts: { ...D, ability: "Fluffy" }, move: "Liquidation", jpMove: "アクアブレイク", jpDefAbility: "もふもふ" });
run("とつげきチョッキ", { atk: "Charizard", atkOpts: { level: 50, nature: "Modest", evs: { spa: 252 } }, def: "Klefki", defOpts: { ...D, item: "Assault Vest" }, move: "Flamethrower", jpMove: "かえんほうしゃ", jpDefItem: "とつげきチョッキ" });
run("しんかのきせき", { atk: "Golisopod", atkOpts: S, def: "Chansey", defOpts: { ...D, item: "Eviolite" }, move: "Liquidation", jpMove: "アクアブレイク", jpDefItem: "しんかのきせき" });
run("リフレクター", { atk: "Golisopod", atkOpts: S, def: "Chandelure", defOpts: D, move: "Liquidation", jpMove: "アクアブレイク", field: { defenderSide: { isReflect: true } } });
run("急所", { atk: "Golisopod", atkOpts: S, def: "Chandelure", defOpts: D, move: "Liquidation", moveOpts: { isCrit: true }, jpMove: "アクアブレイク" });
run("スナイパー＋急所", { atk: "Kingdra", atkOpts: { ...S, ability: "Sniper" }, def: "Chandelure", defOpts: D, move: "Waterfall", moveOpts: { isCrit: true }, jpMove: "たきのぼり", jpAtkAbility: "スナイパー" });
run("にほんばれ＋ほのお", { atk: "Charizard", atkOpts: { level: 50, nature: "Modest", evs: { spa: 252 } }, def: "Klefki", defOpts: D, move: "Flamethrower", jpMove: "かえんほうしゃ", field: { weather: "Sun" }, jpWeather: "にほんばれ" });
run("あまごい＋ほのお（半減）", { atk: "Charizard", atkOpts: { level: 50, nature: "Modest", evs: { spa: 252 } }, def: "Klefki", defOpts: D, move: "Flamethrower", jpMove: "かえんほうしゃ", field: { weather: "Rain" }, jpWeather: "あまごい" });
run("すなのちから", { atk: "Excadrill", atkOpts: { ...S, ability: "Sand Force" }, def: "Chandelure", defOpts: D, move: "Iron Head", jpMove: "アイアンヘッド", field: { weather: "Sand" }, jpWeather: "すなあらし", jpAtkAbility: "すなのちから" });
run("アナライズ", { atk: "Excadrill", atkOpts: { level: 50, nature: "Brave", evs: { atk: 252 }, ability: "Analytic" }, def: "Chandelure", defOpts: { level: 50, nature: "Timid", evs: { spe: 252 } }, move: "Iron Head", jpMove: "アイアンヘッド", jpAtkAbility: "アナライズ", atkMovesLast: true });
run("てだすけ", { atk: "Golisopod", atkOpts: S, def: "Chandelure", defOpts: D, move: "Liquidation", jpMove: "アクアブレイク", field: { attackerSide: { isHelpingHand: true } } });
run("エレキフィールド", { atk: "Pincurchin", atkOpts: { level: 50, nature: "Modest", evs: { spa: 252 } }, def: "Klefki", defOpts: D, move: "Thunderbolt", jpMove: "10まんボルト", field: { terrain: "Electric" }, jpField: "エレキフィールド" });
run("グラスフィールド＋じしん", { atk: "Excadrill", atkOpts: S, def: "Chandelure", defOpts: D, move: "Earthquake", jpMove: "じしん", field: { terrain: "Grassy" }, jpField: "グラスフィールド" });
run("てきおうりょく", { atk: "Lucario", atkOpts: { ...S, ability: "Adaptability" }, def: "Chandelure", defOpts: D, move: "Meteor Mash", jpMove: "コメットパンチ", jpAtkAbility: "てきおうりょく" });
run("ランク＋2", { atk: "Golisopod", atkOpts: { ...S, boosts: { atk: 2 } }, def: "Chandelure", defOpts: D, move: "Liquidation", jpMove: "アクアブレイク" });
run("防御ランク−1", { atk: "Golisopod", atkOpts: S, def: "Chandelure", defOpts: { ...D, boosts: { def: -1 } }, move: "Liquidation", jpMove: "アクアブレイク" });
run("パンクロック（音・攻撃側）", { atk: "Toxtricity", atkOpts: { level: 50, nature: "Modest", evs: { spa: 252 }, ability: "Punk Rock" }, def: "Klefki", defOpts: D, move: "Boomburst", jpMove: "ばくおんぱ", jpAtkAbility: "パンクロック" });
run("パンクロック（音・防御側）", { atk: "Exploud", atkOpts: { level: 50, nature: "Modest", evs: { spa: 252 } }, def: "Toxtricity", defOpts: { ...D, ability: "Punk Rock" }, move: "Boomburst", jpMove: "ばくおんぱ", jpDefAbility: "パンクロック" });
run("きれあじ", { atk: "Kleavor", atkOpts: { ...S, ability: "Sharpness" }, def: "Chandelure", defOpts: D, move: "X-Scissor", jpMove: "シザークロス", jpAtkAbility: "きれあじ" });
run("メガランチャー", { atk: "Blastoise", atkOpts: { level: 50, nature: "Modest", evs: { spa: 252 }, ability: "Mega Launcher" }, def: "Klefki", defOpts: D, move: "Water Pulse", jpMove: "みずのはどう", jpAtkAbility: "メガランチャー" });
run("がんじょうあご", { atk: "Tyrantrum", atkOpts: { ...S, ability: "Strong Jaw" }, def: "Klefki", defOpts: D, move: "Fire Fang", jpMove: "ほのおのキバ", jpAtkAbility: "がんじょうあご" });
run("すてみ", { atk: "Golisopod", atkOpts: { ...S, ability: "Reckless" }, def: "Klefki", defOpts: D, move: "Double-Edge", jpMove: "すてみタックル", jpAtkAbility: "すてみ" });
run("ちからもち", { atk: "Mawile", atkOpts: { ...S, ability: "Huge Power" }, def: "Chandelure", defOpts: D, move: "Play Rough", jpMove: "じゃれつく", jpAtkAbility: "ちからもち" });
run("はりきり", { atk: "Togepi", atkOpts: { ...S, ability: "Hustle" }, def: "Klefki", defOpts: D, move: "Body Slam", jpMove: "のしかかり", jpAtkAbility: "はりきり" });
run("スカイスキン", { atk: "Salamence", atkOpts: { ...S, ability: "Aerilate" }, def: "Klefki", defOpts: D, move: "Double-Edge", jpMove: "すてみタックル", jpAtkAbility: "スカイスキン" });
run("とうそうしん（同性）", { atk: "Nidoking", atkOpts: { ...S, ability: "Rivalry", gender: "M" }, def: "Chandelure", defOpts: { ...D, gender: "M" }, move: "Earthquake", jpMove: "じしん", jpAtkAbility: "とうそうしん", rivalry: "同性" });
run("ふしぎなうろこ", { atk: "Golisopod", atkOpts: S, def: "Milotic", defOpts: { ...D, ability: "Marvel Scale", status: "par" }, move: "Liquidation", jpMove: "アクアブレイク", jpDefAbility: "ふしぎなうろこ" });
run("すなあらし＋いわの特防", { atk: "Charizard", atkOpts: { level: 50, nature: "Modest", evs: { spa: 252 } }, def: "Tyranitar", defOpts: D, move: "Flamethrower", jpMove: "かえんほうしゃ", field: { weather: "Sand" }, jpWeather: "すなあらし" });

run("しっぺがえし（後攻）", { atk: "Aggron", atkOpts: { level: 50, nature: "Brave", evs: { atk: 252 } }, def: "Chandelure", defOpts: { level: 50, nature: "Timid", evs: { spe: 252 } }, move: "Payback", jpMove: "しっぺがえし", atkMovesLast: true });
run("しっぺがえし（先攻）", { atk: "Excadrill", atkOpts: S, def: "Chandelure", defOpts: D, move: "Payback", jpMove: "しっぺがえし" });
run("はたきおとす（持ち物あり）", { atk: "Scizor", atkOpts: S, def: "Chandelure", defOpts: { ...D, item: "Leftovers" }, move: "Knock Off", jpMove: "はたきおとす", jpDefItem: "とつげきチョッキ" });
run("からげんき（やけど・こんじょうなし）", { atk: "Ursaring", atkOpts: { ...S, ability: "Quick Feet", status: "brn" }, def: "Klefki", defOpts: D, move: "Facade", jpMove: "からげんき" });
run("複数体攻撃（ダブル）", { atk: "Excadrill", atkOpts: S, def: "Chandelure", defOpts: D, move: "Earthquake", jpMove: "じしん", field: { gameType: "Doubles" }, spread: true });
run("複数体攻撃＋リフレクター", { atk: "Excadrill", atkOpts: S, def: "Chandelure", defOpts: D, move: "Earthquake", jpMove: "じしん", field: { gameType: "Doubles", defenderSide: { isReflect: true } }, spread: true });
run("いのちのたま＋たつじんのおび相当（複合最終補正）", { atk: "Scizor", atkOpts: { ...S, item: "Life Orb" }, def: "Klefki", defOpts: { ...D, ability: "Filter" }, move: "Bullet Punch", jpMove: "バレットパンチ", jpItem: "いのちのたま", jpDefAbility: "フィルター／ハードロック／プリズムアーマー" });
run("かたいツメ＋こだわりハチマキ＋いのちのたま", { atk: "Golisopod", atkOpts: { ...S, ability: "Tough Claws", item: "Life Orb" }, def: "Chandelure", defOpts: D, move: "First Impression", jpMove: "であいがしら", jpAtkAbility: "かたいツメ", jpItem: "いのちのたま" });

console.log(`一致 ${pass} / 不一致 ${fail}`);
for (const f of failures) console.log("  NG " + f);
