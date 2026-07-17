import { useEffect, useMemo, useState } from "react";
import type { Move, StatBlock, Threat } from "../types";
import { useStore } from "../store";
import { AP_VALUES, NATURES, STAT_KEYS, STAT_LABEL, TYPES, realStats } from "../data/game";
import { CONFIRMED } from "../data/confirmed";
import { MOVE_BY_NAME, MOVE_LIB, sortMovesByType } from "../data/moves";
import {
  computeDamage, effLabel, hazardDamage, koAnalysis, typeEffectiveness,
  type Weather,
} from "../calc";
import { TypeBadges, typeSelectStyle } from "./TypeBadge";
import { displayName } from "../data/roster";
import { MoveEditor, moveOptionsFor } from "./MoveEditor";
import { MoveSelect } from "./MoveSelect";

type Dir = "toThreat" | "toSelf";

const ATK_ITEMS = ["（なし）", "こだわりハチマキ", "こだわりメガネ", "いのちのたま", "たつじんのおび"];
const DEF_ITEMS = ["（なし）", "とつげきチョッキ"];
const ATK_ABILITIES = ["（補正なし）", "てきおうりょく", "かたいツメ", "ちからもち", "ちからずく"];
const DEF_ABILITIES = ["（補正なし）", "フィルター／ハードロック／プリズムアーマー", "マルチスケイル"];
const WEATHERS: Weather[] = ["なし", "にほんばれ", "あまごい"];
const RANKS = [6, 5, 4, 3, 2, 1, 0, -1, -2, -3, -4, -5, -6];

function abilityOptionsWith(base: string, extras: string[]): string[] {
  const own = base.split("/").map((s) => s.trim()).filter(Boolean);
  const out = ["（補正なし）", ...own];
  for (const e of extras) if (!out.includes(e)) out.push(e);
  return [...new Set(out)];
}

