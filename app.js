'use strict';

/* ------------------------------------------------------------------ *
 * Pallet Planner — loose part stacking on the shop pallet.
 *
 * Parts ship loose: the cardboard is scrapped, so only part size, part
 * weight and piece count drive the plan. Fixed shop constraints:
 * 44 × 48 in pallet (44 front-to-back, 48 across), 4 3/4 in thick,
 * 26 in total height, 2,700 lb total load (pallet
 * included), sides flush, a little overhang allowed at the back only.
 *
 * Canonical internal units are cm and kg; the UI reads and writes
 * inches/pounds or cm/kg depending on the unit switch.
 * ------------------------------------------------------------------ */

/* rho is the density in g/cm³, which is what turns a measured size into a
 * weight. Carbon and alloy steels are all about 7.85; the stainless grades
 * are slightly heavier for the same size. */
const MATERIALS = [
  { id: 'A105', desc: 'Carbon steel · forged', rho: 7.85 },
  { id: 'A130', desc: 'Carbon steel', rho: 7.85 },
  { id: 'A185', desc: 'Carbon steel', rho: 7.85 },
  { id: 'A350', desc: 'A350 LF2 · carbon steel', rho: 7.85 },
  { id: 'F304-304L', desc: 'Stainless · forged, dual-certified 304/304L', rho: 7.93 },
  { id: 'F316-316L', desc: 'Stainless · forged, dual-certified 316/316L', rho: 8.0 },
  { id: 'F22', desc: 'Alloy steel · 2¼Cr-1Mo', rho: 7.85 },
  { id: 'C22', desc: 'Hastelloy C22 · nickel alloy', rho: 8.69 },
  { id: 'OTHER', desc: 'Mixed or unlisted grade', rho: 7.85 }
];

const CM_PER_IN = 2.54;
const LB_PER_KG = 2.2046226218;

const LEN_FIELDS = ['rOD', 'rBore', 'rThick'];
const WT_FIELDS = ['rWeight'];
const COUNT_FIELDS = ['rQty', 'rPerLayer', 'rPerRow'];
const NUMERIC = [...LEN_FIELDS, ...WT_FIELDS, ...COUNT_FIELDS];

/* Paperwork, not measurements: the same part and heat can ship on more than one
 * purchase order, so the order number goes on the sheet and the card too. */
const TEXT_FIELDS = ['rPO', 'rHeat'];

/* Lettered dimensions as they read on the part print. Optional: they are
 * recorded and printed alongside the plan, and never change the packing
 * maths — the plan still stacks on diameter, thickness and piece weight. */
/* The shop's dimension card letters, with the target off the print. They
 * print as they read on the card — f is lowercase there. */
/* Cards differ part to part — one print carries O/C/X/Y/B, another
 * O/C/R/X/Y/A/J/f — so the planner offers the whole set and the sheet
 * prints only the letters filled in for this part. */
const DIM_LETTERS = [
  { key: 'O', letter: 'O', role: 'Overall width' },
  { key: 'C', letter: 'C', role: 'Wall at the bottom' },
  { key: 'R', letter: 'R', role: 'Raised-face width' },
  { key: 'X', letter: 'X', role: 'Spout, bottom' },
  { key: 'Y', letter: 'Y', role: 'Overall height' },
  { key: 'A', letter: 'A', role: 'Top of the cone' },
  { key: 'J', letter: 'J', role: 'Bore' },
  { key: 'F', letter: 'f', role: 'Raised-face height' },
  { key: 'B', letter: 'B', role: 'Bore' }
];
const DIM_FIELDS = DIM_LETTERS.map(({ key }) => `dim${key}T`);

const IN = (v) => v * CM_PER_IN;
const LB = (v) => v / LB_PER_KG;

const DEFAULTS = {
  material: 'A105',
  partShape: 'ring'
};

/* The pallet and the shipping limits are the same on every load, so nobody
 * types them and they are not on screen. They still print on the plan sheet,
 * and the 26 in / 2,700 lb are totals including the pallet. */
const PALLET = {
  palletL: IN(44), palletW: IN(48), palletH: IN(4.75), palletTare: LB(55),
  maxHeight: IN(26), maxLoad: LB(2700), backOverhang: IN(1)
};

const nf0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const $ = (id) => document.getElementById(id);

let units = 'imperial';

/* True while the weight on screen came from the size and the grade rather than
 * from a part on a scale. The card says so: a guessed weight hides an
 * overweight pallet. */
let weightIsEstimate = false;

/* ----------------------------- units ----------------------------- */

const lenUnit = () => (units === 'imperial' ? 'in' : 'cm');
const wtUnit = () => (units === 'imperial' ? 'lb' : 'kg');
const toDisplayLen = (cm) => (units === 'imperial' ? cm / CM_PER_IN : cm);
const toDisplayWt = (kg) => (units === 'imperial' ? kg * LB_PER_KG : kg);
const fromDisplayLen = (v) => (units === 'imperial' ? v * CM_PER_IN : v);
const fromDisplayWt = (v) => (units === 'imperial' ? v / LB_PER_KG : v);
const round4 = (v) => Math.round(v * 10000) / 10000;

/** Dimension text: whole numbers stay whole, otherwise one decimal. */
function fmtDim(cm) {
  const v = Math.round(toDisplayLen(cm) * 10) / 10;
  return Number.isInteger(v) ? nf0.format(v) : nf1.format(v);
}

function fmtKg(kg) {
  const v = Math.round(toDisplayWt(kg) * 10) / 10;
  return Number.isInteger(v) ? nf0.format(v) : nf1.format(v);
}

const fmtKg0 = (kg) => nf0.format(toDisplayWt(kg));

/** Dimension targets keep three decimals, the way the shop card reads. */
const fmtSpec3 = (cm) => toDisplayLen(cm).toFixed(3);

const manualLimit = () => (units === 'imperial' ? 50 : 23);
const manualLimitText = () => (units === 'imperial' ? '50 lb' : '23 kg');

/* ----------------------------- state ----------------------------- */

