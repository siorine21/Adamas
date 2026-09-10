import { useMemo, useState } from "react";
import type { StatKey } from "../types";
import { useStore } from "../store";
import { DEX } from "../data/dex";
import { MAX_STARRED, STAT_KEYS, STAT_LABEL, TYPES, TYPE_COLORS } from "../data/game";
import { typeEffectiveness } from "../calc";
import { displayName, entryFromDex } from "../data/roster";
import { TypeBadges } from "./TypeBadge";
import { usePersistedState } from "../uiState";

/** 1フォルム */
interface Form {
  form: string;
  label: string; // 表示名（メガ○○ など）
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
      types: f.types,
      stats: f.base,
      total: STAT_KEYS.reduce((s, k) => s + f.base[k], 0),
      weak,
      immune,
    };
  }),
}));

const ALL_FORMS = SPECIES.flatMap((s) => s.forms);
/** 種族値バーの基準。図鑑内の最大値に合わせると差が見やすい */
const STAT_MAX = Math.max(...ALL_FORMS.flatMap((f) => STAT_KEYS.map((k) => f.stats[k])));
/** 図鑑に実際に出てくるタイプだけを絞込みボタンに出す（18個並べても押せないタイプが大半なので） */
const USED_TYPES = TYPES.filter((t) => ALL_FORMS.some((f) => f.types.includes(t)));

const valueOf = (f: Form, k: SortKey): number =>
  k === "total" ? f.total : k === "name" ? 0 : f.stats[k];

