import { useEffect, useMemo, useRef, useState } from "react";
import type { Move, StatBlock, Threat } from "../types";
import { useStore } from "../store";
import { usePersistedState } from "../uiState";
import { AP_MAX_EACH, AP_MAX_TOTAL, NATURES, RANK_MAX, RANK_MIN, STAT_KEYS, STAT_LABEL, TYPES, TYPE_COLORS, rankLabel, rankMulLabel, realStats } from "../data/game";
import { CONFIRMED } from "../data/confirmed";
import { MOVE_BY_NAME, MOVE_LIB, accLabel, moveWithMeta, sortMovesByType } from "../data/moves";
import {
  effLabel, hazardDamage, typeEffectiveness, type KoResult,
  type Field, type Weather,
} from "../calc";
import { TypeBadges } from "./TypeBadge";
import { displayName } from "../data/roster";
import { MoveEditor, moveOptionsFor, threatMoveOptions } from "./MoveEditor";
import { MoveSelect } from "./MoveSelect";
import { Panel } from "./Panel";
import { Segmented } from "./Segmented";
import { SelectMenu } from "./SelectMenu";
import { abilitySummary } from "../data/abilities";
import { AbilityNote } from "./AbilityNote";
import { TypeMatchup } from "./TypeMatchup";
import { ApSlider } from "./ApSlider";
import { ApBudgetBar, ApEditor } from "./ApEditor";
import { StepSlider } from "./StepSlider";
import { NumberInput } from "./NumberInput";
import { LockButton } from "./LockButton";
import { analyzeAttack, koChanceWithin, type AttackAnalysis, type HitsChoice, type HitsInfo } from "../attack";
import { BulkTuner } from "./BulkTuner";

type Dir = "toThreat" | "toSelf";

const ATK_ITEMS = [
  "（なし）", "こだわりハチマキ", "こだわりメガネ", "いのちのたま", "たつじんのおび", "タイプ強化アイテム",
  "ノーマルジュエル", // レギュM-Cで解禁
];
const DEF_ITEMS = [
  "（なし）", "とつげきチョッキ", "しんかのきせき",
  "ふうせん", // レギュM-Cで解禁（じめん技を無効化）
  "きあいのタスキ", // HP満タンから倒れる一撃を1で耐える（確定数に反映）
];
/* 内定352フォルムが持つ特性のうち、ダメージに影響するもの（tools で棚卸し済み） */
const ATK_ABILITIES = [
  "（補正なし）", "てきおうりょく", "かたいツメ", "ちからもち", "ヨガパワー", "はりきり", "ちからずく",
  "てつのこぶし", "メガランチャー", "がんじょうあご", "きれあじ", "すてみ", "スナイパー",
  "こんじょう", "サンパワー", "すなのちから", "アナライズ", "とうそうしん",
  "しんりょく", "もうか", "げきりゅう", "むしのしらせ", "かたやぶり",
  // まもるを貫通する特性（かんつうドリル＝ふかしのこぶしと同効果）
  "ふかしのこぶし", "かんつうドリル",
  // レギュM-Cの追加ポケモンが持つもの（テクニシャンはハッサム等も該当）
  "テクニシャン", "パンクロック", "そうだいしょう",
  "スキルリンク", // 連続技が必ず最大回数（メガヘラクロス・ドデカバシ）
  // タイプが変わる特性。撃つ技のタイプが変わるので相性・一致も変わる
  "へんげんじざい", "リベロ",
  "スカイスキン", "フェアリースキン", "フリーズスキン", "ドラゴンスキン", "うるおいボイス",
];
/** そうだいしょうで選べる「倒れた味方の数」。6体目以降は増えないので5まで */
const FAINTED = [0, 1, 2, 3, 4, 5];
const DEF_ABILITIES = [
  "（補正なし）", "フィルター／ハードロック／プリズムアーマー", "マルチスケイル",
  "ファーコート", "こおりのりんぷん", "もふもふ", "たいねつ", "あついしぼう", "ふしぎなうろこ",
  "ふゆう", "もらいび", "ちくでん", "ちょすい", "そうしょく", "ぼうおん", "ぼうだん",
  "はどうのぼうご", // レギュM-Cで追加（メガルカリオZ・接触技を半減）
  "パンクロック",   // 音技のダメージを半減（ストリンダー）
  // ダメージは変えず、確定数の判定に効くもの
  "がんじょう", "ばけのかわ",
];
/** ノーマル技が何タイプになるか（注記の文言用。計算の本体は src/calc.ts） */
const SKIN_NOTE: Record<string, string> = {
  "スカイスキン": "ひこう", "フェアリースキン": "フェアリー", "フリーズスキン": "こおり",
  "エレキスキン": "でんき", "ドラゴンスキン": "ドラゴン",
};
/** 撃つ技のタイプになる特性（「リベロ／へんげんじざい」は以前の表記の互換） */
const PROTEAN_NOTE = ["へんげんじざい", "リベロ", "リベロ／へんげんじざい"];

const WEATHERS: Weather[] = ["なし", "にほんばれ", "あまごい", "すなあらし", "ゆき"];
const FIELDS: Field[] = ["なし", "エレキフィールド", "グラスフィールド", "サイコフィールド", "ミストフィールド"];
const RIVALRY = ["なし", "同性", "異性"] as const;

/** 仮想敵の中身（内定表からのコピーを、性格・AP・種族値・タイプまで手直しできる） */
type ThreatState = Threat & { nature: string; ap: StatBlock; item: string; ability: string; typeVerified: boolean };
/** お気に入りの仮想敵。仮想敵そのものと、被ダメのときの攻撃技をまとめて持つ */
interface FavThreat { id: string; label: string; threat: ThreatState; move?: Move }

/** 保存済みの仮想敵データが今の形かどうか（古い保存値は既定値に戻す） */
function isThreatState(v: unknown): boolean {
  if (!v || typeof v !== "object") return false;
  const t = v as Record<string, unknown>;
  const stats = t.base as Record<string, unknown> | undefined;
  const ap = t.ap as Record<string, unknown> | undefined;
  if (typeof t.name !== "string" || !Array.isArray(t.types)) return false;
  if (!stats || !ap) return false;
  return STAT_KEYS.every((k) => typeof stats[k] === "number" && typeof ap[k] === "number");
}

/** 保存済みの技データが今の形かどうか */
function isMove(v: unknown): boolean {
  if (!v || typeof v !== "object") return false;
  const m = v as Record<string, unknown>;
  return typeof m.name === "string" && typeof m.type === "string"
    && typeof m.power === "number" && typeof m.cat === "string";
}

/** 畳んだパネルの見出しに出すAPの要約（0でない能力だけ並べる） */
function apSummary(ap: StatBlock): string {
  const parts = STAT_KEYS.filter((k) => ap[k] > 0).map((k) => `${k}${ap[k]}`);
  return parts.length ? parts.join(" ") : "未配分";
}

function abilityOptionsWith(base: string, extras: string[], current?: string): string[] {
  const own = base.split("/").map((s) => s.trim()).filter(Boolean);
  const out = ["（補正なし）", ...own];
  for (const e of extras) if (!out.includes(e)) out.push(e);
  // 保存済みの選択が一覧から外れていても、欄が空に見えないよう残す
  if (current && !out.includes(current)) out.push(current);
  return [...new Set(out)];
}

