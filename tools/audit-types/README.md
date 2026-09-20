# audit-types

内定データ（`src/data/confirmed.ts`）のタイプ・種族値を本編（PokeAPI）と突き合わせて検算する。

```
node tools/audit-types/audit-types.mjs
```

ヒスイダイケンキが `みず/かくとう` と誤登録されていた（正しくは `みず/あく`）のを機に、
352フォルム全体を機械的に点検するために書いた。差分が出たら本編側が正しいかを確認して直す。

やっていること:

1. PokeAPI の CSV（`pokemon` / `pokemon_forms` / `pokemon_species_names` / `pokemon_types` /
   `type_names` / `pokemon_stats`）から「日本語の表示名 → タイプ・種族値」を組む。
   名前は種族の日本語名＋フォルム識別子（`mega` / `mega-x` / `alola` / `hisui` ほか）から
   当方の表記に合わせて作り、規則で作れないもの（`ヒートロトム`、`イルカマン(マイティ)` 等）は
   スクリプト内の `IDENT` で `pokemon.identifier` を直接指定する。
2. `confirmed.ts` の全行と比較し、タイプ不一致・種族値不一致・未照合を出す。
3. はがね図鑑（`src/data/dex.ts`）は一次ソースのスプレッドシートから手で起こしたものなので、
   内定表とも食い違っていないか見る。あく図鑑は `confirmed.ts` から自動生成（`tools/gen-dex`）
   なので照合しない。

備考: Legends Z-A 由来のメガも PokeAPI に載ったため、以前は本編に対応が無く
`typeVerified: false`（素の型を仮採用）だった31件も照合できるようになった。
現在は全352フォルムがタイプ・種族値とも本編と一致している。
