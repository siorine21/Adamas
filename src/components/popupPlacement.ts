import { useEffect, useState, type CSSProperties, type RefObject } from "react";

/** ドロップダウンを画面内に収める配置スタイルを返す。
 *  下に十分な余白が無ければ上向きに開き、高さは残りスペースに合わせて制限する
 *  （スマホでポップアップが画面外へ伸びて“全画面”のようになるのを防ぐ）。 */
export function usePopupPlacement(
  open: boolean,
  anchorRef: RefObject<HTMLElement | null>,
  opts?: { minWidth?: number },
): CSSProperties {
  const [style, setStyle] = useState<CSSProperties>({ top: "calc(100% + 4px)", maxHeight: 300 });

  useEffect(() => {
    if (!open) return;
    const calc = () => {
      const el = anchorRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const gap = 8;
      const below = vh - r.bottom - gap;
      const above = r.top - gap;
      const openUp = below < 180 && above > below;
      const space = Math.max(140, Math.min(340, openUp ? above : below));
      const next: CSSProperties = openUp
        ? { bottom: "calc(100% + 4px)", top: "auto", maxHeight: space }
        : { top: "calc(100% + 4px)", bottom: "auto", maxHeight: space };

      // 数値グリッド等、アンカーより広く出したい場合は画面内に収まる位置へ寄せる
      if (opts?.minWidth) {
        const vw = window.innerWidth;
        const width = Math.min(Math.max(r.width, opts.minWidth), vw - 16);
        let left = r.left;
        if (left + width > vw - 8) left = vw - 8 - width;
        if (left < 8) left = 8;
        next.width = width;
        next.left = left - r.left; // アンカー基準の相対位置
        next.right = "auto";
      }
      setStyle(next);
    };
    calc();
    window.addEventListener("resize", calc);
    window.addEventListener("scroll", calc, true);
    return () => {
      window.removeEventListener("resize", calc);
      window.removeEventListener("scroll", calc, true);
    };
  }, [open, anchorRef]);

  return style;
}
