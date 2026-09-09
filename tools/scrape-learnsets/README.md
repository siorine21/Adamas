# チャンピオンズ習得技 取得ツール

ポケモンチャンピオンズの、はがね24系統が「覚えるワザ」を AppMedia の各ポケモン個別ページから取得し、
アプリの習得技データ（`src/data/moves.ts` の `LEARNSETS`）を更新するためのツールです。

## なぜこの方式か

- チャンピオンズの習得技は**本編（SV等）とは別物**で、機械可読なデータ源が存在しない。掲載は攻略サイトのみ。
- このリポジトリの実行環境（Claude Code）や yakkun 等（Cloudflare）は直接取得できないが、
  **GitHub Actions のランナーからは AppMedia に到達でき**、AppMedia は robots.txt で `/pokemonchampions/` を許可している。
- AppMedia のページは JavaScript で描画されるため、**Playwright（ヘッドレスChromium）で描画**してから抽出する。

## 使い方

### GitHub Actions（推奨）
1. Actions タブ → **Scrape Champ Data** → Run workflow（手動起動）。
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
- `champ_moves.json` … 取得済みデータのスナップショット（24系統・2026/9時点）

## 注意・マナー
- 低頻度・少量（24ページ・ページ間に待機）で運用すること。robots.txt を尊重。
- AppMedia のHTML構造が変わると `scrape.cjs` の抽出条件（「わざ名」「威力」を含む表）を要調整。
- 取得結果は**必ず目視確認**すること（サイト側の記載ミスや構造変化を検知するため）。
- Cloudflare 等のbot判定を設けているサイト（yakkun 等）は対象にしない（アクセス制御の回避はしない）。

## どの表を採るか（重要）

AppMedia の個別ページには「チャンピオンズで覚える技」の表のほかに、本編（SV・剣盾・LEGENDS）の
「基本/進化時/レベル」「技マシン」「タマゴ技」「技レコード」「DLC」の表も並んでいます。
1ページに 5〜16 個の表があり、**全部を合算するとチャンピオンズでは使えない技まで入ります**。
`scrape.cjs` は見出しに「チャンピオンズ」を含む表だけを採用します。

## 再スクレイプの結果（2026/9・レギュM-C）

上記の表の選別を入れて取り直したところ、23系統で**合計354技が候補から外れました**（追加は0）。
外れたのは テラバースト・かげぶんしん・いあいぎり・メタルクロー・マグネットボム など、
チャンピオンズには存在しない技が中心です（メタルクロー・マグネットボム・テラバーストは
23系統すべてで0件になった＝チャンピオンズには無い技）。

以前は手で消していた **ヒスイヌメルゴンの `とける`** も、この選別により自動で外れます
（＝実機で覚えなかったのは、本編の表を混ぜて取り込んでいたのが原因）。
**手動での再適用はもう不要です。**

`tools/audit-learnsets` で「本編（PokeAPI）では習得できない技」を洗い出せます。
選別前は 86件でしたが、選別後は 18件（＝チャンピオンズ独自の追加とみられるもの）まで減りました。

## レギュレーションで没収された技

種族ごとの使用禁止技は `src/data/moves.ts` の `BANNED_MOVES` で別管理しています
（AppMedia の習得表からも消えますが、以前のレギュで組んだ個体には残るため警告を出す）。

- **ブリジュラス**: `ミラーコート` / `メタルバースト` / `ボディプレス`（レギュM-Cで没収）

## チャンピオンズ独自の技データ（本編と異なる）

技のタイプ・威力等は PokeAPI（本編）準拠ですが、チャンピオンズで値が違うものは実機に合わせて
`src/data/moves.ts` を上書きし、`tools/audit-moves` の `CHAMP_OVERRIDES` にも登録しています。
（登録しないと検証スクリプトが「出典と不一致」として毎回報告します）

- **トラバサミ**: 本編は「くさ」だが、チャンピオンズでは **はがね**（2026/9 実機確認済み）。
- **きりさく**: 本編は威力70だが、レギュM-Cで解禁され **威力80・急所ランク+1**。
- 命中率・PP の独自値（`ねがいごと` / `ちからをすいとる` のPP=8 など）は
  `src/data/moves.ts` の `CHAMP_META` に置きます（`moveMeta.ts` は PokeAPI から再生成するため）。
