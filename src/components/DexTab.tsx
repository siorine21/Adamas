import { useMemo, useState } from "react";
import type { StatKey } from "../types";
import { useStore } from "../store";
import { DEX } from "../data/dex";
import { STAT_KEYS, STAT_LABEL, TYPES, TYPE_COLORS } from "../data/game";
import { displayName, entryFromDex } from "../data/roster";
import { TypeBadges } from "./TypeBadge";
import { usePersistedState } from "../uiState";

interface Row {
  name: string;
  megaOnly: boolean;
  form: string;
  types: string[];
  stats: Record<StatKey, number>;
  total: number;
}

type SortKey = StatKey | "total" | "name";
const SORT_KEYS: SortKey[] = ["name", ...STAT_KEYS, "total"];
const SORT_LABEL: Record<SortKey, string> = {
  name: "名前", total: "合計",
  H: "H", A: "A", B: "B", C: "C", D: "D", S: "S",
};

const FLAT: Row[] = DEX.flatMap((d) =>
  d.forms.map((f) => ({
    name: d.name,
    megaOnly: !!d.megaOnly,
    form: f.form,
    types: f.types,
    stats: f.base,
    total: STAT_KEYS.reduce((s, k) => s + f.base[k], 0),
  })),
);

/** 種族値バーの基準。図鑑内の最大値に合わせると差が見やすい */
const STAT_MAX = Math.max(...FLAT.flatMap((r) => STAT_KEYS.map((k) => r.stats[k])));
/** 図鑑に実際に出てくるタイプだけを絞込みボタンに出す（18個並べても押せないタイプが大半なので） */
const USED_TYPES = TYPES.filter((t) => FLAT.some((r) => r.types.includes(t)));

export function DexTab() {
  const { addEntry, roster } = useStore();
  const [q, setQ] = useState(""); // 検索語は一時的なものなので保存しない
  const [typeFilter, setTypeFilter] = usePersistedState<string[]>(
    "dex.types", [], (v) => Array.isArray(v) && v.every((x) => typeof x === "string"));
  const [megaOnly, setMegaOnly] = usePersistedState("dex.megaOnly", false, (v) => typeof v === "boolean");
  const [sortKey, setSortKey] = usePersistedState<SortKey>(
    "dex.sortKey", "total", (v) => SORT_KEYS.includes(v as SortKey));
  const [asc, setAsc] = usePersistedState("dex.asc", false, (v) => typeof v === "boolean");

  // すでに自軍にいるフォルムには印を付ける（同じ個体を二重に足すミスを防ぐ）
  const owned = useMemo(() => {
    const s = new Set<string>();
    for (const e of roster) {
      const f = e.forms[e.activeForm] ?? e.forms[0];
      if (f) s.add(`${e.name}/${f.form}`);
    }
    return s;
  }, [roster]);

  const rows = useMemo(() => {
    let r = FLAT;
    if (q.trim()) {
      const qq = q.trim();
      r = r.filter((x) => x.name.includes(qq) || displayName(x.name, x.form).includes(qq));
    }
    if (megaOnly) r = r.filter((x) => x.megaOnly);
    if (typeFilter.length > 0) {
      r = r.filter((x) => typeFilter.every((t) => x.types.includes(t)));
    }
    return [...r].sort((a, b) => {
      let av: number | string, bv: number | string;
      if (sortKey === "total") { av = a.total; bv = b.total; }
      else if (sortKey === "name") { av = a.name; bv = b.name; }
      else { av = a.stats[sortKey]; bv = b.stats[sortKey]; }
      if (av < bv) return asc ? -1 : 1;
      if (av > bv) return asc ? 1 : -1;
      return 0;
    });
  }, [q, typeFilter, megaOnly, sortKey, asc]);

  const toggleType = (t: string) =>
    setTypeFilter((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));

  const setSort = (k: SortKey) => {
    if (sortKey === k) setAsc((v) => !v);
    else { setSortKey(k); setAsc(k === "name"); }
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
            style={{ flex: "1 1 180px" }}
          />
          <label className="row tight small" style={{ cursor: "pointer" }}>
            <input type="checkbox" checked={megaOnly} onChange={(e) => setMegaOnly(e.target.checked)} />
            メガで初鋼化のみ
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
          {rows.length} フォルム表示中（全 {FLAT.length} フォルム・{DEX.length} 系統）
          {typeFilter.length > 0 && `　絞込み: ${typeFilter.join("・")}を含む`}
        </div>
      </div>

      <div className="panel dex-list">
        {rows.map((r) => {
          const isOwned = owned.has(`${r.name}/${r.form}`);
          return (
            <div className="dex-row" key={`${r.name}/${r.form}`}>
              <div className="dex-head">
                <span className="dex-name">
                  {displayName(r.name, r.form)}
                  {r.megaOnly && <span className="small amber" title="メガシンカで初めてはがね化"> ⚑</span>}
                  {isOwned && <span className="small dex-owned" title="すでに自軍にいます"> 自軍</span>}
                </span>
                <TypeBadges types={r.types} />
                <button
                  className="btn small dex-add"
                  title="自軍（ベンチ）へ追加"
                  onClick={() => {
                    const e = entryFromDex(r.name);
                    if (!e) return;
                    const idx = e.forms.findIndex((f) => f.form === r.form);
                    if (idx >= 0) e.activeForm = idx;
                    addEntry(e);
                  }}
                >
                  ＋自軍へ
                </button>
              </div>
              {/* 6つの種族値を等幅で並べる。行をまたいで縦に揃うので表と同じように読める */}
              <div className="dex-stats">
                {STAT_KEYS.map((k) => (
                  <div className={`dex-stat ${sortKey === k ? "on" : ""}`} key={k} title={STAT_LABEL[k]}>
                    <span className="k">{k}</span>
                    <span className="v tnum">{r.stats[k]}</span>
                    <span className="bar"><i style={{ width: `${(r.stats[k] / STAT_MAX) * 100}%` }} /></span>
                  </div>
                ))}
                <div className={`dex-stat total ${sortKey === "total" ? "on" : ""}`} title="種族値合計">
                  <span className="k">計</span>
                  <span className="v tnum">{r.total}</span>
                  <span className="bar" />
                </div>
              </div>
            </div>
          );
        })}
        {rows.length === 0 && <div className="small muted">条件に合うポケモンがいません。</div>}
      </div>
    </div>
  );
}
