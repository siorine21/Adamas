import { useEffect, useState } from "react";
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
      {/* 各タブは常時マウントし表示切替のみ行う（タブ移動で入力状態が初期化されないように） */}
      <main>
        <div style={{ display: tab === "team" ? "block" : "none" }}><TeamTab /></div>
        <div style={{ display: tab === "dex" ? "block" : "none" }}><DexTab /></div>
        <div style={{ display: tab === "damage" ? "block" : "none" }}><DamageTab /></div>
        <div style={{ display: tab === "speed" ? "block" : "none" }}><SpeedTab /></div>
      </main>
      <InstallFooter />
    </div>
  );
}

// ページ末尾: このアプリのURL表示＋ホーム画面追加(インストール)の案内
function InstallFooter() {
  const url = `${window.location.origin}${import.meta.env.BASE_URL}`;
  const [copied, setCopied] = useState(false);
  const [deferred, setDeferred] = useState<{ prompt: () => void; userChoice: Promise<unknown> } | null>(null);
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const standalone =
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true;

  useEffect(() => {
    const onBip = (e: Event) => {
      e.preventDefault();
      setDeferred(e as unknown as { prompt: () => void; userChoice: Promise<unknown> });
    };
    window.addEventListener("beforeinstallprompt", onBip);
    return () => window.removeEventListener("beforeinstallprompt", onBip);
  }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* クリップボード不可の環境では無視（URLは表示済み） */
    }
  };

  const install = async () => {
    if (!deferred) return;
    deferred.prompt();
    try { await deferred.userChoice; } catch { /* noop */ }
    setDeferred(null);
  };

  return (
    <footer className="app-footer">
      <div className="row tight">
        <span className="small muted">このアプリのURL</span>
        <a className="app-url" href={url}>{url}</a>
        <button className="btn small" onClick={copy}>{copied ? "コピー済" : "コピー"}</button>
      </div>
      {!standalone && (
        <div className="small muted" style={{ marginTop: 6 }}>
          {deferred ? (
            <button className="btn small primary" onClick={install}>📲 アプリとしてインストール</button>
          ) : isIOS ? (
            <>ホーム画面に追加: 共有メニュー →「ホーム画面に追加」でアプリのように使えます。</>
          ) : (
            <>ホーム画面に追加: ブラウザメニュー →「アプリをインストール／ホーム画面に追加」でアプリのように使えます。</>
          )}
        </div>
      )}
    </footer>
  );
}