export function DamageTab() {
  const { roster, updateEntry } = useStore();
  // 画面の入力は localStorage に保存し、リロード後も同じ条件から再開できるようにする
  const [dir, setDir] = usePersistedState<Dir>(
    "dmg.dir", "toThreat", (v) => v === "toThreat" || v === "toSelf");

  const selfList = useMemo(
    () => [...roster].sort((a, b) => (a.starred === b.starred ? 0 : a.starred ? -1 : 1)),
    [roster],
  );
  const [selfKey, setSelfKey] = usePersistedState<string>(
    "dmg.selfKey", () => selfList[0]?.key ?? "", (v) => typeof v === "string");
  const self = selfList.find((e) => e.key === selfKey) ?? selfList[0];
  const selfItems = useMemo(
    () => selfList.map((e) => ({
      value: e.key,
      label: `${e.starred ? "★ " : ""}${displayName(e.name, e.forms[e.activeForm].form)}${e.nickname ? `「${e.nickname}」` : ""}`,
    })),
    [selfList],
  );

  // 仮想敵（内定ポケモンから選択・編集可能なコピー）
  const DEFAULT_THREAT = CONFIRMED.find((c) => c.name === "ガブリアス") ?? CONFIRMED[0];
  const [threat, setThreat] = usePersistedState<ThreatState>(
    "dmg.threat",
    () => ({ name: DEFAULT_THREAT.name, base: { ...DEFAULT_THREAT.base }, types: [...DEFAULT_THREAT.types], nature: "がんばりや（無補正）", ap: { H: 0, A: 0, B: 0, C: 0, D: 0, S: 0 }, item: "（なし）", ability: DEFAULT_THREAT.abilities.join("/"), typeVerified: DEFAULT_THREAT.typeVerified }),
    isThreatState,
  );
  // 内定全体を検索付きドロップダウンで選ぶ（旧: 絞り込み入力＋200件のネイティブselect）
  const threatItems = useMemo(
    () => CONFIRMED.map((t) => ({
      value: t.name,
      label: t.name,
      sub: `${t.total}${t.typeVerified ? "" : " ⚠型未確認"}`,
    })),
    [],
  );
  const pickThreat = (name: string) => {
    const t = CONFIRMED.find((x) => x.name === name);
    if (!t) return;
    setThreat({ name: t.name, base: { ...t.base }, types: [...t.types], nature: "がんばりや（無補正）", ap: { H: 0, A: 0, B: 0, C: 0, D: 0, S: 0 }, item: "（なし）", ability: t.abilities.join("/"), typeVerified: t.typeVerified });
    setFavId("");
    // 今の技をその相手が覚えないなら、覚える技から「主力らしい技」に替える
    // （覚えない技のまま被ダメを出しても意味が無いため）
    const opts = threatMoveOptions(t.name);
    if (opts.verified && !(threatMove && opts.options.some((o) => o.name === threatMove.name))) {
      const best = mainAttack(opts.options, t.types, t.base);
      setThreatMove(best ? { ...best } : undefined);
    }
  };

  /* ---------- お気に入りの仮想敵 ---------- */
  const favLabel = () => {
    const nat = threat.nature.replace(/（.*/, "");
    const ap = apSummary(threat.ap);
    return `${threat.name}（${nat}${ap === "未配分" ? "" : `・${ap}`}）`;
  };
  const favSub = (f: FavThreat) =>
    [f.threat.name, f.move?.name].filter(Boolean).join("・");
  const loadFav = (id: string) => {
    const f = favThreats.find((x) => x.id === id);
    if (!f) return;
    setThreat(structuredClone(f.threat));
    if (f.move) setThreatMove({ ...f.move });
    setFavId(id);
  };
  const saveFav = () => {
    const label = prompt("お気に入りの名前", favLabel());
    if (!label) return;
    const id = `${Date.now()}`;
    setFavThreats((p) => [...p, { id, label, threat: structuredClone(threat), move: threatMove && { ...threatMove } }]);
    setFavId(id);
  };
  const overwriteFav = () => {
    const f = favThreats.find((x) => x.id === favId);
    if (!f || !confirm(`「${f.label}」を今の内容で上書きします。よろしいですか？`)) return;
    setFavThreats((p) => p.map((x) => (x.id === favId
      ? { ...x, threat: structuredClone(threat), move: threatMove && { ...threatMove } } : x)));
  };
  const deleteFav = () => {
    const f = favThreats.find((x) => x.id === favId);
    if (!f || !confirm(`「${f.label}」をお気に入りから消します。よろしいですか？`)) return;
    setFavThreats((p) => p.filter((x) => x.id !== favId));
    setFavId("");
  };

  // 技選択：その種族がチャンピオンズで覚える攻撃技すべて＋この個体に設定済みの攻撃技を候補にする
  const selfForm = self?.forms[self.activeForm];
  const selfDamaging = useMemo<Move[]>(() => {
    if (!self) return [];
    // 攻撃技（変化技以外）は威力0の威力変動技も候補に含める（威力は下で手入力）
    const own = self.moves.filter((m) => m.cat !== "変化");
    const learn = moveOptionsFor(self.name).options.filter((m) => m.cat !== "変化");
    const merged: Move[] = [...own];
    for (const m of learn) if (!merged.some((x) => x.name === m.name)) merged.push(m);
    return sortMovesByType(merged); // 統合後にタイプ順で並べ直す（設定済み技が先頭に来るのを防ぐ）
  }, [self]);
  const [selfMoveName, setSelfMoveName] = usePersistedState<string>(
    "dmg.selfMove", "", (v) => typeof v === "string");
  const selfMove = selfDamaging.find((m) => m.name === selfMoveName) ?? selfDamaging[0];
  // 威力変動技（ライブラリ威力0）は威力を手入力。技を切り替えたら設定済み威力で初期化。
  const selfVarPower = !!selfMove && selfMove.cat !== "変化"
    && (MOVE_BY_NAME[selfMove.name]?.power ?? selfMove.power) === 0;
  const [selfPow, setSelfPow] = usePersistedState<number>(
    "dmg.selfPow", 0, (v) => typeof v === "number");
  // 技を切り替えたときだけ威力を初期化する（初回描画では保存済みの入力値を残す）
  const prevMoveName = useRef<string | null>(null);
  useEffect(() => {
    const name = selfMove?.name ?? "";
    if (prevMoveName.current !== null && prevMoveName.current !== name) {
      setSelfPow(selfMove && selfMove.power > 0 ? selfMove.power : 0);
    }
    prevMoveName.current = name;
  }, [selfMove?.name]);
  const selfMoveEff = selfMove && selfVarPower ? { ...selfMove, power: selfPow } : selfMove;
  // お気に入りの仮想敵（壊れた保存値は捨てる）。favId は今呼び出しているもの
  const [favThreats, setFavThreats] = usePersistedState<FavThreat[]>(
    "dmg.favThreats", [],
    (v) => Array.isArray(v) && v.every((f) =>
      !!f && typeof f.id === "string" && typeof f.label === "string" && isThreatState(f.threat)
      && (f.move === undefined || isMove(f.move))));
  const [favId, setFavId] = useState("");
  const [threatMove, setThreatMove] = usePersistedState<Move | undefined>(
    "dmg.threatMove", () => ({ ...MOVE_LIB[0] }), isMove);

  // 戦闘条件
  const isNum = (v: unknown) => typeof v === "number";
  const isBool = (v: unknown) => typeof v === "boolean";
  const isStr = (v: unknown) => typeof v === "string";
  const [atkRank, setAtkRank] = usePersistedState("dmg.atkRank", 0, isNum);
  const [defRank, setDefRank] = usePersistedState("dmg.defRank", 0, isNum);
  const [weather, setWeather] = usePersistedState<Weather>(
    "dmg.weather", "なし", (v) => WEATHERS.includes(v as Weather));
  const [crit, setCrit] = usePersistedState("dmg.crit", false, isBool);
  const [burn, setBurn] = usePersistedState("dmg.burn", false, isBool);
  const [wall, setWall] = usePersistedState("dmg.wall", false, isBool);
  const [defHPFull, setDefHPFull] = usePersistedState("dmg.defHPFull", true, isBool);
  const [atkItem, setAtkItem] = usePersistedState("dmg.atkItem", "（なし）", isStr);
  const [defItem, setDefItem] = usePersistedState("dmg.defItem", "（なし）", isStr);
  const [atkAbil, setAtkAbil] = usePersistedState("dmg.atkAbil", "（補正なし）", isStr);
  const [defAbil, setDefAbil] = usePersistedState("dmg.defAbil", "（補正なし）", isStr);
  const [field, setField] = usePersistedState<Field>(
    "dmg.field", "なし", (v) => FIELDS.includes(v as Field));
  const [helpingHand, setHelpingHand] = usePersistedState("dmg.help", false, isBool);
  const [spread, setSpread] = usePersistedState("dmg.spread", false, isBool);
  const [atkStatused, setAtkStatused] = usePersistedState("dmg.atkStatused", false, isBool);
  const [defStatused, setDefStatused] = usePersistedState("dmg.defStatused", false, isBool);
  const [atkPinch, setAtkPinch] = usePersistedState("dmg.atkPinch", false, isBool);
  const [atkMovesLast, setAtkMovesLast] = usePersistedState("dmg.atkLast", false, isBool);
  const [rivalry, setRivalry] = usePersistedState<"なし" | "同性" | "異性">(
    "dmg.rivalry", "なし", (v) => RIVALRY.includes(v as "なし"));
  const [alliesFainted, setAlliesFainted] = usePersistedState(
    "dmg.alliesFainted", 0, (v) => typeof v === "number" && FAINTED.includes(v));
  const [protect, setProtect] = usePersistedState("dmg.protect", false, isBool);
  const [extraMul, setExtraMul] = usePersistedState("dmg.extraMul", 100, isNum); // %で保持
  // ステルスロックを踏んでから受ける（確定数に入れる）
  const [withSR, setWithSR] = usePersistedState("dmg.sr", false, isBool);
  // 連続技の回数。"auto" は技の既定（固定回数・2〜5回は確率込み・スキルリンクなら最大）
  const [hitsChoice, setHitsChoice] = usePersistedState<HitsChoice>(
    "dmg.hits", "auto", (v) => v === "auto" || (typeof v === "number" && v >= 1 && v <= 10));
  // 技を変えたら回数の指定は既定に戻す（5回を選んだまま2回技に替えると紛らわしい）
  const curMoveName = dir === "toThreat" ? selfMove?.name : threatMove?.name;
  const prevHitsMove = useRef(curMoveName);
  useEffect(() => {
    if (prevHitsMove.current !== curMoveName) setHitsChoice("auto");
    prevHitsMove.current = curMoveName;
  }, [curMoveName]);
  // 仮想敵のAPもスクロール中の誤操作を防げるようロックできるようにする
  const [threatApLocked, setThreatApLocked] = usePersistedState("dmg.threatApLock", false, isBool);

  // ※ フックはすべてこの早期 return より前に置くこと。空のチームでここを通ると
  //   フックの数が変わり、React が「Rendered fewer hooks」で画面ごと落ちる。
  /* 結果パネルが画面に入っているか。入っていないときだけ下に要約を貼る
     （両方出ると同じ数字が二重に見えるため）。
     タブは display:none で切り替えているので、他タブでは box が無く
     isIntersecting=false になるが、貼り付く要素も同じ非表示の中にあるので出ない。
     要素はコールバック ref で受け取る。空のチームで開いた直後は結果パネルが
     無いので、useRef＋[] の effect だと後から出てきたパネルを見張れないため。 */
  const [resultEl, setResultEl] = useState<HTMLDivElement | null>(null);
  const [resultOnScreen, setResultOnScreen] = useState(false);
  useEffect(() => {
    if (!resultEl || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([e]) => setResultOnScreen(e.isIntersecting),
      { threshold: 0.5 },
    );
    io.observe(resultEl);
    return () => io.disconnect();
  }, [resultEl]);


  if (!self || !selfForm) {
    return <div className="panel muted">先に「チーム管理」でポケモンを登録してください。</div>;
  }

  // 仮想敵のAPも 各32／合計66 で制御する
  const threatApTotal = STAT_KEYS.reduce((s, k) => s + threat.ap[k], 0);
  const threatApRemaining = AP_MAX_TOTAL - threatApTotal;
  const threatMaxFor = (k: keyof StatBlock) =>
    Math.min(AP_MAX_EACH, threat.ap[k] + Math.max(0, threatApRemaining));
  const setThreatAP = (k: keyof StatBlock, v: number) =>
    setThreat((p) => {
      const total = STAT_KEYS.reduce((s, kk) => s + p.ap[kk], 0);
      const remaining = AP_MAX_TOTAL - total;
      const max = Math.min(AP_MAX_EACH, p.ap[k] + Math.max(0, remaining));
      return { ...p, ap: { ...p.ap, [k]: Math.max(0, Math.min(max, v || 0)) } };
    });

  const selfReal = realStats(selfForm.base, self.ap, self.nature);
  const threatReal = realStats(threat.base, threat.ap, threat.nature);

  // 役割の割り当て
  const attackerIsSelf = dir === "toThreat";
  const move: Move | undefined = attackerIsSelf ? selfMoveEff : threatMove;

  const atkTypes = attackerIsSelf ? selfForm.types : threat.types;
  const defTypes = attackerIsSelf ? threat.types : selfForm.types;
  const atkReal = attackerIsSelf ? selfReal : threatReal;
  const defReal = attackerIsSelf ? threatReal : selfReal;
  const defHP = defReal.H;

  /** 技と攻守の実数値から、計算に渡す条件を組み立てる。
   *  結果表示・技の一括計算・耐久の逆算がすべてこれを通るので、同じ条件なら同じ答えになる */
  const buildParams = (m: Move, atkR: StatBlock, defR: StatBlock) => {
    const cat = m.cat === "特殊" ? "特殊" : "物理";
    // 攻撃側能力値: ボディプレスは自分のB、イカサマは相手のA
    const atkStat = m.useDef ? atkR.B
      : m.useTargetAtk ? defR.A
      : cat === "物理" ? atkR.A : atkR.C;
    // 防御側能力値: 物理 or 対B技(サイコショック系)は相手B、それ以外はD
    const defStat = cat === "物理" || m.targetB ? defR.B : defR.D;
    return {
      atkStat,
      defStat,
      params: {
        power: m.power,
        moveName: m.name,
        atkStat,
        defStat,
        atkRank,
        defRank: m.ignoreDefRank ? 0 : defRank,
        moveType: m.type,
        atkTypes,
        defTypes,
        category: cat as "物理" | "特殊",
        item: atkItem === "（なし）" ? "" : atkItem,
        defItem: defItem === "（なし）" ? "" : defItem,
        crit,
        weather,
        field,
        burn,
        wall,
        contact: !!m.contact,
        atkAbility: atkAbil === "（補正なし）" ? "" : atkAbil,
        defAbility: defAbil === "（補正なし）" ? "" : defAbil,
        helpingHand,
        spread,
        atkStatused,
        defStatused,
        atkPinch,
        atkMovesLast,
        rivalry,
        alliesFainted,
        protect,
        extraMul: extraMul / 100,
      },
    };
  };
  const attackExtras = { startFull: defHPFull, stealthRock: withSR, hits: hitsChoice };

  let analysis: AttackAnalysis | null = null;
  let result: AttackAnalysis["result"] = null;
  let ko: KoResult | null = null;
  let atkStatUsed = 0;
  let defStatUsed = 0;
  let eff = 1;

  if (move) {
    const b = buildParams(move, atkReal, defReal);
    atkStatUsed = b.atkStat;
    defStatUsed = b.defStat;
    analysis = analyzeAttack(b.params, defHP, attackExtras);
    result = analysis.result;
    ko = analysis.ko;
    // 相性の表示は計算と同じ値を使う（スキン系でタイプが変わると素の相性と違うため）
    eff = result ? result.eff : typeEffectiveness(move.type, defTypes);
  }

  /* 耐久調整の逆算（被ダメのときだけ）。自軍の H と B（特殊なら D）を仮に変えて、
     結果表示と同じ analyzeAttack で確定耐えかを判定する。ほかの能力のAPと性格はそのまま */
  const bulkDefKey: "B" | "D" = move && (move.cat === "物理" || move.targetB) ? "B" : "D";
  const bulkBudget = AP_MAX_TOTAL - STAT_KEYS
    .filter((k) => k !== "H" && k !== bulkDefKey)
    .reduce((sum, k) => sum + self.ap[k], 0);
  const bulkEval = (h: number, d: number, maxActions: number) => {
    const ap = { ...self.ap, H: h, [bulkDefKey]: d };
    const dr = realStats(selfForm.base, ap, self.nature);
    const b = buildParams(move as Move, atkReal, dr);
    return analyzeAttack(b.params, dr.H, { ...attackExtras, maxActions });
  };
  const bulkKey = move ? JSON.stringify({
    c: buildParams(move, atkReal, defReal).params, base: selfForm.base, ap: self.ap,
    nat: self.nature, ex: attackExtras, key: self.key,
  }) : "";

  /* 登録している攻撃技を、この相手に対して一度に比べる（与ダメのときだけ）。
     条件はすべて今の戦闘条件のまま。選んでいる技だけは連続技の回数指定も合わせ、
     ほかの技は既定（2〜5回なら確率込み）で出す。 */
  const moveRows = attackerIsSelf
    ? self.moves
      .map((mv) => selfDamaging.find((d) => d.name === mv.name.trim()))
      .filter((m): m is Move => !!m && m.cat !== "変化")
      .map((m) => {
        const cur = m.name === move?.name;
        const eff0 = cur ? (move as Move) : m; // 威力可変技は今入力している威力を使う
        if (!eff0.power) return { move: m, cur, varPower: true as const };
        const b = buildParams(eff0, atkReal, defReal);
        const a = analyzeAttack(b.params, defHP, { ...attackExtras, hits: cur ? hitsChoice : "auto" });
        return { move: m, cur, varPower: false as const, a };
      })
    : [];

  const srInfo = self ? hazardDamage(defHP, "いわ", defTypes) : 0;

  /** 畳んだままでも何が効いているか分かるよう、見出しに出す要約 */
  // 結果の要約。判定そのものは畳んでも出ているので、技の比較の件数を添える
  const resultSummary = moveRows.length > 1 ? `登録技${moveRows.length}つの比較・参考` : "参考情報";
  // 戦闘条件の要約。攻撃側・防御側・場ごとに、既定から変えているものだけを並べる
  const joinOr = (parts: (string | false)[]) => parts.filter(Boolean).join(" / ") || "既定（補正なし）";
  const atkCondSummary = joinOr([
    atkRank !== 0 && `ランク${rankLabel(atkRank)}`,
    atkItem !== "（なし）" && atkItem,
    atkAbil !== "（補正なし）" && (atkAbil === "そうだいしょう" ? `そうだいしょう${alliesFainted}体` : atkAbil),
    rivalry !== "なし" && `とうそうしん${rivalry}`,
    crit && "急所",
    helpingHand && "てだすけ",
    burn && "やけど",
    atkStatused && "状態異常",
    atkPinch && "HP1/3以下",
    atkMovesLast && "後攻",
  ]);
  const defCondSummary = joinOr([
    defRank !== 0 && `ランク${rankLabel(defRank)}`,
    defItem !== "（なし）" && defItem,
    defAbil !== "（補正なし）" && defAbil,
    wall && "壁",
    !defHPFull && "HP満タンでない",
    withSR && "ステロ込み",
    defStatused && "状態異常",
    protect && "まもる",
  ]);
  const fieldCondSummary = joinOr([
    weather !== "なし" && weather,
    field !== "なし" && field,
    spread && "複数体",
    extraMul !== 100 && `補正${extraMul}%`,
  ]);
  // 仮想敵が覚える攻撃技（被ダメで使う）
  const threatOpts = threatMoveOptions(threat.name);
  // 自軍の要約。名前は選択欄（always）に出ているので、それ以外を並べる
  const selfSummary = [
    selfForm.types.join("/"),
    self.item || "持ち物なし",
    `AP ${apSummary(self.ap)}`,
  ].join("・");
  // 畳んだときの仮想敵の要約。名前は選択欄（always）に出ているので、それ以外を並べる
  const threatSummary = [
    threat.types.join("/"),
    threat.nature.replace(/（.*/, ""),
    `AP ${apSummary(threat.ap)}`,
  ].join("・");


  return (
    <div>
      {/* 方向切替。画面内の切替はカードで囲まず、タブのすぐ下に置く */}
      <Segmented
        size="lg"
        ariaLabel="計算の向き"
        style={{ margin: "12px 0 0" }}
        options={[
          { value: "toThreat", label: "与ダメ", sub: "自軍 → 仮想敵" },
          { value: "toSelf", label: "被ダメ", sub: "仮想敵 → 自軍" },
        ]}
        value={dir}
        onChange={setDir}
      />

      <div className="grid2">
        {/* 自軍。個体と技の選択は計算に必須なので畳んでも出しておく（always） */}
        <Panel
          id="dmg.self"
          title={`自軍${attackerIsSelf ? "（攻撃）" : "（防御）"}`}
          summary={selfSummary}
          always={(
            <>
              <SelectMenu
                items={selfItems}
                value={self.key}
                onChange={(v) => { setSelfKey(v); setSelfMoveName(""); }}
              />
              {attackerIsSelf && (
                <label className="fld">
                  <span>使用技（この種族が覚える攻撃技）</span>
                  {selfDamaging.length === 0 ? (
                    <div className="banner warn">この個体・種族に攻撃技が見つかりません。チーム管理で技を追加してください。</div>
                  ) : (
                    <MoveSelect moves={selfDamaging} value={selfMove?.name ?? ""} onChange={setSelfMoveName} />
                  )}
                  {selfVarPower && (
                    <div className="row tight" style={{ marginTop: 6 }}>
                      <span className="small muted">威力変動技 — 威力を入力:</span>
                      <NumberInput value={selfPow} style={{ width: 90 }} onChange={setSelfPow} />
                    </div>
                  )}
                </label>
              )}
            </>
          )}
        >
          <div className="row tight" style={{ marginTop: 6 }}>
            <TypeBadges types={selfForm.types} />
            <span className="small muted">{self.nature.replace(/（.*/, "")} / {self.item || "持ち物なし"}</span>
          </div>
          <StatLine real={selfReal} />
          {/* 「あと少しで耐える／落とせる」が見えたその場でAPを振り直せるようにする。
              書き込み先は個体そのものなので、チーム管理の手持ち・控えにそのまま残る。 */}
          <Panel
            id="dmg.selfAp"
            title="AP配分"
            defaultOpen={false}
            summary={apSummary(self.ap)}
          >
            <div className="small muted" style={{ marginBottom: 6 }}>
              ここで変えたAPは、この個体（チーム管理の手持ち・控え）にそのまま保存されます。
            </div>
            <ApBudgetBar entry={self} />
            <ApEditor entry={self} />
          </Panel>
        </Panel>

        {/* 仮想敵。タイプ相性・性格・APと縦に長いので畳めるようにする。
            畳んでも相手を選び替えられるよう、選択欄と警告は always に置く。
            被ダメのときの「相手の技」も計算に必須なので always に置く。 */}
        <Panel
          id="dmg.threat"
          title={`仮想敵${attackerIsSelf ? "（防御）" : "（攻撃）"}`}
          summary={threatSummary}
          always={(
            <>
              <SelectMenu
                items={threatItems}
                value={threat.name}
                onChange={pickThreat}
                searchable
                searchPlaceholder="内定ポケモンを名前で絞り込み…"
              />
              <div className="small muted">{CONFIRMED.length}体の内定ポケモンから選択（種族値・特性はシート準拠）</div>
              {/* よく使う相手は、性格・AP・技ごと保存して呼び出せる */}
              <div className="fav-row">
                <SelectMenu
                  style={{ flex: "1 1 170px", minWidth: 0 }}
                  items={favThreats.map((f) => ({ value: f.id, label: f.label, sub: favSub(f) }))}
                  value={favId}
                  placeholder={favThreats.length ? "★お気に入りから呼び出す" : "★お気に入りはまだありません"}
                  disabled={favThreats.length === 0}
                  onChange={loadFav}
                />
                <button type="button" className="btn small" onClick={saveFav} title="今の仮想敵（性格・AP・技まで）を保存">☆保存</button>
                {favId && <button type="button" className="btn small" onClick={overwriteFav}>上書き</button>}
                {favId && <button type="button" className="btn small danger" onClick={deleteFav}>削除</button>}
              </div>
              {!threat.typeVerified && (
                <div className="banner warn">この個体はチャンピオンズ新規メガ等でタイプが未公表です。素の型を仮採用しています（開いて修正可）。</div>
              )}
              {threat.ability.includes("マイティチェンジ") && (
                <div className="banner info">
                  マイティチェンジ: 一度引っ込めて出し直すとマイティフォルムになります（種族値が大きく上がる）。
                  強化後を想定するなら「イルカマン(マイティ)」を選んでください。
                </div>
              )}
              {!attackerIsSelf && (
                <div style={{ marginTop: 8 }}>
                  <div className="small muted">
                    仮想敵の攻撃技（{threatOpts.verified ? `${threat.name}が覚える技 ${threatOpts.options.length}個` : "全技ライブラリ"}）
                  </div>
                  {/* 相手を替えたら「覚える技以外も選ぶ」の状態は戻す */}
                  <MoveEditor key={threat.name} move={threatMove} options={threatOpts.options} onChange={setThreatMove} />
                  {!threatOpts.verified && (
                    <div className="small amber">この相手の習得技は未収録のため、全技から選べます。</div>
                  )}
                </div>
              )}
            </>
          )}
        >
          {/* この相手が持ちうる特性。下の「特性」欄は計算に効くものだけの一覧なので、
              そこに出てこない特性（いかく等）もここで分かるようにしておく */}
          <AbilityNote name={threat.ability} withName />
          <div className="small muted" style={{ marginTop: 2 }}>特性はどれか1つを持ちます。</div>
          <div className="row tight" style={{ marginTop: 6 }}>
            {threat.types.map((t, i) => (
              <SelectMenu
                key={i}
                style={{ flex: "0 1 130px" }}
                items={TYPES.map((tp) => ({ value: tp, label: tp, swatch: TYPE_COLORS[tp] }))}
                value={t}
                onChange={(v) => setThreat((p) => ({ ...p, types: p.types.map((x, j) => (j === i ? v : x)) }))}
              />
            ))}
            <button className="btn small" onClick={() => setThreat((p) => ({ ...p, types: p.types.length > 1 ? [p.types[0]] : [...p.types, "ノーマル"] }))}>
              {threat.types.length > 1 ? "単タイプ" : "＋タイプ"}
            </button>
          </div>
          {/* 選んだ仮想敵が何を嫌うか。どの技を持たせるか決めるのに毎回タイプ表を引くのは手間なので添える */}
          <div className="small muted" style={{ marginTop: 6 }}>
            {attackerIsSelf ? "この相手のタイプ相性" : "この相手が受けるタイプ相性"}
          </div>
          <TypeMatchup types={threat.types} />
          <div className="small muted" style={{ marginTop: 4 }}>
            タイプ相性のみです。特性（ふゆう・もらいび等）やもちものは考慮しません。
          </div>
          <label className="fld">
            <span>性格</span>
            <SelectMenu
              items={Object.keys(NATURES).map((n) => ({ value: n, label: n }))}
              value={threat.nature}
              onChange={(v) => setThreat((p) => ({ ...p, nature: v }))}
            />
          </label>
          <div className={`ap-budget ${threatApTotal > AP_MAX_TOTAL ? "over" : ""}`} style={{ marginTop: 8 }}>
            <div className="ap-bar">
              <div className="fill" style={{ width: `${Math.min(100, (threatApTotal / AP_MAX_TOTAL) * 100)}%` }} />
            </div>
            <span className="small nowrap">
              AP <b className="tnum">{threatApTotal}</b> / {AP_MAX_TOTAL}
              <span className="muted">　残り <b className="tnum">{Math.max(0, threatApRemaining)}</b></span>
            </span>
            <LockButton locked={threatApLocked} onToggle={() => setThreatApLocked(!threatApLocked)} />
          </div>
          {STAT_KEYS.map((k) => (
            <div className="ap-row" key={k}>
              <div className="ap-head">
                <span className="ap-k">{k}<span className="small muted"> {STAT_LABEL[k]}</span></span>
                <label className="small muted ap-base">
                  種族
                  <NumberInput
                    value={threat.base[k]}
                    min={1}
                    onChange={(v) => setThreat((p) => ({ ...p, base: { ...p.base, [k]: v } }))}
                  />
                </label>
                <span className="ap-real small">実数値 <b>{threatReal[k]}</b></span>
              </div>
              <ApSlider value={threat.ap[k]} max={threatMaxFor(k)} locked={threatApLocked} onChange={(v) => setThreatAP(k, v)} />
            </div>
          ))}
        </Panel>
      </div>

      {/* 戦闘条件。項目が多く1枚だと縦に長すぎるので、攻撃側・防御側・場の3枚に分け、
          それぞれ既定から変えているものだけを見出しに出す */}
      <Panel id="dmg.condAtk" title={`攻撃側の条件（${attackerIsSelf ? "自軍" : "仮想敵"}）`} summary={atkCondSummary}>
        <div className="grid3">
          <label className="fld wide">
            <span>
              攻撃ランク <b className="tnum">{rankMulLabel(atkRank)}</b>
              {move?.useTargetAtk ? "（イカサマ＝相手のAランク）" : ""}
            </span>
            <StepSlider
              value={atkRank} min={RANK_MIN} max={RANK_MAX} onChange={setAtkRank}
              format={rankLabel} ariaLabel="攻撃ランク" valueWidth={34} noSlider
            />
          </label>
          <label className="fld">
            <span>持ち物</span>
            <SelectMenu items={ATK_ITEMS.map((i) => ({ value: i, label: i }))} value={atkItem} onChange={setAtkItem} />
          </label>
          <label className="fld wide">
            <span>特性</span>
            <SelectMenu
              items={abilityOptionsWith(attackerIsSelf ? selfForm.ability : threat.ability, ATK_ABILITIES, atkAbil).map((a) => ({ value: a, label: a, sub: abilitySummary(a) }))}
              value={atkAbil}
              stacked /* 倍率を添えるので名前の下の行に出す */
              subInListOnly /* 選んだあとの説明は欄の下に出す */
              onChange={setAtkAbil}
            />
            <AbilityNote name={atkAbil} />
          </label>
          <label className="fld">
            <span>とうそうしん（性別）</span>
            <SelectMenu
              items={RIVALRY.map((r) => ({ value: r, label: r === "なし" ? "対象外" : r }))}
              value={rivalry}
              onChange={(v) => setRivalry(v as "なし")}
            />
          </label>
          {/* そうだいしょうを選んだときだけ出す。常時出すとドドゲザン専用の項目が邪魔になる */}
          {atkAbil === "そうだいしょう" && (
            <div className="fld wide">
              <span className="fld-label">そうだいしょう（倒れた味方）</span>
              <Segmented
                ariaLabel="倒れた味方の数"
                options={FAINTED.map((n) => ({ value: n, label: `${n}体`, sub: `×${(1 + n * 0.1).toFixed(1)}` }))}
                value={alliesFainted}
                onChange={setAlliesFainted}
              />
            </div>
          )}
        </div>
        <div className="checks">
          <label><input type="checkbox" checked={crit} onChange={(e) => setCrit(e.target.checked)} />急所</label>
          <label><input type="checkbox" checked={helpingHand} onChange={(e) => setHelpingHand(e.target.checked)} />てだすけ(×1.5)</label>
          <label><input type="checkbox" checked={burn} onChange={(e) => setBurn(e.target.checked)} />やけど(物理半減)</label>
          <label title="こんじょう・からげんき系の条件">
            <input type="checkbox" checked={atkStatused} onChange={(e) => setAtkStatused(e.target.checked)} />
            状態異常(こんじょう)
          </label>
          <label title="しんりょく・もうか・げきりゅう・むしのしらせの条件">
            <input type="checkbox" checked={atkPinch} onChange={(e) => setAtkPinch(e.target.checked)} />
            HP1/3以下(ピンチ特性)
          </label>
          <label title="アナライズの条件">
            <input type="checkbox" checked={atkMovesLast} onChange={(e) => setAtkMovesLast(e.target.checked)} />
            後攻(アナライズ)
          </label>
        </div>

        {atkAbil === "かたやぶり" && (
          <div className="banner info">かたやぶり: 防御側の特性（軽減・無効化）を無視して計算しています。</div>
        )}
        {(atkAbil === "ふかしのこぶし" || atkAbil === "かんつうドリル") && (
          <div className="banner info">
            {atkAbil}: まもる／みきりを貫通します（接触技のみ。ダメージ倍率は変わりません）。
          </div>
        )}
        {SKIN_NOTE[atkAbil] && (
          <div className="banner info">
            {atkAbil}: ノーマル技は{SKIN_NOTE[atkAbil]}技として（威力1.2倍）計算しています。
            相性・無効化・タイプ一致も{SKIN_NOTE[atkAbil]}で見ます。
          </div>
        )}
        {atkAbil === "うるおいボイス" && (
          <div className="banner info">
            うるおいボイス: 音技はみず技として計算しています（威力は上がりません）。
          </div>
        )}
        {PROTEAN_NOTE.includes(atkAbil) && (
          <div className="banner info">
            {atkAbil}: 撃つ技と同じタイプになるので、どの技もタイプ一致（×1.5）で計算しています。
          </div>
        )}
      </Panel>

      <Panel id="dmg.condDef" title={`防御側の条件（${attackerIsSelf ? "仮想敵" : "自軍"}）`} summary={defCondSummary}>
        <div className="grid3">
          <label className="fld wide">
            <span>
              防御ランク <b className="tnum">{rankMulLabel(move?.ignoreDefRank ? 0 : defRank)}</b>
              {move?.ignoreDefRank ? "（無視技のため無効）" : ""}
            </span>
            <StepSlider
              value={defRank} min={RANK_MIN} max={RANK_MAX} onChange={setDefRank}
              format={rankLabel} ariaLabel="防御ランク" valueWidth={34} noSlider
            />
          </label>
          <label className="fld">
            <span>持ち物</span>
            <SelectMenu items={DEF_ITEMS.map((i) => ({ value: i, label: i }))} value={defItem} onChange={setDefItem} />
          </label>
          <label className="fld wide">
            <span>特性</span>
            <SelectMenu
              items={abilityOptionsWith(attackerIsSelf ? threat.ability : selfForm.ability, DEF_ABILITIES, defAbil).map((a) => ({ value: a, label: a, sub: abilitySummary(a) }))}
              value={defAbil}
              stacked /* 倍率を添えるので名前の下の行に出す */
              subInListOnly /* 選んだあとの説明は欄の下に出す */
              onChange={setDefAbil}
            />
            <AbilityNote name={defAbil} />
          </label>
        </div>
        <div className="checks">
          <label><input type="checkbox" checked={wall} onChange={(e) => setWall(e.target.checked)} />壁(リフレク/ひかりのかべ)</label>
          <label title="マルチスケイル・きあいのタスキ・がんじょうの条件"><input type="checkbox" checked={defHPFull} onChange={(e) => setDefHPFull(e.target.checked)} />HP満タン(マルチスケイル・タスキ)</label>
          <label title="交代で出てきたときにステルスロックを踏んだ前提で確定数を出す"><input type="checkbox" checked={withSR} onChange={(e) => setWithSR(e.target.checked)} />ステルスロック込み</label>
          <label title="ふしぎなうろこの条件">
            <input type="checkbox" checked={defStatused} onChange={(e) => setDefStatused(e.target.checked)} />
            状態異常(ふしぎなうろこ)
          </label>
          <label title="ふかしのこぶし・かんつうドリルの接触技だけが貫通します">
            <input type="checkbox" checked={protect} onChange={(e) => setProtect(e.target.checked)} />
            まもる／みきり
          </label>
        </div>

      </Panel>

      <Panel id="dmg.condField" title="場・その他" summary={fieldCondSummary}>
        <div className="grid3">
          <label className="fld">
            <span>天候</span>
            <SelectMenu
              items={WEATHERS.map((w) => ({ value: w, label: w }))}
              value={weather}
              onChange={(v) => setWeather(v as Weather)}
            />
          </label>
          <label className="fld">
            <span>フィールド</span>
            <SelectMenu
              items={FIELDS.map((f) => ({ value: f, label: f }))}
              value={field}
              onChange={(v) => setField(v as Field)}
            />
          </label>
        </div>
        <div className="checks">
          <label title="ダブルで2体以上に当てる技は0.75倍。壁の軽減も 1/2 → 2732/4096 に変わる">
            <input type="checkbox" checked={spread} onChange={(e) => setSpread(e.target.checked)} />
            複数体に攻撃(×0.75)
          </label>
          <label className="row tight" title="未対応の条件やチャンピオンズ独自の特性を手で掛ける">
            補正
            <NumberInput value={extraMul} min={1} max={400} onChange={setExtraMul} style={{ width: 68 }} />
            %
          </label>
        </div>
        <div className="small muted">
          壁の軽減はシングル基準（1/2）。「複数体に攻撃」を選んだときだけ、ダブルの値（2732/4096）で計算します。
          未対応の条件・独自特性は「補正%」で掛けてください。
        </div>
      </Panel>

      {/* 結果。判定・ダメージ・HPバーは畳んでも出しておき（always）、
          技の比較と参考情報だけを畳めるようにする。
          画面外にあるときは下に貼り付く要約（dmg-sticky）を出す */}
      <Panel
        id="dmg.result"
        title="計算結果"
        summary={resultSummary}
        always={(
          /* 見張るのは判定・ダメージ・HPバーの塊だけにする。パネル全体だと
             画面が低いとき（横向き等）に threshold に届かず、貼り付く要約が
             消えなくなるため。 */
          <div ref={setResultEl}>
          {!move ? (
            <div className="muted">技を選択してください。</div>
          ) : result?.immune ? (
            <div className="stamp">
              {result.immuneReason ? `${result.immuneReason}で無効` : "こうかがない（無効）"}
            </div>
          ) : result && ko ? (
            <ResultView move={move} ko={ko} eff={eff} rolls={result.rolls} defHP={defHP}
              atkStat={atkStatUsed} defStat={defStatUsed}
              analysis={analysis!} hitsChoice={hitsChoice} onHits={setHitsChoice} />
          ) : (
            <div className="muted">威力のある技を選択してください。</div>
          )}
          </div>
        )}
      >
        {moveRows.length > 1 && (
          <MoveCompare rows={moveRows} onPick={setSelfMoveName} defName={threat.name} />
        )}
        {attackerIsSelf && self.moves.length === 0 && (
          <div className="small muted" style={{ marginTop: 8 }}>
            チーム管理で技を登録すると、登録した技をこの相手に対して一度に比べられます。
          </div>
        )}
        <div className="banner info" style={{ marginTop: 10 }}>
          参考: ステルスロック着地ダメージ（防御側の1/8×相性 = {(typeEffectiveness("いわ", defTypes)).toString()}倍）＝ <b className="tnum">{srInfo}</b>（{defHP > 0 ? ((srInfo / defHP) * 100).toFixed(1) : "0"}%）
          {!withSR && <>。防御側の条件の「ステルスロック込み」で確定数に入ります</>}
        </div>
      </Panel>

      {!attackerIsSelf && move && ko && (
        <BulkTuner
          moveName={move.name}
          defKey={bulkDefKey}
          current={{ h: self.ap.H, d: self.ap[bulkDefKey] }}
          budget={bulkBudget}
          survive={(h, d, n) => koChanceWithin(bulkEval(h, d, n).ko, n) === 0}
          koFor={(h, d) => bulkEval(h, d, 10).ko}
          memoKey={bulkKey}
          locked={!!self.apLocked}
          onApply={(plan) => updateEntry(self.key, (e) => ({
            ...e, ap: { ...e.ap, H: plan.h, [bulkDefKey]: plan.d },
          }))}
        />
      )}

      {/* 結果が画面外のときだけ、要点を画面下に貼り付けておく。
          条件をいじりながら結果を見たいので、スクロール位置に関わらず判定が見える。
          タップすると結果まで飛ぶ。 */}
      {!resultOnScreen && move && (result?.immune || (result && ko)) && (
        <button
          type="button"
          className="dmg-sticky"
          title="計算結果まで移動"
          onClick={() => resultEl?.scrollIntoView({ behavior: "smooth", block: "start" })}
        >
          <span className="dmg-sticky-in">
            {result?.immune ? (
              <span className="row tight">
                <span className="stamp">{result.immuneReason ? `${result.immuneReason}で無効` : "こうかがない（無効）"}</span>
              </span>
            ) : ko && (
              <>
                <span className="row tight" style={{ alignItems: "center" }}>
                  <span className={`stamp ${ko.verdict === "確定1発" ? "ko1" : ko.verdict === "確定2発" ? "ko2" : ""}`}>
                    {ko.verdict}
                  </span>
                  {ko.detail && <span className="amber small">{ko.detail}</span>}
                  <span className="spacer" />
                  <span className="small muted">
                    <b className={eff > 1 ? "ok" : eff < 1 ? "warn" : ""}>{effLabel(eff)}</b>
                  </span>
                </span>
                <span className="dmg-sticky-num tnum">
                  <b>{ko.min} 〜 {ko.max}</b>
                  <span className="muted"> （{ko.minPct.toFixed(1)}% 〜 {ko.maxPct.toFixed(1)}%）</span>
                </span>
                <HpBar
                  slim
                  minPct={ko.minPct}
                  maxPct={ko.maxPct}
                  label={`最大ダメで残りHP ${Math.max(0, defHP - ko.max)} / ${defHP}`}
                />
              </>
            )}
          </span>
        </button>
      )}
    </div>
  );
}

