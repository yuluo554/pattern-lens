// 序列化单点：所有落盘/导出文本一律经此模块（JSON 字段顺序、LF、结尾换行三件事只在这里定义一次）。
// 纯数据模块：不 import 任何其他 lib 模块时为规约，但本模块允许被任何层 import。

export const EOL = "\n";

/** 保序序列化（字段顺序 = 调用方构造对象时的顺序，导出契约依赖这一点）。 */
export function orderedJsonText(value, indent = 2) {
  return JSON.stringify(value, null, indent).split("\n").join(EOL) + EOL;
}

/** 键排序序列化：只用于**内容哈希**（哈希必须与字段书写顺序无关）。 */
export function canonicalJsonText(value) {
  return JSON.stringify(sortKeysDeep(value));
}

function sortKeysDeep(value) {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === "object") {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = sortKeysDeep(value[key]);
    return out;
  }
  return value;
}

/** 与平台无关的文本归一：CRLF → LF，并保证以单个 LF 结尾。 */
export function normalizeText(text) {
  return String(text).replace(/\r\n?/g, EOL).replace(/\n*$/, EOL);
}
