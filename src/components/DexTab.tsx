import { useEffect, useMemo, useState } from "react";
import type { DexEntry, StatKey } from "../types";
import { useStore } from "../store";
import { DEX_BY_TYPE, DEX_TYPES, type DexType } from "../data/dex";
import { MAX_STARRED, STAT_KEYS, STAT_LABEL, TYPES, TYPE_COLORS } from "../data/game";
import { typeEffectiveness } from "../calc";
import { BANNED_MOVES, LEARNSETS, MOVE_BY_NAME } from "../data/moves";
import type { Move } from "../types";
import { dexFitsMainType, displayName, entryFromDex } from "../data/roster";
import { usePersistedState } from "../uiState";
import { Panel } from "./Panel";
import { SelectMenu } from "./SelectMenu";
import { kanaMatcher } from "../search";
import { abilitySummary } from "../data/abilities";
import { AbilityNote } from "./AbilityNote";

/** 1フォルム */
interface Form {
  form: string;
  label: string; // 表示名（メガ○○ など）
  short: string; // フォルム切替チップの表示（通常 / メガ / メガZ など）
  types: string[];
  /** そのフォルムが持ちうる特性（夢特性を含む） */
  abilities: string[];
  stats: Record<StatKey, number>;
  total: number;
  /** 弱点（等倍超）。倍率つき */
  weak: { type: string; mul: number }[];
  /** 無効化できるタイプ */
  immune: string[];
}
/** 1系統（フォルムをまとめたもの） */
interface Species {
  name: string;
  /** メガシンカで初めてはがねが付く（通常フォルムは非はがね） */
  megaOnly: boolean;
  /** メガシンカのフォルムを持つ */
  hasMega: boolean;
  /** 覚える攻撃技のタイプ数（打点の広さ）。習得表が無い系統は0 */
  coverage: number;
  forms: Form[];
}

type SortKey = StatKey | "total" | "name";
const SORT_KEYS: SortKey[] = ["name", ...STAT_KEYS, "total"];
const SORT_LABEL: Record<SortKey, string> = {
  name: "名前", total: "合計",
  H: "H", A: "A", B: "B", C: "C", D: "D", S: "S",
};

/** メガ絞込み。has=メガを持つ / none=持たない / steel=メガで初めてはがねが付く */
type MegaMode = "all" | "has" | "none" | "steel";
const MEGA_MODES: { key: MegaMode; label: string; title: string }[] = [
  { key: "all", label: "すべて", title: "メガの有無で絞らない" },
  { key: "has", label: "メガあり", title: "メガシンカを持つ系統" },
  { key: "none", label: "メガなし", title: "メガシンカを持たない系統（メガ枠を空けたいとき）" },
  { key: "steel", label: "メガで初獲得", title: "通常フォルムはそのタイプを持たず、メガシンカで初めて付く" },
];

/** タイプボタンの意味 */
type TypeMode = "self" | "move" | "safe";
const TYPE_MODES: { key: TypeMode; label: string; title: string }[] = [
  { key: "self", label: "本人のタイプ", title: "そのタイプを持つポケモンを探す" },
  { key: "move", label: "覚える技", title: "そのタイプの技を覚えるポケモンを探す" },
  { key: "safe", label: "弱点でない", title: "そのタイプが弱点にならないポケモンを探す（ほのお受けを探すときなど）" },
];

/** 覚える攻撃技が何タイプあるか（打点の広さ）。没収技は除く */
function coverageOf(name: string): number {
  const banned = BANNED_MOVES[name] ?? [];
  const types = new Set<string>();
  for (const n of LEARNSETS[name]?.moves ?? []) {
    if (banned.includes(n)) continue;
    const m = MOVE_BY_NAME[n];
    if (m && m.cat !== "変化") types.add(m.type);
  }
  return types.size;
}

/** 1タイプぶんの図鑑データ。タイプを切り替えても作り直さずに済むよう、
 *  起動時に一度だけ組んでおく（はがね24系統・あく25系統なので軽い）。 */