/** ダメージのHPバー。左から
 *    緑   … 最大乱数でも残るHP
 *    橙   … 乱数しだいで残るかもしれない幅（min〜maxの差）
 *    赤   … 最小乱数でも必ず減るぶん
 *  100%を超えるダメージ（確定1発）は緑が0になり、橙が「超えたぶん」の帯になる。 */
function HpBar({ minPct, maxPct, label, slim }: {
  minPct: number; maxPct: number; label: string; slim?: boolean;
}) {
  const survive = Math.max(0, 100 - maxPct);      // 緑
  const sure = Math.min(100, Math.max(0, minPct)); // 赤
  const risk = Math.max(0, 100 - survive - sure);  // 橙
  return (
    <div className={`hpbar ${slim ? "slim" : ""}`}>
      <div className="remain" style={{ width: `${survive}%` }} />
      <div className="hp-risk" style={{ left: `${survive}%`, width: `${risk}%` }} />
      <div className="hp-lost" style={{ left: `${survive + risk}%`, width: `${sure}%` }} />
      <div className="lbl">{label}</div>
    </div>
  );
}

function StatLine({ real }: { real: StatBlock }) {
  return (
    <div className="small tnum muted" style={{ marginTop: 4 }}>
      {STAT_KEYS.map((k) => `${k}${real[k]}`).join(" / ")}
    </div>
  );
}

