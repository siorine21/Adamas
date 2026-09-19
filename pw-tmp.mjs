import { chromium } from "playwright-core";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args:["--no-sandbox"] });
const p = await (await b.newContext({ viewport:{width:412,height:915}, deviceScaleFactor:2 })).newPage();
await p.goto("http://localhost:4173/Adamas/", { waitUntil:"networkidle" });
await p.getByRole("button", { name: "はがね図鑑", exact: true }).click();
await p.waitForTimeout(600);
const info = async () => {
  const n = await p.locator(".dex-row:visible").count();
  const head = await p.locator(".row.tight:visible").filter({ hasText: "図鑑" }).first().innerText();
  return `${n}系統 / ${head.replace(/\n/g," ")}`;
};
console.log("初期:", await info());
await p.locator(".dex-type:visible").filter({ hasText: "あく" }).click();
await p.waitForTimeout(500);
console.log("あく:", await info());
console.log("先頭5:", (await p.locator(".dex-name:visible").allInnerTexts()).slice(0,5).join("/"));
await p.screenshot({ path: "/tmp/claude-0/dex-dark.png" });
console.log("横あふれ:", await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth));
await b.close();
