import { useMemo } from "react";
import type { StatBlock, StatKey } from "../types";
import {
  CHART, NATURES, STAT_KEYS, STAT_LABEL, TYPES, TYPE_COLORS,
  AP_MAX_EACH, AP_MAX_TOTAL, realStats,
} from "../data/game";
import { CONFIRMED } from "../data/confirmed";
import { typeEffectiveness } from "../calc";
import { usePersistedState } from "../uiState";
import { NumberInput } from "./NumberInput";
import { SelectMenu } from "./SelectMenu";
import { TypeMatchup, matchupOf } from "./TypeMatchup";
import { Panel } from "./Panel";
import { Segmented } from "./Segmented";
import { AppInfo } from "./AppInfo";

/* ============================================================
   汎用ツール。特定のチームや図鑑に紐づかない、タイプ相性・実数値まわりの
   道具をここにまとめる。チーム管理タブの「攻撃範囲チェック」が★手持ち全体を
   見るのに対し、こちらは任意のタイプ・種族値を手で入れて単体で見るためのもの。
   ============================================================ */

type ToolId = "coverage" | "defense" | "chart" | "stats";
const TOOLS: { id: ToolId; label: string; desc: string }[] = [
  { id: "coverage", label: "攻撃範囲", desc: "技のタイプを最大4つ選び、全タイプへの通りを見ます。" },
  { id: "defense", label: "防御相性", desc: "タイプを1〜2つ選び、そのタイプが受ける相性を見ます。" },
  { id: "chart", label: "タイプ相性表", desc: "18タイプの相性を一覧します。縦＝攻撃側、横＝防御側。" },
  { id: "stats", label: "実数値計算", desc: "種族値・AP・性格から実数値を出します（Lv50・個体値31）。" },
];

/** タイプ相性表の列見出し用の1文字略号（慣用の漢字表記） */
const TYPE_ABBR: Record<string, string> = {
  "ノーマル": "無", "ほのお": "炎", "みず": "水", "でんき": "電", "くさ": "草", "こおり": "氷",
  "かくとう": "闘", "どく": "毒", "じめん": "地", "ひこう": "飛", "エスパー": "超", "むし": "虫",
  "いわ": "岩", "ゴースト": "霊", "ドラゴン": "竜", "あく": "悪", "はがね": "鋼", "フェアリー": "妖",
};

/** 倍率の表示（攻撃・防御で共通） */
function mulLabel(m: number): string {
  if (m === 0) return "0";
  if (m >= 4) return "×4";
  if (m > 1) return "×2";
  if (m === 1) return "—";
  if (m <= 0.25) return "¼";
  return "½";
}
/** 打点としての色分け（抜群＝緑＝良い）。CoverageTable と同じ意味づけ */
function atkClass(m: number): string {
  if (m === 0) return "cv-imm";
  if (m >= 4) return "cv-x4";
  if (m > 1) return "cv-x2";
  if (m === 1) return "cv-n";
  if (m <= 0.25) return "cv-q";
  return "cv-h";
}

const isTypeList = (max: number) => (v: unknown) =>
  Array.isArray(v) && v.length <= max && v.every((x) => typeof x === "string" && TYPES.includes(x));

export function ToolsTab() {
  const [tool, setTool] = usePersistedState<ToolId>(
    "tools.id", "coverage", (v) => TOOLS.some((t) => t.id === v));
  const current = TOOLS.find((t) => t.id === tool) ?? TOOLS[0];

  return (
    <div>
      {/* 画面内の切替はカードで囲まず、タブのすぐ下に置く（ダメージ計算の与ダメ／被ダメと同じ） */}
      <Segmented
        size="lg"
        ariaLabel="ツールの種類"
        style={{ margin: "12px 0 0" }}
        options={TOOLS.map((t) => ({ value: t.id, label: t.label }))}
        value={tool}
        onChange={setTool}
      />
      <div className="small muted" style={{ margin: "6px 2px 0" }}>{current.desc}</div>

      {/* 各ツールは常時マウントせず、選ばれたものだけ描く。
          入力は usePersistedState で保存しているので切り替えても消えない */}
      {tool === "coverage" && <CoverageTool />}
      {tool === "defense" && <DefenseTool />}
      {tool === "chart" && <ChartTool />}
      {tool === "stats" && <StatsTool />}

      <AppInfo />
    </div>
  );
}

