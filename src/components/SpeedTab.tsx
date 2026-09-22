import { useMemo, useState } from "react";
import type { RosterEntry } from "../types";
import { useStore } from "../store";
import { usePersistedState } from "../uiState";
import { CONFIRMED } from "../data/confirmed";
import { abilitySummary } from "../data/abilities";
import { RANK_MAX, RANK_MIN, TYPES, TYPE_COLORS, calcStat, rankLabel, rankMul, realStats } from "../data/game";
import { TypeBadges } from "./TypeBadge";
import { displayName } from "../data/roster";
import { Panel } from "./Panel";
import { SelectMenu } from "./SelectMenu";
import { StepSlider } from "./StepSlider";
import { kanaMatcher } from "../search";

type RefLine = "最速" | "準速" | "無振り";
type Kind = "team" | "bench" | "ref";

interface SpeedRow {
  key: string;
  label: string;
  detail: string;
  types?: string[];
  /** 特性の候補（絞込み用。個体として選んでいる1つではない） */
  abilities: string[];
  isMega: boolean;
  speed: number;
  kind: Kind;
}

/** メガ絞込み。はがね図鑑と同じ考え方だが、内定表はメガを別の行として持つので
 *  「持つ／持たない」ではなく「その行がメガか」で見る */
type MegaMode = "all" | "only" | "not";
const MEGA_MODES: { key: MegaMode; label: string }[] = [
  { key: "all", label: "すべて" },
  { key: "only", label: "メガのみ" },
  { key: "not", label: "メガ以外" },
];

