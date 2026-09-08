/* public/icon.svg から、PWA・iOS 用のPNGアイコンを生成する。
 *
 *   npm i -D playwright-core   （未導入の場合）
 *   node tools/gen-icons/gen-icons.mjs
 *
 * 生成物:
 *   public/icon-192.png            … manifest の any 用
 *   public/icon-512.png            … manifest の any 用
 *   public/icon-maskable-512.png   … Android のマスク対応（角丸なし・内容を72%に縮小）
 *   public/apple-touch-icon.png    … iOS のホーム画面（180px・角丸なし。iOS側でマスクされる）
 *
 * maskable は、OSが円形などに切り抜いても欠けないよう中央80%が安全領域。
 * icon.svg の <!-- content:start --> 〜 <!-- content:end --> を縮小して収める。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PUBLIC = path.join(ROOT, "public");
const SRC = fs.readFileSync(path.join(PUBLIC, "icon.svg"), "utf8");

/** maskable 用: 角丸を無くし、コンテンツを中央 72% に縮小した SVG を作る */
function toMaskable(svg) {
  const start = svg.indexOf("<!-- content:start -->");
  const end = svg.indexOf("<!-- content:end -->");
  if (start < 0 || end < 0) throw new Error("icon.svg に content マーカーが見つかりません");
  const head = svg.slice(0, start).replace('rx="100"', 'rx="0"');
  const content = svg.slice(start, end);
  const tail = svg.slice(end);
  return `${head}<g transform="translate(256 256) scale(0.72) translate(-256 -256)">${content}</g>${tail}`;
}

const shoot = async (page, svg, size, out) => {
  const uri = "data:image/svg+xml;base64," + Buffer.from(svg).toString("base64");
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<style>html,body{margin:0;background:transparent}img{display:block;width:${size}px;height:${size}px}</style>` +
    `<img src="${uri}">`,
  );
  await page.waitForTimeout(80);
  await page.screenshot({ path: path.join(PUBLIC, out), omitBackground: true });
  console.log(`${out} (${size}x${size})`);
};

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
});
const page = await browser.newPage({ deviceScaleFactor: 1 });

await shoot(page, SRC, 192, "icon-192.png");
await shoot(page, SRC, 512, "icon-512.png");
// iOSは自前で角丸マスクをかけるので、角を透過させず四角のまま渡す
await shoot(page, SRC.replace('rx="100"', 'rx="0"'), 180, "apple-touch-icon.png");
await shoot(page, toMaskable(SRC), 512, "icon-maskable-512.png");

await browser.close();