/** 選んだタイプを並べるボタン群。上限に達したら未選択のものを押せなくする */
function TypePicker({
  value, onToggle, max, all = TYPES,
}: { value: string[]; onToggle: (t: string) => void; max: number; all?: string[] }) {
  return (
    <div className="filter-types" style={{ marginTop: 6 }}>
      {all.map((t) => {
        const on = value.includes(t);
        return (
          <button
            key={t}
            className={on ? "on" : ""}
            disabled={!on && value.length >= max}
            style={{ background: TYPE_COLORS[t], color: "#14171c" }}
            onClick={() => onToggle(t)}
          >
            {t}
          </button>
        );
      })}
    </div>
  );
}

/* ---------- ① 攻撃範囲（技のタイプ最大4つ） ---------- */
const MAX_ATK_TYPES = 4;

function CoverageTool() {
  const [picked, setPicked] = usePersistedState<string[]>(
    "tools.cov", [], isTypeList(MAX_ATK_TYPES));
  const toggle = (t: string) =>
    setPicked((prev) => (prev.includes(t)
      ? prev.filter((x) => x !== t)
      : prev.length >= MAX_ATK_TYPES ? prev : [...prev, t]));

  /** 単タイプ18種それぞれへの、選んだタイプのうち最も良い倍率 */
  const rows = useMemo(() => TYPES.map((t) => {
    const each = picked.map((mt) => ({ type: mt, mul: typeEffectiveness(mt, [t]) }));
    const best = each.length === 0 ? 1 : Math.max(...each.map((e) => e.mul));
    return { type: t, best, by: each.filter((e) => e.mul === best).map((e) => e.type) };
  }), [picked]);

  const tally = useMemo(() => ({
    sup: rows.filter((r) => r.best > 1).length,
    neu: rows.filter((r) => r.best === 1).length,
    res: rows.filter((r) => r.best < 1 && r.best > 0).length,
    imm: rows.filter((r) => r.best === 0).length,
  }), [rows]);

  /** 内定ポケモン（複合タイプ込み）への通り。単タイプだけ見ても実戦の当たりは分からない */
  const vs = useMemo(() => {
    if (picked.length === 0) return null;
    const noSuper: string[] = [];
    let sup = 0;
    for (const c of CONFIRMED) {
      const best = Math.max(...picked.map((mt) => typeEffectiveness(mt, c.types)));
      if (best > 1) sup += 1; else noSuper.push(c.name);
    }
    return { sup, noSuper };
  }, [picked]);

  const blind = rows.filter((r) => r.best <= 1).map((r) => r.type);

  return (
    <Panel id="tools.coverage" title="攻撃範囲チェック（単体）" summary={picked.length ? picked.join("・") : "未選択"}>
      <div className="row tight">
        <span className="small muted">技のタイプ（最大{MAX_ATK_TYPES}）</span>
        <span className="small">{picked.length} / {MAX_ATK_TYPES}</span>
        {picked.length > 0 && (
          <button className="btn small" onClick={() => setPicked([])}>選択を解除</button>
        )}
      </div>
      <TypePicker value={picked} onToggle={toggle} max={MAX_ATK_TYPES} />

      {picked.length === 0 ? (
        <div className="small muted" style={{ marginTop: 8 }}>
          タイプを選ぶと、18タイプそれぞれへの通りと、内定{CONFIRMED.length}体への通りを出します。
        </div>
      ) : (
        <>
          <div className="banner info" style={{ marginTop: 8 }}>
            単タイプ18種のうち　抜群 <b>{tally.sup}</b>／等倍 {tally.neu}／半減 {tally.res}／無効 {tally.imm}
          </div>
          {blind.length > 0 && (
            <div className="banner warn">抜群を取れないタイプ: {blind.join(" / ")}</div>
          )}
          {vs && (
            <div className="banner info">
              内定{CONFIRMED.length}体のうち <b>{vs.sup}体</b>（
              {Math.round((vs.sup / CONFIRMED.length) * 100)}%）に抜群を取れます。
              {vs.noSuper.length > 0 && (
                <>
                  {" "}抜群なし {vs.noSuper.length}体:{" "}
                  <span className="muted">
                    {vs.noSuper.slice(0, 12).join("・")}
                    {vs.noSuper.length > 12 && ` ほか${vs.noSuper.length - 12}体`}
                  </span>
                </>
              )}
            </div>
          )}

          <div className="table-scroll" style={{ marginTop: 6 }}>
            <table className="wk cv">
              <thead>
                <tr><th>相手タイプ</th><th className="num">倍率</th><th>最も通る技</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.type}>
                    <td>
                      <span className="tbadge" style={{ background: TYPE_COLORS[r.type] }}>{r.type}</span>
                    </td>
                    <td className={`num ${atkClass(r.best)}`}>{mulLabel(r.best)}</td>
                    <td className="small muted">{r.by.join("・")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="small muted" style={{ marginTop: 6 }}>
            選んだタイプのうち最も相性の良い倍率です。特性（もらいび・ふゆう等）による無効化や、
            技の威力・実数値は考慮しません。
          </div>
        </>
      )}
    </Panel>
  );
}

