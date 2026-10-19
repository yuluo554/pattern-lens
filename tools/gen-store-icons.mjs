#!/usr/bin/env node
// 商店/扩展图标生成器（**确定性**，零依赖）：程序化产出 `assets/store/` 下的 PNG 图标。
//
// 为什么生成而不是手工放位图：仓库纪律是"产物一律生成、禁手编"（同 fixture 的 K23）。
// 图标也是被断言的对象（尺寸 / 透明通道 / 逐字节可复现），故：
//   · 本脚本用自写的最小 PNG 编码器（`node:zlib` deflate + 自算 CRC32）产出；
//   · `--check` 重生成并与盘上产物**逐字节比对**（同 build-extension / gen-fixtures 的口径）；
//   · 图形本身用**确定性**光栅化（无随机、无字体依赖、无外链）——换机重生成逐字节一致。
//
// 图形：深蓝圆底 + 白色放大镜（镜圈 + 手柄）+ 镜内三条"证据横线"（对应"逐条取证"）。
// 用法：node tools/gen-store-icons.mjs [--check]
// 退出码：0 一致/已生成 / 1 --check 不一致 / 2 用法错误。

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const STORE_DIR = join(ROOT, "assets", "store");

/** 图标尺寸清单（商店素材与扩展 `manifest.icons` 共用这一份；改这里就够）。 */
export const ICON_SIZES = [16, 32, 48, 128];

/** 调色（单点）：与 `src/sidepanel/sidepanel.css` 的 `--accent` 同色系。 */
const BG = [47, 91, 215, 255]; // #2f5bd7
const FG = [255, 255, 255, 255]; // 白
const TRANSPARENT = [0, 0, 0, 0];

// ── 最小 PNG 编码器（真彩 + alpha，8 bit；无第三方依赖）──────────────────────
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

/** RGBA 像素缓冲（`width*height*4`）→ PNG 字节。filter 0（None）逐行，确定性。 */
export function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type = RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// ── 确定性光栅化（无抗锯齿随机、无字体；用解析式几何覆盖判定）───────────────
const fill = (rgba, width, x, y, color) => {
  const i = (y * width + x) * 4;
  rgba[i] = color[0];
  rgba[i + 1] = color[1];
  rgba[i + 2] = color[2];
  rgba[i + 3] = color[3];
};

/**
 * 画一枚图标：深蓝圆底 + 白色放大镜 + 镜内三条证据线。
 * 全部用**归一化坐标**（0..1）与解析式距离判定 → 与尺寸无关、确定性。
 */
export function drawIcon(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.46; // 圆底
  const lensR = size * 0.26; // 镜圈半径
  const lensCx = size * 0.44;
  const lensCy = size * 0.42;
  const ringWidth = Math.max(1, size * 0.06);
  const handleWidth = Math.max(1, size * 0.075);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const px = x + 0.5;
      const py = y + 0.5;
      // 圆底（带一点外透明边缘）
      const dist = Math.hypot(px - cx, py - cy);
      if (dist > radius) {
        fill(rgba, size, x, y, TRANSPARENT);
        continue;
      }
      fill(rgba, size, x, y, BG);

      // 手柄：从镜圈右下方沿 45° 外延的粗线
      const hx = lensCx + lensR * 0.72;
      const hy = lensCy + lensR * 0.72;
      const along = (px - hx) * 0.7071 + (py - hy) * 0.7071;
      const perp = Math.abs((px - hx) * -0.7071 + (py - hy) * 0.7071);
      if (along >= -handleWidth && along <= size * 0.16 && perp <= handleWidth) {
        fill(rgba, size, x, y, FG);
      }

      // 镜圈（圆环）
      const lensDist = Math.hypot(px - lensCx, py - lensCy);
      if (Math.abs(lensDist - lensR) <= ringWidth) {
        fill(rgba, size, x, y, FG);
      }

      // 镜内三条证据线（只在镜内，且留出镜圈内边距）
      if (lensDist < lensR - ringWidth * 1.6) {
        const band = (offset) => Math.abs(py - (lensCy + offset)) <= Math.max(0.6, size * 0.026);
        const within = (halfWidth) => Math.abs(px - lensCx) <= lensR * halfWidth;
        if (band(-size * 0.1) && within(0.5)) fill(rgba, size, x, y, FG);
        else if (band(0) && within(0.6)) fill(rgba, size, x, y, FG);
        else if (band(size * 0.1) && within(0.4)) fill(rgba, size, x, y, FG);
      }
    }
  }
  return encodePng(size, size, rgba);
}

/** 素材清单：路径 → 生成函数（新增素材只在这里登记一处）。 */
export function storeAssets() {
  const files = new Map();
  for (const size of ICON_SIZES) files.set(`icon-${size}.png`, drawIcon(size));
  return files;
}

function main() {
  const checkOnly = process.argv.includes("--check");
  const unknown = process.argv.slice(2).filter((arg) => arg !== "--check");
  if (unknown.length > 0) {
    process.stderr.write("用法: node tools/gen-store-icons.mjs [--check]\n");
    process.exitCode = 2;
    return;
  }

  const files = storeAssets();
  if (checkOnly) {
    const diffs = [];
    for (const [name, data] of files) {
      const path = join(STORE_DIR, name);
      if (!existsSync(path)) diffs.push(`${name}: 缺失`);
      else if (!readFileSync(path).equals(data)) diffs.push(`${name}: 字节不同`);
    }
    if (diffs.length > 0) {
      process.stdout.write(`图标产物与重生成结果不一致（${diffs.length} 处）：\n- ${diffs.join("\n- ")}\n`);
      process.exitCode = 1;
      return;
    }
    const bytes = [...files.values()].reduce((sum, data) => sum + data.length, 0);
    process.stdout.write(`图标产物一致：${files.size} 个文件 / ${bytes} 字节\n`);
    return;
  }

  mkdirSync(STORE_DIR, { recursive: true });
  for (const [name, data] of files) writeFileSync(join(STORE_DIR, name), data);
  const bytes = [...files.values()].reduce((sum, data) => sum + data.length, 0);
  process.stdout.write(`已生成 assets/store/ 图标：${files.size} 个文件 / ${bytes} 字节（尺寸 ${ICON_SIZES.join(" / ")}）\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main();
}