export function DexTab() {
  const { addEntry, roster, starredCount } = useStore();
  const [q, setQ] = useState(""); // 検索語は一時的なものなので保存しない
  const [typeFilter, setTypeFilter] = usePersistedState<string[]>(
    "dex.types", [], (v) => Array.isArray(v) && v.every((x) => typeof x === "string"));
  const [megaOnly, setMegaOnly] = usePersistedState("dex.megaOnly", false, (v) => typeof v === "boolean");
  const [sortKey, setSortKey] = usePersistedState<SortKey>(
    "dex.sortKey", "total", (v) => SORT_KEYS.includes(v as SortKey));
  const [asc, setAsc] = usePersistedState("dex.asc", false, (v) => typeof v === "boolean");
  const [compact, setCompact] = usePersistedState("dex.compact", false, (v) => typeof v === "boolean");
  // 開いている系統（フォルム内訳と弱点を出す）
  const [open, setOpen] = usePersistedState<string[]>(
    "dex.open", [], (v) => Array.isArray(v) && v.every((x) => typeof x === "string"));

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

  /** 検索・絞込みを通したうえで、系統ごとに「並び替えの基準になるフォルム」を決める */
  const list = useMemo(() => {
    const qq = q.trim();
    const out: { sp: Species; forms: Form[]; lead: Form; sortVal: number }[] = [];
    for (const sp of SPECIES) {
      if (megaOnly && !sp.megaOnly) continue;
      let forms = sp.forms;
      if (typeFilter.length > 0) forms = forms.filter((f) => typeFilter.every((t) => f.types.includes(t)));
      if (qq) {
        const hitName = sp.name.includes(qq);
        if (!hitName) forms = forms.filter((f) => f.label.includes(qq));
      }
      if (forms.length === 0) continue;
      // 名前順のときは素のフォルム、能力順のときはその能力が最も高いフォルムを代表にする
      const lead = sortKey === "name"
        ? forms[0]
        : forms.reduce((a, b) => (valueOf(b, sortKey) > valueOf(a, sortKey) ? b : a));
      out.push({ sp, forms, lead, sortVal: valueOf(lead, sortKey) });
    }
    return out.sort((a, b) => {
      if (sortKey === "name") return asc ? a.sp.name.localeCompare(b.sp.name, "ja") : b.sp.name.localeCompare(a.sp.name, "ja");
      return asc ? a.sortVal - b.sortVal : b.sortVal - a.sortVal;
    });
  }, [q, typeFilter, megaOnly, sortKey, asc]);

  const shownForms = list.reduce((n, x) => n + x.forms.length, 0);

  const toggleType = (t: string) =>
    setTypeFilter((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  const toggleOpen = (name: string) =>
    setOpen((prev) => (prev.includes(name) ? prev.filter((x) => x !== name) : [...prev, name]));
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

  /** 1フォルムぶんの行（種族値・弱点・追加ボタン） */
  const FormRow = ({ sp, f, showLabel }: { sp: Species; f: Form; showLabel: boolean }) => {
    const isOwned = owned.has(`${sp.name}/${f.form}`);
    return (
      <div className="dex-form">
        <div className="dex-head">
          <span className="dex-name">
            {showLabel ? f.label : displayName(sp.name, f.form)}
            {sp.megaOnly && <span className="small amber" title="メガシンカで初めてはがね化"> ⚑</span>}
            {isOwned && <span className="small dex-owned" title="すでに自軍にいます"> 自軍</span>}
          </span>
          <TypeBadges types={f.types} />
          <span className="dex-actions">
            <button
              className="btn small"
              title={starDisabled ? "★手持ちは最大6体まで" : "★手持ちに直接追加"}
              disabled={starDisabled}
              onClick={() => add(sp.name, f.form, true)}
            >
              ★手持ち
            </button>
            <button className="btn small" title="ベンチへ追加" onClick={() => add(sp.name, f.form, false)}>
              ＋ベンチ
            </button>
          </span>
        </div>
        {/* 6つの種族値を等幅で並べる。行をまたいで縦に揃うので表と同じように読める */}
        <div className="dex-stats">
          {STAT_KEYS.map((k) => (
            <div className={`dex-stat ${sortKey === k ? "on" : ""}`} key={k} title={STAT_LABEL[k]}>
              <span className="k">{k}</span>
              <span className="v tnum">{f.stats[k]}</span>
              {!compact && <span className="bar"><i style={{ width: `${(f.stats[k] / STAT_MAX) * 100}%` }} /></span>}
            </div>
          ))}
          <div className={`dex-stat total ${sortKey === "total" ? "on" : ""}`} title="種族値合計">
            <span className="k">計</span>
            <span className="v tnum">{f.total}</span>
            {!compact && <span className="bar" />}
          </div>
        </div>
      </div>
    );
  };

  /** 弱点・無効。はがね統一だと耐性は多いので、突かれる側だけ出す */
  const Weak = ({ f }: { f: Form }) => (
    <div className="dex-weak">
      <span className="small muted">弱点</span>
      {f.weak.length === 0 && <span className="small muted">なし</span>}
      {f.weak.map((w) => (
        <span
          key={w.type}
          className={`weak-chip ${w.mul >= 4 ? "x4" : ""}`}
          style={{ borderColor: TYPE_COLORS[w.type] }}
        >
          {w.type}×{w.mul}
        </span>
      ))}
      {f.immune.length > 0 && (
        <>
          <span className="small muted" style={{ marginLeft: 6 }}>無効</span>
          {f.immune.map((t) => (
            <span key={t} className="weak-chip immune" style={{ borderColor: TYPE_COLORS[t] }}>{t}</span>
          ))}
        </>
      )}
    </div>
  );

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
        <div className="filter-types" style={{ marginTop: 8 }}>
          {USED_TYPES.map((t) => (
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
        </div>

        <div className="small muted" style={{ marginTop: 6 }}>
          {list.length} 系統 / {shownForms} フォルム表示中（全 {SPECIES.length} 系統・{ALL_FORMS.length} フォルム）
          {typeFilter.length > 0 && `　絞込み: ${typeFilter.join("・")}を含む`}
          {sortKey !== "name" && list.some((x) => x.forms.length > 1) && "　※能力順では、その能力が最も高いフォルムを代表に表示します"}
        </div>
      </div>

      <div className={`panel dex-list ${compact ? "compact" : ""}`}>
        {list.map(({ sp, forms, lead }) => {
          const isOpen = open.includes(sp.name);
          const rest = forms.filter((f) => f !== lead);
          return (
            <div className="dex-row" key={sp.name}>
              <FormRow sp={sp} f={lead} showLabel />
              <button className="dex-more" onClick={() => toggleOpen(sp.name)} aria-expanded={isOpen}>
                <span className={`card-caret ${isOpen ? "open" : ""}`}>▶</span>
                {rest.length > 0 ? `他${rest.length}フォルム・弱点` : "弱点"}
              </button>
              {isOpen && (
                <div className="dex-detail">
                  <Weak f={lead} />
                  {rest.map((f) => (
                    <div key={f.form}>
                      <FormRow sp={sp} f={f} showLabel />
                      <Weak f={f} />
                    </div>
                  ))}
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
