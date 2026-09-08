import { useEffect, useState } from "react";

/* 画面の入力状態（開いていたタブ・ダメージ計算の条件・素早さ比較の設定など）を
   localStorage に保存する。手持ちデータ本体は storage.ts が別枠で保存している。
   保存できない環境（プライベートモード等）でも動作は変えず、既定値で動く。 */
const PREFIX = "adamas-koubou/ui/";

function load<T>(key: string, fallback: T, isValid?: (v: unknown) => boolean): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw === null) return fallback;
    const parsed: unknown = JSON.parse(raw);
    if (isValid && !isValid(parsed)) return fallback; // 形が変わった古い保存値は捨てる
    return parsed as T;
  } catch {
    return fallback;
  }
}

/** useState と同じ使い勝手で、値の変化を localStorage に保存する。 */
export function usePersistedState<T>(
  key: string,
  initial: T | (() => T),
  isValid?: (v: unknown) => boolean,
) {
  const [value, setValue] = useState<T>(() => {
    const init = typeof initial === "function" ? (initial as () => T)() : initial;
    return load(key, init, isValid);
  });

  useEffect(() => {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch {
      /* 保存できなくても表示・計算には影響しない */
    }
  }, [key, value]);

  return [value, setValue] as const;
}
