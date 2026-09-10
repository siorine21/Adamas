export interface StatBlock {
  H: number;
  A: number;
  B: number;
  C: number;
  D: number;
  S: number;
}

export type StatKey = keyof StatBlock;

export interface PokemonForm {
  form: string; // "通常" "メガ" "メガZ" "シールド" "ブレード" "オリジン" 等
  types: string[]; // 1〜2要素
  base: StatBlock; // 種族値
  ability: string; // 特性（複数候補は"/"区切り文字列）
}

export type MoveCategory = "物理" | "特殊" | "変化";

/** [命中率, PP]。命中率0は必中（命中判定なし）、PPはポイントアップ未使用の基本値。 */
export type MoveMeta = [acc: number, pp: number];

export interface Move {
  name: string;
  type: string;
  power: number; // 0の場合は変化技扱い
  cat: MoveCategory;
  acc?: number; // 命中率（0=必中、未定義=不明／手動入力技）
  pp?: number; // PP（基本値、未定義=不明／手動入力技）
  contact?: boolean; // 接触技か（かたいツメ等の判定用）
  useDef?: boolean; // 自分のBでダメージ計算（ボディプレス）
  useTargetAtk?: boolean; // 相手のAでダメージ計算（イカサマ）
  targetB?: boolean; // 特殊技だが相手のBに与える（サイコショック系）
  ignoreDefRank?: boolean; // 相手の能力ランク変化を無視（せいなるつるぎ）
  critUp?: boolean; // 急所ランク+1（きりさく等）
}

export interface RosterEntry {
  key: string; // 一意識別子
  name: string; // 図鑑名（DEXのnameと対応）
  nickname: string; // 任意のニックネーム
  starred: boolean; // ★手持ちフラグ（true付与は最大6体まで）
  activeForm: number; // formsのインデックス（表示・計算に使うフォルム）
  forms: PokemonForm[]; // DEXの該当エントリからコピー（種族値等は個別編集可能にする）
  item: string; // 持ち物（自由入力）
  nature: string; // NATURESのキーのいずれか
  ap: StatBlock; // 各0-32、合計上限66
  apLocked?: boolean; // AP配分をロック（スクロール時の誤操作防止。未設定＝ロックなし）
  moves: Move[]; // 最大4
  note: string; // メモ欄
}

export interface Team {
  id: string; // 一意識別子
  name: string; // チーム名
  roster: RosterEntry[]; // このチームの登録個体（★手持ち＋控え）
}

export interface DexForm {
  form: string;
  types: string[];
  base: StatBlock;
  ability: string;
}

export interface DexEntry {
  name: string;
  megaOnly?: boolean;
  forms: DexForm[];
}

export interface Threat {
  name: string;
  types: string[];
  base: StatBlock;
}

export interface Learnset {
  status: "full" | "partial";
  source: string;
  moves: string[];
}