export function DamageTab() {
  const { roster } = useStore();
  const [dir, setDir] = useState<Dir>("toThreat");

  const selfList = useMemo(
    () => [...roster].sort((a, b) => (a.starred === b.starred ? 0 : a.starred ? -1 : 1)),
    [roster],
  );
  const [selfKey, setSelfKey] = useState<string>(() => selfList[0]?.key ?? "");
  const self = selfList.find((e) => e.key === selfKey) ?? selfList[0];

  // 仮想敵（内定ポケモンから選択・編集可能なコピー）
  const DEFAULT_THREAT = CONFIRMED.find((c) => c.name === "ガブリアス") ?? CONFIRMED[0];
  const [threatFilter, setThreatFilter] = useState("");
  const [threat, setThreat] = useState<Threat & { nature: string; ap: StatBlock; item: string; ability: string; typeVerified: boolean }>(
    () => ({ name: DEFAULT_THREAT.name, base: { ...DEFAULT_THREAT.base }, types: [...DEFAULT_THREAT.types], nature: "がんばりや（無補正）", ap: { H: 0, A: 0, B: 0, C: 0, D: 0, S: 0 }, item: "（なし）", ability: DEFAULT_THREAT.abilities.join("/"), typeVerified: DEFAULT_THREAT.typeVerified }),
  );
  const threatOptions = useMemo(() => {
    const q = threatFilter.trim();
    const list = q ? CONFIRMED.filter((c) => c.name.includes(q)) : CONFIRMED;
    return list.slice(0, 200);
  }, [threatFilter]);
  const pickThreat = (name: string) => {
    const t = CONFIRMED.find((x) => x.name === name);
    if (!t) return;
    setThreat({ name: t.name, base: { ...t.base }, types: [...t.types], nature: "がんばりや（無補正）", ap: { H: 0, A: 0, B: 0, C: 0, D: 0, S: 0 }, item: "（なし）", ability: t.abilities.join("/"), typeVerified: t.typeVerified });
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
  const [selfMoveName, setSelfMoveName] = useState<string>("");
  const selfMove = selfDamaging.find((m) => m.name === selfMoveName) ?? selfDamaging[0];
  // 威力変動技（ライブラリ威力0）は威力を手入力。技を切り替えたら設定済み威力で初期化。
  const selfVarPower = !!selfMove && selfMove.cat !== "変化"
    && (MOVE_BY_NAME[selfMove.name]?.power ?? selfMove.power) === 0;
  const [selfPow, setSelfPow] = useState(0);
  useEffect(() => {
    setSelfPow(selfMove && selfMove.power > 0 ? selfMove.power : 0);
  }, [selfMove?.name]);
  const selfMoveEff = selfMove && selfVarPower ? { ...selfMove, power: selfPow } : selfMove;
  const [threatMove, setThreatMove] = useState<Move | undefined>(() => ({ ...MOVE_LIB[0] }));

  // 戦闘条件
  const [atkRank, setAtkRank] = useState(0);
  const [defRank, setDefRank] = useState(0);
  const [weather, setWeather] = useState<Weather>("なし");
  const [crit, setCrit] = useState(false);
  const [burn, setBurn] = useState(false);
  const [wall, setWall] = useState(false);
  const [defHPFull, setDefHPFull] = useState(true);
  const [atkItem, setAtkItem] = useState("（なし）");
  const [defItem, setDefItem] = useState("（なし）");
  const [atkAbil, setAtkAbil] = useState("（補正なし）");
  const [defAbil, setDefAbil] = useState("（補正なし）");

  if (!self || !selfForm) {
    return <div className="panel muted">先に「チーム管理」でポケモンを登録してください。</div>;
  }

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

  let result = null as ReturnType<typeof computeDamage>;
  let ko = null as ReturnType<typeof koAnalysis>;
  let atkStatUsed = 0;
  let defStatUsed = 0;
  let eff = 1;

  if (move) {
    const cat = move.cat === "特殊" ? "特殊" : "物理";
    // 攻撃側能力値: ボディプレス系は自分のB
    atkStatUsed = move.useDef ? atkReal.B : cat === "物理" ? atkReal.A : atkReal.C;
    // 防御側能力値: 物理 or 対B技(サイコショック系)は相手B、それ以外はD
    defStatUsed = cat === "物理" || move.targetB ? defReal.B : defReal.D;
    eff = typeEffectiveness(move.type, defTypes);
    result = computeDamage({
      power: move.power,
      atkStat: atkStatUsed,
      defStat: defStatUsed,
      atkRank,
      defRank: move.ignoreDefRank ? 0 : defRank,
      moveType: move.type,
      atkTypes,
      defTypes,
      category: cat,
      item: atkItem === "（なし）" ? "" : atkItem,
      defItem: defItem === "（なし）" ? "" : defItem,
      crit,
      weather,
      burn,
      wall,
      contact: !!move.contact,
      atkAbility: atkAbil === "（補正なし）" ? "" : atkAbil,
      defAbility: defAbil === "（補正なし）" ? "" : defAbil,
      defHPFull,
    });
    if (result && !result.immune) ko = koAnalysis(result.rolls, defHP);
  }

  const srInfo = self ? hazardDamage(defHP, "いわ", defTypes) : 0;

  return (
    <div>
      {/* 方向切替 */}
      <div className="panel">
        <div className="row">
          <button className={`btn ${dir === "toThreat" ? "primary" : ""}`} onClick={() => setDir("toThreat")}>
            与ダメ（自軍 → 仮想敵）
          </button>
          <button className={`btn ${dir === "toSelf" ? "primary" : ""}`} onClick={() => setDir("toSelf")}>
            被ダメ（仮想敵 → 自軍）
          </button>
        </div>
      </div>

      <div className="grid2">
        {/* 自軍 */}
        <div className="panel">
          <div className="section-title">自軍{attackerIsSelf ? "（攻撃）" : "（防御）"}</div>
          <select value={selfKey} onChange={(e) => { setSelfKey(e.target.value); setSelfMoveName(""); }}>
            {selfList.map((e) => (
              <option key={e.key} value={e.key}>
                {e.starred ? "★ " : ""}{displayName(e.name, e.forms[e.activeForm].form)}{e.nickname ? `「${e.nickname}」` : ""}
              </option>
            ))}
          </select>
          <div className="row tight" style={{ marginTop: 6 }}>
            <TypeBadges types={selfForm.types} />
            <span className="small muted">{self.nature.replace(/（.*/, "")} / {self.item || "持ち物なし"}</span>
          </div>
          <StatLine real={selfReal} />
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
                  <input
                    type="number"
                    min={0}
                    value={selfPow}
                    style={{ width: 90 }}
                    onChange={(e) => setSelfPow(Math.max(0, Number(e.target.value) || 0))}
                  />
                </div>
              )}
            </label>
          )}
        </div>

        {/* 仮想敵 */}
        <div className="panel">
          <div className="section-title">仮想敵{attackerIsSelf ? "（防御）" : "（攻撃）"}</div>
          <input
            type="text"
            placeholder="内定ポケモンを名前で絞込み…"
            value={threatFilter}
            onChange={(e) => setThreatFilter(e.target.value)}
            style={{ marginBottom: 4 }}
          />
          <select value={threat.name} onChange={(e) => pickThreat(e.target.value)}>
            {!threatOptions.some((t) => t.name === threat.name) && (
              <option value={threat.name}>{threat.name}（選択中）</option>
            )}
            {threatOptions.map((t) => (
              <option key={`${t.no}-${t.name}`} value={t.name}>
                {t.name}（{t.total}）{t.typeVerified ? "" : " ⚠型未確認"}
              </option>
            ))}
          </select>
          <div className="small muted">{CONFIRMED.length}体の内定ポケモンから選択（種族値・特性はシート準拠）</div>
          {!threat.typeVerified && (
            <div className="banner warn">この個体はチャンピオンズ新規メガ等でタイプが未公表です。素の型を仮採用しています（下で修正可）。</div>
          )}
          <div className="row tight" style={{ marginTop: 6 }}>
            {threat.types.map((t, i) => (
              <select key={i} value={t} style={{ width: "auto", ...typeSelectStyle(t) }}
                onChange={(e) => setThreat((p) => ({ ...p, types: p.types.map((x, j) => (j === i ? e.target.value : x)) }))}>
                {TYPES.map((tp) => (
                  <option key={tp} value={tp}>{tp}</option>
                ))}
              </select>
            ))}
            <button className="btn small" onClick={() => setThreat((p) => ({ ...p, types: p.types.length > 1 ? [p.types[0]] : [...p.types, "ノーマル"] }))}>
              {threat.types.length > 1 ? "単タイプ" : "＋タイプ"}
            </button>
          </div>
          <label className="fld">
            <span>性格</span>
            <select value={threat.nature} onChange={(e) => setThreat((p) => ({ ...p, nature: e.target.value }))}>
              {Object.keys(NATURES).map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <div className="stat-grid" style={{ marginTop: 4 }}>
            <div /><div className="head">種族</div><div className="head">AP</div><div className="head">実数</div>
            {STAT_KEYS.map((k) => (
              <ThreatStatRow key={k} k={k} base={threat.base[k]} ap={threat.ap[k]} real={threatReal[k]}
                onBase={(v) => setThreat((p) => ({ ...p, base: { ...p.base, [k]: v } }))}
                onAP={(v) => setThreat((p) => ({ ...p, ap: { ...p.ap, [k]: Math.max(0, Math.min(32, v)) } }))}
              />
            ))}
          </div>
          {!attackerIsSelf && (
            <div style={{ marginTop: 8 }}>
              <div className="small muted">仮想敵の攻撃技（全ライブラリ＋手動）</div>
              <MoveEditor move={threatMove} options={MOVE_LIB} onChange={setThreatMove} />
            </div>
          )}
        </div>
      </div>

      {/* 戦闘条件 */}
      <div className="panel">
        <div className="section-title">戦闘条件</div>
        <div className="grid3">
          <label className="fld">
            <span>攻撃ランク</span>
            <select value={atkRank} onChange={(e) => setAtkRank(Number(e.target.value))}>
              {RANKS.map((r) => <option key={r} value={r}>{r > 0 ? `+${r}` : r}</option>)}
            </select>
          </label>
          <label className="fld">
            <span>防御ランク{move?.ignoreDefRank ? "（無視技）" : ""}</span>
            <select value={defRank} disabled={!!move?.ignoreDefRank} onChange={(e) => setDefRank(Number(e.target.value))}>
              {RANKS.map((r) => <option key={r} value={r}>{r > 0 ? `+${r}` : r}</option>)}
            </select>
          </label>
          <label className="fld">
            <span>天候</span>
            <select value={weather} onChange={(e) => setWeather(e.target.value as Weather)}>
              {WEATHERS.map((w) => <option key={w} value={w}>{w}</option>)}
            </select>
          </label>
          <label className="fld">
            <span>攻撃側 持ち物</span>
            <select value={atkItem} onChange={(e) => setAtkItem(e.target.value)}>
              {ATK_ITEMS.map((i) => <option key={i} value={i}>{i}</option>)}
            </select>
          </label>
          <label className="fld">
            <span>攻撃側 特性</span>
            <select value={atkAbil} onChange={(e) => setAtkAbil(e.target.value)}>
              {abilityOptionsWith(attackerIsSelf ? selfForm.ability : threat.ability, ATK_ABILITIES).map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </label>
          <label className="fld">
            <span>防御側 持ち物</span>
            <select value={defItem} onChange={(e) => setDefItem(e.target.value)}>
              {DEF_ITEMS.map((i) => <option key={i} value={i}>{i}</option>)}
            </select>
          </label>
          <label className="fld">
            <span>防御側 特性</span>
            <select value={defAbil} onChange={(e) => setDefAbil(e.target.value)}>
              {abilityOptionsWith(attackerIsSelf ? threat.ability : selfForm.ability, DEF_ABILITIES).map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="checks" style={{ marginTop: 4 }}>
          <label><input type="checkbox" checked={crit} onChange={(e) => setCrit(e.target.checked)} />急所</label>
          <label><input type="checkbox" checked={burn} onChange={(e) => setBurn(e.target.checked)} />やけど(物理半減)</label>
          <label><input type="checkbox" checked={wall} onChange={(e) => setWall(e.target.checked)} />壁(リフレク/ひかりのかべ)</label>
          <label><input type="checkbox" checked={defHPFull} onChange={(e) => setDefHPFull(e.target.checked)} />防御側HP満タン(マルチスケイル)</label>
        </div>
      </div>

      {/* 結果 */}
      <div className="panel">
        <div className="section-title">計算結果</div>
        {!move ? (
          <div className="muted">技を選択してください。</div>
        ) : result?.immune ? (
          <div className="stamp">こうかがない（無効）</div>
        ) : result && ko ? (
          <ResultView move={move} ko={ko} eff={eff} rolls={result.rolls} defHP={defHP}
            atkStat={atkStatUsed} defStat={defStatUsed} />
        ) : (
          <div className="muted">威力のある技を選択してください。</div>
        )}
        <div className="banner info" style={{ marginTop: 10 }}>
          参考: ステルスロック着地ダメージ（防御側の1/8×相性 = {(typeEffectiveness("いわ", defTypes)).toString()}倍）＝ <b className="tnum">{srInfo}</b>（{defHP > 0 ? ((srInfo / defHP) * 100).toFixed(1) : "0"}%）
        </div>
        <div className="banner info">
          ※ がんじょう・きあいのタスキ・ばけのかわ等「1発耐え」効果は計算に含みません。威力可変技・連続技も非対応（威力を手動指定してください）。
        </div>
      </div>
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

function ThreatStatRow({ k, base, ap, real, onBase, onAP }: {
  k: keyof StatBlock; base: number; ap: number; real: number;
  onBase: (v: number) => void; onAP: (v: number) => void;
}) {
  return (
    <>
      <div className="lbl">{k}<span className="small muted"> {STAT_LABEL[k]}</span></div>
      <input type="number" min={1} value={base} onChange={(e) => onBase(Math.max(1, Number(e.target.value) || 1))} />
      <select value={ap} onChange={(e) => onAP(Number(e.target.value) || 0)}>
        {AP_VALUES.map((v) => <option key={v} value={v}>{v}</option>)}
      </select>
      <div className="real">{real}</div>
    </>
  );
}

function ResultView({ move, ko, eff, rolls, defHP, atkStat, defStat }: {
  move: Move; ko: NonNullable<ReturnType<typeof koAnalysis>>; eff: number;
  rolls: number[]; defHP: number; atkStat: number; defStat: number;
}) {
  const stampClass = ko.verdict === "確定1発" ? "ko1" : ko.verdict === "確定2発" ? "ko2" : "";
  const remainMinPct = Math.max(0, 100 - ko.maxPct); // 最大ダメ時の残り
  return (
    <div>
      <div className="row" style={{ alignItems: "center", marginBottom: 6 }}>
        <span className={`stamp ${stampClass}`}>{ko.verdict}</span>
        {ko.detail && <span className="amber">{ko.detail}</span>}
        <div className="spacer" />
        <span className="small muted">相性: <b className={eff > 1 ? "ok" : eff < 1 ? "warn" : ""}>{effLabel(eff)}</b></span>
      </div>

      <div className="tnum">
        ダメージ <b style={{ fontSize: 18, color: "var(--steel-hi)" }}>{ko.min} 〜 {ko.max}</b>
        <span className="muted"> （{ko.minPct.toFixed(1)}% 〜 {ko.maxPct.toFixed(1)}%）</span>
      </div>

      {/* HPバー（最大ダメージ時の残量を表示） */}
      <div className="hpbar">
        <div className="remain" style={{ width: `${remainMinPct}%` }} />
        <div className="dmg-max" style={{ left: `${remainMinPct}%`, width: `${Math.min(100, ko.maxPct) - Math.max(0, remainMinPct + ko.maxPct - 100)}%` }} />
        <div className="lbl">最大ダメで残りHP {Math.max(0, defHP - ko.max)} / {defHP}</div>
      </div>

      <div className="small muted">
        使用実数値: {move.useDef ? "防御B" : move.cat === "物理" ? "攻撃A" : "特攻C"} <b className="tnum">{atkStat}</b> → 相手{move.cat === "物理" || move.targetB ? "防御B" : "特防D"} <b className="tnum">{defStat}</b>
        （威力 {move.power} / {move.type} / {move.cat}）
      </div>

      <div className="small muted" style={{ marginTop: 6 }}>16乱数（85〜100%）:</div>
      <div className="rolls">
        {rolls.map((d, i) => <span key={i}>{d}</span>)}
      </div>
    </div>
  );
}