function readState() {
  const s = { ...PALLET, material: $('material').value, partShape: $('partShape').value };
  for (const key of LEN_FIELDS) {
    const v = parseFloat($(key).value);
    s[key] = Number.isFinite(v) && v > 0 ? fromDisplayLen(v) : 0;
  }
  for (const key of WT_FIELDS) {
    const v = parseFloat($(key).value);
    s[key] = Number.isFinite(v) && v > 0 ? fromDisplayWt(v) : 0;
  }
  for (const key of COUNT_FIELDS) {
    const v = parseFloat($(key).value);
    s[key] = Number.isFinite(v) && v > 0 ? v : 0;
  }
  s.useCallout = $('useCallout').checked;
  s.po = ($('rPO').value || '').trim();
  s.heat = ($('rHeat').value || '').trim();
  s.dims = {};
  for (const { key } of DIM_LETTERS) {
    const v = parseFloat($(`dim${key}T`).value);
    s.dims[key] = Number.isFinite(v) && v > 0 ? fromDisplayLen(v) : null;
  }
  return s;
}

function materialOf(id) {
  return MATERIALS.find((m) => m.id === id) || MATERIALS[MATERIALS.length - 1];
}

/* ------------------------- weight estimate ------------------------ */

/* What each letter tells the planner, read the way the shop reads the card:
 * O is always the width across, Y the overall height, B and J the bore, C the
 * wall thickness at the bottom, R and f the raised face on the bottom, A the
 * top of the cone and X the bottom of the spout. A card only carries some of
 * them, so anything missing falls back to the plain part size. */
function cardGeom(s) {
  const d = s.useCallout ? (s.dims || {}) : {};
  const ring = s.partShape === 'ring';
  const outer = d.O || s.rOD || 0;
  const height = d.Y || s.rThick || 0;

  let bore = ring ? (d.B || d.J || s.rBore || 0) : 0;
  if (ring && !bore && d.O && d.C && d.O > 2 * d.C) bore = d.O - 2 * d.C;
  bore = Math.min(bore, outer);

  /* Some prints carry the bore the finished part will have while the forging
   * in the box is solid — the 114802F 16" 300# weld-neck sheet reads J 14.69.
   * Carving that bore out of a solid part halves its weight and doubles what
   * goes on a pallet, so on a solid part the letter is printed for the record
   * and never used, and the screen says so rather than dropping it quietly. */
  const boreLetter = !ring && (d.B || d.J) ? (d.B ? 'B' : 'J') : null;
  const boreOnPrint = boreLetter ? d[boreLetter] : 0;

  /* A and X are the width across the top of the cone. A number no wider than
   * the bore cannot be a diameter at all — one card's X reads a spout length
   * there — and a cone narrowing inside its own bore would count a fraction of
   * the part: one A105 card read 2.9 lb against 7.445 lb on the scale. So a
   * letter that does not describe a real annulus is left out of the volume and
   * the part counts as a straight ring, which is the heavy side, never the
   * light one. */
  /* Which of the two is the outside depends on the print. On a bored weld-neck
   * A is the face inside the bore, but on the solid cone 243660F A 8.810 is the
   * flat top inside an X of 11.94. A solid part has no inner diameter at all,
   * so it takes the wider of the two — the envelope, heavy rather than light. */
  const cardTop = ring ? (d.A || d.X || 0) : Math.max(d.A || 0, d.X || 0);
  const topLetter = d.A && cardTop === d.A ? 'A' : 'X';
  const tapers = cardTop > bore;
  const top = tapers ? cardTop : outer;
  const ignoredTop = cardTop > 0 && !tapers ? topLetter : null;

  const used = [];
  if (d.O) used.push('O');
  if (d.Y) used.push('Y');
  if (ring && (d.B || d.J)) used.push(d.B ? 'B' : 'J');
  else if (ring && bore > 0 && d.C && d.O) used.push('C');
  if (tapers) used.push(topLetter);
  if (d.R && d.F) used.push('R, f');

  return {
    outer, height, top, bore, cardTop, tapers, ignoredTop, boreLetter, boreOnPrint,
    faceW: d.R || 0, faceH: d.F || 0, used
  };
}

/* Volume of the turned part, in cm³: O at the bottom tapering to A (or X) at
 * the top — a plain ring when the card gives no taper — with the bore taken
 * out through it and the bottom face set back where R and f describe a raised
 * face. */
function partVolumeCm3(s) {
  const g = cardGeom(s);
  if (!(g.outer > 0) || !(g.height > 0)) return 0;

  // a ring cone: the same annulus at the bottom and the top, tapering
  // between them, so a plain ring comes out as area × height exactly
  const areaAt = (dia) => (Math.PI / 4) * Math.max(0, dia * dia - g.bore * g.bore);
  const a0 = areaAt(g.outer);
  const a1 = areaAt(g.top);
  let vol = (g.height / 3) * (a0 + Math.sqrt(a0 * a1) + a1);

  if (g.faceW > 0 && g.faceH > 0) {
    const faceOuter = Math.min(g.outer, g.bore + 2 * g.faceW);
    vol -= (Math.PI / 4) * Math.max(0, g.outer * g.outer - faceOuter * faceOuter) * g.faceH;
  }
  return Math.max(0, vol);
}

/** Weight per part off the geometry and the grade's density, in kg. */
function estimateWeightKg(s) {
  const g = cardGeom(s);
  if (!(g.outer > 0) || !(g.height > 0)) return 0;
  return partVolumeCm3(s) * materialOf(s.material).rho / 1000;
}

/** Which card letters the estimate actually came from. */
function estimateCardNote(s) {
  const g = cardGeom(s);
  const used = g.used.slice();
  if (s.partShape !== 'ring') used.push('solid');
  return used.length ? ` — from the card: ${used.join(', ')}` : '';
}

/** Usable footprint: full pallet width, plus the allowed back overhang. */
const usableLength = (s) => s.palletL + s.backOverhang;

/* --------------------------- packing ----------------------------- */

/** Straight rows, every row the same count, so rows are easy to count. */
function squareGrid(L, W, od) {
  const cols = Math.max(0, Math.floor(L / od));
  const rows = Math.max(0, Math.floor(W / od));
  return { stagger: false, cols, rows, count: cols * rows };
}

function centersFor(layout, od) {
  const pts = [];
  for (let i = 0; i < layout.rows; i++) {
    for (let j = 0; j < layout.cols; j++) {
      pts.push([od / 2 + j * od, od / 2 + i * od]);
    }
  }
  return pts;
}

