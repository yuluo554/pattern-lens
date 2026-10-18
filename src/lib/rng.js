// 确定性 RNG（splitmix64 + FNV-1a 种子派生）：fixture 生成与造数只许用它。
// 纪律：禁 stdlib 随机、禁 set 迭代序、禁系统时钟——同种子必须逐字节同产物。

const MASK64 = (1n << 64n) - 1n;

/** FNV-1a（64 位）派生种子：把任意字符串映射成 BigInt 种子。 */
export function seedFromString(text) {
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(String(text))) {
    hash = (hash ^ BigInt(byte)) & MASK64;
    hash = (hash * 0x100000001b3n) & MASK64;
  }
  return hash;
}

/** splitmix64：返回 { nextUint64, nextFloat, pick, int }。 */
export function makeRng(seed) {
  let state = typeof seed === "bigint" ? seed & MASK64 : seedFromString(seed);
  const nextUint64 = () => {
    state = (state + 0x9e3779b97f4a7c15n) & MASK64;
    let z = state;
    z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & MASK64;
    z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & MASK64;
    return (z ^ (z >> 31n)) & MASK64;
  };
  const nextFloat = () => Number(nextUint64() >> 11n) / Number(1n << 53n);
  const int = (minInclusive, maxExclusive) =>
    minInclusive + Number(nextUint64() % BigInt(Math.max(1, maxExclusive - minInclusive)));
  const pick = (items) => {
    if (!Array.isArray(items) || items.length === 0) throw new Error("pick: 需要非空数组");
    return items[int(0, items.length)];
  };
  return { nextUint64, nextFloat, int, pick };
}

/** 固定 seed 的洗牌（Fisher–Yates，确定性）。 */
export function shuffleDeterministic(items, rng) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = rng.int(0, i + 1);
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}