const ANY_ABILITY = "（すべて）";
const splitAbility = (s: string): string[] => s.split("/").map((a) => a.trim()).filter(Boolean);

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
  // はがね図鑑と同じ絞込み。こちらも保存しない（何も出ない状態で開くのを避ける）
  const [typeFilter, setTypeFilter] = useState<string[]>([]);
  const [megaMode, setMegaMode] = useState<MegaMode>("all");
  const [ability, setAbility] = useState(ANY_ABILITY);

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
      abilities: splitAbility(form.ability),
      isMega: form.form.startsWith("メガ"),
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
          abilities: c.abilities,
          isMega: c.name.startsWith("メガ"),
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
    const list = onlyMine ? out.filter((r) => r.kind !== "ref") : out;

    /* 絞込みは内定の行にだけ効かせる。自分の個体は「どこに置かれるか」を見るための
       基準線なので、相手を絞った拍子に消えると比較そのものができなくなる。
       自分の個体だけにしたいときは「自分の個体のみ」を使う。 */
    const hit = kanaMatcher(q);
    const matchesRef = (r: SpeedRow): boolean => {
      if (megaMode === "only" && !r.isMega) return false;
      if (megaMode === "not" && r.isMega) return false;
      // タイプは図鑑と同じく AND（選んだタイプをすべて持つ）
      if (typeFilter.length > 0 && !typeFilter.every((t) => r.types?.includes(t))) return false;
      if (ability !== ANY_ABILITY && !r.abilities.includes(ability)) return false;
      if (q.trim() && !hit(r.label)) return false;
      return true;
    };
    return list
      .filter((r) => r.kind !== "ref" || matchesRef(r))
      .sort((a, b) => b.speed - a.speed);
  }, [sortedRoster, scarf, rank, line, onlyMine, q, typeFilter, megaMode, ability]);

  /** 絞込みに出す特性。内定表＋自分の個体に実際に出てくるものだけを、多い順に */
  const abilityOptions = useMemo(() => {
    const count = new Map<string, number>();
    for (const c of CONFIRMED) for (const a of c.abilities) count.set(a, (count.get(a) ?? 0) + 1);
    for (const e of roster) {
      for (const a of splitAbility(e.forms[e.activeForm].ability)) {
        if (!count.has(a)) count.set(a, 0);
      }
    }
    return [...count.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ja"))
      .map(([name, n]) => ({ value: name, label: name, sub: abilitySummary(name) ?? (n > 0 ? `${n}体` : undefined) }));
  }, [roster]);

  /** 内定表に実際に出てくるタイプだけ（18種すべて出るが、将来レギュが変わっても空振りしない） */
  const usedTypes = useMemo(
    () => TYPES.filter((t) => CONFIRMED.some((c) => c.types.includes(t))),
    [],
  );

  const filtered = typeFilter.length > 0 || megaMode !== "all" || ability !== ANY_ABILITY;
  /** 名前検索も含め、内定側を絞っている状態か（注記の出し分けに使う） */
  const narrowing = filtered || q.trim().length > 0;
  const clearFilters = () => { setTypeFilter([]); setMegaMode("all"); setAbility(ANY_ABILITY); };
  /** 畳んだままでも何が効いているか分かるよう、見出しに出す要約 */
  const filterSummary = useMemo(() => {
    const parts: string[] = [];
    if (megaMode !== "all") parts.push(MEGA_MODES.find((m) => m.key === megaMode)?.label ?? "");
    if (ability !== ANY_ABILITY) parts.push(ability);
    if (typeFilter.length > 0) parts.push(typeFilter.join("・"));
    if (q.trim()) parts.push(`「${q.trim()}」`);
    return parts.join(" / ");
  }, [megaMode, ability, typeFilter, q]);
  const toggleType = (t: string) =>
    setTypeFilter((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));

  const marker = (k: Kind) => (k === "team" ? "★ " : k === "bench" ? "◆ " : "");
  const rowClass = (k: Kind) => (k === "team" ? "self-row" : k === "bench" ? "bench-row" : "");

  return (
    <div>
      {/* 個体が多いと縦に長くなり、肝心の比較表まで遠くなるので畳めるようにする */}
      <Panel id="spd.roster" title="手持ち・控えの素早さ設定" summary={`${sortedRoster.length}体`}>
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
              <div className="row tight small spd-rank">
                <span>Sランク</span>
                <StepSlider
                  value={rank[e.key] ?? 0}
                  min={RANK_MIN}
                  max={RANK_MAX}
                  onChange={(v) => setRank((p) => ({ ...p, [e.key]: v }))}
                  format={rankLabel}
                  ariaLabel={`${e.name} のSランク`}
                  valueWidth={34}
                  noSlider
                />
              </div>
            </div>
          );
        })}
      </Panel>

      <Panel
        id="spd.filters"
        title="絞り込み"
        defaultOpen={false}
        summary={narrowing ? filterSummary : "未設定"}
      >
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
          {filtered && <button className="btn small" onClick={clearFilters}>絞込みを解除</button>}
        </div>

        {/* 以下ははがね図鑑と同じ絞込み */}
        <div className="row tight" style={{ marginTop: 8 }}>
          <span className="small muted">メガシンカ</span>
          {MEGA_MODES.map((m) => (
            <button
              key={m.key}
              className={`sort-chip ${megaMode === m.key ? "on" : ""}`}
              aria-pressed={megaMode === m.key}
              onClick={() => setMegaMode(m.key)}
            >
              {m.label}
            </button>
          ))}
        </div>
        <div className="row tight" style={{ marginTop: 8 }}>
          <span className="small muted">特性</span>
          <SelectMenu
            style={{ flex: "1 1 150px", minWidth: 130 }}
            items={[{ value: ANY_ABILITY, label: ANY_ABILITY }, ...abilityOptions]}
            value={ability}
            stacked /* 効果の説明を名前の下に出す */
            onChange={setAbility}
            searchPlaceholder="特性を絞り込み…"
          />
        </div>
        <div className="row tight" style={{ marginTop: 8 }}>
          <span className="small muted" title="選んだタイプをすべて持つポケモンだけ残します">
            タイプで絞る{typeFilter.length > 1 && "（すべて持つ）"}
          </span>
        </div>
        <div className="filter-types" style={{ marginTop: 6 }}>
          {usedTypes.map((t) => (
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

      <div className="panel table-scroll">
        <div className="section-title">
          素早さ比較（{rows.length}件・降順）
          {narrowing && <span className="small muted">　内定{CONFIRMED.length}体から絞込み中</span>}
        </div>
        <div className="small muted" style={{ marginBottom: 6 }}>
          <span className="spd-tag team">★手持ち</span>
          <span className="spd-tag bench">◆控え</span>
          は自分の構成（実数値）。それ以外は内定ポケモンの{line}ライン。
          {narrowing && "　絞込みは内定ポケモンにだけ効きます（自分の個体は基準線として常に表示）。"}
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