/* ---------- ② 防御相性（自分のタイプ1〜2つ） ---------- */
const MAX_DEF_TYPES = 2;

function DefenseTool() {
  const [picked, setPicked] = usePersistedState<string[]>(
    "tools.def", [], isTypeList(MAX_DEF_TYPES));
  const toggle = (t: string) =>
    setPicked((prev) => (prev.includes(t)
      ? prev.filter((x) => x !== t)
      : prev.length >= MAX_DEF_TYPES ? prev : [...prev, t]));

  const groups = useMemo(
    () => (picked.length === 0 ? null : matchupOf(picked)),
    [picked],
  );

  return (
    <Panel id="tools.defense" title="防御相性チェック" summary={picked.length ? picked.join("・") : "未選択"}>
      <div className="row tight">
        <span className="small muted">自分のタイプ（最大{MAX_DEF_TYPES}）</span>
        <span className="small">{picked.length} / {MAX_DEF_TYPES}</span>
        {picked.length > 0 && (
          <button className="btn small" onClick={() => setPicked([])}>選択を解除</button>
        )}
      </div>
      <TypePicker value={picked} onToggle={toggle} max={MAX_DEF_TYPES} />

      {!groups ? (
        <div className="small muted" style={{ marginTop: 8 }}>
          タイプを選ぶと、受ける側の相性を倍率ごとにまとめます。
        </div>
      ) : (
        <>
          <div className="banner info" style={{ marginTop: 8 }}>
            弱点 <b>{groups.x4.length + groups.x2.length}</b>／半減以下{" "}
            <b>{groups.h.length + groups.q.length + groups.z.length}</b>
          </div>
          <TypeMatchup types={picked} showEmpty showNeutral />
          <div className="small muted" style={{ marginTop: 6 }}>
            タイプ相性のみです。特性（ふゆう・もらいび・ぼうおん等）やもちものは考慮しません。
          </div>
        </>
      )}
    </Panel>
  );
}

