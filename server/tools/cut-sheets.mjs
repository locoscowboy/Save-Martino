// Cuts the hand-laid sprite sheets in assets/ into one Phaser atlas per character and boss (assets/sprites/<id>.png + .json).
// Usage: npm run sprites [-- jin nonna]      (default: every sheet). Re-run whenever Jin updates a sheet.
// Each sheet is two rows of figures on white with a caption under each figure. Figures are found by ink projection,
// captions dropped, the background made transparent by flood fill from the border (so white aprons and plates survive),
// and every frame scaled so the idle pose is `idle` px tall. The pivot is the feet: bottom edge, centre of the lowest pixels.
// Sheets are read with sharp: some of them are JPEG or WebP data behind a .png name.
import sharp from 'sharp';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(ROOT, 'assets', 'sprites');
const WHITE = 232;       // a pixel whose darkest channel is above this is background
const PAD = 3, GAP = 2, MAX_W = 4096;

// Projectiles and props, cut from detached pieces of the sheets (at: a point inside the piece) or from a box (fade: alpha
// ramp on the left edge where the box cuts through the drawing). width: target width in the atlas, 2.5x the in-game size.
const PROPS = [
  { name: 'plate', sheet: 'nonna', at: [643, 977], width: 75 },
  { name: 'feather', sheet: 'peacock', at: [694, 1098], width: 110 },
  { name: 'baguette', sheet: 'quentin', at: [2120, 977], width: 60 },
  { name: 'sauce', sheet: 'nonna', box: [1350, 930, 1510, 1065], fade: 30, width: 70 },
  { name: 'grill', sheet: 'carlos', box: [2050, 1150, 2250, 1475], fade: 40, width: 180, pivot: { x: 0.5, y: 1 } },
];
const CHAR_ROWS = [['front', 'threequarter', 'side', 'back'], ['idle', 'walk1', 'walk2', 'attack', 'special', 'hurt']];
const BOSS_ROWS = [['idle', 'walk1', 'walk2', 'attack'], ['throw', 'special', 'hurt', 'defeated']];
// idle: target height of the idle frame in the atlas (2.5× the in-game size, crisp on a 1080p TV). facing: which way row 2 looks.
const SHEETS = [
  ...['euge', 'quentin', 'jin', 'oriana'].map(id => ({ id, file: `characters/${id}_sheet.png`, rows: CHAR_ROWS, idle: 240, facing: 1, portraits: ['front'] })),
  { id: 'carlos', file: 'characters/carlos_sheet.png', rows: CHAR_ROWS, idle: 240, facing: 1, portraits: ['front'], holes: { threequarter: [[0.74, 0.65]] } },
  { id: 'bricciola', file: 'characters/bricciola_sheet.png', rows: [['front', 'threequarter', 'side', 'side2', 'back'], CHAR_ROWS[1]], idle: 240, facing: -1, portraits: ['front'] },
  // the generated boss sheets look left at rest and right for most actions: frameFacing says which pose looks which way
  { id: 'nonna', file: 'bosses/nonna_sheet.png', rows: BOSS_ROWS, idle: 375, facing: -1, frameFacing: { attack: 1, throw: 1, special: 1, hurt: 1, defeated: 1 } },
  { id: 'peacock', file: 'bosses/peacock_sheet.png', rows: BOSS_ROWS, idle: 400, facing: -1, frameFacing: { attack: 1, hurt: 1, defeated: 1 }, holes: { idle: [[0.29, 0.87]] } },
  { id: 'martino', file: 'bosses/martino_sheet.png', rows: [['hero', 'idle', 'walk1', 'walk2', 'attack'], ['special', 'hurt', 'defeated', 'tino']], idle: 425, facing: -1, frameFacing: { attack: 1, special: 1, hurt: 1, defeated: 1, tino: 1 }, portraits: ['hero', 'tino'] },
];