function ResultView({ move, ko, eff, rolls, defHP, atkStat, defStat, analysis, hitsChoice, onHits }: {
  move: Move; ko: KoResult; eff: number;
  rolls: number[]; defHP: number; atkStat: number; defStat: number;
  analysis: AttackAnalysis; hitsChoice: HitsChoice; onHits: (v: HitsChoice) => void;
}) {
  const stampClass = ko.verdict === "確定1発" ? "ko1" : ko.verdict === "確定2発" ? "ko2" : "";
  const full = moveWithMeta(move); // 命中率・PPを補完した技情報
  const hits = analysis.hits;
  return (
    <div>
      {hits && analysis.hitsAuto && (
        <HitsPicker hits={hits} auto={analysis.hitsAuto} choice={hitsChoice} onChange={onHits} moveName={move.name} />
      )}

      <div className="row" style={{ alignItems: "center", marginBottom: 6 }}>
        <span className={`stamp ${stampClass}`}>{ko.verdict}</span>
        {ko.detail && <span className="amber">{ko.detail}</span>}
        <div className="spacer" />
        <span className="small muted">相性: <b className={eff > 1 ? "ok" : eff < 1 ? "warn" : ""}>{effLabel(eff)}</b></span>
      </div>

      <div className="tnum">
        ダメージ{hits ? <span className="small muted">（{hits.random ? `${hits.min}〜${hits.max}回` : `${hits.fixed}回`}の合計）</span> : null}{" "}
        <b style={{ fontSize: 18, color: "var(--steel-hi)" }}>{ko.min} 〜 {ko.max}</b>
        <span className="muted"> （{ko.minPct.toFixed(1)}% 〜 {ko.maxPct.toFixed(1)}%）</span>
      </div>

      {/* HPバー。乱数の幅（橙）と、最小乱数でも必ず減るぶん（赤）を分けて出す */}
      <HpBar
        minPct={ko.minPct}
        maxPct={ko.maxPct}
        label={`最大ダメで残りHP ${Math.max(0, defHP - ko.max)} / ${defHP}`}
      />
      <div className="hp-legend small muted">
        <span><i className="sw remain" />最大乱数でも残る</span>
        <span><i className="sw risk" />乱数しだい（{ko.min}〜{ko.max}）</span>
        <span><i className="sw lost" />必ず減る</span>
      </div>

      {/* 確定数に入れた効果。ダメージの幅には出ないものがあるので、何を見たかを明示する */}
      {analysis.notes.length > 0 && (
        <ul className="calc-notes small">
          {analysis.notes.map((n) => <li key={n}>{n}</li>)}
        </ul>
      )}

      <div className="small muted">
        使用実数値: {move.useDef ? "防御B" : move.useTargetAtk ? "相手の攻撃A" : move.cat === "物理" ? "攻撃A" : "特攻C"} <b className="tnum">{atkStat}</b> → 相手{move.cat === "物理" || move.targetB ? "防御B" : "特防D"} <b className="tnum">{defStat}</b>
        （威力{move.power}{hits?.escalating ? "→×2→×3" : ""} / {move.type} / {move.cat} / {accLabel(full.acc)} / PP{full.pp ?? "—"}{full.critUp ? " / 急所+1" : ""}）
      </div>

      <div className="small muted" style={{ marginTop: 6 }}>
        {hits ? `1発目の16乱数（85〜100%）${hits.escalating ? "。2発目以降は威力が上がる" : ""}:` : "16乱数（85〜100%）:"}
      </div>
      <div className="rolls">
        {rolls.map((d, i) => <span key={i}>{d}</span>)}
      </div>
    </div>
  );
}

