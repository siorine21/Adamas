import { abilityInfo } from "../data/abilities";

interface Props {
  /** 特性名。「いかく/だっぴ」のように未選択で複数入っていることがある */
  name: string;
  /** 名前も一緒に出す（選択欄の外で使うとき） */
  withName?: boolean;
}

/** 特性の効果を1〜2行で出す。
 *  選ぶ前は「いかく/だっぴ」のように複数入っているので、その場合は全部並べる。
 *  知らない特性（手入力など）は何も出さない。 */
export function AbilityNote({ name, withName }: Props) {
  const list = name.split("/").map((s) => s.trim()).filter(Boolean);
  const infos = list.map((n) => abilityInfo(n)).filter((i) => !!i);
  if (infos.length === 0) return null;
  return (
    <div className="abil-note">
      {infos.map((i) => (
        <p key={i.name}>
          {(withName || infos.length > 1) && <b>{i.name}</b>}
          {i.effect}
          {i.calc && <span className="abil-calc">{i.calc}</span>}
        </p>
      ))}
    </div>
  );
}