async function readImage(file) { const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); return { width: info.width, height: info.height, data }; }
// palette PNGs: a quarter of the size of true-colour ones, and cel-shaded art does not miss the colours
const writeImage = (file, w, h, px) => sharp(Buffer.from(px.buffer, px.byteOffset, px.byteLength), { raw: { width: w, height: h, channels: 4 } }).png({ palette: true, quality: 95, effort: 7, dither: 0.5 }).toFile(file);

// 8-connected components of the ink mask, with bbox, area and centroid.
function components(ink, W, H) {
  const label = new Int32Array(W * H).fill(-1), stack = new Int32Array(W * H), comps = [];
  for (let i = 0; i < W * H; i++) {
    if (!ink[i] || label[i] >= 0) continue;
    const id = comps.length, c = { id, x0: W, y0: H, x1: 0, y1: 0, area: 0, sx: 0, sy: 0 };
    let sp = 0; stack[sp++] = i; label[i] = id;
    while (sp) {
      const p = stack[--sp], x = p % W, y = (p - x) / W;
      c.area++; c.sx += x; c.sy += y; if (x < c.x0) c.x0 = x; if (x + 1 > c.x1) c.x1 = x + 1; if (y < c.y0) c.y0 = y; if (y + 1 > c.y1) c.y1 = y + 1;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const n = ny * W + nx; if (ink[n] && label[n] < 0) { label[n] = id; stack[sp++] = n; }
      }
    }
    c.cx = c.sx / c.area; c.cy = c.sy / c.area; c.w = c.x1 - c.x0; c.h = c.y1 - c.y0;
    comps.push(c);
  }
  return { label, comps };
}

function cutSheet(def, img) {
  const { width: W, height: H, data } = img;
  const ink = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) { const o = i * 4; if (data[o + 3] > 0 && Math.min(data[o], data[o + 1], data[o + 2]) < WHITE) ink[i] = 1; }
  const { label, comps } = components(ink, W, H);

  // captions: rows of letter-sized components sharing a baseline. Paint them white so they never end up in a frame.
  const letters = comps.filter(c => c.h >= 12 && c.h <= 60 && c.w <= 90 && c.area >= 20).sort((a, b) => a.y1 - b.y1);
  const lines = []; for (const c of letters) { const l = lines[lines.length - 1]; if (l && c.y1 - l.y1 <= 10) { l.cs.push(c); l.y1 = c.y1; l.y0 = Math.min(l.y0, c.y0); } else lines.push({ y0: c.y0, y1: c.y1, cs: [c] }); }
  const captions = new Set();
  for (const l of lines) if (l.cs.length >= 6) for (const c of comps) if (c.h <= 60 && c.y0 >= l.y0 - 6 && c.y1 <= l.y1 + 6) captions.add(c.id); // every small thing on that baseline, dashes and digits included
  for (const c of comps) if (captions.has(c.id)) for (let y = c.y0; y < c.y1; y++) for (let x = c.x0; x < c.x1; x++) if (label[y * W + x] === c.id) { ink[y * W + x] = 0; data.fill(255, (y * W + x) * 4, (y * W + x) * 4 + 3); }
  const rest = comps.filter(c => !captions.has(c.id) && c.area >= 8);

  // rows: two centres, each component goes to the nearest (by its centroid), big ones weigh more
  const centres = [H * 0.25, H * 0.75];
  for (let it = 0; it < 10; it++) { const s = [0, 0], n = [0, 0]; for (const c of rest) { const r = Math.abs(c.cy - centres[0]) <= Math.abs(c.cy - centres[1]) ? 0 : 1; s[r] += c.cy * c.area; n[r] += c.area; } for (let r = 0; r < 2; r++) if (n[r]) centres[r] = s[r] / n[r]; }
  if (process.env.DEBUG) console.log(`    row centres y=${centres.map(Math.round).join(', ')}`);
  const rowOf = (c) => (Math.abs(c.cy - centres[0]) <= Math.abs(c.cy - centres[1]) ? 0 : 1);
  const figs = [];
  def.rows.forEach((names, r) => {
    // the N largest components of the row are its figures, left to right
    const mine = rest.filter(c => rowOf(c) === r).sort((a, b) => b.area - a.area).slice(0, names.length);
    if (mine.length < names.length) throw new Error(`${def.id} row ${r + 1}: found ${mine.length} figures, expected ${names.length}`);
    if (mine[mine.length - 1].area < mine[0].area * 0.05) console.log(`  ! row ${r + 1}: the smallest "figure" is tiny (${mine[mine.length - 1].area} px); check the layout in SHEETS`);
    mine.sort((a, b) => a.x0 - b.x0).forEach((c, k) => figs.push({ name: names[k], x0: c.x0, y0: c.y0, x1: c.x1, y1: c.y1, ids: new Set([c.id]) }));
  });
  // leftovers (a flying hat, a thrown plate, shockwave rings) join the nearest figure of either row, closest pairs first so
  // that a chain of pieces (ring, ring, ring) follows its figure as the figure's box grows; anything too far is dropped
  const parts = rest.filter(c => !figs.some(f => f.ids.has(c.id)));
  const dist = (c, f) => Math.max(0, f.x0 - c.x1, c.x0 - f.x1) + 0.5 * Math.max(0, f.y0 - c.y1, c.y0 - f.y1);
  while (parts.length) {
    let bi = -1, bf = null, bd = Infinity;
    parts.forEach((c, i) => { for (const f of figs) { const d = dist(c, f); if (d < bd) { bd = d; bi = i; bf = f; } } });
    const c = parts.splice(bi, 1)[0];
    if (bd > 220) { if (c.area > 400) console.log(`  dropped a ${c.w}×${c.h} piece at ${c.x0},${c.y0} (${Math.round(bd)} px from anything)`); continue; }
    if (process.env.DEBUG && c.area > 150) console.log(`    ${c.w}×${c.h} piece at ${c.x0},${c.y0} (area ${c.area}) → ${bf.name} (d=${Math.round(bd)})`);
    bf.ids.add(c.id); bf.x0 = Math.min(bf.x0, c.x0); bf.x1 = Math.max(bf.x1, c.x1); bf.y0 = Math.min(bf.y0, c.y0); bf.y1 = Math.max(bf.y1, c.y1);
  }
  const frames = figs.map(f => { if (process.env.HOLES) console.log(`    ${f.name}`); return { name: f.name, ...crop(img, label, f, (def.holes || {})[f.name], `${def.id}/${f.name}`) }; });
  return { frames, img, label, comps };
}

