import type { Learnset } from "../types";
import { BANNED_MOVES, LEARNSETS } from "./moves";
import { MEGA_BASE, THREAT_LEARNSETS } from "./threatLearnsets";

/* ============================================================
   習得技の引き方をここに集める。図鑑・チーム管理・ダメージ計算がすべてこれを使う。

   引く順番:
     1. メガは元の姿に寄せる（習得技は同じ）
     2. はがね・あく系統は LEARNSETS（AppMedia＋GameWith＋実機確認の補正つき）
        （内定表の名前は「ギルガルド(シールドフォルム)」のようにフォルム名が付くので、外しても引く）
     3. それ以外の内定ポケモンは THREAT_LEARNSETS（GameWith から全種族を取得）
   ============================================================ */

const GW_SOURCE = "GameWith個別ページ（チャンピオンズで覚える技）2026/9";
const cache = new Map<string, Learnset | null>();

/** 系統名（図鑑・内定表・ロスターのどの名前でもよい）の習得表。無ければ undefined */
export function learnsetOf(name: string): Learnset | undefined {
  if (cache.has(name)) return cache.get(name) ?? undefined;
  const base = MEGA_BASE[name] ?? name;
  const noForm = base.replace(/[(（].*$/, "");
  let ls: Learnset | undefined = LEARNSETS[base] ?? LEARNSETS[noForm];
  if (!ls) {
    const gw = THREAT_LEARNSETS[base];
    if (gw) ls = { status: "full", source: GW_SOURCE, moves: gw.split(" ") };
  }
  cache.set(name, ls ?? null);
  return ls;
}

/** レギュレーションで使用禁止の技 */
export function bannedMovesOf(name: string): string[] {
  const base = MEGA_BASE[name] ?? name;
  return BANNED_MOVES[base] ?? BANNED_MOVES[base.replace(/[(（].*$/, "")] ?? [];
}