/** Lined-up rows, both ways round; whichever orientation holds more wins. */
function roundLayout(palletL, palletW, od) {
  const options = [];
  for (const swapped of [false, true]) {
    const L = swapped ? palletW : palletL;
    const W = swapped ? palletL : palletW;
    options.push({ ...squareGrid(L, W, od), swapped, L, W });
  }
  options.sort((a, b) => b.count - a.count);
  const best = options[0];
  const centers = centersFor(best, od).map(([x, y]) => (best.swapped ? [y, x] : [x, y]));
  return { ...best, centers };
}

function calcPlan(s) {
  const od = s.rOD;
  const bore = s.partShape === 'ring' ? Math.min(s.rBore, od) : 0;
  const layout = roundLayout(usableLength(s), s.palletW, od);

  /* The stacker's own count wins over the size: a part that nests, or one
   * whose ears are wider than the body, only holds together on the floor. */
  const typedPerLayer = Math.max(0, Math.round(s.rPerLayer || 0));
  const handCount = typedPerLayer > 0;
  const gridPerLayer = layout.count;
  const perLayer = handCount ? typedPerLayer : gridPerLayer;

  /* Rows only make sense when the typed layer divides into the typed row. */
  const typedPerRow = Math.max(0, Math.round(s.rPerRow || 0));
  const typedRows = handCount && typedPerRow > 0 && typedPerLayer % typedPerRow === 0
    ? typedPerLayer / typedPerRow
    : 0;

  const usableHeight = Math.max(0, s.maxHeight - s.palletH);
  const layersByHeight = s.rThick > 0 ? Math.floor(usableHeight / s.rThick) : 0;

  // limit is total load, so the pallet itself comes off the top
  const availableLoad = Math.max(0, s.maxLoad - s.palletTare);
  const layersByWeight = (s.maxLoad > 0 && s.rWeight > 0 && perLayer > 0)
    ? Math.floor(availableLoad / (s.rWeight * perLayer))
    : Infinity;

  const layers = Math.max(0, Math.min(layersByHeight, layersByWeight));
  const capacity = perLayer * layers;
  const qty = Math.round(s.rQty);
  const pallets = capacity > 0 ? Math.ceil(qty / capacity) : 0;

  const unitsOnFull = pallets > 1 ? capacity : Math.min(qty, capacity);
  const layersOnFull = perLayer > 0
    ? (pallets > 1 ? layers : Math.min(layers, Math.ceil(unitsOnFull / perLayer)))
    : 0;

  const lastUnits = pallets > 1 ? qty - (pallets - 1) * capacity : qty;

  // Breakdown for the printed sheet, capped so a huge count stays light.
  const perPallet = [];
  const MAX_ROWS = 200;
  if (perLayer > 0) {
    for (let i = 0; i < Math.min(pallets, MAX_ROWS); i++) {
      const units = Math.min(capacity, qty - i * capacity);
      if (units <= 0) break;
      const layerCount = Math.ceil(units / perLayer);
      perPallet.push({
        units,
        layers: layerCount,
        partsKg: units * s.rWeight,
        totalKg: units * s.rWeight + s.palletTare,
        height: s.palletH + layerCount * s.rThick
      });
    }
  }

  return {
    layout, perLayer, gridPerLayer, handCount, typedPerRow, typedRows, bore, layersByHeight, layersByWeight, layers, capacity,
    qty, pallets, unitsOnFull, layersOnFull, perPallet,
    stackHeight: s.palletH + layersOnFull * s.rThick,
    palletWeight: unitsOnFull * s.rWeight + s.palletTare,
    lastUnits,
    lastLayers: perLayer > 0 ? Math.ceil(lastUnits / perLayer) : 0,
    lastWeight: lastUnits * s.rWeight + s.palletTare,
    usedHeight: s.palletH + layers * s.rThick,
    headroom: s.maxHeight - (s.palletH + layers * s.rThick),
    totalLoad: qty * s.rWeight
  };
}

/* ----------------------------- view ------------------------------ */

function tile(icon, value, unit, caption) {
  return `<div class="tile">
    <span class="icon" aria-hidden="true">${icon}</span>
    <div class="body">
      <div class="val">${value}${unit ? `<small>${unit}</small>` : ''}</div>
      <div class="cap">${caption}</div>
    </div>
  </div>`;
}

function tilesHtml(rows) {
  return rows.map(([icon, value, unit, caption]) => tile(icon, value, unit, caption)).join('');
}

function note(text, cls) {
  return `<div class="note${cls ? ' ' + cls : ''}">${text}</div>`;
}

function plural(n, word) {
  return `${nf0.format(n)} ${word}${n === 1 ? '' : 's'}`;
}

function setBanner(text, cls) {
  const el = $('banner');
  el.className = 'banner ' + cls;
  el.textContent = text;
}

function overhangNote(s) {
  if (s.backOverhang > 0) {
    return `nothing over the sides, ${fmtDim(s.backOverhang)} ${lenUnit()} allowed past the back edge`;
  }
  return 'nothing over the sides or the back';
}

function renderEmptyState() {
  setBanner('Waiting for part details', 'idle');
  $('preview').innerHTML = '<div class="empty">Enter the part size and piece count to preview the pallet.</div>';
  $('tiles').innerHTML = tilesHtml([
    ['🪵', '—', '', 'Pallets needed'],
    ['📦', '—', 'pcs', 'Pcs / pallet'],
    ['🧱', '—', '', 'Layers / pallet'],
    ['▦', '—', '', 'Pcs / layer'],
    ['⚖️', '—', '', 'Est. pallet wt'],
    ['📏', '—', '', 'Est. stack ht']
  ]);
  $('notes').innerHTML = note(
    'Enter the outside diameter, bore, thickness, piece weight and count from the label. The pallet and the limits are already set.'
  );
}

/* ------------------------ isometric preview ---------------------- */

const COS30 = Math.cos(Math.PI / 6);
const SIN30 = 0.5;
const EDGE = 'rgba(0,0,0,0.45)';
const POLY_BUDGET = 900;

function project(x, y, z) {
  return [(x - y) * COS30, (x + y) * SIN30 - z];
}

function makeScene() {
  const shapes = [];
  function quad(pts, fill, stroke) {
    shapes.push({ pts: pts.map((p) => project(p[0], p[1], p[2])), fill, stroke });
  }
  function poly(pts, fill, stroke) {
    shapes.push({ pts, fill, stroke });
  }
  return { shapes, quad, poly };
}

