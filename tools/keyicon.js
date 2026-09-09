// Cuts the flat background out of a generated icon, drops any baked
// glow, and downscales to a size sane for an app icon.
//   node keyicon.js <src.png> <out.png>
const fs = require('fs');
const { PNG } = require('pngjs');

const [, , SRC, OUT] = process.argv;
const SIZE = 512;
const LOW = 45;    // below this distance from bg = transparent
const HIGH = 110;  // above = fully opaque; between = antialiased rim

const src = PNG.sync.read(fs.readFileSync(SRC));
const w = src.width, h = src.height;
// Background sampled from a corner rather than assumed.
const BG = [src.data[0], src.data[1], src.data[2]];

const pr = new Float64Array(w * h), pg = new Float64Array(w * h);
const pb = new Float64Array(w * h), pa = new Float64Array(w * h);
for (let i = 0; i < w * h; i++) {
  const o = i << 2;
  const d = Math.hypot(src.data[o] - BG[0], src.data[o + 1] - BG[1], src.data[o + 2] - BG[2]);
  let a = (d - LOW) / (HIGH - LOW);
  a = a < 0 ? 0 : a > 1 ? 1 : a;
  pa[i] = a; pr[i] = src.data[o] * a; pg[i] = src.data[o + 1] * a; pb[i] = src.data[o + 2] * a;
}

const out = new PNG({ width: SIZE, height: SIZE });
const sx = w / SIZE, sy = h / SIZE;
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const x0 = Math.floor(x * sx), x1 = Math.min(w, Math.ceil((x + 1) * sx));
    const y0 = Math.floor(y * sy), y1 = Math.min(h, Math.ceil((y + 1) * sy));
    let r = 0, g = 0, b = 0, a = 0, n = 0;
    for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) {
      const i = yy * w + xx; r += pr[i]; g += pg[i]; b += pb[i]; a += pa[i]; n++;
    }
    r /= n; g /= n; b /= n; a /= n;
    const o = ((y * SIZE) + x) << 2;
    out.data[o] = a > 0 ? Math.min(255, Math.round(r / a)) : 0;
    out.data[o + 1] = a > 0 ? Math.min(255, Math.round(g / a)) : 0;
    out.data[o + 2] = a > 0 ? Math.min(255, Math.round(b / a)) : 0;
    out.data[o + 3] = Math.round(a * 255);
  }
}
fs.writeFileSync(OUT, PNG.sync.write(out));

// Tight bounding box of the visible pixels, so optical sizing across
// icons can be matched rather than guessed.
let minX = SIZE, minY = SIZE, maxX = 0, maxY = 0;
for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
  if (out.data[(((y * SIZE) + x) << 2) + 3] > 8) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
}
console.log('bg keyed:', JSON.stringify(BG));
console.log('wrote', OUT, (fs.statSync(OUT).size / 1024).toFixed(0) + ' KB');
console.log('content box:', (maxX - minX + 1) + 'x' + (maxY - minY + 1), 'of', SIZE);
