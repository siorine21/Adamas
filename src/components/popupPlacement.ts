import { useEffect, useState, type CSSProperties, type RefObject } from "react";

/** ドロップダウンを画面内に収める配置スタイルを返す。
 *  - 下に余白が無ければ上向きに開く
 *  - 高さは残りスペースに合わせて制限する
 *  - ソフトキーボードが出ている間は visualViewport（キーボードを除いた実際の可視領域）
 *    を基準にするので、キーボードの裏まで伸びてスクロールできなくなるのを防ぐ */
export function usePopupPlacement(
  open: boolean,
  anchorRef: RefObject<HTMLElement | null>,
  opts?: { minWidth?: number },
): CSSProperties {
  const [style, setStyle] = useState<CSSProperties>({ top: "calc(100% + 4px)", maxHeight: 300 });

  useEffect(() => {
    if (!open) return;
    const vv = window.visualViewport;

    const calc = () => {
      const el = anchorRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const gap = 8;

      // 可視領域（キーボードが出ていればその上端まで）をレイアウト座標で表す
      const viewTop = vv ? vv.offsetTop : 0;
      const viewBottom = viewTop + (vv ? vv.height : window.innerHeight);

      const below = viewBottom - r.bottom - gap;
      const above = r.top - viewTop - gap;
      // 原則は下向き。下が狭く上のほうが広いときだけ上向きに開く
      const openUp = below < 200 && above > below;
      const space = Math.max(100, Math.min(340, openUp ? above : below));

      const next: CSSProperties = openUp
        ? { bottom: "calc(100% + 4px)", top: "auto", maxHeight: space }
        : { top: "calc(100% + 4px)", bottom: "auto", maxHeight: space };

      // 数値グリッド等、アンカーより広く出したい場合は画面内に収まる位置へ寄せる
      if (opts?.minWidth) {
        const vw = vv ? vv.width : window.innerWidth;
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
    // キーボードの開閉／ピンチズームで可視領域が変わったら再計算
    vv?.addEventListener("resize", calc);
    vv?.addEventListener("scroll", calc);
    return () => {
      window.removeEventListener("resize", calc);
      window.removeEventListener("scroll", calc, true);
      vv?.removeEventListener("resize", calc);
      vv?.removeEventListener("scroll", calc);
    };
  }, [open, anchorRef, opts?.minWidth]);

  return style;
}