function palletQuad(quad, palletL, palletW, deck) {
  quad([[-6, -6, 0], [palletL + 6, -6, 0], [palletL + 6, palletW + 6, 0], [-6, palletW + 6, 0]],
    'rgba(0,0,0,0.5)', null);
  quad([[0, palletW, 0], [palletL, palletW, 0], [palletL, palletW, deck], [0, palletW, deck]], '#6b4720', EDGE);
  quad([[palletL, 0, 0], [palletL, palletW, 0], [palletL, palletW, deck], [palletL, 0, deck]], '#875a29', EDGE);
  quad([[0, 0, deck], [palletL, 0, deck], [palletL, palletW, deck], [0, palletW, deck]], '#b98342', EDGE);
}

function addCylinder(shapes, cx, cy, r, z0, z1, topFill, sideFill, boreR) {
  const N = 16;
  const top = [];
  const bottom = [];
  for (let k = 0; k < N; k++) {
    const a = (k / N) * Math.PI * 2;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    top.push(project(x, y, z1));
    bottom.push(project(x, y, z0));
  }
  shapes.push({ pts: top.concat(bottom.slice().reverse()), fill: sideFill, stroke: EDGE });
  shapes.push({ pts: top, fill: topFill, stroke: EDGE });

  if (boreR > 0.01) {
    const bore = [];
    for (let k = 0; k < N; k++) {
      const a = (k / N) * Math.PI * 2;
      bore.push(project(cx + Math.cos(a) * boreR, cy + Math.sin(a) * boreR, z1));
    }
    shapes.push({ pts: bore, fill: '#242b32', stroke: 'rgba(0,0,0,0.55)' });
  }
}