// One projectile or prop: the component under `at`, or everything inside `box`.
function cutProp(def, { img, label, comps }) {
  let fig;
  if (def.at) {
    const [x, y] = def.at; const c = comps.find(c => x >= c.x0 && x < c.x1 && y >= c.y0 && y < c.y1 && label[y * img.width + x] === c.id) || comps.filter(c => c.area > 100).sort((a, b) => Math.hypot(a.cx - x, a.cy - y) - Math.hypot(b.cx - x, b.cy - y))[0];
    fig = { x0: c.x0, y0: c.y0, x1: c.x1, y1: c.y1, ids: new Set([c.id]) };
  } else {
    const [x0, y0, x1, y1] = def.box, ids = new Set();
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const l = label[y * img.width + x]; if (l >= 0) ids.add(l); }
    fig = { x0, y0, x1, y1, ids };
  }
  const f = crop(img, label, fig, [], `props/${def.name}`);
  if (def.fade) for (let y = 0; y < f.h; y++) for (let x = 0; x < def.fade + PAD; x++) f.px[(y * f.w + x) * 4 + 3] *= Math.max(0, x - PAD) / def.fade;
  return { name: def.name, ...scale(f, Math.min(1, def.width / f.w)), pivot: def.pivot || { x: 0.5, y: 0.5 } };
}

