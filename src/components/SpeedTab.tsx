import { useMemo, useState } from "react";
import type { RosterEntry } from "../types";
import { useStore } from "../store";
import { usePersistedState } from "../uiState";
import { CONFIRMED } from "../data/confirmed";
import { abilitySummary } from "../data/abilities";
import { RANK_MAX, RANK_MIN, TYPES, TYPE_COLORS, calcStat, rankLabel, rankMul, rankMulLabel, realStats } from "../data/game";
import { TypeBadges } from "./TypeBadge";
import { displayName } from "../data/roster";
import { Panel } from "./Panel";
import { Segmented } from "./Segmented";
import { SelectMenu } from "./SelectMenu";
import { StepSlider } from "./StepSlider";
import { ApBudgetBar, ApEditor } from "./ApEditor";
import { kanaMatcher } from "../search";

type RefLine = "最速" | "準速" | "無振り";
type Kind = "team" | "bench" | "ref";

interface SpeedRow {
  key: string;
  label: string;
  detail: string;
  /** 実数値から変えている条件（スカーフ・Sランク）。実効Sが実数値と違う理由なので目立たせる */
  mods?: string;
  types?: string[];
  /** 特性の候補（絞り込み用。個体として選んでいる1つではない） */
  abilities: string[];
  isMega: boolean;
  speed: number;
  kind: Kind;
}

/** メガ絞り込み。はがね図鑑と同じ考え方だが、内定表はメガを別の行として持つので
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

/** 抜きたい相手に対して、Sに何AP振れば抜けるか（同速はいくつか）を出す。
 *  スカーフ・Sランクは比較表と同じくこの画面の仮定を使う。性格は個体のまま */
function SpeedNeed({ entry, targetName, targetSpeed, speedAt, onApply }: {
  entry: RosterEntry;
  targetName: string;
  targetSpeed: number;
  speedAt: (sAp: number) => number;
  onApply: (sAp: number) => void;
}) {
  const cur = entry.ap.S;
  // 0〜32 を順に見るだけ（33通り）。素早さは振るほど上がるので最初に超えた値が最小
  let faster: number | null = null, tie: number | null = null;
  for (let k = 0; k <= 32; k++) {
    const sp = speedAt(k);
    if (tie === null && sp === targetSpeed) tie = k;
    if (sp > targetSpeed) { faster = k; break; }
  }
  const others = (Object.keys(entry.ap) as (keyof typeof entry.ap)[])
    .filter((k) => k !== "S").reduce((sum, k) => sum + entry.ap[k], 0);
  const room = 66 - others; // S に回せる上限
  const nowSpeed = speedAt(cur);

  let text: string;
  let cls = "";
  if (faster === null) {
    text = `S32でも ${speedAt(32)} で届きません`;
    cls = "warn";
  } else if (nowSpeed > targetSpeed) {
    text = `今のまま抜けます（最小 S${faster}${faster < cur ? `、${cur - faster} AP 浮く` : ""}）`;
    cls = "ok";
  } else if (faster > room) {
    text = `S${faster} 必要。ほかに ${others} 振っているので S は ${room} まで（あと ${faster - room} 足りない）`;
    cls = "warn";
  } else {
    text = `S${faster} で抜けます（今 S${cur} → あと ${faster - cur}）`;
  }
  const canApply = faster !== null && faster <= room && faster !== cur && !entry.apLocked;
  return (
    <div className="spd-need small">
      <span className="muted">{targetName}（{targetSpeed}）を抜く: </span>
      <span className={cls}>{text}</span>
      {/* 抜けないときも、同速までは届くなら知らせる（同速は半々で先手） */}
      {tie !== null && (faster === null || tie < faster) && (
        <span className="muted">。S{tie} だと同速</span>
      )}
      {canApply && (
        <button
          type="button"
          className="btn small"
          style={{ marginLeft: 6 }}
          onClick={() => {
            if (faster === null) return;
            if (faster < cur && !confirm(`S の AP を ${cur}→${faster} に下げます。よろしいですか？`)) return;
            onApply(faster);
          }}
        >
          S{faster}にする
        </button>
      )}
    </div>
  );
}

