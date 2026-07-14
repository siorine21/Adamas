import { useMemo, useState } from "react";
import { useStore } from "../store";
import { THREATS } from "../data/dex";
import { calcStat, rankMul, realStats } from "../data/game";
import { TypeBadges } from "./TypeBadge";

interface SpeedRow {
  label: string;
  detail: string;
  types?: string[];
  speed: number;
  self: boolean;
  key: string;
}

// 環境レポケモンの速度ライン（最速 / 準速 / 無振り）
const THREAT_LINES: SpeedRow[] = THREATS
  .filter((t) => t.name !== "手動入力")
  .flatMap((t) => [
    { key: `${t.name}-fast`, label: t.name, detail: "最速(S↑/AP32)", types: t.types, speed: calcStat(t.base.S, 32, 1.1), self: false },
    { key: `${t.name}-mid`, label: t.name, detail: "準速(無補正/AP32)", types: t.types, speed: calcStat(t.base.S, 32, 1.0), self: false },
    { key: `${t.name}-none`, label: t.name, detail: "無振り(AP0)", types: t.types, speed: calcStat(t.base.S, 0, 1.0), self: false },
  ]);

export function SpeedTab() {
  const { roster } = useStore();
  const starred = roster.filter((e) => e.starred);
  // 個体ごとの スカーフ / ランク設定
  const [scarf, setScarf] = useState<Record<string, boolean>>({});
  const [rank, setRank] = useState<Record<string, number>>({});

  const myRows: SpeedRow[] = useMemo(() =>
    starred.map((e) => {
      const form = e.forms[e.activeForm];
      const base = realStats(form.base, e.ap, e.nature).S;
      let s = base;
      if (scarf[e.key]) s = Math.floor(s * 1.5);
      s = rankMul(s, rank[e.key] ?? 0);
      const tags: string[] = [];
      if (scarf[e.key]) tags.push("スカーフ");
      if ((rank[e.key] ?? 0) !== 0) tags.push(`S${(rank[e.key] ?? 0) > 0 ? "+" : ""}${rank[e.key]}`);
      return {
        key: e.key,
        label: `${e.name}${e.nickname ? `「${e.nickname}」` : ""}`,
        detail: `実数${base}${tags.length ? " / " + tags.join(" ") : ""}`,
        types: form.types,
        speed: s,
        self: true,
      };
    }), [starred, scarf, rank]);

  const merged = useMemo(
    () => [...myRows, ...THREAT_LINES].sort((a, b) => b.speed - a.speed),
    [myRows],
  );

  const RANKS = [6, 5, 4, 3, 2, 1, 0, -1, -2, -3, -4, -5, -6];

  return (
    <div>
      <div className="panel">
        <div className="section-title">★手持ちの素早さ設定</div>
        {starred.length === 0 && <div className="muted small">★手持ちがいません。チーム管理で登録してください。</div>}
        {starred.map((e) => {
          const form = e.forms[e.activeForm];
          const base = realStats(form.base, e.ap, e.nature).S;
          return (
            <div className="row" key={e.key} style={{ padding: "6px 0", borderBottom: "1px solid var(--line)" }}>
              <div style={{ flex: "1 1 160px" }}>
                <b style={{ color: "var(--steel-hi)" }}>{e.name}</b>
                {e.nickname && <span className="small muted">「{e.nickname}」</span>}
                <span className="small muted tnum"> 実数S {base}</span>
              </div>
              <label className="row tight small" style={{ cursor: "pointer" }}>
                <input type="checkbox" checked={!!scarf[e.key]} onChange={(ev) => setScarf((p) => ({ ...p, [e.key]: ev.target.checked }))} />
                こだわりスカーフ
              </label>
              <label className="row tight small">
                Sランク
                <select value={rank[e.key] ?? 0} onChange={(ev) => setRank((p) => ({ ...p, [e.key]: Number(ev.target.value) }))} style={{ width: "auto" }}>
                  {RANKS.map((r) => <option key={r} value={r}>{r > 0 ? `+${r}` : r}</option>)}
                </select>
              </label>
            </div>
          );
        })}
      </div>

      <div className="panel table-scroll">
        <div className="section-title">素早さ比較（降順）</div>
        <table className="spd">
          <thead>
            <tr>
              <th>実効S</th>
              <th>ポケモン</th>
              <th>条件 / タイプ</th>
            </tr>
          </thead>
          <tbody>
            {merged.map((r) => (
              <tr key={r.key} className={r.self ? "self-row" : ""}>
                <td className="num"><b className={r.self ? "me" : ""}>{r.speed}</b></td>
                <td className={r.self ? "me" : ""}>{r.self ? "★ " : ""}{r.label}</td>
                <td>
                  <div className="row tight">
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
