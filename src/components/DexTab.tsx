import { useMemo, useState } from "react";
import type { StatKey } from "../types";
import { useStore } from "../store";
import { DEX } from "../data/dex";
import { MAX_STARRED, STAT_KEYS, STAT_LABEL, TYPES, TYPE_COLORS } from "../data/game";
import { typeEffectiveness } from "../calc";
import { BANNED_MOVES, LEARNSETS, MOVE_BY_NAME } from "../data/moves";
import type { Move } from "../types";
import { displayName, entryFromDex } from "../data/roster";
import { usePersistedState } from "../uiState";
import { kanaMatcher } from "../search";

/** 1フォルム */
interface Form {
  form: string;
  label: string; // 表示名（メガ○○ など）
  short: string; // フォルム切替チップの表示（通常 / メガ / メガZ など）
  types: string[];
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
  megaOnly: boolean;
  forms: Form[];
}

type SortKey = StatKey | "total" | "name";
const SORT_KEYS: SortKey[] = ["name", ...STAT_KEYS, "total"];
const SORT_LABEL: Record<SortKey, string> = {
  name: "名前", total: "合計",
  H: "H", A: "A", B: "B", C: "C", D: "D", S: "S",
};

const SPECIES: Species[] = DEX.map((d) => ({
  name: d.name,
  megaOnly: !!d.megaOnly,
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
      stats: f.base,
      total: STAT_KEYS.reduce((s, k) => s + f.base[k], 0),
      weak,
      immune,
    };
  }),
}));

/** 系統ごとに「覚える技をタイプ別にまとめたもの」。
 *  例: こおりを選ぶと、こおり技を覚える系統だけに絞って技名を出せる。
 *  レギュレーションで没収された技は除く。並びは 威力の高い順（変化技は最後）。 */
const MOVES_BY_TYPE: Record<string, Record<string, Move[]>> = {};
for (const sp of SPECIES) {
  const banned = BANNED_MOVES[sp.name] ?? [];
  const byType: Record<string, Move[]> = {};
  for (const n of LEARNSETS[sp.name]?.moves ?? []) {
    if (banned.includes(n)) continue;
    const m = MOVE_BY_NAME[n];
    if (!m) continue;
    (byType[m.type] ??= []).push(m);
  }
  for (const list of Object.values(byType)) {
    list.sort((a, b) => (b.power || -1) - (a.power || -1) || a.name.localeCompare(b.name, "ja"));
  }
  MOVES_BY_TYPE[sp.name] = byType;
}

const ALL_FORMS = SPECIES.flatMap((s) => s.forms);
/** 種族値バーの基準。図鑑内の最大値に合わせると差が見やすい */
const STAT_MAX = Math.max(...ALL_FORMS.flatMap((f) => STAT_KEYS.map((k) => f.stats[k])));
/** 図鑑に実際に出てくるタイプだけを絞込みボタンに出す（18個並べても押せないタイプが大半なので） */
const USED_TYPES = TYPES.filter((t) => ALL_FORMS.some((f) => f.types.includes(t)));

const valueOf = (f: Form, k: SortKey): number =>
  k === "total" ? f.total : k === "name" ? 0 : f.stats[k];

const isStrRecord = (v: unknown) =>
  !!v && typeof v === "object" && !Array.isArray(v)
  && Object.values(v as object).every((x) => typeof x === "string");

