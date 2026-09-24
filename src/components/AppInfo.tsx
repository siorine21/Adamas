import { useEffect, useState } from "react";
import { Panel } from "./Panel";

/** このアプリのURL表示＋ホーム画面追加（インストール）の案内。
 *  以前はどのタブの下にも出ていたが、毎回目に入るほどのものではないのでツールタブに置く */
export function AppInfo() {
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
    <Panel id="tools.app" title="このアプリについて" summary={standalone ? "インストール済み" : "URL・ホーム画面に追加"} defaultOpen={false}>
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
    </Panel>
  );
}
