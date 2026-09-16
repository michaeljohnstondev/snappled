// Strips a baked glow off an icon that already has an alpha channel.
//   node tools/deglow.js <file.png> [floor]
//
// Different job from keyicon.js. That one keys a flat opaque BACKGROUND
// out of an image that has none. This one handles the other case: the
// background is already transparent, but the artwork is wrapped in a
// soft halo of barely-there pixels. Over a white canvas you cannot see
// it; over the app's dark gradient it reads as a grey-violet smear
// around the icon, and it inflates the content box so trimming leaves
// the artwork smaller than it should be.
//
// A glow is separable from an edge by alpha alone. Measured on the
// magenta ticket: 10,564 pixels sat in the 32-63 band (the halo) while
// 682,256 sat above 224 (the mark), with under 900 per bucket in
// between (genuine antialiasing). So everything under the floor goes,
// and what survives is rescaled to keep edges smooth rather than
// hard-clipped into jaggies.
//
// Overwrites in place. The originals are in git.

const fs = require('fs');
const { PNG } = require('pngjs');

const [, , FILE, FLOOR_ARG] = process.argv;
if (!FILE) {
  console.error('usage: node tools/deglow.js <file.png> [floor]');
  process.exit(1);
}
// Below this alpha a pixel is glow, not edge. 64 sits in the empty
// valley between the two populations on every asset measured so far.
const FLOOR = Number(FLOOR_ARG || 64);

/** Widest and tallest extent of pixels above an alpha threshold. */
function extent(png, threshold) {
  const { width: w, height: h, data } = png;
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[((y * w + x) << 2) + 3] > threshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return [maxX - minX + 1, maxY - minY + 1];
}

const png = PNG.sync.read(fs.readFileSync(FILE));
const before = extent(png, 8);
let cleared = 0;

for (let i = 0; i < png.width * png.height; i++) {
  const o = (i << 2);
  const a = png.data[o + 3];
  if (a <= FLOOR) {
    if (a > 0) cleared++;
    png.data[o + 3] = 0;
  } else {
    // Rescale what is left across the full range, so an edge pixel that
    // was 70 does not survive as a ghost at 70.
    png.data[o + 3] = Math.round(((a - FLOOR) / (255 - FLOOR)) * 255);
  }
}

fs.writeFileSync(FILE, PNG.sync.write(png));
const after = extent(png, 8);
console.log(`${FILE}: cleared ${cleared} glow pixels (alpha <= ${FLOOR})`);
console.log(`  content box ${before.join('x')} -> ${after.join('x')}`);
