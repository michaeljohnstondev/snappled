// Crops the transparent margin off an icon so the artwork fills its own
// canvas.
//   node tools/trimicon.js <file.png> [more.png ...]
//
// Why this exists: CurrencyIcon draws each asset with resizeMode
// "contain" into a box the caller sizes. If the PNG carries transparent
// padding, "contain" fits the CANVAS to the box and the visible artwork
// lands smaller than asked for — the coin measured 342x344 inside a
// 512x512 canvas, so a coin requested at 24pt drew about 16pt of coin
// and read as undersized next to a 22pt Ionicons glyph everywhere it
// appeared.
//
// The alternative was multiplying the scale factor to compensate, but
// that makes the Image larger than its own container, and an icon that
// overflows its box collides with whatever sits beside it — in the
// resource bar, the number. Fixing the asset keeps the box honest.
//
// Overwrites in place. The originals are in git.

const fs = require('fs');
const { PNG } = require('pngjs');

// Below this alpha a pixel counts as background. Not zero, because
// antialiased edges and any leftover glow fade out gradually and a
// strict test would leave a ring of near-invisible pixels behind,
// defeating the crop.
const ALPHA_FLOOR = 8;

/** Tightest box containing every pixel that is actually visible. */
function contentBox(png) {
  const { width: w, height: h, data } = png;
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[((y * w + x) << 2) + 3] > ALPHA_FLOOR) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return { minX, minY, maxX, maxY };
}

/** Crop one file to its content and write it back. */
function trim(file) {
  const src = PNG.sync.read(fs.readFileSync(file));
  const { minX, minY, maxX, maxY } = contentBox(src);
  if (maxX < 0) { console.log(`${file}: fully transparent, skipped`); return; }

  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  if (w === src.width && h === src.height) {
    console.log(`${file}: already tight (${w}x${h})`);
    return;
  }

  const out = new PNG({ width: w, height: h });
  // Straight copy rather than a resample: cropping must not touch the
  // pixels it keeps, or the art softens every time this is run.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const s = (((y + minY) * src.width) + (x + minX)) << 2;
      const d = ((y * w) + x) << 2;
      out.data[d] = src.data[s];
      out.data[d + 1] = src.data[s + 1];
      out.data[d + 2] = src.data[s + 2];
      out.data[d + 3] = src.data[s + 3];
    }
  }

  fs.writeFileSync(file, PNG.sync.write(out));
  const before = Math.max(src.width, src.height);
  console.log(`${file}: ${src.width}x${src.height} -> ${w}x${h}`
    + ` (art now fills the canvas; was ${(Math.max(w, h) / before * 100).toFixed(1)}%)`);
}

const files = process.argv.slice(2);
if (!files.length) {
  console.error('usage: node tools/trimicon.js <file.png> [more.png ...]');
  process.exit(1);
}
files.forEach(trim);
