// Rasterises the LogoMark outlines into the PNGs a home-screen install needs.
// Hand-rolled rather than pulling in a graphics library: the mark is a handful
// of quadratic outlines, and a build-time dependency for four PNGs that change
// once a year is a poor trade.
import zlib from "node:zlib";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { polygons, BOX, NAVY } from "./icon-mark.mjs";

function crc32(buf) {
  let c, table = [];
  for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c >>> 0; }
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0)),
  ]);
}

// Scanline fill at 4x, then box-downsample — cheap antialiasing without a
// graphics library.
const SS = 4;
function render(size, { radius, scale }) {
  const W = size * SS;
  const rgb = new Float64Array(W * W * 3);
  const alpha = new Float64Array(W * W);
  const put = (x, y, [r, g, b]) => { const i = y * W + x; rgb[i * 3] = r; rgb[i * 3 + 1] = g; rgb[i * 3 + 2] = b; alpha[i] = 1; };

  // background: rounded square
  const R = W * radius;
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const px = x + 0.5, py = y + 0.5;
    const dx = Math.max(R - px, 0, px - (W - R)), dy = Math.max(R - py, 0, py - (W - R));
    if (dx === 0 || dy === 0 || dx * dx + dy * dy <= R * R) put(x, y, NAVY);
  }

  // Fit the drawing's own bounds into the icon, uniformly, centred.
  const k = (W * scale) / Math.max(BOX.w, BOX.h);
  const offX = (W - BOX.w * k) / 2, offY = (W - BOX.h * k) / 2;
  const toPx = ([dx, dy]) => [offX + (dx - BOX.x) * k, offY + (dy - BOX.y) * k];

  for (const poly of polygons()) {
    const pts = poly.pts.map(toPx);
    let minY = Infinity, maxY = -Infinity;
    for (const [, py] of pts) { minY = Math.min(minY, py); maxY = Math.max(maxY, py); }
    for (let y = Math.max(0, Math.floor(minY)); y < Math.min(W, Math.ceil(maxY)); y++) {
      const yc = y + 0.5, xs = [];
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i], [xj, yj] = pts[j];
        if ((yi > yc) !== (yj > yc)) xs.push(((xj - xi) * (yc - yi)) / (yj - yi) + xi);
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2)
        for (let x = Math.max(0, Math.ceil(xs[k] - 0.5)); x < Math.min(W, Math.ceil(xs[k + 1] - 0.5)); x++)
          if (alpha[y * W + x]) put(x, y, poly.fill);
    }
  }

  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const i = (y * SS + sy) * W + x * SS + sx;
      r += rgb[i * 3]; g += rgb[i * 3 + 1]; b += rgb[i * 3 + 2]; a += alpha[i];
    }
    const n = SS * SS, i = (y * size + x) * 4;
    out[i] = a ? Math.round(r / a) : 0;
    out[i + 1] = a ? Math.round(g / a) : 0;
    out[i + 2] = a ? Math.round(b / a) : 0;
    out[i + 3] = Math.round((a / n) * 255);
  }
  return out;
}

// Run with `npm run icons --workspace client` after editing icon-mark.mjs.
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public");
for (const [name, size, opts] of [
  ["icon-192.png", 192, { radius: 0.2, scale: 0.88 }],
  ["icon-512.png", 512, { radius: 0.2, scale: 0.88 }],
  ["icon-maskable-512.png", 512, { radius: 0, scale: 0.64 }],
  ["apple-touch-icon.png", 180, { radius: 0, scale: 0.82 }],
  ["favicon.png", 64, { radius: 0.2, scale: 0.94 }],
]) {
  fs.writeFileSync(path.join(dir, name), png(size, render(size, opts)));
  console.log(name, size);
}
