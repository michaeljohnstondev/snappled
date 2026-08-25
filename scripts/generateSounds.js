/**
 * generateSounds.js — procedural SFX generator for Snappled.
 *
 * Writes 16-bit mono WAVs into assets/sounds/. These are placeholders
 * with intent: square/saw waves through a soft-clip stage so they read
 * as deliberate chiptune-punk rather than "programmer forgot the audio".
 * Swap in real SFX later by overwriting the files — nothing in the app
 * references anything but the filenames.
 *
 * Run: node scripts/generateSounds.js
 */

const fs = require('fs');
const path = require('path');

const SR = 44100;
const OUT = path.join(__dirname, '..', 'assets', 'sounds');

// ---- synth primitives -------------------------------------------------

const square = (t, f) => (Math.sin(2 * Math.PI * f * t) >= 0 ? 1 : -1);
const saw = (t, f) => 2 * ((t * f) % 1) - 1;

// Soft clip. Drive above ~2 gives the grit; tanh keeps it from tearing.
const drive = (x, amount) => Math.tanh(x * amount) / Math.tanh(amount);

// Percussive envelope: near-instant attack, exponential decay.
const pluck = (i, len, decay = 5) => Math.exp((-decay * i) / len);

// Attack/decay envelope for sustained notes, avoids click at both ends.
function ad(i, len, attack = 0.02) {
  const a = Math.floor(len * attack);
  if (i < a) return i / a;
  const r = (i - a) / (len - a);
  return Math.pow(1 - r, 1.5);
}

// ---- note/sequence helpers -------------------------------------------

function note({ freq, ms, wave = square, gain = 0.5, dist = 3, decay = 5, env = pluck }) {
  const len = Math.floor((ms / 1000) * SR);
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    const e = env === pluck ? pluck(i, len, decay) : ad(i, len);
    out[i] = drive(wave(t, freq), dist) * e * gain;
  }
  return out;
}

const silence = (ms) => new Float32Array(Math.floor((ms / 1000) * SR));

function concat(parts) {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Float32Array(total);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

// Overlay b onto a starting at offsetMs, summing (a is extended if needed).
function layer(a, b, offsetMs = 0) {
  const off = Math.floor((offsetMs / 1000) * SR);
  const out = new Float32Array(Math.max(a.length, off + b.length));
  out.set(a);
  for (let i = 0; i < b.length; i++) out[off + i] += b[i];
  return out;
}

// ---- wav encoding -----------------------------------------------------

function writeWav(name, samples) {
  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) {
    // Clamp before quantising or loud sums wrap around into noise.
    const s = Math.max(-1, Math.min(1, samples[i]));
    data.writeInt16LE(Math.round(s * 32767), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);      // PCM chunk size
  header.writeUInt16LE(1, 20);       // format = PCM
  header.writeUInt16LE(1, 22);       // mono
  header.writeUInt32LE(SR, 24);
  header.writeUInt32LE(SR * 2, 28);  // byte rate
  header.writeUInt16LE(2, 32);       // block align
  header.writeUInt16LE(16, 34);      // bits per sample
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);

  const file = path.join(OUT, name);
  fs.writeFileSync(file, Buffer.concat([header, data]));
  const ms = Math.round((samples.length / SR) * 1000);
  console.log(`  ${name.padEnd(20)} ${ms}ms  ${(fs.statSync(file).size / 1024).toFixed(1)}kb`);
}

// ---- the kit ----------------------------------------------------------

fs.mkdirSync(OUT, { recursive: true });
console.log('Generating Snappled SFX ->', OUT);

// Card picked: tiny neutral select blip. Fires often, so keep it quiet
// and short enough to never step on the next interaction.
writeWav('card-pick.wav', note({ freq: 660, ms: 55, gain: 0.32, dist: 2, decay: 7 }));

// Vote locked in: two-tone descending "chunk". Confirmation, not reward.
writeWav('vote-lock.wav', concat([
  note({ freq: 880, ms: 60, gain: 0.42, dist: 4, decay: 6 }),
  silence(15),
  note({ freq: 587, ms: 90, gain: 0.42, dist: 4, decay: 5 }),
]));

// Countdown tick: dry click, high and brief. Plays up to 10x in a row.
writeWav('countdown-tick.wav', note({ freq: 1200, ms: 35, gain: 0.3, dist: 2, decay: 9 }));

// Round winner: fast rising major arpeggio (C5-E5-G5-C6) with the top
// note held. Reads as "you won this round", not "game complete".
writeWav('round-winner.wav', concat([
  note({ freq: 523, ms: 80, gain: 0.4, dist: 3, decay: 6 }),
  note({ freq: 659, ms: 80, gain: 0.4, dist: 3, decay: 6 }),
  note({ freq: 784, ms: 80, gain: 0.4, dist: 3, decay: 6 }),
  note({ freq: 1047, ms: 320, gain: 0.45, dist: 3, decay: 3 }),
]));

// Game over: the big one. Root+fifth power chord under a rising lead,
// saw layer for weight. This is the only sound allowed to feel earned.
{
  const lead = concat([
    note({ freq: 392, ms: 110, gain: 0.34, dist: 3, decay: 5 }),
    note({ freq: 523, ms: 110, gain: 0.34, dist: 3, decay: 5 }),
    note({ freq: 659, ms: 110, gain: 0.34, dist: 3, decay: 5 }),
    note({ freq: 784, ms: 620, gain: 0.4, dist: 4, decay: 2 }),
  ]);
  const root = note({ freq: 131, ms: 950, wave: saw, gain: 0.26, dist: 5, env: ad });
  const fifth = note({ freq: 196, ms: 950, wave: saw, gain: 0.2, dist: 5, env: ad });
  writeWav('game-over.wav', layer(layer(lead, root, 330), fifth, 330));
}

console.log('Done.');
