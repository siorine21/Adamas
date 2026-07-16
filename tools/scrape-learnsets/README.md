# チャンピオンズ習得技 取得ツール

ポケモンチャンピオンズの、はがね22系統が「覚えるワザ」を AppMedia の各ポケモン個別ページから取得し、
アプリの習得技データ（`src/data/moves.ts` の `LEARNSETS`）を更新するためのツールです。

## なぜこの方式か

- チャンピオンズの習得技は**本編（SV等）とは別物**で、機械可読なデータ源が存在しない。掲載は攻略サイトのみ。
- このリポジトリの実行環境（Claude Code）や yakkun 等（Cloudflare）は直接取得できないが、
  **GitHub Actions のランナーからは AppMedia に到達でき**、AppMedia は robots.txt で `/pokemonchampions/` を許可している。
- AppMedia のページは JavaScript で描画されるため、**Playwright（ヘッドレスChromium）で描画**してから抽出する。

## 使い方

### GitHub Actions（推奨）
1. Actions タブ → **Scrape Champ Learnsets** → Run workflow（手動起動）。
2. 実行後、`tools/scrape-learnsets/champ_moves.json` と `src/data/moves.ts` が更新された
   ブランチ `bot/champ-learnsets` が作られる（＝差分をPRで確認できる）。

### ローカル
```bash
npm i -D playwright && npx playwright install chromium
node tools/scrape-learnsets/scrape.cjs        # champ_moves.json を再取得
node tools/scrape-learnsets/gen-learnsets.mjs # moves.ts の LEARNSETS を再生成
```

## 構成
- `scrape.cjs` … AppMedia を描画して覚えるワザを取得 → `champ_moves.json`
- `gen-learnsets.mjs` … `champ_moves.json` から `LEARNSETS` を再生成（MOVE_LIB に存在する技のみ）
- `champ_moves.json` … 取得済みデータのスナップショット（22系統・2026/7時点）

## 注意・マナー
- 低頻度・少量（22ページ・ページ間に待機）で運用すること。robots.txt を尊重。
- AppMedia のHTML構造が変わると `scrape.cjs` の抽出条件（「わざ名」「威力」を含む表）を要調整。
- 取得結果は**必ず目視確認**すること（サイト側の記載ミスや構造変化を検知するため）。
- Cloudflare 等のbot判定を設けているサイト（yakkun 等）は対象にしない（アクセス制御の回避はしない）。