// Crop a figure (its component plus attached parts) with padding, flood the background from the border to alpha 0, feather the edge pixels.
// holes: extra flood seeds as [x, y] fractions of the box, for background sealed inside an outline (between legs and tail).
function crop(img, label, f, holes = [], what = '') {
  const { x0, y0, x1, y1 } = f, W = img.width, w = x1 - x0 + PAD * 2, h = y1 - y0 + PAD * 2;
  const px = new Uint8ClampedArray(w * h * 4).fill(255);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const sx = x0 - PAD + x, sy = y0 - PAD + y; if (sx < 0 || sy < 0 || sx >= W || sy >= img.height) continue;
    const l = label[sy * W + sx]; if (l >= 0 && !f.ids.has(l)) continue; // a neighbour's ink poking into the box stays white
    const s = (sy * W + sx) * 4, d = (y * w + x) * 4; px[d] = img.data[s]; px[d + 1] = img.data[s + 1]; px[d + 2] = img.data[s + 2]; px[d + 3] = 255;
  }
  const isBg = (i) => Math.min(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]) >= WHITE;
  const bg = new Uint8Array(w * h); const stack = [];
  for (let x = 0; x < w; x++) { stack.push(x, (h - 1) * w + x); } for (let y = 0; y < h; y++) { stack.push(y * w, y * w + w - 1); }
  for (const [fx, fy] of holes) { const i = Math.round(fy * h) * w + Math.round(fx * w); if (isBg(i)) stack.push(i); else console.log(`  ! ${what}: hole seed ${fx},${fy} is not on white`); }
  while (stack.length) { const i = stack.pop(); if (bg[i] || !isBg(i)) continue; bg[i] = 1; const x = i % w, y = (i - x) / w;
    if (x > 0) stack.push(i - 1); if (x < w - 1) stack.push(i + 1); if (y > 0) stack.push(i - w); if (y < h - 1) stack.push(i + w); }
  if (process.env.HOLES) { // diagnostic: enclosed near-white regions (a white apron, or background the fill could not reach)
    const seen = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) { if (bg[i] || seen[i] || !isBg(i)) continue; const st = [i]; seen[i] = 1; let n = 0, sum = 0; while (st.length) { const p = st.pop(); n++; sum += Math.min(px[p * 4], px[p * 4 + 1], px[p * 4 + 2]); const x = p % w, y = (p - x) / w; for (const q of [p - 1, p + 1, p - w, p + w]) { const qx = q % w; if (q < 0 || q >= w * h || Math.abs(qx - x) > 1 || seen[q] || bg[q] || !isBg(q)) continue; seen[q] = 1; st.push(q); } }
      if (n >= 150) console.log(`      hole ${n} px, mean ${(sum / n).toFixed(1)}`); }
  }
  for (let i = 0; i < w * h; i++) {
    if (bg[i]) { px[i * 4 + 3] = 0; continue; }
    const x = i % w, y = (i - x) / w;
    const edge = (x > 0 && bg[i - 1]) || (x < w - 1 && bg[i + 1]) || (y > 0 && bg[i - w]) || (y < h - 1 && bg[i + w]);
    if (edge) { const m = Math.min(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]); if (m > 170) px[i * 4 + 3] = Math.round(255 * (255 - m) / 85); }
  }
  return { w, h, px };
}

// Area-average downscale on premultiplied alpha.
function scale(f, s) {
  if (s >= 1) return f;
  const w = Math.max(1, Math.ceil(f.w * s)), h = Math.max(1, Math.ceil(f.h * s));
  const acc = new Float64Array(w * h * 4), cnt = new Uint32Array(w * h);
  for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) {
    const o = Math.min(h - 1, Math.floor(y * s)) * w + Math.min(w - 1, Math.floor(x * s)), i = (y * f.w + x) * 4, a = f.px[i + 3] / 255;
    acc[o * 4] += f.px[i] * a; acc[o * 4 + 1] += f.px[i + 1] * a; acc[o * 4 + 2] += f.px[i + 2] * a; acc[o * 4 + 3] += a; cnt[o]++;
  }
  const px = new Uint8ClampedArray(w * h * 4);
  for (let o = 0; o < w * h; o++) { const a = acc[o * 4 + 3]; if (!a) continue; px[o * 4] = acc[o * 4] / a; px[o * 4 + 1] = acc[o * 4 + 1] / a; px[o * 4 + 2] = acc[o * 4 + 2] / a; px[o * 4 + 3] = 255 * a / cnt[o]; }
  return { w, h, px };
}