/* ---------- ③ タイプ相性表 ---------- */
function ChartTool() {
  return (
    <Panel id="tools.chart" title="タイプ相性表" summary="18タイプ">
      <div className="small muted">縦＝攻撃側、横＝防御側。空欄は等倍。</div>
      <div className="table-scroll" style={{ marginTop: 6 }}>
        <table className="wk cv chart">
          <thead>
            <tr>
              <th>攻＼防</th>
              {TYPES.map((t) => (
                <th key={t} className="num" title={t}>
                  <span className="tabbr" style={{ background: TYPE_COLORS[t] }}>{TYPE_ABBR[t]}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {TYPES.map((a) => (
              <tr key={a}>
                <td><span className="tbadge" style={{ background: TYPE_COLORS[a] }}>{a}</span></td>
                {TYPES.map((d) => {
                  const m = CHART[a]?.[d] ?? 1;
                  return (
                    <td key={d} className={`num ${m === 1 ? "" : atkClass(m)}`} title={`${a} → ${d}`}>
                      {m === 1 ? "" : mulLabel(m)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

/* ---------- ④ 実数値計算 ---------- */
const ZERO: StatBlock = { H: 0, A: 0, B: 0, C: 0, D: 0, S: 0 };
const isStatBlock = (v: unknown) =>
  !!v && typeof v === "object" && STAT_KEYS.every((k) => typeof (v as StatBlock)[k] === "number");

function StatsTool() {
  const [base, setBase] = usePersistedState<StatBlock>(
    "tools.base", { H: 100, A: 100, B: 100, C: 100, D: 100, S: 100 }, isStatBlock);
  const [ap, setAp] = usePersistedState<StatBlock>("tools.ap", { ...ZERO }, isStatBlock);
  const [nature, setNature] = usePersistedState(
    "tools.nature", "がんばりや（無補正）", (v) => typeof v === "string" && v in NATURES);

  const real = useMemo(() => realStats(base, ap, nature), [base, ap, nature]);
  const apTotal = STAT_KEYS.reduce((n, k) => n + ap[k], 0);
  const nat = NATURES[nature] ?? {};

  const set = (
    setter: typeof setBase, k: StatKey, max: number,
  ) => (v: number) => setter((prev) => ({ ...prev, [k]: Math.min(max, Math.max(0, v)) }));

  return (
    <Panel id="tools.stats" title="実数値計算" summary={`Lv50・個体値31・${nature.replace(/（.*/, "")}`}>
      <label className="fld">
        <span>性格</span>
        <SelectMenu
          items={Object.keys(NATURES).map((n) => ({ value: n, label: n }))}
          value={nature}
          onChange={setNature}
        />
      </label>
      <div className={`small ${apTotal > AP_MAX_TOTAL ? "warn-text" : "muted"}`} style={{ margin: "6px 0" }}>
        AP合計 {apTotal} / {AP_MAX_TOTAL}
        {apTotal > AP_MAX_TOTAL && "（上限を超えています）"}
      </div>
      <div className="table-scroll">
        <table className="wk">
          <thead>
            <tr><th>能力</th><th className="num">種族値</th><th className="num">AP</th><th className="num">実数値</th></tr>
          </thead>
          <tbody>
            {STAT_KEYS.map((k) => (
              <tr key={k}>
                <td>
                  {STAT_LABEL[k]}
                  {nat.up === k && <span className="amber small"> ↑</span>}
                  {nat.down === k && <span className="small" style={{ color: "var(--red)" }}> ↓</span>}
                </td>
                <td className="num">
                  <NumberInput className="tool-num" value={base[k]} min={1} max={255}
                    onChange={set(setBase, k, 255)} />
                </td>
                <td className="num">
                  <NumberInput className="tool-num" value={ap[k]} min={0} max={AP_MAX_EACH}
                    onChange={set(setAp, k, AP_MAX_EACH)} />
                </td>
                <td className="num"><b>{real[k]}</b></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="small muted" style={{ marginTop: 6 }}>
        チャンピオンズの配分（AP 各{AP_MAX_EACH}・合計{AP_MAX_TOTAL}まで）で計算します。
        性格補正は攻撃〜素早さに ×1.1／×0.9。HPには掛かりません。
      </div>
    </Panel>
  );
}
