import { useEffect, useRef } from "react";
import { useStore } from "./store";
import { usePersistedState } from "./uiState";
import { TeamTab } from "./components/TeamTab";
import { DexTab } from "./components/DexTab";
import { DamageTab } from "./components/DamageTab";
import { SpeedTab } from "./components/SpeedTab";
import { ToolsTab } from "./components/ToolsTab";

type Tab = "team" | "dex" | "damage" | "speed" | "tools";

const TABS: { id: Tab; label: string }[] = [
  { id: "team", label: "チーム管理" },
  { id: "dex", label: "図鑑" },
  { id: "damage", label: "ダメージ計算" },
  { id: "speed", label: "素早さ比較" },
  { id: "tools", label: "ツール" },
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
  // 開いていたタブを覚えておく（リロード・ホーム画面から再起動しても同じ画面に戻る）
  const [tab, setTab] = usePersistedState<Tab>(
    "tab", "team",
    (v) => typeof v === "string" && TABS.some((t) => t.id === v),
  );
  // 貼り付くヘッダーの高さを CSS 変数に入れる。表の見出し行をその下に貼り付けるため
  const headerRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const el = headerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const set = () => document.documentElement.style.setProperty("--hdr-h", `${el.offsetHeight}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div className="app">
      <header className="app-header" ref={headerRef}>
        <div className="app-title">
          <h1>アダマス工房</h1>
          <span className="sub">はがね／あく統一チーム構成支援 ／ レギュM-C・Lv50</span>
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
      {/* 各タブは常時マウントし表示切替のみ行う（タブ移動で入力状態が初期化されないように） */}
      <main>
        <div style={{ display: tab === "team" ? "block" : "none" }}><TeamTab /></div>
        <div style={{ display: tab === "dex" ? "block" : "none" }}><DexTab /></div>
        <div style={{ display: tab === "damage" ? "block" : "none" }}><DamageTab /></div>
        <div style={{ display: tab === "speed" ? "block" : "none" }}><SpeedTab /></div>
        <div style={{ display: tab === "tools" ? "block" : "none" }}><ToolsTab /></div>
      </main>
    </div>
  );
}