// Where the feet are: centre of the opaque pixels in the lowest rows, as a fraction of the width.
function pivotX(f) {
  const rows = Math.max(2, Math.round(f.h * 0.06)); let sum = 0, n = 0;
  for (let y = f.h - rows; y < f.h; y++) for (let x = 0; x < f.w; x++) if (f.px[(y * f.w + x) * 4 + 3] > 128) { sum += x; n++; }
  return n ? Math.round(sum / n / f.w * 1000) / 1000 : 0.5;
}

async function pack(def, frames, key = def.id) {
  // shelf packing, left to right, new shelf when the row is full
  let x = 0, y = 0, rowH = 0, maxW = 0;
  for (const f of frames) {
    if (x + f.w > MAX_W) { x = 0; y += rowH + GAP; rowH = 0; }
    f.x = x; f.y = y; x += f.w + GAP; rowH = Math.max(rowH, f.h); maxW = Math.max(maxW, x - GAP);
  }
  const aw = maxW, ah = y + rowH, atlas = new Uint8ClampedArray(aw * ah * 4);
  const out = { frames: {}, meta: { app: 'save-martino cut-sheets', image: `${key}.png`, size: { w: aw, h: ah }, scale: '1', facing: def.facing, idle: null } };
  for (const f of frames) {
    for (let yy = 0; yy < f.h; yy++) atlas.set(f.px.subarray(yy * f.w * 4, (yy + 1) * f.w * 4), ((f.y + yy) * aw + f.x) * 4);
    // facing: which way this pose looks; the generated boss sheets are not consistent from one pose to the next
    out.frames[f.name] = { frame: { x: f.x, y: f.y, w: f.w, h: f.h }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: f.w, h: f.h }, sourceSize: { w: f.w, h: f.h },
      pivot: f.pivot || { x: pivotX(f), y: 1 }, facing: (def.frameFacing || {})[f.name] ?? def.facing ?? 1 };
    if (f.name === 'idle') out.meta.idle = { w: f.w, h: f.h };
  }
  await writeImage(path.join(OUT, `${key}.png`), aw, ah, atlas);
  writeFileSync(path.join(OUT, `${key}.json`), JSON.stringify(out, null, 1));
  return out;
}

mkdirSync(OUT, { recursive: true });
const only = process.argv.slice(2);
const analysed = new Map(); // sheet id → { img, label, comps }, reused by the props
for (const def of SHEETS) {
  if (only.length && !only.includes(def.id)) continue;
  console.log(`${def.id} (${def.file})`);
  const { frames: raw, ...analysis } = cutSheet(def, await readImage(path.join(ROOT, 'assets', def.file)));
  analysed.set(def.id, analysis);
  const idle = raw.find(f => f.name === 'idle');
  const s = def.idle / idle.h;
  const frames = raw.map(f => ({ name: f.name, ...scale(f, s) }));
  for (const name of def.portraits || []) { const p = frames.find(f => f.name === name); await writeImage(path.join(OUT, `${def.id}_${name}.png`), p.w, p.h, p.px); }
  const atlas = await pack(def, frames);
  console.log(`  ${frames.length} frames, scale ${s.toFixed(3)}, atlas ${atlas.meta.size.w}×${atlas.meta.size.h}: ` + frames.map(f => `${f.name} ${f.w}×${f.h}`).join(', '));
}
if (!only.length || only.includes('props')) {
  console.log('props');
  const props = [];
  for (const p of PROPS) {
    if (!analysed.has(p.sheet)) { const def = SHEETS.find(d => d.id === p.sheet); const { frames: _f, ...a } = cutSheet(def, await readImage(path.join(ROOT, 'assets', def.file))); analysed.set(p.sheet, a); }
    props.push(cutProp(p, analysed.get(p.sheet)));
  }
  const atlas = await pack({ id: 'props', facing: 1 }, props);
  console.log(`  ${props.length} props, atlas ${atlas.meta.size.w}×${atlas.meta.size.h}: ` + props.map(f => `${f.name} ${f.w}×${f.h}`).join(', '));
}