/** Dense layers are drawn as one solid band instead of thousands of parts. */
function addSlab(quad, x0, y0, x1, y1, z0, z1, topFill) {
  quad([[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], '#5f6b78', EDGE);
  quad([[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], '#7d8a97', EDGE);
  quad([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], topFill, EDGE);
}

function sceneToHtml(shapes, label, badge) {
  if (!shapes.length) return '<div class="empty">Nothing to draw yet.</div>';

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const shape of shapes) {
    for (const [px, py] of shape.pts) {
      if (px < minX) minX = px;
      if (px > maxX) maxX = px;
      if (py < minY) minY = py;
      if (py > maxY) maxY = py;
    }
  }
  const pad = 3;
  const w = Math.max(1, maxX - minX) + pad * 2;
  const h = Math.max(1, maxY - minY) + pad * 2;
  const viewBox = `${(minX - pad).toFixed(2)} ${(minY - pad).toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)}`;

  const body = shapes.map((shape) => {
    const pts = shape.pts.map((p) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(' ');
    return `<polygon points="${pts}" fill="${shape.fill}"${shape.stroke ? ` stroke="${shape.stroke}" stroke-width="0.35"` : ''}/>`;
  }).join('');

  return `<span class="badge">${badge}</span>
    <svg viewBox="${viewBox}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${label}">
      ${body}
    </svg>`;
}

function planPreview(s, r) {
  if (!r || r.perLayer === 0 || r.layers === 0) {
    return '<div class="empty">Enter the part size and piece count to preview the pallet.</div>';
  }

  const { shapes, quad } = makeScene();
  palletQuad(quad, s.palletL, s.palletW, s.palletH);

  const dense = r.perLayer > 60;
  const layersByBudget = Math.max(1, Math.min(40, Math.floor(POLY_BUDGET / Math.max(1, r.perLayer * 3))));
  const maxLayers = dense ? Math.min(r.layers, 8) : Math.min(r.layers, layersByBudget);

  if (dense) {
    const r0 = s.rOD / 2;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [cx, cy] of r.layout.centers) {
      if (cx - r0 < x0) x0 = cx - r0;
      if (cx + r0 > x1) x1 = cx + r0;
      if (cy - r0 < y0) y0 = cy - r0;
      if (cy + r0 > y1) y1 = cy + r0;
    }
    for (let l = 0; l < maxLayers; l++) {
      const z0 = s.palletH + l * s.rThick;
      const z1 = z0 + s.rThick;
      const isTop = l === r.layers - 1;
      const topFill = isTop ? '#d7e1ec' : (l % 2 === 0 ? '#c2ccd7' : '#b3becb');
      addSlab(quad, x0, y0, x1, y1, z0, z1, topFill);
    }
  } else {
    const centers = r.layout.centers.slice().sort((a, b) => (a[0] + a[1]) - (b[0] + b[1]));
    for (let l = 0; l < maxLayers; l++) {
      const z0 = s.palletH + l * s.rThick;
      const z1 = z0 + s.rThick;
      const isTop = l === r.layers - 1;
      const topFill = isTop ? '#d7e1ec' : (l % 2 === 0 ? '#c2ccd7' : '#b3becb');
      for (const [cx, cy] of centers) {
        addCylinder(shapes, cx, cy, s.rOD / 2, z0, z1, topFill, '#5f6b78', r.bore / 2);
      }
    }
  }

  const clipped = maxLayers < r.layers;
  const badge = `${plural(r.layers, 'layer')} · ${nf0.format(r.perLayer)} pcs/layer` +
    `${r.handCount ? ' · as counted' : ''}${clipped || dense ? ' · schematic' : ''}`;
  return sceneToHtml(shapes, `Isometric preview of ${nf0.format(r.perLayer)} parts per layer on a pallet`, badge);
}

/* ----------------------------- render ---------------------------- */

function updateMaterialHint() {
  const mat = materialOf($('material').value);
  $('materialHint').textContent = `${mat.desc} · ${mat.rho} g/cm³`;
}

/* The fixed pallet, in whatever units are on screen. */
function updateFixedLine() {
  $('fixedLine').textContent =
    `Pallet and limits are fixed: ${fmtDim(PALLET.palletL)} × ${fmtDim(PALLET.palletW)} ${lenUnit()} deck, ` +
    `${fmtDim(PALLET.maxHeight)} ${lenUnit()} total height, ${fmtKg0(PALLET.maxLoad)} ${wtUnit()} total weight, ` +
    `${fmtDim(PALLET.backOverhang)} ${lenUnit()} allowed past the back. They print on the plan sheet.`;
}

function updateEstimateLine(s) {
  const el = $('estWeight');
  const kg = estimateWeightKg(s);
  if (!kg) {
    el.textContent = 'Fill in the part size, or the card, and this gives a weight per part.';
    return;
  }
  const mat = materialOf(s.material);
  el.textContent = `Size + ${mat.id} ≈ ${fmtKg(kg)} ${wtUnit()} each` +
    `${estimateCardNote(s)}. The label weight still wins.`;
}

function updateUnitLabels() {
  document.querySelectorAll('[data-unit="len"]').forEach((el) => {
    el.textContent = lenUnit();
  });
  document.querySelectorAll('[data-unit="wt"]').forEach((el) => {
    el.textContent = wtUnit();
  });
}

function render() {
  const s = readState();

  $('boreField').hidden = s.partShape !== 'ring';
  $('calloutFields').hidden = !s.useCallout;
  $('unitImp').classList.toggle('is-active', units === 'imperial');
  $('unitMet').classList.toggle('is-active', units === 'metric');

  updateMaterialHint();
  updateUnitLabels();
  updateEstimateLine(s);
  updateFixedLine();

  const ready = s.rOD > 0 && s.rThick > 0 && s.rQty > 0 && s.palletL > 0 && s.palletW > 0;
  if (!ready) {
    renderEmptyState();
    renderSheet(s, null);
    return;
  }

  const r = calcPlan(s);
  const mat = materialOf(s.material);
  const layout = r.layout;

  let bannerText, bannerClass;
  if (r.perLayer === 0) {
    bannerText = 'Part too big for this pallet';
    bannerClass = 'split';
  } else if (r.layers === 0) {
    bannerText = r.layersByHeight === 0 ? 'No layer fits the height limit' : 'Over the pallet load limit';
    bannerClass = 'split';
  } else if (r.pallets === 1) {
    bannerText = 'Fits on one pallet';
    bannerClass = 'ok';
  } else {
    bannerText = `Split required (${r.pallets} pallets)`;
    bannerClass = 'split';
  }
  setBanner(bannerText, bannerClass);

  $('preview').innerHTML = planPreview(s, r);

  const hasPallet = r.unitsOnFull > 0;
  $('tiles').innerHTML = tilesHtml([
    ['🪵', r.pallets > 0 ? nf0.format(r.pallets) : '—', '', 'Pallets needed'],
    ['📦', hasPallet ? nf0.format(r.unitsOnFull) : '—', 'pcs', 'Pcs / pallet'],
    ['🧱', nf0.format(r.layers), '', 'Layers / pallet'],
    ['▦', nf0.format(r.perLayer), '', 'Pcs / layer'],
    ['⚖️', hasPallet ? fmtKg(r.palletWeight) : '—', wtUnit(), 'Est. pallet wt'],
    ['📏', hasPallet ? fmtDim(r.stackHeight) : '—', lenUnit(), 'Est. stack ht']
  ]);

  const cardG = cardGeom(s);
  const shapeWord = s.partShape === 'ring' ? 'Ring' : cardG.tapers ? 'Solid cone' : 'Disc';
  const stackWord = s.useCallout && s.dims.Y ? 'tall' : 'thick';
  const out = [];

  out.push(note(
    `Grade <span class="chip">${mat.id}</span> ${mat.desc} · ` +
    `${shapeWord} Ø <b>${fmtDim(s.rOD)} ${lenUnit()}</b>` +
    `${r.bore > 0 ? ` · bore <b>${fmtDim(r.bore)} ${lenUnit()}</b>` : ''} · ` +
    `<b>${fmtDim(s.rThick)} ${lenUnit()}</b> ${stackWord} · <b>${fmtKg(s.rWeight)} ${wtUnit()}</b> each · ` +
    `<b>${nf0.format(r.qty)} pcs</b>`
  ));

  if (r.perLayer === 0) {
    out.push(note(
      `A ${fmtDim(s.rOD)} ${lenUnit()} part does not fit the ${fmtDim(s.palletL)} × ${fmtDim(s.palletW)} ` +
      `${lenUnit()} pallet.`,
      'bad'
    ));
  } else if (r.handCount) {
    out.push(note(
      `Packing: <b>${nf0.format(r.perLayer)} pcs</b> per layer as you counted them` +
      (r.typedRows ? ` (${nf0.format(r.typedPerRow)} per row × ${nf0.format(r.typedRows)} rows)` : '') + `, on the ` +
      `${fmtDim(s.palletL)} × ${fmtDim(s.palletW)} ${lenUnit()} pallet — ${overhangNote(s)}.` +
      (r.perLayer > r.gridPerLayer
        ? ` The size on its own fits <b>${nf0.format(r.gridPerLayer)}</b> in straight rows.`
        : '')
    ));
  } else {
    out.push(note(
      `Packing: <b>${layout.cols} × ${layout.rows} grid</b> → <b>${nf0.format(r.perLayer)} pcs</b> per layer ` +
      `on the ${fmtDim(s.palletL)} × ${fmtDim(s.palletW)} ${lenUnit()} pallet — ${overhangNote(s)}.`
    ));
  }

  if (s.partShape === 'ring' && s.rBore >= s.rOD) {
    out.push(note('Bore is not smaller than the outside diameter — treated as a solid disc.', 'warn'));
  }

  if (cardG.ignoredTop) {
    out.push(note(
      `The card's <b>${cardG.ignoredTop}</b> of <b>${fmtDim(cardG.cardTop)} ${lenUnit()}</b> is no wider than the ` +
      `<b>${fmtDim(cardG.bore)} ${lenUnit()}</b> bore, so it does not describe the outside of the part. ` +
      `It still prints; the weight is worked out as a straight ring at Ø <b>${fmtDim(cardG.outer)} ${lenUnit()}</b>.`,
      'warn'
    ));
  }

  if (cardG.boreLetter) {
    out.push(note(
      `Solid part: the card's <b>${cardG.boreLetter}</b> of <b>${fmtDim(cardG.boreOnPrint)} ${lenUnit()}</b> ` +
      `is the bore on the print, so no bore comes out of the weight — the part is planned solid. ` +
      `If the forging arrives bored, set the shape to <b>Ring / flange</b> and the weight drops.`,
      'warn'
    ));
  }

  if (r.perLayer > 0) {
    if (r.layers > 0) {
      if (r.layersByWeight < r.layersByHeight) {
        out.push(note(
          `Load-limited: the <b>${fmtKg0(s.maxLoad)} ${wtUnit()}</b> total is reached at ` +
          `<b>${plural(r.layers, 'layer')}</b> (${fmtKg(r.palletWeight)} ${wtUnit()} incl. pallet).`,
          'warn'
        ));
      } else if (r.layersByHeight < r.layersByWeight) {
        out.push(note(
          `Height-limited: the <b>${fmtDim(s.maxHeight)} ${lenUnit()}</b> total is reached at ` +
          `<b>${plural(r.layers, 'layer')}</b>, ${fmtDim(r.usedHeight)} ${lenUnit()} stacked ` +
          `(${fmtDim(Math.max(0, r.headroom))} ${lenUnit()} spare).`
        ));
      } else {
        out.push(note(
          `Balanced: height and load limits both allow <b>${plural(r.layers, 'layer')}</b>.`
        ));
      }
    } else if (r.layersByHeight === 0) {
      out.push(note(
        `The ${fmtDim(s.rThick)} ${lenUnit()} part plus the ${fmtDim(s.palletH)} ${lenUnit()} pallet deck ` +
        `exceeds the ${fmtDim(s.maxHeight)} ${lenUnit()} total height.`,
        'bad'
      ));
    } else if (r.layersByWeight === 0) {
      out.push(note(
        `One layer of ${nf0.format(r.perLayer)} parts weighs ${fmtKg(r.perLayer * s.rWeight)} ${wtUnit()}, ` +
        `and the pallet itself is ${fmtKg(s.palletTare)} ${wtUnit()} — over the ${fmtKg0(s.maxLoad)} ` +
        `${wtUnit()} total.`,
        'bad'
      ));
    }
  }

  if (toDisplayWt(s.rWeight) > manualLimit() && r.layers > 0) {
    out.push(note(
      `Each part is <b>${fmtKg(s.rWeight)} ${wtUnit()}</b> — plan a lift aid or a two-person lift.`,
      'warn'
    ));
  }

  if (r.pallets > 1) {
    out.push(note(
      `Last pallet: <b>${nf0.format(r.lastUnits)} pcs</b> · ${plural(r.lastLayers, 'layer')} · ` +
      `${fmtKg(r.lastWeight)} ${wtUnit()}` +
      (r.lastUnits < r.unitsOnFull
        ? ` — pull from it first, and the ${plural(r.pallets - 1, 'full pallet')} at ` +
          `${nf0.format(r.unitsOnFull)} pcs stay in the bin.`
        : ' — every pallet is full.')
    ));
  }

  if (r.pallets > 0) {
    out.push(note(
      `Load total: <b>${nf0.format(r.qty)} pcs</b> · ${fmtKg0(r.totalLoad)} ${wtUnit()} of parts ` +
      `(${fmtKg0(r.pallets * s.palletTare)} ${wtUnit()} of pallets on top).`
    ));
  }

  $('notes').innerHTML = out.join('');

  renderSheet(s, r);
}

/* --------------------------- print sheet -------------------------- */

/** Notes are built as HTML; the sheet prints them as plain sentences. */
/** Typed text (a PO, a heat number) prints as text, never as markup. */
function esc(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function stripTags(html) {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

const MAX_BREAKDOWN_ROWS = 14;

/* Cards carry different letter sets, so the sheet shows the letters this
 * part actually has. Nothing filled in yet prints the full card blank. */
function printedDimRows(s) {
  if (!s.useCallout) return '';
  const used = DIM_LETTERS.filter(({ key }) => s.dims[key] !== null);
  const rows = used.length ? used : DIM_LETTERS;
  return rows.map(({ key, letter, role }) => `<tr>
      <td class="dim-cell">${letter}</td>
      <td>${s.dims[key] !== null ? fmtSpec3(s.dims[key]) : '—'}</td>
      <td class="dim-role">${role}</td>
    </tr>`).join('');
}

function renderSheet(s, r) {
  const sheet = $('sheet');
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

  if (!r || r.perLayer === 0 || r.layers === 0 || r.pallets === 0) {
    sheet.innerHTML = `
      <header class="sheet-head">
        <div>
          <h1>Pallet plan</h1>
          <p class="sheet-sub">${today}</p>
        </div>
      </header>
      <p class="sheet-empty">${stripTags($('banner').textContent)} — enter the part size, piece count and pallet limits, then print again.</p>`;
    $('printCard').innerHTML = '';
    return;
  }

  const mat = materialOf(s.material);
  const unitL = lenUnit();
  const unitW = wtUnit();
  const est = estimateWeightKg(s);
  const specRows = printedDimRows(s);
  const shapeName = s.partShape === 'ring'
    ? 'ring / flange'
    : cardGeom(s).tapers ? 'solid cone, no bore' : 'disc / blank, solid';

  /* The sheet is one page: past 14 pallets the rest are summed in a line. */
  const shown = r.perPallet.slice(0, MAX_BREAKDOWN_ROWS);
  const rows = shown.map((p, i) => `<tr>
      <td>${i + 1}</td>
      <td>${nf0.format(p.units)}</td>
      <td>${nf0.format(p.layers)}</td>
      <td>${fmtKg0(p.partsKg)}</td>
      <td>${fmtKg0(p.totalKg)}</td>
      <td>${fmtDim(p.height)}</td>
    </tr>`).join('');

  const more = r.pallets > shown.length
    ? `<p class="sheet-note">… plus ${nf0.format(r.pallets - shown.length)} more pallets of ${nf0.format(r.capacity)} pcs each.</p>`
    : '';

  sheet.innerHTML = `
    <header class="sheet-head">
      <div>
        <h1>Pallet plan</h1>
        <p class="sheet-sub">${mat.id} · ${shapeName} · ${nf0.format(r.qty)} pcs · printed ${today}</p>
      </div>
      <div class="sheet-big"><span>Pallets needed</span><b>${nf0.format(r.pallets)}</b></div>
    </header>

    <section class="sheet-sec">
      <h2>Per pallet</h2>
      <table class="sheet-table">
        <tbody>
          <tr><th>Pieces per pallet</th><td>${nf0.format(r.unitsOnFull)} pcs</td>
              <th>Layers per pallet</th><td>${nf0.format(r.layersOnFull)}</td></tr>
          <tr><th>Pieces per layer</th><td>${nf0.format(r.perLayer)}</td>
              <th>Stack height</th><td>${fmtDim(r.stackHeight)} ${unitL}</td></tr>
          <tr><th>Parts weight</th><td>${fmtKg0(r.unitsOnFull * s.rWeight)} ${unitW}</td>
              <th>Pallet weight total</th><td>${fmtKg(r.palletWeight)} ${unitW}</td></tr>
        </tbody>
      </table>
    </section>

    <section class="sheet-sec">
      <h2>Part</h2>
      <table class="sheet-table">
        <tbody>
          <tr><th>Grade</th><td>${mat.id} — ${mat.desc}</td>
              <th>Shape</th><td>${shapeName}</td></tr>
          <tr><th>Outside Ø</th><td>${fmtDim(s.rOD)} ${unitL}</td>
              <th>Bore Ø</th><td>${r.bore > 0 ? `${fmtDim(r.bore)} ${unitL}` : '—'}</td></tr>
          <tr><th>Thickness / height</th><td>${fmtDim(s.rThick)} ${unitL}</td>
              <th>Weight each</th><td>${fmtKg(s.rWeight)} ${unitW}</td></tr>
          <tr><th>Quantity</th><td>${nf0.format(r.qty)} pcs</td>
              <th>Parts load</th><td>${fmtKg0(r.totalLoad)} ${unitW}</td></tr>
          <tr><th>Purchase order</th><td>${s.po ? esc(s.po) : '—'}</td>
              <th>Heat number</th><td>${s.heat ? esc(s.heat) : '—'}</td></tr>
        </tbody>
      </table>
      ${est > 0.01 ? `<p class="sheet-note">Weight off the size and ${mat.id}: about ${fmtKg(est)} ${unitW} each${estimateCardNote(s)} — check it against the box label.</p>` : ''}
    </section>

    ${specRows ? `<section class="sheet-sec">
      <h2>Dimensions (${unitL})</h2>
      <table class="sheet-table sheet-dims">
        <thead><tr><th>Dim</th><th>Target</th><th>What it is</th></tr></thead>
        <tbody>${specRows}</tbody>
      </table>
    </section>` : ''}

    <section class="sheet-sec">
      <h2>Pallet &amp; limits</h2>
      <table class="sheet-table">
        <tbody>
          <tr><th>Pallet</th><td>${fmtDim(s.palletL)} × ${fmtDim(s.palletW)} ${unitL}</td>
              <th>Deck height</th><td>${fmtDim(s.palletH)} ${unitL}</td></tr>
          <tr><th>Pallet weight</th><td>${fmtKg(s.palletTare)} ${unitW}</td>
              <th>Max height, total</th><td>${fmtDim(s.maxHeight)} ${unitL}</td></tr>
          <tr><th>Max load, total</th><td>${fmtKg0(s.maxLoad)} ${unitW}</td>
              <th>Back allowance</th><td>${fmtDim(s.backOverhang)} ${unitL}</td></tr>
        </tbody>
      </table>
    </section>

    ${r.pallets > 1 ? `<section class="sheet-sec">
      <h2>Pallet breakdown</h2>
      <table class="sheet-table sheet-list">
        <thead><tr><th>Pallet</th><th>Pcs</th><th>Layers</th>
          <th>Parts (${unitW})</th><th>Total (${unitW})</th><th>Stack (${unitL})</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      ${more}
      ${r.lastUnits < r.unitsOnFull ? `<p class="sheet-note"><b>Use pallet ${nf0.format(r.pallets)} first</b> — it is short at ${nf0.format(r.lastUnits)} pcs, so the ${nf0.format(r.pallets - 1)} full pallets stay in the bin.</p>` : ''}
    </section>` : ''}

    <section class="sheet-sec">
      <h2>Packing notes</h2>
      <p class="sheet-note">${stripTags($('notes').innerHTML)}</p>
    </section>

    ${r.handCount ? '' : `<div class="sheet-fig">${planPreview(s, r)}</div>`}

    <p class="sheet-sign"><span>Stacked and checked by</span><span>Date</span></p>`;

  $('printCard').innerHTML = cardMarkup(s, r);
}

/* The stack card: what to build, how many, and the weight. No packing notes,
 * no figure, no breakdown — just the numbers someone needs at the stack. */
function cardMarkup(s, r) {
  const mat = materialOf(s.material);
  const unitL = lenUnit();
  const unitW = wtUnit();
  const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const last = r.perPallet[r.perPallet.length - 1];
  const estTag = weightIsEstimate ? ' (est.)' : '';
  /* A solid part is a disc or a cone; a cone is named on the card and its top
   * diameter printed, because that is what tells two similar forgings apart. */
  const g = cardGeom(s);
  const solid = s.partShape !== 'ring';
  const shapeLabel = solid ? (g.tapers ? 'Solid cone, no bore' : 'Disc / blank, solid') : 'Ring / flange';
  const topNote = solid && g.tapers && g.top > 0 ? ` → ${fmtDim(g.top)} ${unitL} top` : '';
  const partLoad = last && last.units < r.unitsOnFull
    ? `<div class="pc-last-row"><span>Last pallet</span><b>${nf0.format(last.units)} pcs · ${nf0.format(last.layers)} layers</b></div>`
    : '';

  return `
    <div class="pc-top"><span>Pallet card</span><span>${today}</span></div>
    <div class="pc-hero"><b>${nf0.format(r.pallets)}</b><span>pallets · ${mat.id}</span></div>
    <p class="pc-line">${fmtDim(s.rOD)} ${unitL} OD${topNote}${r.bore > 0 ? ` × ${fmtDim(r.bore)} ${unitL} bore` : ''} × ${fmtDim(s.rThick)} ${unitL}</p>
    <p class="pc-line pc-grade">${shapeLabel} · ${nf0.format(r.qty)} pcs</p>
    <div class="pc-order">
      <span><em>PO</em><b>${s.po ? esc(s.po) : '—'}</b></span>
      <span><em>Heat</em><b>${s.heat ? esc(s.heat) : '—'}</b></span>
    </div>
    <div class="pc-grid">
      ${r.handCount
        ? (r.typedRows
          ? `<div><span>Rows per layer</span><b>${nf0.format(r.typedRows)}</b></div>
      <div><span>Parts per row</span><b>${nf0.format(r.typedPerRow)}</b></div>`
          : '')
        : `<div><span>Rows per layer</span><b>${nf0.format(r.layout.rows)}</b></div>
      <div><span>Parts per row</span><b>${nf0.format(r.layout.cols)}</b></div>`}
      <div><span>Parts per layer</span><b>${nf0.format(r.perLayer)}</b></div>
      <div><span>Layers per pallet</span><b>${nf0.format(r.layersOnFull)}</b></div>
      <div><span>Per pallet</span><b>${nf0.format(r.unitsOnFull)} pcs</b></div>
      <div><span>Stack height</span><b>${fmtDim(r.stackHeight)} ${unitL}</b></div>
      <div><span>Each${estTag}</span><b>${fmtKg(s.rWeight)} ${unitW}</b></div>
      <div><span>Pallet weight${estTag}</span><b>${fmtKg(r.palletWeight)} ${unitW}</b></div>
      ${partLoad}
    </div>
    ${last && last.units < r.unitsOnFull ? '<p class="pc-open">Short pallet first — keep the full ones in the bin.</p>' : ''}
    ${weightIsEstimate ? '<p class="pc-est">Weight worked out from the size — weigh one part and write it here.</p>' : ''}
    <p class="pc-sign">Stacked by ______________&nbsp;&nbsp; Date __________</p>`;
}

/* Each print gets its own page size. The rule lives in a <style> tag so the
 * card can be 8.497 × 4.26 in without touching the stylesheet. */
function printAs(card) {
  $('pageRule').textContent = card
    /* The stock card measures 8.497 × 4.26 in and goes in with the eye hole on
     * the left edge, ½ in in and halfway down. The operator measured 0.200 in
     * of clear card left of the type and 0.690 in right of it, so the type sits
     * off-centre on purpose: 3.37 in wide, clear of the punched hole. */
    ? '@page { size: 4.26in 8.497in; margin: 6mm 0.69in 6mm 0.2in; }'
    : '@page { size: letter portrait; margin: 10mm; }';
  document.body.className = card ? 'print-card' : '';
  window.print();
}

/* ----------------------------- events ---------------------------- */

function setUnits(next) {
  if (next === units) return;

  const convertLen = next === 'imperial' ? ((v) => v / CM_PER_IN) : ((v) => v * CM_PER_IN);
  const convertWt = next === 'imperial' ? ((v) => v * LB_PER_KG) : ((v) => v / LB_PER_KG);

  for (const id of LEN_FIELDS) {
    const v = parseFloat($(id).value);
    if (Number.isFinite(v)) $(id).value = round4(convertLen(v));
  }
  for (const id of WT_FIELDS) {
    const v = parseFloat($(id).value);
    if (Number.isFinite(v)) $(id).value = round4(convertWt(v));
  }
  for (const id of DIM_FIELDS) {
    const v = parseFloat($(id).value);
    if (Number.isFinite(v)) $(id).value = round4(convertLen(v));
  }

  units = next;
  render();
}

/* Clear means blank: no leftover part size, weight or count to mistake for
 * the next job. The pallet is fixed, so nothing there needs clearing. */
function resetAll() {
  $('material').value = DEFAULTS.material;
  $('partShape').value = DEFAULTS.partShape;
  for (const id of NUMERIC) $(id).value = '';
  for (const id of TEXT_FIELDS) $(id).value = '';
  for (const id of DIM_FIELDS) $(id).value = '';
  $('useCallout').checked = false;
  weightIsEstimate = false;
  render();
}

/** Reading a number off a field, blank or nonsense as zero. */
function fieldNum(id) {
  const v = parseFloat($(id).value);
  return Number.isFinite(v) && v > 0 ? v : 0;
}

/** Tick the box and the card starts from the part: O is the width across, Y
 * the overall height, B the bore and C the wall at the bottom (O minus the
 * bore, halved). The cone and raised-face letters stay for the print. */
function prefillDims() {
  const put = (id, v) => {
    if (v > 0 && !$(id).value.trim()) $(id).value = round4(v);
  };
  const od = fieldNum('rOD'), thick = fieldNum('rThick'), bore = fieldNum('rBore');
  put('dimOT', od);
  put('dimYT', thick);
  if ($('partShape').value === 'ring') {
    put('dimBT', bore);
    if (od > bore && bore > 0) put('dimCT', (od - bore) / 2);
  }
}

/* The card is the source while it is ticked: O and Y fill the footprint and
 * the stack height, and the bore comes off B or J — or off C, the wall at the
 * bottom, because the bore is O less two wall thicknesses. */
function syncCardToPart() {
  if (!$('useCallout').checked) return;
  const O = fieldNum('dimOT'), Y = fieldNum('dimYT'), C = fieldNum('dimCT');
  if (O) $('rOD').value = round4(O);
  if (Y) $('rThick').value = round4(Y);
  if ($('partShape').value !== 'ring') return;
  const bore = fieldNum('dimBT') || fieldNum('dimJT') || (O && C && O > 2 * C ? O - 2 * C : 0);
  if (bore) $('rBore').value = round4(Math.min(bore, O || bore));
}

function init() {
  $('material').innerHTML = MATERIALS
    .map((m) => `<option value="${m.id}">${m.id} — ${m.desc}</option>`)
    .join('');

  resetAll();

  document.addEventListener('input', (e) => {
    if (!e.target.matches('input, select')) return;
    if (e.target.id === 'rWeight') weightIsEstimate = false;
    if (/^dim[A-Z]T$/.test(e.target.id)) syncCardToPart();
    render();
  });

  $('unitImp').addEventListener('click', () => setUnits('imperial'));
  $('unitMet').addEventListener('click', () => setUnits('metric'));
  $('reset').addEventListener('click', resetAll);
  $('printBtn').addEventListener('click', () => printAs(false));
  $('cardBtn').addEventListener('click', () => printAs(true));
  if (window.addEventListener) {
    window.addEventListener('afterprint', () => {
      document.body.className = '';
      $('pageRule').textContent = '';
    });
  }
  $('useCallout').addEventListener('change', () => {
    if ($('useCallout').checked) prefillDims();
    render();
  });
  $('useEstimate').addEventListener('click', () => {
    const kg = estimateWeightKg(readState());
    if (!kg) return;
    $('rWeight').value = Math.round(toDisplayWt(kg) * 100) / 100;
    weightIsEstimate = true;
    render();
  });
}

init();