type MoveRow =
  | { move: Move; cur: boolean; varPower: true }
  | { move: Move; cur: boolean; varPower: false; a: AttackAnalysis };

/** 登録済みの攻撃技を並べて比べる。行を押すとその技の詳細（上の結果）に切り替わる */
function MoveCompare({ rows, onPick, defName }: {
  rows: MoveRow[]; onPick: (name: string) => void; defName: string;
}) {
  return (
    <div className="move-compare">
      <div className="small muted" style={{ marginBottom: 4 }}>
        登録している技で比べる（対 {defName}・今の戦闘条件）
      </div>
      {rows.map((r) => {
        const ko = !r.varPower ? r.a.ko : null;
        const immune = !r.varPower && r.a.result?.immune;
        const cls = ko?.verdict === "確定1発" ? "ko1" : ko?.verdict === "確定2発" ? "ko2" : "";
        return (
          <button
            type="button"
            key={r.move.name}
            className={`mc-row ${r.cur ? "on" : ""}`}
            onClick={() => onPick(r.move.name)}
            title="この技の詳細を見る"
          >
            <span className="tbadge" style={{ background: TYPE_COLORS[r.move.type] }}>{r.move.type}</span>
            <span className="mc-name">{r.move.name}</span>
            <span className="mc-res">
              {r.varPower ? <span className="muted small">威力可変（選んで威力を入力）</span>
                : immune ? <span className="muted small">{r.a.result?.immuneReason ? `${r.a.result.immuneReason}で無効` : "効果なし"}</span>
                : ko ? (
                  <>
                    <span className={`mc-verdict ${cls}`}>{ko.verdict}</span>
                    {ko.detail && <span className="amber small"> {ko.detail}</span>}
                    <span className="muted small tnum"> {ko.minPct.toFixed(1)}〜{ko.maxPct.toFixed(1)}%</span>
                  </>
                ) : <span className="muted small">—</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** 連続技の回数を選ぶ。2〜5回の技は「確率込み」（35/35/15/15%）が既定 */
function HitsPicker({ hits, auto, choice, onChange, moveName }: {
  hits: HitsInfo; auto: HitsInfo; choice: HitsChoice; onChange: (v: HitsChoice) => void; moveName: string;
}) {
  const counts = Array.from({ length: hits.max - hits.min + 1 }, (_, i) => hits.min + i);
  // 回数が固定で選びようがない技（ダブルウイング等）は、回数を示すだけにする
  if (counts.length === 1) {
    return <div className="small muted" style={{ marginBottom: 6 }}>連続技: {moveName}（{hits.max}回）</div>;
  }
  // 「既定」の中身は技と特性で決まる（今どれを選んでいるかでは変わらない）
  const autoLabel = auto.random ? "確率込み" : `${auto.fixed}回（既定）`;
  return (
    <div className="hits-pick">
      <span className="small muted">連続技の回数</span>
      <Segmented<HitsChoice>
        ariaLabel="連続技の回数"
        style={{ marginTop: 3 }}
        options={[
          { value: "auto", label: autoLabel },
          ...counts.map((k) => ({ value: k, label: `${k}回` })),
        ]}
        value={choice}
        onChange={onChange}
      />
    </div>
  );
}

/** 自爆・反動で動けなくなる技・条件つきの技など、主力として普段は撃たない技 */
const NOT_MAIN = new Set([
  "だいばくはつ", "じばく", "ミストバースト", // 自分が倒れる
  "はかいこうせん", "ギガインパクト", "すてみタックル", // 反動・次のターン動けない
  "アイアンローラー", // フィールドが無いと失敗する
  "きあいパンチ", // 先に攻撃を受けると失敗する
  "ソーラービーム", "ソーラーブレード", "ゴッドバード", // 溜めが要る
]);

/** 覚える技のうち、主力らしい技を1つ選ぶ。
 *  威力 × タイプ一致(1.5) × 攻撃・特攻の高い方に合う分類か、で比べる。威力変動技は除く */
function mainAttack(moves: Move[], types: string[], base: StatBlock): Move | undefined {
  const physical = base.A >= base.C;
  const score = (m: Move) =>
    m.power
    * (types.includes(m.type) ? 1.5 : 1)
    * ((m.cat === "物理") === physical ? 1 : 0.6);
  return moves
    .filter((m) => m.power > 0 && !NOT_MAIN.has(m.name))
    .sort((a, b) => score(b) - score(a))[0];
}