export function DexTab() {
  const { addEntry, roster, starredCount } = useStore();
  const [q, setQ] = useState(""); // 検索語は一時的なものなので保存しない
  const [typeFilter, setTypeFilter] = usePersistedState<string[]>(
    "dex.types", [], (v) => Array.isArray(v) && v.every((x) => typeof x === "string"));
  // タイプボタンの意味。self=本人のタイプ / move=覚える技のタイプ
  const [typeMode, setTypeMode] = usePersistedState<"self" | "move">(
    "dex.typeMode", "self", (v) => v === "self" || v === "move");
  const [megaOnly, setMegaOnly] = usePersistedState("dex.megaOnly", false, (v) => typeof v === "boolean");
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
    for (const sp of SPECIES) {
      if (megaOnly && !sp.megaOnly) continue;
      let forms = sp.forms;
      // 覚える技で絞るときはフォルムではなく系統で判定する（習得技は系統で共通）
      const hitMoves: Move[] = [];
      if (typeFilter.length > 0) {
        if (typeMode === "move") {
          const byType = MOVES_BY_TYPE[sp.name] ?? {};
          if (!typeFilter.every((t) => (byType[t]?.length ?? 0) > 0)) continue;
          for (const t of typeFilter) hitMoves.push(...(byType[t] ?? []));
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
  }, [q, typeFilter, typeMode, megaOnly, sortKey, asc, picked]);

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
        <div className="row">
          <input
            type="text"
            placeholder="名前で検索…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ flex: "1 1 160px" }}
          />
          <label className="row tight small" style={{ cursor: "pointer" }}>
            <input type="checkbox" checked={megaOnly} onChange={(e) => setMegaOnly(e.target.checked)} />
            メガで初鋼化のみ
          </label>
          <label className="row tight small" style={{ cursor: "pointer" }} title="バーと余白を省いて一度に多く見る">
            <input type="checkbox" checked={compact} onChange={(e) => setCompact(e.target.checked)} />
            コンパクト
          </label>
          {typeFilter.length > 0 && (
            <button className="btn small" onClick={() => setTypeFilter([])}>タイプ絞込み解除</button>
          )}
        </div>
        {/* タイプボタンの意味を切り替える。「覚える技」なら、そのタイプの技を
            覚える系統だけに絞り、該当する技名をカードに出す */}
        <div className="row tight" style={{ marginTop: 8 }}>
          <span className="small muted">タイプで絞る</span>
          <button
            className={`sort-chip ${typeMode === "self" ? "on" : ""}`}
            onClick={() => setTypeMode("self")}
          >
            本人のタイプ
          </button>
          <button
            className={`sort-chip ${typeMode === "move" ? "on" : ""}`}
            onClick={() => setTypeMode("move")}
            title="そのタイプの技を覚えるポケモンを探す"
          >
            覚える技
          </button>
        </div>
        <div className="filter-types" style={{ marginTop: 6 }}>
          {(typeMode === "move" ? TYPES : USED_TYPES).map((t) => (
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
          {list.length} 系統 / {shownForms} フォルム（全 {SPECIES.length} 系統・{ALL_FORMS.length} フォルム）
          {typeFilter.length > 0 && (typeMode === "move"
            ? `　絞込み: ${typeFilter.join("・")}の技を覚える`
            : `　絞込み: ${typeFilter.join("・")}を含む`)}
        </div>
      </div>

      <div className={`panel dex-list ${compact ? "compact" : ""}`}>
        {list.map(({ sp, forms, sel, hitMoves }) => {
          const isOpen = open.includes(sp.name);
          const isOwned = owned.has(`${sp.name}/${sel.form}`);
          return (
            <div className="dex-row" key={sp.name}>
              {/* 1行目: 名前と追加ボタン */}
              <div className="dex-head">
                <span className="dex-name">
                  {sel.label}
                  {sp.megaOnly && <span className="small amber" title="メガシンカで初めてはがね化"> ⚑</span>}
                  {isOwned && <span className="small dex-owned" title="すでに自軍にいます"> 自軍</span>}
                </span>
                <span className="dex-actions">
                  <button
                    className="btn small"
                    title={starDisabled ? "★手持ちは最大6体まで" : "★手持ちに直接追加"}
                    disabled={starDisabled}
                    onClick={() => add(sp.name, sel.form, true)}
                  >
                    ★手持ち
                  </button>
                  <button className="btn small" title="ベンチへ追加" onClick={() => add(sp.name, sel.form, false)}>
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
                <button className="dex-more" onClick={() => toggleOpen(sp.name)} aria-expanded={isOpen}>
                  <span className={`card-caret ${isOpen ? "open" : ""}`}>▶</span>
                  弱点
                </button>
              </div>

              {/* 3行目: 6つの種族値を等幅で並べる。行をまたいで縦に揃うので表と同じように読める */}
              <div className="dex-stats">
                {STAT_KEYS.map((k) => (
                  <div className={`dex-stat ${sortKey === k ? "on" : ""}`} key={k} title={STAT_LABEL[k]}>
                    <span className="k">{k}</span>
                    <span className="v tnum">{sel.stats[k]}</span>
                    {!compact && <span className="bar"><i style={{ width: `${(sel.stats[k] / STAT_MAX) * 100}%` }} /></span>}
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
                /* はがね統一だと耐性は多いので、突かれる側だけ出す */
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
