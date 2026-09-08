import { useMemo, useState } from "react";
import type { RosterEntry } from "../types";
import { useStore } from "../store";
import { usePersistedState } from "../uiState";
import { CONFIRMED } from "../data/confirmed";
import { calcStat, rankMul, realStats } from "../data/game";
import { TypeBadges } from "./TypeBadge";
import { displayName } from "../data/roster";
import { SelectMenu } from "./SelectMenu";
import { NumberMenu } from "./NumberMenu";

type RefLine = "最速" | "準速" | "無振り";
type Kind = "team" | "bench" | "ref";

interface SpeedRow {
  key: string;
  label: string;
  detail: string;
  types?: string[];
  speed: number;
  kind: Kind;
}

const RANKS = [6, 5, 4, 3, 2, 1, 0, -1, -2, -3, -4, -5, -6];

function refSpeed(baseS: number, line: RefLine): number {
  if (line === "最速") return calcStat(baseS, 32, 1.1);
  if (line === "準速") return calcStat(baseS, 32, 1.0);
  return calcStat(baseS, 0, 1.0); // 無振り
}

export function SpeedTab() {
  const { roster } = useStore();
  // 個体ごとの スカーフ / ランク設定（リロードしても残す）
  const isObj = (v: unknown) => !!v && typeof v === "object" && !Array.isArray(v);
  const [scarf, setScarf] = usePersistedState<Record<string, boolean>>("spd.scarf", {}, isObj);
  const [rank, setRank] = usePersistedState<Record<string, number>>("spd.rank", {}, isObj);
  // 内定リファレンスの素早さライン
  const [line, setLine] = usePersistedState<RefLine>(
    "spd.line", "最速", (v) => v === "最速" || v === "準速" || v === "無振り");
  const [onlyMine, setOnlyMine] = usePersistedState("spd.onlyMine", false, (v) => typeof v === "boolean");
  // 絞込みは保存しない（開いた時に何も出ない状態になるのを避ける）
  const [q, setQ] = useState("");

  // 手持ち(★)→控えの順に全個体
  const sortedRoster = useMemo(
    () => [...roster].sort((a, b) => (a.starred === b.starred ? 0 : a.starred ? -1 : 1)),
    [roster],
  );

  const rosterRow = (e: RosterEntry): SpeedRow => {
    const form = e.forms[e.activeForm];
    const base = realStats(form.base, e.ap, e.nature).S;
    let s = base;
    if (scarf[e.key]) s = Math.floor(s * 1.5);
    s = rankMul(s, rank[e.key] ?? 0);
    const tags: string[] = [`実数${base}`];
    if (scarf[e.key]) tags.push("スカーフ");
    if ((rank[e.key] ?? 0) !== 0) tags.push(`S${(rank[e.key] ?? 0) > 0 ? "+" : ""}${rank[e.key]}`);
    return {
      key: e.key,
      label: `${displayName(e.name, form.form)}${e.nickname ? `「${e.nickname}」` : ""}`,
      detail: tags.join(" / "),
      types: form.types,
      speed: s,
      kind: e.starred ? "team" : "bench",
    };
  };

  const rows = useMemo(() => {
    // ロスター個体を表示名で引けるように（内定名と一致するものはハイライト行に置換）
    const byName = new Map<string, RosterEntry>();
    for (const e of sortedRoster) byName.set(displayName(e.name, e.forms[e.activeForm].form), e);
    const used = new Set<string>();
    const out: SpeedRow[] = [];
    for (const c of CONFIRMED) {
      const e = byName.get(c.name);
      if (e && !used.has(c.name)) {
        used.add(c.name);
        out.push(rosterRow(e));
      } else {
        out.push({
          key: `ref-${c.no}-${c.name}`,
          label: c.name,
          detail: line,
          types: c.types,
          speed: refSpeed(c.base.S, line),
          kind: "ref",
        });
      }
    }
    // 内定名と一致しなかったロスター個体（フォルム表記差など）も必ず表示
    for (const e of sortedRoster) {
      const nm = displayName(e.name, e.forms[e.activeForm].form);
      if (!used.has(nm)) { used.add(nm); out.push(rosterRow(e)); }
    }
    let list = onlyMine ? out.filter((r) => r.kind !== "ref") : out;
    const qq = q.trim();
    if (qq) list = list.filter((r) => r.label.includes(qq));
    return list.sort((a, b) => b.speed - a.speed);
  }, [sortedRoster, scarf, rank, line, onlyMine, q]);

  const marker = (k: Kind) => (k === "team" ? "★ " : k === "bench" ? "◆ " : "");
  const rowClass = (k: Kind) => (k === "team" ? "self-row" : k === "bench" ? "bench-row" : "");

  return (
    <div>
      <div className="panel">
        <div className="section-title">手持ち・控えの素早さ設定</div>
        {sortedRoster.length === 0 && <div className="muted small">個体がいません。チーム管理で登録してください。</div>}
        {sortedRoster.map((e) => {
          const form = e.forms[e.activeForm];
          const base = realStats(form.base, e.ap, e.nature).S;
          return (
            <div className="row" key={e.key} style={{ padding: "6px 0", borderBottom: "1px solid var(--line)" }}>
              <div style={{ flex: "1 1 160px" }}>
                <span className={`spd-tag ${e.starred ? "team" : "bench"}`}>{e.starred ? "★手持ち" : "◆控え"}</span>
                <b style={{ color: "var(--steel-hi)" }}>{displayName(e.name, form.form)}</b>
                {e.nickname && <span className="small muted">「{e.nickname}」</span>}
                <span className="small muted tnum"> 実数S {base}</span>
              </div>
              <label className="row tight small" style={{ cursor: "pointer" }}>
                <input type="checkbox" checked={!!scarf[e.key]} onChange={(ev) => setScarf((p) => ({ ...p, [e.key]: ev.target.checked }))} />
                こだわりスカーフ
              </label>
              <label className="row tight small">
                Sランク
                <NumberMenu
                  style={{ width: 92 }}
                  values={RANKS}
                  value={rank[e.key] ?? 0}
                  onChange={(v) => setRank((p) => ({ ...p, [e.key]: v }))}
                  cols={5}
                  format={(r) => (r > 0 ? `+${r}` : String(r))}
                />
              </label>
            </div>
          );
        })}
      </div>

      <div className="panel">
        <div className="row" style={{ gap: 12 }}>
          <label className="row tight small">
            内定の素早さライン
            <SelectMenu
              style={{ width: 180 }}
              items={[
                { value: "最速", label: "最速(S↑/AP32)" },
                { value: "準速", label: "準速(無補正/AP32)" },
                { value: "無振り", label: "無振り(AP0)" },
              ]}
              value={line}
              onChange={(v) => setLine(v as RefLine)}
            />
          </label>
          <label className="row tight small" style={{ cursor: "pointer" }}>
            <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} />
            自分の個体のみ
          </label>
          <input
            type="text"
            placeholder="名前で絞込み…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ flex: "1 1 140px" }}
          />
        </div>
      </div>

      <div className="panel table-scroll">
        <div className="section-title">素早さ比較（内定{CONFIRMED.length}体・降順）</div>
        <div className="small muted" style={{ marginBottom: 6 }}>
          <span className="spd-tag team">★手持ち</span>
          <span className="spd-tag bench">◆控え</span>
          は自分の構成（実数値）。それ以外は内定ポケモンの{line}ライン。
        </div>
        {/* スマホでも横スクロール無しで読めるよう、条件/タイプは名前の下に重ねる2列構成 */}
        <table className="spd">
          <thead>
            <tr>
              <th className="num">実効S</th>
              <th>ポケモン / 条件・タイプ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className={rowClass(r.kind)}>
                <td className="num"><b className={r.kind !== "ref" ? "me" : ""}>{r.speed}</b></td>
                <td>
                  <div className={r.kind !== "ref" ? "me" : ""}>{marker(r.kind)}{r.label}</div>
                  <div className="row tight spd-meta">
                    <span className="small muted">{r.detail}</span>
                    {r.types && <TypeBadges types={r.types} />}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