export function SpeedTab() {
  const { roster, updateEntry } = useStore();
  // 個体ごとの スカーフ / ランク設定（リロードしても残す）
  const isObj = (v: unknown) => !!v && typeof v === "object" && !Array.isArray(v);
  const [scarf, setScarf] = usePersistedState<Record<string, boolean>>("spd.scarf", {}, isObj);
  const [rank, setRank] = usePersistedState<Record<string, number>>("spd.rank", {}, isObj);
  // 内定リファレンスの素早さライン
  const [line, setLine] = usePersistedState<RefLine>(
    "spd.line", "最速", (v) => v === "最速" || v === "準速" || v === "無振り");
  const [onlyMine, setOnlyMine] = usePersistedState("spd.onlyMine", false, (v) => typeof v === "boolean");
  // 抜きたい相手（素早さの逆算）。空文字なら未設定
  const [target, setTarget] = usePersistedState<string>(
    "spd.target", "", (v) => typeof v === "string" && (v === "" || CONFIRMED.some((c) => c.name === v)));
  const [targetLine, setTargetLine] = usePersistedState<RefLine>(
    "spd.targetLine", "最速", (v) => v === "最速" || v === "準速" || v === "無振り");
  const [targetScarf, setTargetScarf] = usePersistedState("spd.targetScarf", false, (v) => typeof v === "boolean");
  // 素早さ設定で開いている個体（key）。既定は全部畳む＝比較表までを短く
  const [openRows, setOpenRows] = usePersistedState<string[]>(
    "spd.open", [], (v) => Array.isArray(v) && v.every((x) => typeof x === "string"));
  const toggleRow = (key: string) =>
    setOpenRows((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  // 絞り込みは保存しない（開いた時に何も出ない状態になるのを避ける）
  const [q, setQ] = useState("");
  // はがね図鑑と同じ絞り込み。こちらも保存しない（何も出ない状態で開くのを避ける）
  const [typeFilter, setTypeFilter] = useState<string[]>([]);
  const [megaMode, setMegaMode] = useState<MegaMode>("all");
  const [ability, setAbility] = useState(ANY_ABILITY);

  // 手持ち(★)→控えの順に全個体
  const sortedRoster = useMemo(
    () => [...roster].sort((a, b) => (a.starred === b.starred ? 0 : a.starred ? -1 : 1)),
    [roster],
  );

  /** 個体の素早さ。S の AP だけ差し替えて計算できる（逆算用）。
   *  スカーフ・Sランクはこの画面の設定を使う（比較表と同じ数え方） */
  const effSpeed = (e: RosterEntry, sAp: number): number => {
    const form = e.forms[e.activeForm];
    let s = realStats(form.base, { ...e.ap, S: sAp }, e.nature).S;
    if (scarf[e.key]) s = Math.floor(s * 1.5);
    return rankMul(s, rank[e.key] ?? 0);
  };
  const targetMon = CONFIRMED.find((c) => c.name === target);
  const targetSpeed = targetMon
    ? (targetScarf ? Math.floor(refSpeed(targetMon.base.S, targetLine) * 1.5) : refSpeed(targetMon.base.S, targetLine))
    : 0;

  const rosterRow = (e: RosterEntry): SpeedRow => {
    const form = e.forms[e.activeForm];
    const base = realStats(form.base, e.ap, e.nature).S;
    let s = base;
    if (scarf[e.key]) s = Math.floor(s * 1.5);
    s = rankMul(s, rank[e.key] ?? 0);
    const mods: string[] = [];
    if (scarf[e.key]) mods.push("スカーフ×1.5");
    const r = rank[e.key] ?? 0;
    if (r !== 0) mods.push(`S${rankLabel(r)}(${rankMulLabel(r)})`);
    return {
      key: e.key,
      label: `${displayName(e.name, form.form)}${e.nickname ? `「${e.nickname}」` : ""}`,
      detail: `実数値${base}`,
      mods: mods.length ? mods.join(" ") : undefined,
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

    /* 絞り込みは内定の行にだけ効かせる。自分の個体は「どこに置かれるか」を見るための
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

  /** 絞り込みに出す特性。内定表＋自分の個体に実際に出てくるものだけを、多い順に */
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

  /** Sランクを0以外にしている個体。ランクは保存されるので、いつ変えたか忘れていても
   *  「実数値が高いのに下にいる」理由が分かるよう、表の上に出して一括で戻せるようにする */
  const rankedMons = sortedRoster.filter((e) => (rank[e.key] ?? 0) !== 0);
  const resetRanks = () => setRank({});

  /** 比較表の自分の行へ飛び、少しのあいだ光らせる */
  const [flash, setFlash] = useState<string | null>(null);
  const jumpTo = (key: string) => {
    document.getElementById(`spd-row-${key}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    setFlash(key);
    window.setTimeout(() => setFlash((k) => (k === key ? null : k)), 1600);
  };

  const marker = (k: Kind) => (k === "team" ? "★ " : k === "bench" ? "◆ " : "");
  const rowClass = (k: Kind) => (k === "team" ? "self-row" : k === "bench" ? "bench-row" : "");

  return (
    <div>
      {/* 個体が多いと縦に長くなり、肝心の比較表まで遠くなるので畳めるようにする */}
      <Panel
        id="spd.roster"
        title="手持ち・控えの素早さ設定"
        summary={`${sortedRoster.length}体${rankedMons.length ? `・Sランク変更${rankedMons.length}体` : ""}`}
      >
        {sortedRoster.length === 0 && <div className="muted small">個体がいません。チーム管理で登録してください。</div>}
        {sortedRoster.length > 0 && (
          <div className="spd-target">
            <div className="small muted">抜きたい相手（各個体に、抜くのに要るSのAPを出します）</div>
            <SelectMenu
              items={[{ value: "", label: "（選ばない）" }, ...CONFIRMED.map((c) => ({ value: c.name, label: c.name, sub: `S${c.base.S}` }))]}
              value={target}
              onChange={setTarget}
              searchable
              searchPlaceholder="内定ポケモンを名前で絞り込み…"
            />
            {targetMon && (
              <div className="row tight" style={{ marginTop: 6 }}>
                <Segmented
                  ariaLabel="抜きたい相手の素早さライン"
                  style={{ flex: "0 1 220px" }}
                  options={(["最速", "準速", "無振り"] as RefLine[]).map((l) => ({ value: l, label: l }))}
                  value={targetLine}
                  onChange={setTargetLine}
                />
                <label className="row tight small" style={{ cursor: "pointer" }}>
                  <input type="checkbox" checked={targetScarf} onChange={(ev) => setTargetScarf(ev.target.checked)} />
                  スカーフ
                </label>
                <span className="small tnum">→ 実数値S <b>{targetSpeed}</b></span>
              </div>
            )}
          </div>
        )}
        {sortedRoster.length > 0 && (
          <div className="small muted" style={{ marginBottom: 4 }}>
            スカーフ・Sランクはこの画面だけの仮定です。APを変えた場合は、
            この個体（チーム管理の手持ち・控え）にそのまま保存されます。
          </div>
        )}
        {/* 1体を1行にまとめ、スカーフ・Sランク・APはタップで開いて変える。
            全部開いたままだと7体で画面3枚ぶんになり、比較表まで遠かった。
            抜きたい相手を選んでいるときの「要るS」は、畳んでいても出す。 */}
        {sortedRoster.map((e) => {
          const form = e.forms[e.activeForm];
          const base = realStats(form.base, e.ap, e.nature).S;
          const isOpen = openRows.includes(e.key);
          const r = rank[e.key] ?? 0;
          const mods = [scarf[e.key] && "スカーフ×1.5", r !== 0 && `S${rankLabel(r)}(${rankMulLabel(r)})`].filter(Boolean).join(" ");
          return (
            <div key={e.key} className="spd-mon">
              <button
                type="button"
                className="card-toggle"
                aria-expanded={isOpen}
                onClick={() => toggleRow(e.key)}
              >
                <span className={`card-caret ${isOpen ? "open" : ""}`}>▶</span>
                <span className="card-head">
                  <span>
                    <span className={`spd-tag ${e.starred ? "team" : "bench"}`}>{e.starred ? "★手持ち" : "◆控え"}</span>
                    <b style={{ color: "var(--steel-hi)" }}>{displayName(e.name, form.form)}</b>
                    {e.nickname && <span className="small muted">「{e.nickname}」</span>}
                  </span>
                  <span className="small muted tnum">
                    実数値S {base}・AP {e.ap.S}
                    {mods && <span className="amber"> → {mods} ＝ {effSpeed(e, e.ap.S)}</span>}
                  </span>
                </span>
              </button>
              {isOpen && (
                <div className="spd-mon-body">
                  <div className="row">
                    <label className="row tight small" style={{ cursor: "pointer" }}>
                      <input type="checkbox" checked={!!scarf[e.key]} onChange={(ev) => setScarf((p) => ({ ...p, [e.key]: ev.target.checked }))} />
                      こだわりスカーフ
                    </label>
                    <div className="row tight small spd-rank">
                      <span>Sランク</span>
                      <StepSlider
                        value={r}
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
                  {/* 「あと何振れば抜けるか」を見ながらその場で振れるようにする。
                      書き込み先は個体そのものなので、手持ち・控えにそのまま残る。
                      ここはSしか出さないので、＋が押せない理由（残りAP0）が分かるよう
                      残量バーも添える。振り直しは他の能力も見えるチーム管理で。 */}
                  <ApBudgetBar entry={e} />
                  <ApEditor entry={e} keys={["S"]} />
                </div>
              )}
              {targetMon && (
                <SpeedNeed
                  entry={e}
                  targetName={`${targetMon.name}（${targetLine}${targetScarf ? "・スカーフ" : ""}）`}
                  targetSpeed={targetSpeed}
                  speedAt={(k) => effSpeed(e, k)}
                  onApply={(k) => updateEntry(e.key, (en) => ({ ...en, ap: { ...en.ap, S: k } }))}
                />
              )}
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
          <div className="row tight small" style={{ flex: "1 1 260px" }}>
            内定の素早さライン
            <Segmented
              ariaLabel="内定の素早さライン"
              style={{ flex: "1 1 200px" }}
              options={[
                { value: "最速", label: "最速", sub: "S↑/AP32" },
                { value: "準速", label: "準速", sub: "無補正/AP32" },
                { value: "無振り", label: "無振り", sub: "AP0" },
              ] as { value: RefLine; label: string; sub: string }[]}
              value={line}
              onChange={setLine}
            />
          </div>
          <label className="row tight small" style={{ cursor: "pointer" }}>
            <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} />
            自分の個体のみ
          </label>
          <input
            type="text"
            placeholder="名前で絞り込み…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ flex: "1 1 140px" }}
          />
          {filtered && <button className="btn small" onClick={clearFilters}>絞り込みを解除</button>}
        </div>

        {/* 以下ははがね図鑑と同じ絞り込み */}
        <div className="row tight" style={{ marginTop: 8 }}>
          <span className="small muted">メガシンカ</span>
          <Segmented
            ariaLabel="メガシンカ"
            style={{ flex: "1 1 220px" }}
            options={MEGA_MODES.map((m) => ({ value: m.key, label: m.label }))}
            value={megaMode}
            onChange={setMegaMode}
          />
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

      {/* 比較表。353行と長いので、自分の個体の行へ飛ぶボタンを上に置く。
          見出し行は画面上部に貼り付く（横スクロールの箱に入れると貼り付かないので入れない） */}
      <Panel
        id="spd.table"
        title="素早さ比較"
        summary={`${rows.length}件・降順・内定は${line}${narrowing ? "・絞り込み中" : ""}`}
      >
        {rows.some((r) => r.kind !== "ref") && (
          <div className="spd-jump">
            <span className="small muted">自分の位置へ</span>
            {rows.filter((r) => r.kind !== "ref").map((r) => (
              <button
                key={r.key}
                type="button"
                className={`sort-chip ${r.kind}`}
                onClick={() => jumpTo(r.key)}
              >
                {marker(r.kind)}{r.label.replace(/「.*」$/, "")} <b className="tnum">{r.speed}</b>
              </button>
            ))}
          </div>
        )}
        <div className="small muted" style={{ marginBottom: 6 }}>
          <span className="spd-tag team">★手持ち</span>
          <span className="spd-tag bench">◆控え</span>
          は自分の構成（実数値）。それ以外は内定ポケモンの{line}ライン。
          {narrowing && "　絞り込みは内定ポケモンにだけ効きます（自分の個体は基準線として常に表示）。"}
        </div>
        {rankedMons.length > 0 && (
          <div className="banner warn row tight" style={{ marginBottom: 6 }}>
            <span style={{ flex: "1 1 200px" }}>
              Sランクを変えている個体があります（実効Sはランク込み）：
              {rankedMons.map((e) => `${displayName(e.name, e.forms[e.activeForm].form)} S${rankLabel(rank[e.key])}`).join("、")}
            </span>
            <button type="button" className="btn small" onClick={resetRanks}>Sランクをすべて0に戻す</button>
          </div>
        )}
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
              <tr key={r.key} id={`spd-row-${r.key}`} className={`${rowClass(r.kind)} ${flash === r.key ? "flash" : ""}`}>
                <td className="num"><b className={r.kind !== "ref" ? "me" : ""}>{r.speed}</b></td>
                <td>
                  <div className={r.kind !== "ref" ? "me" : ""}>{marker(r.kind)}{r.label}</div>
                  <div className="row tight spd-meta">
                    <span className="small muted">{r.detail}</span>
                    {r.mods && <span className="small amber">→ {r.mods}</span>}
                    {r.types && <TypeBadges types={r.types} />}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}
