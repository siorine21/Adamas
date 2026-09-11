import { useEffect, useState, type CSSProperties, type RefObject } from "react";

/** スマホ幅ではアンカー直下ではなく画面下部のシートとして開く。
 *  狭い画面だと、開いた位置が下のほうだったときにソフトキーボードで
 *  候補が押し出されてタップできず、ページをスクロールしようとすると
 *  メニュー自体が閉じてしまうため。 */
const SHEET_QUERY = "(max-width: 560px)";

export interface PopupPlacement {
  style: CSSProperties;
  /** 画面下部のシートとして開いているか（背景の覆いを出すかの判断に使う） */
  sheet: boolean;
}

/** ドロップダウンを画面内に収める配置スタイルを返す。
 *  - スマホ幅では可視領域の下部に固定するシート（キーボードの上に必ず出る）
 *  - PC幅では従来どおりアンカー直下。下に余白が無ければ上向きに開く
 *  - どちらも visualViewport（キーボードを除いた実際の可視領域）を基準にする */
export function usePopupPlacement(
  open: boolean,
  anchorRef: RefObject<HTMLElement | null>,
  opts?: { minWidth?: number },
): PopupPlacement {
  const [placement, setPlacement] = useState<PopupPlacement>({
    style: { top: "calc(100% + 4px)", maxHeight: 300 },
    sheet: false,
  });

  useEffect(() => {
    if (!open) return;
    const vv = window.visualViewport;

    const calc = () => {
      const el = anchorRef.current;
      if (!el) return;
      const gap = 8;
      // 可視領域（キーボードが出ていればその上端まで）をレイアウト座標で表す
      const viewTop = vv ? vv.offsetTop : 0;
      const viewHeight = vv ? vv.height : window.innerHeight;
      const viewLeft = vv ? vv.offsetLeft : 0;
      const viewWidth = vv ? vv.width : window.innerWidth;

      if (window.matchMedia?.(SHEET_QUERY).matches) {
        // 可視領域の下端に貼り付ける。キーボードが出ると可視領域が縮むので、
        // シートはその上に押し上げられて候補が隠れない。
        const height = Math.min(Math.round(viewHeight * 0.62), 420);
        setPlacement({
          sheet: true,
          style: {
            position: "fixed",
            left: viewLeft + gap,
            width: viewWidth - gap * 2,
            top: viewTop + viewHeight - height - gap,
            right: "auto",
            bottom: "auto",
            maxHeight: height,
          },
        });
        return;
      }

      const r = el.getBoundingClientRect();
      const viewBottom = viewTop + viewHeight;
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
        const width = Math.min(Math.max(r.width, opts.minWidth), viewWidth - 16);
        let left = r.left;
        if (left + width > viewWidth - 8) left = viewWidth - 8 - width;
        if (left < 8) left = 8;
        next.width = width;
        next.left = left - r.left; // アンカー基準の相対位置
        next.right = "auto";
      }
      setPlacement({ style: next, sheet: false });
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

  return placement;
}
