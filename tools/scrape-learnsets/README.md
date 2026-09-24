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
- `scrape-gamewith.cjs` … GameWith から同じ情報を取得（二つ目の出典・PPの唯一の出典）
  → `gamewith_moves.json` / `gamewith_move_stats.json`

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

## 威力・命中の照合

`champ_move_stats.json` には「チャンピオンズで覚える技」表の**威力・命中**が入っています
（技名 → `{power, acc}`）。`tools/audit-moves` がこれとアプリの技ライブラリを突き合わせ、
チャンピオンズ実機の値と違うものを報告します。レギュM-C時点で239技を照合しました。

**PP は AppMedia の表に無い**ため、AppMedia だけでは検証できません。
GameWith の「技（わざ）一覧」には PP 列があるので、そちらを出典にしています（下記）。

## 二つ目の出典（GameWith）

出典が1つだとサイト側の誤りに気づけません。`scrape-gamewith.cjs` が GameWith から
同じ情報を取り、突き合わせに使えるようにしています。

- `gamewith_move_stats.json` … 技名 → `{power, acc, pp}`。「技（わざ）一覧」ページ＋各個別ページ。
- `gamewith_moves.json` … 種族ごとの「チャンピオンズで覚える技」。AppMedia 版との差分確認用。
- `tools/gen-champ-stats` が `gamewith_move_stats.json` から `src/data/champStats.ts`
  （本編との**差分だけ**）を生成し、技ライブラリに重ねます。威力・命中・PP を持ちます。
  威力が違うのは11技で、いずれもチャンピオンズで強化された専用技です
  （`ひょうざんおろし` 100→120、`スターアサルト` 150→170、`くちばしキャノン` 100→120 など）。

技一覧は `<table>` ではなく、技名／威力／命中／PP が縦に並ぶだけの DOM なので、
`innerText` を「その4行が揃っている箇所」として読みます。

### 突き合わせの結果（2026/9・レギュM-C）

GameWith 側を取得できた**21系統すべてが完全一致**、**威力・命中も全技一致**です。

当初は3系統で差が出ましたが、技おしえ画面の実機確認（2026/9）でいずれも
**GameWith が正しく、AppMedia の表が誤り**と判明しました。
差分は `gen-learnsets.mjs` の `EXTRA`（追加）/ `EXCLUDE`（除外）で打ち消しています。
`champ_moves.json` は再取得で上書きされるので、手当てはこの2つに書きます。

| 系統 | 実機確認の内容 | 対応 |
| --- | --- | --- |
| ハッサム | `ダブルウイング` PP12 が一覧にある | `EXTRA` に追加 |
| メタグロス | でんき欄は `かみなりパンチ` / `でんじふゆう` のみ | `でんじふゆう` を追加、`でんじは` を除外 |
| ドリュウズ | かくとう＝`かわらわり` `きあいだま` のみ／ひこう＝`つばめがえし` のみ／エスパー＝`ねむる` のみ／じめんは `どろかけ` で終端 | 余分な7技を除外 |

`きりさく` も5系統すべてで GameWith 側にだけありました。レギュM-Cでの解禁技であり
AppMedia の表が未更新と判断できるため、同じく `EXTRA` で追加しています。

### PP・威力の実機確認

同じ画面から読み取れた25項目（`れいとうパンチ` 威力75・PP16、`つばめがえし` PP20、
`エアカッター` PP20、`きあいだま` PP8、`のろい` PP12 など）は**すべてアプリと一致**しました。

一方で **PP は本編値のままズレていました**（508技中410技）。
チャンピオンズは PP を 8/12/16/20 に作り直していて、
本編値からの単純な換算にもなりません（本編10でも `まもる`→8 / `のろい`→12）。
実機確認済みの `であいがしら`12 / `きゅうけつ`12 / `ふいうち`8 は GameWith とも一致したので、
GameWith の PP 列はチャンピオンズの値と判断しています。

ただし GameWith は**レギュM-Cの調整が反映されていない箇所がある**ようで、
`ねがいごと` を 12（M-C では 8）と載せています。こうした実機確認ぶんは
`CHAMP_META` が最優先で上書きします（重ね順は `MOVE_META` → `CHAMP_STATS` → `CHAMP_META`）。

## チャンピオンズ独自の技データ（本編と異なる）

技のタイプ・威力等は PokeAPI（本編）準拠ですが、チャンピオンズで値が違うものは実機に合わせて
`src/data/moves.ts` を上書きし、`tools/audit-moves` の `CHAMP_OVERRIDES` にも登録しています。
（登録しないと検証スクリプトが「出典と不一致」として毎回報告します）

- **トラバサミ**: 本編は「くさ」だが、チャンピオンズでは **はがね**（2026/9 実機確認済み）。
- **きりさく**: 本編は威力70だが、レギュM-Cで解禁され **威力80・急所ランク+1**。
- **であいがしら**: 本編は威力90だが、チャンピオンズは **威力100**（実機・AppMediaの両方で確認）。
- **ボーンラッシュ**: 本編は威力25だが、チャンピオンズは **威力30**。
- **ゴールドラッシュ**: 本編は命中100だが、チャンピオンズは **命中95**。
- 命中率・PP は3段で重ねます。`moveMeta.ts`（PokeAPI＝本編値）→ `champStats.ts`（GameWith＝
  チャンピオンズ値・自動生成）→ `CHAMP_META`（実機確認などの手動上書き・最優先）。
  手で直すときは `src/data/moves.ts` の `CHAMP_META` に書きます
  （`moveMeta.ts` と `champStats.ts` は再生成されるため直接書かない）。

## 内定ポケモン全種族の習得技（被ダメ計算用）

被ダメ計算で仮想敵の技を「実際に覚える技」から選べるよう、内定352フォルムの習得技を
GameWith の個別ページから取得しています（`src/data/threatLearnsets.ts`）。

```text
Actions → Scrape Champ Data → Run workflow → target: threats
  → bot/threat-learnsets に gamewith_threat_moves.json / gamewith_links.json / scrape_threats_log.txt
取れなかった種族があれば target: threats-missing で、その種族だけ取り直す
node tools/scrape-learnsets/gen-threat-learnsets.mjs   # threatLearnsets.ts を生成
node tools/scrape-learnsets/gen-learnsets.mjs          # あく系統の穴も同じデータで埋まる
```

- 取得対象は `threat-targets.cjs` が内定表から作る270種族。メガは元の姿に寄せる
  （`メガニウム` のように名前が「メガ」で始まるだけの種族は別扱い）。
- 個別ページのURLは、内定一覧・1〜9世代一覧・メガ一覧・M-C追加一覧のリンクを集め、
  括弧や「のすがた」の表記ゆれを吸収して引く。フォルムでページを共有する種族
  （パンプジン・イキリンコ等）やメガのページしか無い種族（ニャオニクス等）にも対応。
- 2026/9 時点で **270/270種族** を取得。はがね・あく47系統は既存の習得表（実機確認の補正つき）と
  突き合わせて46系統が完全一致し、差はギルガルドの `きりさく`（M-C解禁）だけだった
  → `gen-learnsets.mjs` の `EXTRA` に追加済み。
- アプリでは、はがね・あく系統は `LEARNSETS`（補正つき）を優先し、それ以外を
  `THREAT_LEARNSETS` から引く（`src/components/MoveEditor.tsx` の `threatMoveOptions`）。
