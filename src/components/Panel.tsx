import type { ReactNode } from "react";
import { usePersistedState } from "../uiState";

interface Props {
  /** 開閉状態の保存キー。画面ごとに一意にすること（例: "dex.filters"） */
  id: string;
  title: ReactNode;
  /** 見出しの右に出す短い要約。畳んだときに中身の見当がつくよう、件数などを入れる */
  summary?: ReactNode;
  /** 既定で開くか。よく使うものは開、補助的なものは閉にする */
  defaultOpen?: boolean;
  /** 見出しの行に置く操作（開閉ボタンとは別に押せる）。畳んでいても出る */
  actions?: ReactNode;
  /** 畳んでいても出しておく中身。見落とすと困る警告などに使う */
  always?: ReactNode;
  className?: string;
  children: ReactNode;
}

/** 畳めるパネル。
 *
 *  スマホだと1画面が狭く、絞込みや設定が縦に伸びると肝心の一覧まで遠くなる。
 *  中身を隠せるようにして、使わない区画は畳んでおけるようにする。
 *  開閉状態は localStorage に残すので、次に開いたときも同じ形になる。
 *
 *  見出しは button なので、キーボードでも開閉できる（aria-expanded つき）。 */
export function Panel({
  id, title, summary, defaultOpen = true, actions, always, className = "", children,
}: Props) {
  const [open, setOpen] = usePersistedState(
    `panel.${id}`, defaultOpen, (v) => typeof v === "boolean");

  return (
    <div className={`panel ${className}`}>
      <div className="panel-head">
        <button
          type="button"
          className="wk-head"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          <span className={`card-caret ${open ? "open" : ""}`}>▶</span>
          <span className="section-title" style={{ margin: 0, border: "none", padding: 0 }}>
            {title}
          </span>
          {summary && <span className="small muted panel-sum">{summary}</span>}
        </button>
        {actions && <span className="panel-actions">{actions}</span>}
      </div>
      {always}
      {open && children}
    </div>
  );
}