interface Dataset {
  species: Species[];
  movesByType: Record<string, Record<string, Move[]>>;
  moveSet: Record<string, Set<string>>;
  moveOptions: { value: string; label: string; sub: string }[];
  abilityOptions: { value: string; label: string; sub: string }[];
  allForms: Form[];
  statMax: number;
  usedTypes: string[];
  weakTypes: string[];
  /** 習得技データを持つ系統の数。0なら技での絞込みは出さない */
  withLearnset: number;
}

function buildDataset(dex: DexEntry[]): Dataset {
  const species: Species[] = dex.map((d) => ({
    name: d.name,
    megaOnly: !!d.megaOnly,
    hasMega: d.forms.some((f) => f.form.startsWith("メガ")),
    coverage: coverageOf(d.name),
    forms: d.forms.map((f) => {
      const weak: { type: string; mul: number }[] = [];
      const immune: string[] = [];
      for (const t of TYPES) {
        const e = typeEffectiveness(t, f.types);
        if (e === 0) immune.push(t);
        else if (e > 1) weak.push({ type: t, mul: e });
      }
      weak.sort((a, b) => b.mul - a.mul);
      return {
        form: f.form,
        label: displayName(d.name, f.form),
        short: f.form,
        types: f.types,
        abilities: f.ability.split("/").map((a) => a.trim()).filter(Boolean),
        stats: f.base,
        total: STAT_KEYS.reduce((s, k) => s + f.base[k], 0),
        weak,
        immune,
      };
    }),
  }));

  /* 系統ごとに「覚える技をタイプ別にまとめたもの」。
     例: こおりを選ぶと、こおり技を覚える系統だけに絞って技名を出せる。
     レギュレーションで没収された技は除く。並びは 威力の高い順（変化技は最後）。 */
  const movesByType: Record<string, Record<string, Move[]>> = {};
  const moveSet: Record<string, Set<string>> = {};
  for (const sp of species) {
    const banned = BANNED_MOVES[sp.name] ?? [];
    const byType: Record<string, Move[]> = {};
    const names = new Set<string>();
    for (const n of LEARNSETS[sp.name]?.moves ?? []) {
      if (banned.includes(n)) continue;
      const m = MOVE_BY_NAME[n];
      if (!m) continue;
      (byType[m.type] ??= []).push(m);
      names.add(n);
    }
    for (const list of Object.values(byType)) {
      list.sort((a, b) => (b.power || -1) - (a.power || -1) || a.name.localeCompare(b.name, "ja"));
    }
    movesByType[sp.name] = byType;
    moveSet[sp.name] = names;
  }

  /* 技名の選択肢。図鑑の誰かが覚える技だけを、覚える系統の多い順に並べる。
     全833技から選ばせても、その図鑑の面々が覚えない技が大半で空振りするため。 */
  const moveCount = new Map<string, number>();
  for (const set of Object.values(moveSet)) {
    for (const n of set) moveCount.set(n, (moveCount.get(n) ?? 0) + 1);
  }
  const moveOptions = [...moveCount.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ja"))
    .map(([name, n]) => {
      const m = MOVE_BY_NAME[name];
      return {
        value: name,
        label: name,
        sub: `${m.type}・${m.power > 0 ? `威力${m.power}` : m.cat}・${n}系統`,
      };
    });

  const allForms = species.flatMap((sp) => sp.forms);

  /* 特性の選択肢。図鑑に出てくるものだけを、持つフォルムの多い順に並べる */
  const abCount = new Map<string, number>();
  for (const f of allForms) for (const a of f.abilities) abCount.set(a, (abCount.get(a) ?? 0) + 1);
  const abilityOptions = [...abCount.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ja"))
    .map(([name, n]) => ({ value: name, label: name, sub: abilitySummary(name) ?? `${n}フォルム` }));

  return {
    species,
    movesByType,
    moveSet,
    moveOptions,
    abilityOptions,
    allForms,
    /** 種族値バーの基準。図鑑内の最大値に合わせると差が見やすい */
    statMax: Math.max(...allForms.flatMap((f) => STAT_KEYS.map((k) => f.stats[k]))),
    /** 図鑑に実際に出てくるタイプだけを絞込みボタンに出す（18個並べても押せないタイプが大半なので） */
    usedTypes: TYPES.filter((t) => allForms.some((f) => f.types.includes(t))),
    /** 誰かの弱点になりうるタイプ。「弱点でない」で絞るときはこれだけ出す
     *  （誰の弱点でもないタイプを押しても全員が残るだけなので） */
    weakTypes: TYPES.filter((t) => allForms.some((f) => f.weak.some((w) => w.type === t))),
    withLearnset: species.filter((sp) => (moveSet[sp.name]?.size ?? 0) > 0).length,
  };
}

const DATASETS = Object.fromEntries(
  DEX_TYPES.map((t) => [t, buildDataset(DEX_BY_TYPE[t])]),
) as Record<DexType, Dataset>;

const ADD_MOVE = "（技を追加…）";
const ANY_ABILITY = "（すべて）";

/** 打点の広さのしきい値。図鑑の分布（5〜16タイプ）に合わせた刻み */
const COVERAGE_STEPS = [0, 10, 12];

const valueOf = (f: Form, k: SortKey): number =>
  k === "total" ? f.total : k === "name" ? 0 : f.stats[k];

const isStrRecord = (v: unknown) =>
  !!v && typeof v === "object" && !Array.isArray(v)
  && Object.values(v as object).every((x) => typeof x === "string");

export function DexTab() {
  const { addEntry, roster, starredCount, mainType } = useStore();
  // どのタイプの図鑑を見るか。はがね統一が主目的だが、あく統一でも同じ道具が使える
  const [dexType, setDexType] = usePersistedState<DexType>(
    "dex.type", "はがね", (v) => DEX_TYPES.includes(v as DexType));
  const D = DATASETS[dexType];
  // チームを切り替えたら、その統一タイプの図鑑を開く（別タイプの図鑑では何も追加できないため）。
  // 開いたあとに手で切り替えるのは自由。
  useEffect(() => {
    if (DEX_TYPES.includes(mainType as DexType)) setDexType(mainType as DexType);
  }, [mainType, setDexType]);
  const [q, setQ] = useState(""); // 検索語は一時的なものなので保存しない
  const [typeFilter, setTypeFilter] = usePersistedState<string[]>(
    "dex.types", [], (v) => Array.isArray(v) && v.every((x) => typeof x === "string"));
  // タイプボタンの意味。self=本人のタイプ / move=覚える技のタイプ / safe=そのタイプが弱点でない
  const [typeMode, setTypeMode] = usePersistedState<TypeMode>(
    "dex.typeMode", "self", (v) => TYPE_MODES.some((m) => m.key === v));
  const [megaMode, setMegaMode] = usePersistedState<MegaMode>(
    "dex.mega", "all", (v) => MEGA_MODES.some((m) => m.key === v));
  const [ability, setAbility] = usePersistedState(
    "dex.ability", ANY_ABILITY,
    (v) => v === ANY_ABILITY || D.abilityOptions.some((a) => a.value === v));
  // 自軍に1フォルムも入れていない系統だけ（6体を埋めていくとき用）
  const [unowned, setUnowned] = usePersistedState("dex.unowned", false, (v) => typeof v === "boolean");
  const [minCoverage, setMinCoverage] = usePersistedState(
    "dex.coverage", 0, (v) => typeof v === "number" && COVERAGE_STEPS.includes(v));
  // 技名で絞る（複数選ぶと「すべて覚える」系統だけ残る）
  const [moveFilter, setMoveFilter] = usePersistedState<string[]>(
    "dex.moves", [],
    (v) => Array.isArray(v) && v.every((x) => typeof x === "string" && !!MOVE_BY_NAME[x as string]));
  const [sortKey, setSortKey] = usePersistedState<SortKey>(
    "dex.sortKey", "total", (v) => SORT_KEYS.includes(v as SortKey));
  const [asc, setAsc] = usePersistedState("dex.asc", false, (v) => typeof v === "boolean");
  const [compact, setCompact] = usePersistedState("dex.compact", false, (v) => typeof v === "boolean");
  // 弱点を開いている系統
  const [open, setOpen] = usePersistedState<string[]>(
    "dex.open", [], (v) => Array.isArray(v) && v.every((x) => typeof x === "string"));
  // 手動で選んだフォルム（系統名 → フォルム名）。未選択なら並び替えに合わせて自動で選ぶ
  const [picked, setPicked] = usePersistedState<Record<string, string>>(
    "dex.form", {}, isStrRecord);

  const starDisabled = starredCount >= MAX_STARRED;
  /** この系統を今のチームに入れられるか。メインタイプを持つフォルムが1つでもあればよい */
  const fits = (name: string) => {
    const d = DEX_BY_TYPE[dexType].find((x) => x.name === name);
    return !!d && dexFitsMainType(d, mainType);
  };

  // すでに自軍にいるフォルムには印を付ける（同じ個体を二重に足すミスを防ぐ）
  const owned = useMemo(() => {
    const s = new Set<string>();
    for (const e of roster) {
      const f = e.forms[e.activeForm] ?? e.forms[0];
      if (f) s.add(`${e.name}/${f.form}`);
    }
    return s;
  }, [roster]);

  /** 検索・絞込みを通したうえで、系統ごとに表示するフォルムを決めて並べ替える。
   *  表示フォルム＝手動で選んだもの。未選択なら、能力順ならその能力が最も高いフォルム。
   *  並び替えは「表示しているフォルムの値」で行うので、見えている数字と順位が一致する。 */
  const list = useMemo(() => {
    const qq = q.trim();
    const hitQ = kanaMatcher(q);
    const out: { sp: Species; forms: Form[]; sel: Form; sortVal: number; hitMoves: Move[] }[] = [];
    for (const sp of D.species) {
      if (megaMode === "has" && !sp.hasMega) continue;
      if (megaMode === "none" && sp.hasMega) continue;
      if (megaMode === "steel" && !sp.megaOnly) continue;
      if (sp.coverage < minCoverage) continue;
      // 系統として1体も入れていないものだけ（フォルム違いは同じ個体なので系統で見る）
      if (unowned && sp.forms.some((f) => owned.has(`${sp.name}/${f.form}`))) continue;
      let forms = sp.forms;
      if (ability !== ANY_ABILITY) forms = forms.filter((f) => f.abilities.includes(ability));
      // 覚える技で絞るときはフォルムではなく系統で判定する（習得技は系統で共通）
      const hitMoves: Move[] = [];
      // 技名での絞込み。複数選んだら「すべて覚える」系統だけ残す
      if (moveFilter.length > 0) {
        const set = D.moveSet[sp.name];
        if (!moveFilter.every((n) => set?.has(n))) continue;
        for (const n of moveFilter) hitMoves.push(MOVE_BY_NAME[n]);
      }
      if (typeFilter.length > 0) {
        if (typeMode === "move") {
          const byType = D.movesByType[sp.name] ?? {};
          if (!typeFilter.every((t) => (byType[t]?.length ?? 0) > 0)) continue;
          for (const t of typeFilter) hitMoves.push(...(byType[t] ?? []));
        } else if (typeMode === "safe") {
          // 選んだタイプがどれも弱点にならないフォルムだけ残す
          forms = forms.filter((f) => typeFilter.every((t) => !f.weak.some((w) => w.type === t)));
        } else {
          forms = forms.filter((f) => typeFilter.every((t) => f.types.includes(t)));
        }
      }
      if (qq && !hitQ(sp.name)) forms = forms.filter((f) => hitQ(f.label));
      if (forms.length === 0) continue;
      const auto = sortKey === "name"
        ? forms[0]
        : forms.reduce((a, b) => (valueOf(b, sortKey) > valueOf(a, sortKey) ? b : a));
      const sel = forms.find((f) => f.form === picked[sp.name]) ?? auto;
      out.push({ sp, forms, sel, sortVal: valueOf(sel, sortKey), hitMoves });
    }
    return out.sort((a, b) => {
      if (sortKey === "name") {
        return asc ? a.sp.name.localeCompare(b.sp.name, "ja") : b.sp.name.localeCompare(a.sp.name, "ja");
      }
      return asc ? a.sortVal - b.sortVal : b.sortVal - a.sortVal;
    });
  }, [D, q, typeFilter, typeMode, megaMode, ability, unowned, minCoverage, moveFilter, owned, sortKey, asc, picked]);

  const shownForms = list.reduce((n, x) => n + x.forms.length, 0);

  const toggleType = (t: string) =>
    setTypeFilter((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  const toggleOpen = (name: string) =>
    setOpen((prev) => (prev.includes(name) ? prev.filter((x) => x !== name) : [...prev, name]));
  const pickForm = (name: string, form: string) =>
    setPicked((prev) => ({ ...prev, [name]: form }));
  const setSort = (k: SortKey) => {
    if (sortKey === k) setAsc((v) => !v);
    else { setSortKey(k); setAsc(k === "name"); }
  };

  // 絞り込みが増えたので、何か効いているときだけ「まとめて解除」を出す
  const filtered = typeFilter.length > 0 || megaMode !== "all"
    || ability !== ANY_ABILITY || unowned || minCoverage > 0 || moveFilter.length > 0;
  const clearFilters = () => {
    setTypeFilter([]); setMegaMode("all"); setAbility(ANY_ABILITY);
    setUnowned(false); setMinCoverage(0); setMoveFilter([]);
  };
  /** 畳んだままでも何が効いているか分かるよう、見出しに出す要約 */
  const filterSummary = useMemo(() => {
    const parts: string[] = [];
    if (megaMode !== "all") parts.push(MEGA_MODES.find((m) => m.key === megaMode)?.label ?? "");
    if (ability !== ANY_ABILITY) parts.push(ability);
    if (moveFilter.length > 0) parts.push(moveFilter.join("・"));
    if (minCoverage > 0) parts.push(`打点${minCoverage}+`);
    if (typeFilter.length > 0) {
      const how = typeMode === "move" ? "の技" : typeMode === "safe" ? "が弱点でない" : "";
      parts.push(typeFilter.join("・") + how);
    }
    return parts.length > 0 ? parts.join(" / ") : "未設定";
  }, [megaMode, ability, moveFilter, minCoverage, typeFilter, typeMode]);

  /** 図鑑から自軍へ。star=true なら★手持ちとして入れる */
  const add = (speciesName: string, form: string, star: boolean) => {
    const e = entryFromDex(speciesName);
    if (!e) return;
    const idx = e.forms.findIndex((f) => f.form === form);
    if (idx >= 0) e.activeForm = idx;
    e.starred = star;
    addEntry(e);
  };

  return (
    <div>
      <div className="panel">
        {/* 図鑑のタイプ。はがね統一が主目的だが、あく統一でも同じ道具が使える */}
        <div className="row tight" style={{ marginBottom: 8 }}>
          <span className="small muted">図鑑</span>
          {DEX_TYPES.map((t) => (
            <button
              key={t}
              className={`tbadge dex-type ${dexType === t ? "on" : ""}`}
              style={{ background: TYPE_COLORS[t], color: "#14171c" }}
              aria-pressed={dexType === t}
              onClick={() => setDexType(t)}
            >
              {t}
            </button>
          ))}
          <span className="small muted">
            {D.species.length}系統 / {D.allForms.length}フォルム
            {D.withLearnset < D.species.length
              && `　習得技データ ${D.withLearnset}/${D.species.length}系統`}
          </span>
        </div>
        <div className="row">
          <input
            type="text"
            placeholder="名前で検索…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ flex: "1 1 160px" }}
          />
          <label className="row tight small" style={{ cursor: "pointer" }} title="自軍にまだ1体も入れていない系統だけ">
            <input type="checkbox" checked={unowned} onChange={(e) => setUnowned(e.target.checked)} />
            未追加のみ
          </label>
          <label className="row tight small" style={{ cursor: "pointer" }} title="バーと余白を省いて一度に多く見る">
            <input type="checkbox" checked={compact} onChange={(e) => setCompact(e.target.checked)} />
            コンパクト
          </label>
          {filtered && (
            <button className="btn small" onClick={clearFilters}>絞込みを解除</button>
          )}
        </div>
      </div>

      {/* 絞込みは項目が増えて縦に伸びたので畳めるようにする。
            スマホだと開きっぱなしでは一覧が画面の下半分に追いやられる。 */}
      <Panel
        id="dex.filters"
        title="絞り込み"
        defaultOpen={false}
        summary={filterSummary}
      >
          {/* メガシンカで絞る。チャンピオンズはメガを1体しか入れられないので、
              「あり」だけでなく「なし」も要る（メガ枠を空けた構成を組むとき） */}
          <div className="row tight" style={{ marginTop: 8 }}>
            <span className="small muted">メガシンカ</span>
            {MEGA_MODES.map((m) => (
              <button
                key={m.key}
                className={`sort-chip ${megaMode === m.key ? "on" : ""}`}
                aria-pressed={megaMode === m.key}
                title={m.title}
                onClick={() => setMegaMode(m.key)}
              >
                {m.label}
              </button>
            ))}
          </div>
          {/* 特性と打点。特性は図鑑に出てくるものだけ、持つフォルム数の多い順 */}
          <div className="row tight" style={{ marginTop: 8 }}>
            <span className="small muted">特性</span>
            <SelectMenu
              style={{ flex: "1 1 150px", minWidth: 130 }}
              items={[{ value: ANY_ABILITY, label: ANY_ABILITY }, ...D.abilityOptions]}
              value={ability}
              stacked /* 効果の説明を名前の下に出す */
              onChange={setAbility}
              searchPlaceholder="特性を絞り込み…"
            />
          </div>
          {/* 技名で絞る。タイプ絞込みと違い「この技が使える枠を探す」用 */}
          <div className="row tight" style={{ marginTop: 8 }}>
            <span className="small muted" title="複数選ぶと、すべて覚える系統だけが残ります">
              覚える技{moveFilter.length > 1 && "（すべて覚える）"}
            </span>
            <SelectMenu
              style={{ flex: "1 1 150px", minWidth: 130 }}
              items={[
                { value: ADD_MOVE, label: ADD_MOVE },
                ...D.moveOptions.filter((m) => !moveFilter.includes(m.value)),
              ]}
              value={ADD_MOVE}
              onChange={(v) => { if (v !== ADD_MOVE) setMoveFilter((prev) => [...prev, v]); }}
              searchable
              stacked
              searchPlaceholder="技名で絞り込み…"
            />
          </div>
          {moveFilter.length > 0 && (
            <div className="row tight" style={{ marginTop: 6 }}>
              {moveFilter.map((n) => (
                <button
                  key={n}
                  className="sort-chip on"
                  title="タップで外す"
                  onClick={() => setMoveFilter((prev) => prev.filter((x) => x !== n))}
                >
                  {n} ✕
                </button>
              ))}
            </div>
          )}

          {/* 打点の広さ。覚える攻撃技が何タイプあるか（ルカリオ16〜ミミズズ5） */}
          <div className="row tight" style={{ marginTop: 8 }}>
            <span className="small muted" title="覚える攻撃技のタイプ数">打点の広さ</span>
            {COVERAGE_STEPS.map((n) => (
              <button
                key={n}
                className={`sort-chip ${minCoverage === n ? "on" : ""}`}
                aria-pressed={minCoverage === n}
                title={n === 0 ? "打点で絞らない" : `攻撃技が${n}タイプ以上`}
                onClick={() => setMinCoverage(n)}
              >
                {n === 0 ? "すべて" : `${n}タイプ以上`}
              </button>
            ))}
          </div>
          {/* タイプボタンの意味を切り替える。「覚える技」なら、そのタイプの技を
              覚える系統だけに絞って技名をカードに出す。「弱点でない」は受け役を探すとき */}
          <div className="row tight" style={{ marginTop: 8 }}>
            <span className="small muted">タイプで絞る</span>
            {TYPE_MODES.map((m) => (
              <button
                key={m.key}
                className={`sort-chip ${typeMode === m.key ? "on" : ""}`}
                aria-pressed={typeMode === m.key}
                title={m.title}
                onClick={() => setTypeMode(m.key)}
              >
                {m.label}
              </button>
            ))}
          </div>
          <div className="filter-types" style={{ marginTop: 6 }}>
            {(typeMode === "move" ? TYPES : typeMode === "safe" ? D.weakTypes : D.usedTypes).map((t) => (
              <button
                key={t}
                className={typeFilter.includes(t) ? "on" : ""}
                style={{ background: TYPE_COLORS[t], color: "#14171c" }}
                onClick={() => toggleType(t)}
              >
                {t}
              </button>
            ))}
          </div>
      </Panel>

      <div className="panel">

        {/* 表のヘッダーをタップして並べ替える代わりの操作。横スクロールが無くなったぶんここに出す */}
        <div className="sort-bar">
          <span className="small muted">並び替え</span>
          {SORT_KEYS.map((k) => (
            <button
              key={k}
              className={`sort-chip ${sortKey === k ? "on" : ""}`}
              title={k === "name" || k === "total" ? SORT_LABEL[k] : `${SORT_LABEL[k]}（${STAT_LABEL[k as StatKey]}）`}
              onClick={() => setSort(k)}
            >
              {SORT_LABEL[k]}{sortKey === k ? (asc ? " ▲" : " ▼") : ""}
            </button>
          ))}
          {Object.keys(picked).length > 0 && (
            <button className="sort-chip" onClick={() => setPicked({})} title="選んだフォルムを既定に戻す">
              フォルム選択を戻す
            </button>
          )}
        </div>

        <div className="small muted" style={{ marginTop: 6 }}>
          {list.length} 系統 / {shownForms} フォルム（全 {D.species.length} 系統・{D.allForms.length} フォルム）
          {typeFilter.length > 0 && `　絞込み: ${typeFilter.join("・")}${
            typeMode === "move" ? "の技を覚える" : typeMode === "safe" ? "が弱点でない" : "を含む"}`}
          {moveFilter.length > 0 && `　${moveFilter.join("・")}を覚える`}
        </div>
      </div>

      <div className={`panel dex-list ${compact ? "compact" : ""}`}>
        {list.map(({ sp, forms, sel, hitMoves }) => {
          const isOpen = open.includes(sp.name);
          const isOwned = owned.has(`${sp.name}/${sel.form}`);
          // 別タイプの統一チームを開いているときは、その図鑑から入れられない
          const offType = !fits(sp.name);
          const offReason = `このチームは${mainType}統一です（${sp.name}は${mainType}を持ちません）`;
          return (
            <div className="dex-row" key={sp.name}>
              {/* 1行目: 名前と追加ボタン */}
              <div className="dex-head">
                <span className="dex-name">
                  {sel.label}
                  {sp.megaOnly && <span className="small amber" title={`メガシンカで初めて${dexType}が付く`}> ⚑</span>}
                  {isOwned && <span className="small dex-owned" title="すでに自軍にいます"> 自軍</span>}
                </span>
                <span className="dex-actions">
                  <button
                    className="btn small"
                    title={offType ? offReason : starDisabled ? "★手持ちは最大6体まで" : "★手持ちに直接追加"}
                    disabled={starDisabled || offType}
                    onClick={() => add(sp.name, sel.form, true)}
                  >
                    ★手持ち
                  </button>
                  <button
                    className="btn small"
                    title={offType ? offReason : "ベンチへ追加"}
                    disabled={offType}
                    onClick={() => add(sp.name, sel.form, false)}
                  >
                    ＋ベンチ
                  </button>
                </span>
              </div>

              {/* 2行目: タイプ（幅を固定して縦に揃える）とフォルム切替 */}
              <div className="dex-meta">
                <span className="dex-types">
                  {sel.types.map((t) => (
                    <span key={t} className="tbadge" style={{ background: TYPE_COLORS[t] }}>{t}</span>
                  ))}
                </span>
                {forms.length > 1 && (
                  <span className="dex-forms" title="表示するフォルムを切り替える">
                    {forms.map((f) => (
                      <button
                        key={f.form}
                        className={`form-chip ${f === sel ? "on" : ""}`}
                        onClick={() => pickForm(sp.name, f.form)}
                      >
                        {f.short}
                      </button>
                    ))}
                  </span>
                )}
                {/* 打点で絞っているときだけ実数を出す（普段は情報量を増やさない） */}
                {minCoverage > 0 && (
                  <span className="small muted" title="覚える攻撃技のタイプ数">打点{sp.coverage}</span>
                )}
                <button className="dex-more" onClick={() => toggleOpen(sp.name)} aria-expanded={isOpen}>
                  <span className={`card-caret ${isOpen ? "open" : ""}`}>▶</span>
                  特性・弱点
                </button>
              </div>

              {/* 3行目: 6つの種族値を等幅で並べる。行をまたいで縦に揃うので表と同じように読める */}
              <div className="dex-stats">
                {STAT_KEYS.map((k) => (
                  <div className={`dex-stat ${sortKey === k ? "on" : ""}`} key={k} title={STAT_LABEL[k]}>
                    <span className="k">{k}</span>
                    <span className="v tnum">{sel.stats[k]}</span>
                    {!compact && <span className="bar"><i style={{ width: `${(sel.stats[k] / D.statMax) * 100}%` }} /></span>}
                  </div>
                ))}
                <div className={`dex-stat total ${sortKey === "total" ? "on" : ""}`} title="種族値合計">
                  <span className="k">計</span>
                  <span className="v tnum">{sel.total}</span>
                  {!compact && <span className="bar" />}
                </div>
              </div>

              {/* 「覚える技」で絞ったときは、該当する技をそのまま並べる */}
              {hitMoves.length > 0 && (
                <div className="dex-hits">
                  {hitMoves.map((m) => (
                    <span key={m.name} className="hit-chip" style={{ borderColor: TYPE_COLORS[m.type] }}>
                      {m.name}
                      <i>{m.power > 0 ? m.power : m.cat === "変化" ? "変化" : "可変"}</i>
                    </span>
                  ))}
                </div>
              )}

              {isOpen && (
                /* 特性は行が伸びるので、弱点と同じここに畳んでおく */
                <div className="dex-abil">
                  <span className="small muted">特性</span>
                  <AbilityNote name={sel.abilities.join("/")} withName />
                </div>
              )}

              {isOpen && (
                /* はがね・あくとも耐性は多いので、突かれる側だけ出す */
                <div className="dex-weak">
                  <span className="small muted">弱点</span>
                  {sel.weak.length === 0 && <span className="small muted">なし</span>}
                  {sel.weak.map((w) => (
                    <span
                      key={w.type}
                      className={`weak-chip ${w.mul >= 4 ? "x4" : ""}`}
                      style={{ borderColor: TYPE_COLORS[w.type] }}
                    >
                      {w.type}×{w.mul}
                    </span>
                  ))}
                  {sel.immune.length > 0 && (
                    <>
                      <span className="small muted" style={{ marginLeft: 6 }}>無効</span>
                      {sel.immune.map((t) => (
                        <span key={t} className="weak-chip immune" style={{ borderColor: TYPE_COLORS[t] }}>{t}</span>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {list.length === 0 && <div className="small muted">条件に合うポケモンがいません。</div>}
      </div>
    </div>
  );
}
