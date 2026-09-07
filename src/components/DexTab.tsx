import { useMemo, useState } from "react";
import type { StatKey } from "../types";
import { useStore } from "../store";
import { DEX } from "../data/dex";
import { STAT_KEYS, TYPES, TYPE_COLORS } from "../data/game";
import { displayName, entryFromDex } from "../data/roster";
import { TypeBadges } from "./TypeBadge";

interface Row {
  name: string;
  megaOnly: boolean;
  form: string;
  types: string[];
  stats: Record<StatKey, number>;
  total: number;
}

type SortKey = StatKey | "total" | "name";

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

export function DexTab() {
  const { addEntry } = useStore();
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState<Set<string>>(new Set());
  const [megaOnly, setMegaOnly] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("total");
  const [asc, setAsc] = useState(false);

  const rows = useMemo(() => {
    let r = FLAT;
    if (q.trim()) {
      const qq = q.trim();
      r = r.filter((x) => x.name.includes(qq) || displayName(x.name, x.form).includes(qq));
    }
    if (megaOnly) r = r.filter((x) => x.megaOnly);
    if (typeFilter.size > 0) {
      r = r.filter((x) => [...typeFilter].every((t) => x.types.includes(t)));
    }
    const sorted = [...r].sort((a, b) => {
      let av: number | string, bv: number | string;
      if (sortKey === "total") { av = a.total; bv = b.total; }
      else if (sortKey === "name") { av = a.name; bv = b.name; }
      else { av = a.stats[sortKey]; bv = b.stats[sortKey]; }
      if (av < bv) return asc ? -1 : 1;
      if (av > bv) return asc ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [q, typeFilter, megaOnly, sortKey, asc]);

  const toggleType = (t: string) =>
    setTypeFilter((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t); else next.add(t);
      return next;
    });

  const setSort = (k: SortKey) => {
    if (sortKey === k) setAsc((v) => !v);
    else { setSortKey(k); setAsc(k === "name"); }
  };

  const arrow = (k: SortKey) => (sortKey === k ? (asc ? " ▲" : " ▼") : "");

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
          {typeFilter.size > 0 && (
            <button className="btn small" onClick={() => setTypeFilter(new Set())}>タイプ絞込み解除</button>
          )}
        </div>
        <div className="filter-types" style={{ marginTop: 8 }}>
          {TYPES.map((t) => (
            <button
              key={t}
              className={typeFilter.has(t) ? "on" : ""}
              style={{ background: TYPE_COLORS[t], color: "#14171c" }}
              onClick={() => toggleType(t)}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="small muted" style={{ marginTop: 6 }}>
          {rows.length} フォルム表示中（全 {FLAT.length} フォルム・{DEX.length} 系統）
          {typeFilter.size > 0 && `　絞込み: ${[...typeFilter].join("・")}を含む`}
        </div>
      </div>

      <div className="table-scroll panel">
        <div className="scroll-hint">← → 横にスクロールすると種族値・合計が見られます</div>
        <table className="dex">
          <thead>
            <tr>
              <th onClick={() => setSort("name")}>名前{arrow("name")}</th>
              <th>タイプ</th>
              {STAT_KEYS.map((k) => (
                <th key={k} className="num" onClick={() => setSort(k)}>{k}{arrow(k)}</th>
              ))}
              <th className="num" onClick={() => setSort("total")}>合計{arrow("total")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.name}/${r.form}`}>
                <td>
                  {displayName(r.name, r.form)}
                  {r.megaOnly && <span className="small amber" title="メガシンカで初めてはがね化"> ⚑</span>}
                </td>
                <td>
                  <div className="row tight">
                    <TypeBadges types={r.types} />
                  </div>
                </td>
                {STAT_KEYS.map((k) => (
                  <td key={k} className="num">{r.stats[k]}</td>
                ))}
                <td className="num" style={{ color: "var(--steel-hi)", fontWeight: 600 }}>{r.total}</td>
                <td>
                  <button
                    className="btn small"
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
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
