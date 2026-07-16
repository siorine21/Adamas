import type { Move, RosterEntry, StatBlock } from "../types";
import { DEX } from "./dex";
import { MOVE_BY_NAME } from "./moves";

let keyCounter = 0;
export function makeKey(): string {
  keyCounter += 1;
  return `pk_${Date.now().toString(36)}_${keyCounter}`;
}

export const ZERO_AP: StatBlock = { H: 0, A: 0, B: 0, C: 0, D: 0, S: 0 };

/** フォルムを反映した表示名。
 *  メガ→「メガ○○」、メガZ/メガX/メガY→「メガ○○Z」等、その他フォルムは「○○（シールド）」形式。
 *  保存済みデータ（forms文字列）からその場で組み立てるため、既存ロスターにもそのまま効く。 */
export function displayName(name: string, form: string): string {
  if (!name) return "（無名）";
  if (!form || form === "通常") return name;
  if (form === "メガ") return `メガ${name}`;
  if (form.startsWith("メガ")) return `メガ${name}${form.slice(2)}`; // メガZ → メガ○○Z
  return `${name}（${form}）`;
}

export function findDex(name: string) {
  return DEX.find((d) => d.name === name);
}

/** 図鑑エントリからロスター個体を生成（種族値等はディープコピーし個別編集可能に） */
export function entryFromDex(name: string): RosterEntry | null {
  const dex = findDex(name);
  if (!dex) return null;
  return {
    key: makeKey(),
    name: dex.name,
    nickname: "",
    starred: false,
    activeForm: 0,
    forms: dex.forms.map((f) => ({
      form: f.form,
      types: [...f.types],
      base: { ...f.base },
      ability: f.ability,
    })),
    item: "",
    nature: "がんばりや（無補正）",
    ap: { ...ZERO_AP },
    moves: [],
    note: "",
  };
}

/** 空の手動個体（7体目以降の手動追加用） */
export function emptyEntry(): RosterEntry {
  return {
    key: makeKey(),
    name: "",
    nickname: "",
    starred: false,
    activeForm: 0,
    forms: [{ form: "通常", types: ["はがね"], base: { H: 100, A: 100, B: 100, C: 100, D: 100, S: 100 }, ability: "" }],
    item: "",
    nature: "がんばりや（無補正）",
    ap: { ...ZERO_AP },
    moves: [],
    note: "",
  };
}

function mv(name: string): Move {
  const m = MOVE_BY_NAME[name];
  if (m) return { ...m };
  // ライブラリ外の技名は威力0の変化技扱いで生成（手動編集前提）
  return { name, type: "ノーマル", power: 0, cat: "変化" };
}

interface PresetSpec {
  name: string;
  nickname?: string;
  starred: boolean;
  formName: string;
  nature: string;
  item: string;
  ap: StatBlock;
  moves: string[];
  note?: string;
}

const PRESET_SPECS: PresetSpec[] = [
  {
    name: "ボスゴドラ", starred: true, formName: "通常", nature: "わんぱく（B↑C↓）",
    item: "オボンのみ", ap: { H: 32, A: 0, B: 32, C: 0, D: 2, S: 0 },
    moves: ["ステルスロック", "ボディプレス", "メタルバースト", "ほえる"],
  },
  {
    name: "ブリジュラス", starred: true, formName: "通常", nature: "ひかえめ（C↑A↓）",
    item: "かいがらのすず", ap: { H: 2, A: 0, B: 32, C: 32, D: 0, S: 0 },
    moves: ["りゅうのはどう", "はどうだん", "ラスターカノン", "10まんボルト"],
  },
  {
    name: "アーマーガア", starred: true, formName: "通常", nature: "わんぱく（B↑C↓）",
    item: "オッカのみ", ap: { H: 32, A: 0, B: 32, C: 0, D: 2, S: 0 },
    moves: ["ちょうはつ", "ボディプレス", "とんぼがえり", "はねやすめ"],
  },
  {
    name: "メタグロス", nickname: "イブシ", starred: true, formName: "メガ", nature: "ようき（S↑C↓）",
    item: "メタグロスナイト", ap: { H: 2, A: 32, B: 0, C: 0, D: 0, S: 32 },
    moves: ["バレットパンチ", "れいとうパンチ", "サイコファング", "かみなりパンチ"],
  },
  {
    name: "ギルガルド", starred: true, formName: "シールド", nature: "れいせい（C↑S↓）",
    item: "たべのこし", ap: { H: 32, A: 0, B: 2, C: 32, D: 0, S: 0 },
    moves: ["キングシールド", "かげうち", "シャドーボール", "せいなるつるぎ"],
  },
  {
    name: "チリーン", starred: true, formName: "メガ", nature: "ひかえめ（C↑A↓）",
    item: "チリーンナイト", ap: { H: 32, A: 0, B: 2, C: 32, D: 0, S: 0 },
    moves: ["めいそう", "じこさいせい", "サイコノイズ", "ラスターカノン"],
  },
  {
    name: "デカヌチャン", starred: false, formName: "通常", nature: "いじっぱり（A↑C↓）",
    item: "", ap: { H: 2, A: 32, B: 0, C: 0, D: 0, S: 32 },
    moves: ["ねこだまし", "デカハンマー", "じゃれつく", "はたきおとす"],
  },
];

/** 初期プリセット（アダマス編成）7体を生成 */
export function buildPresetRoster(): RosterEntry[] {
  return PRESET_SPECS.map((spec) => {
    const entry = entryFromDex(spec.name) ?? emptyEntry();
    entry.key = makeKey();
    entry.nickname = spec.nickname ?? "";
    entry.starred = spec.starred;
    entry.nature = spec.nature;
    entry.item = spec.item;
    entry.ap = { ...spec.ap };
    entry.moves = spec.moves.map(mv);
    entry.note = spec.note ?? "";
    const idx = entry.forms.findIndex((f) => f.form === spec.formName);
    entry.activeForm = idx >= 0 ? idx : 0;
    return entry;
  });
}
