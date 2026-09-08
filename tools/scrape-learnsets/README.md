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

## 手動修正済みの差分（再スクレイプ時は再適用が必要）

AppMedia の記載が実機と食い違っていた箇所は、手動で修正しています。**再スクレイプすると元に戻る**ため、
`champ_moves.json` / `src/data/moves.ts` に対して以下を再適用してください。

- **ヒスイヌメルゴン**: `とける` を削除（AppMedia には掲載されているが、チャンピオンズ実機では覚えない。2026/7 実機確認済み）。
  2026/9 に再スクレイプしたが AppMedia 側は変わっていないため、**再取得のたびに再適用が必要**。

## 再スクレイプの結果（2026/9）

Actions の「Scrape Champ Learnsets」で取り直し、収録済みデータと比較した結果:

- 22系統すべてで**技の増減なし**（並び順のみ差分あり）。つまり収録データは AppMedia の現在の内容と一致している。
- 唯一の差は上記 **ヒスイヌメルゴンの `とける`**（AppMedia は掲載を継続、実機では覚えない）。

したがって「実機と合わない」ケースは AppMedia 側の誤りであり、**実機で確認した情報を手で反映する**しかない。
`tools/audit-learnsets` で「本編では習得できない技」を洗い出せるので、確認の当たりを付けるのに使う。

## チャンピオンズ独自の技データ（本編と異なる）

技のタイプ・威力等は PokeAPI（本編）準拠ですが、チャンピオンズで値が違うものは実機に合わせて
`src/data/moves.ts` を上書きし、`tools/audit-moves` の `CHAMP_OVERRIDES` にも登録しています。
（登録しないと検証スクリプトが「出典と不一致」として毎回報告します）

- **トラバサミ**: 本編は「くさ」だが、チャンピオンズでは **はがね**（2026/9 実機確認済み）。
