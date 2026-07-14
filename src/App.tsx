import { useState } from "react";
import { useStore } from "./store";
import { TeamTab } from "./components/TeamTab";
import { DexTab } from "./components/DexTab";
import { DamageTab } from "./components/DamageTab";
import { SpeedTab } from "./components/SpeedTab";

type Tab = "team" | "dex" | "damage" | "speed";

const TABS: { id: Tab; label: string }[] = [
  { id: "team", label: "チーム管理" },
  { id: "dex", label: "はがね図鑑" },
  { id: "damage", label: "ダメージ計算" },
  { id: "speed", label: "素早さ比較" },
];

function SaveBadge() {
  const { saveState, saveError } = useStore();
  const text =
    saveState === "saving" ? "保存中…"
    : saveState === "saved" ? "保存済み"
    : saveState === "error" ? "保存失敗"
    : "自動保存";
  return (
    <span className={`save-badge ${saveState}`} title={saveError ?? undefined}>
      {text}
      {saveState === "error" && saveError ? `：${saveError}` : ""}
    </span>
  );
}

export default function App() {
  const [tab, setTab] = useState<Tab>("team");
  return (
    <div className="app">
      <header className="app-header">
        <div className="app-title">
          <h1>アダマス工房</h1>
          <span className="sub">はがね統一チーム構成支援 ／ レギュM-B・Lv50</span>
          <SaveBadge />
        </div>
        <nav className="tabbar">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={tab === t.id ? "active" : ""}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>
      <main>
        {tab === "team" && <TeamTab />}
        {tab === "dex" && <DexTab />}
        {tab === "damage" && <DamageTab />}
        {tab === "speed" && <SpeedTab />}
      </main>
    </div>
  );
}
