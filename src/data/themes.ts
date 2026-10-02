import type { DexEntry } from "../types";
import { ALL_DEX } from "./dex";
import { SPECIES_META, type SpeciesMeta } from "./speciesMeta";

/* ============================================================
   テーマ（へびパ・水生生物パ など、見た目や設定で揃えるパーティ）
   テーマは「候補の系統名の集まり」。ひな形から作ると、条件に合う系統が最初から入る。
   データ（分類・体型・タマゴグループ・色）だけでは綺麗に分けられないので
   （へび型にミミッキュが入る等）、入れたあとに図鑑で出し入れして仕上げる前提。
   ============================================================ */

export interface Theme {
  id: string;
  name: string;
  /** 候補の系統名（図鑑の name） */
  members: string[];
  /** ひな形から作ったときのひな形 id。「おすすめ」（条件に合う未登録の系統）を出すのに使う */
  template?: string;
}

export interface ThemeTemplate {
  id: string;
  name: string;
  /** どういう条件で選ぶか（画面の説明用） */
  rule: string;
  match: (d: DexEntry, m: SpeciesMeta | undefined) => boolean;
}

const hasType = (d: DexEntry, t: string) => d.forms.some((f) => f.types.includes(t));
const hasEgg = (m: SpeciesMeta | undefined, ...eggs: string[]) => !!m && m.eggs.some((e) => eggs.includes(e));

/** 分類に「へび」を含むもの。「すなへび」「りんごオロチ」「コブラ」なども拾う */
const SNAKE_GENUS = /へび|ヘビ|コブラ|おろち|オロチ|ハブ|うわばみ/;

const COLORS = ["あかいろ", "あおいろ", "きいろ", "みどりいろ", "くろいろ", "しろいろ", "ちゃいろ", "むらさきいろ", "ももいろ", "はいいろ"];

export const THEME_TEMPLATES: ThemeTemplate[] = [
  {
    id: "aquatic", name: "水生生物", rule: "タマゴグループが すいちゅう1〜3",
    match: (_d, m) => hasEgg(m, "すいちゅう1", "すいちゅう2", "すいちゅう3"),
  },
  {
    id: "snake", name: "へび", rule: "体型が へび型、または分類に「へび」「コブラ」「おろち」など",
    match: (_d, m) => !!m && (m.shape === "へび型" || SNAKE_GENUS.test(m.genus)),
  },
  {
    id: "bird", name: "とり", rule: "タマゴグループが ひこう",
    match: (_d, m) => hasEgg(m, "ひこう"),
  },
  {
    id: "bug", name: "むし", rule: "タマゴグループが むし、または むしタイプ",
    match: (d, m) => hasEgg(m, "むし") || hasType(d, "むし"),
  },
  {
    id: "beast", name: "けもの", rule: "タマゴグループが りくじょう",
    match: (_d, m) => hasEgg(m, "りくじょう"),
  },
  {
    id: "dragon", name: "竜・怪獣", rule: "タマゴグループが ドラゴン・かいじゅう、または ドラゴンタイプ",
    match: (d, m) => hasEgg(m, "ドラゴン", "かいじゅう") || hasType(d, "ドラゴン"),
  },
  {
    id: "fairy", name: "ようせい", rule: "タマゴグループが ようせい",
    match: (_d, m) => hasEgg(m, "ようせい"),
  },
  {
    id: "humanlike", name: "ひとがた", rule: "タマゴグループが ひとがた、または体型が人型",
    match: (_d, m) => hasEgg(m, "ひとがた") || m?.shape === "人型",
  },
  ...COLORS.map((c): ThemeTemplate => ({
    id: `color-${c}`, name: `${c.replace("いろ", "")}色`, rule: `図鑑の色が ${c}`,
    match: (_d, m) => m?.color === c,
  })),
];

/** 系統の分類・体型などを引く（図鑑番号で持っている） */
export function metaOf(d: DexEntry): SpeciesMeta | undefined {
  return d.no ? SPECIES_META[d.no] : undefined;
}

/** ひな形の条件に合う系統名（図鑑番号順） */
export function templateMatches(templateId: string): string[] {
  const t = THEME_TEMPLATES.find((x) => x.id === templateId);
  if (!t) return [];
  return ALL_DEX.filter((d) => t.match(d, metaOf(d))).map((d) => d.name);
}

export const isTheme = (v: unknown): v is Theme =>
  !!v && typeof v === "object"
  && typeof (v as Theme).id === "string" && typeof (v as Theme).name === "string"
  && Array.isArray((v as Theme).members) && (v as Theme).members.every((x) => typeof x === "string");
