# gen-abilities

特性の説明文（`src/data/abilityText.ts`）を PokeAPI から生成する。

```
node tools/gen-abilities/gen-abilities.mjs
```

出典は `ability_flavor_text.csv` の日本語（＝本編のゲーム内でそのまま出る文）。
版によって文言が変わるので、いちばん新しい version_group のものを採る。
内定データ（`confirmed.ts` / `dex.ts` / `dexDark.ts`）に出てくる特性だけを出力する。

## 2層になっている理由

ゲーム内表記は「いりょくが あがる」のように**倍率を書かない**。
ダメージ計算で効く特性は数字が要るので、`src/data/abilities.ts` に手書きの層を置いている。

| 層 | 場所 | 内容 |
|---|---|---|
| 1 | `abilityText.ts`（自動生成） | ゲーム内表記 |
| 2 | `abilities.ts` の `ABILITY_META` | ゲーム内表記が PokeAPI に無いものを手で書く（こちらが優先） |
| 3 | `abilities.ts` の `ABILITY_CALC` | 倍率などの補足。`src/calc.ts` で実際に効いているものだけ |

持ち物（`items.ts`）・技（`moves.ts`）と同じ「自動生成＋手動で上書き」の作り。

新しいポケモンを図鑑に足して説明の無い特性が出たときは、実行すると
「ABILITY_META 未記入」として名前を並べるので、そこに追記する。

## 補足

Z-A / チャンピオンズの新特性（かんつうドリル・ドラゴンスキン・メガソーラー・
とびだすハバネロ・うなぎのぼり・ほのおのたてがみ・はどうのぼうご など）は
日本語のゲーム内表記がまだ PokeAPI に入っていないが、英語の説明
（`ability_prose.csv` の short_effect）はあるので、それを訳して `ABILITY_META` に書いた。
