// terrain-engine.js
// Pure-JS terrain math: glyph SDF, simplex-ish noise, marching squares isolines.
// Exposes window.TerrainEngine.

(function () {
  'use strict';

  // ───────────────────────────────────────────────────────────────────────────
  // Hash-based 2D value/gradient noise (cheap, deterministic per seed).
  // ───────────────────────────────────────────────────────────────────────────
  function makeNoise(seed) {
    let s = (seed | 0) || 1;
    function rand() {
      s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
      return ((s >>> 0) % 100000) / 100000;
    }
    const perm = new Uint8Array(512);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const tmp = p[i]; p[i] = p[j]; p[j] = tmp;
    }
    for (let i = 0; i < 512; i++) perm[i] = p[i & 255];

    function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
    function lerp(a, b, t) { return a + (b - a) * t; }
    function grad(hash, x, y) {
      const h = hash & 7;
      const u = h < 4 ? x : y;
      const v = h < 4 ? y : x;
      return ((h & 1) ? -u : u) + ((h & 2) ? -2 * v : 2 * v);
    }

    function noise2(x, y) {
      const xi = Math.floor(x) & 255;
      const yi = Math.floor(y) & 255;
      const xf = x - Math.floor(x);
      const yf = y - Math.floor(y);
      const u = fade(xf);
      const v = fade(yf);
      const aa = perm[perm[xi] + yi];
      const ab = perm[perm[xi] + yi + 1];
      const ba = perm[perm[xi + 1] + yi];
      const bb = perm[perm[xi + 1] + yi + 1];
      const x1 = lerp(grad(aa, xf, yf),     grad(ba, xf - 1, yf),     u);
      const x2 = lerp(grad(ab, xf, yf - 1), grad(bb, xf - 1, yf - 1), u);
      return lerp(x1, x2, v);
    }

    function fbm(x, y, octaves, lacunarity, gain) {
      let amp = 1, freq = 1, sum = 0, norm = 0;
      for (let i = 0; i < octaves; i++) {
        sum += amp * noise2(x * freq, y * freq);
        norm += amp;
        amp *= gain;
        freq *= lacunarity;
      }
      return sum / norm;
    }
    return { noise2, fbm };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Render text to an offscreen canvas, then build a signed distance field.
  // Positive inside the glyphs, negative outside, in pixels.
  // ───────────────────────────────────────────────────────────────────────────
  function buildTextSDF({ text, width, height, font, fontSize, letterSpacing = 0, lineHeight = 0.95, lines = null }) {
    const off = document.createElement('canvas');
    off.width = width; off.height = height;
    const ctx = off.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#fff';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.font = `900 ${fontSize}px ${font}`;

    const ls = lines || splitLines(text);
    const lh = fontSize * lineHeight;
    const totalH = lh * ls.length;
    const startY = height / 2 - totalH / 2 + lh / 2;
    ls.forEach((line, i) => {
      drawSpaced(ctx, line, width / 2, startY + i * lh, letterSpacing);
    });

    const img = ctx.getImageData(0, 0, width, height);
    const mask = new Uint8Array(width * height);
    for (let i = 0; i < mask.length; i++) {
      mask[i] = img.data[i * 4 + 1] >= 128 ? 1 : 0;
    }
    const sdf = sdt8sed(mask, width, height);
    return { sdf, width, height, mask };
  }

  function drawSpaced(ctx, text, cx, cy, spacing) {
    if (!spacing) { ctx.fillText(text, cx, cy); return; }
    const widths = []; let total = 0;
    for (const ch of text) {
      const w = ctx.measureText(ch).width;
      widths.push(w); total += w + spacing;
    }
    total -= spacing;
    let x = cx - total / 2; let i = 0;
    for (const ch of text) {
      ctx.fillText(ch, x + widths[i] / 2, cy);
      x += widths[i] + spacing; i++;
    }
  }
  function splitLines(text) { return text.split('\n'); }

  // 8SSEDT (two-pass) signed distance transform.
  function sdt8sed(mask, w, h) {
    const INF = 1e9;
    const dIn = new Float32Array(w * h);
    const dOut = new Float32Array(w * h);
    for (let i = 0; i < mask.length; i++) {
      if (mask[i]) { dIn[i] = INF; dOut[i] = 0; }
      else         { dIn[i] = 0;   dOut[i] = INF; }
    }
    chamfer(dOut, w, h);
    chamfer(dIn,  w, h);
    const sdf = new Float32Array(w * h);
    for (let i = 0; i < mask.length; i++) {
      sdf[i] = mask[i] ? dIn[i] : -dOut[i];
    }
    return sdf;
  }
  function chamfer(d, w, h) {
    const a = 1, b = 1.4142;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        let v = d[i];
        if (x > 0)              v = Math.min(v, d[i - 1]     + a);
        if (y > 0)              v = Math.min(v, d[i - w]     + a);
        if (x > 0 && y > 0)     v = Math.min(v, d[i - w - 1] + b);
        if (x < w - 1 && y > 0) v = Math.min(v, d[i - w + 1] + b);
        d[i] = v;
      }
    }
    for (let y = h - 1; y >= 0; y--) {
      for (let x = w - 1; x >= 0; x--) {
        const i = y * w + x;
        let v = d[i];
        if (x < w - 1)              v = Math.min(v, d[i + 1]     + a);
        if (y < h - 1)              v = Math.min(v, d[i + w]     + a);
        if (x < w - 1 && y < h - 1) v = Math.min(v, d[i + w + 1] + b);
        if (x > 0 && y < h - 1)     v = Math.min(v, d[i + w - 1] + b);
        d[i] = v;
      }
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Marching squares
  // ───────────────────────────────────────────────────────────────────────────
  function marchingSquares(field, w, h, iso) {
    const segs = [];
    for (let y = 0; y < h - 1; y++) {
      for (let x = 0; x < w - 1; x++) {
        const i = y * w + x;
        const tl = field[i], tr = field[i + 1];
        const bl = field[i + w], br = field[i + w + 1];
        let code = 0;
        if (tl > iso) code |= 1;
        if (tr > iso) code |= 2;
        if (br > iso) code |= 4;
        if (bl > iso) code |= 8;
        if (code === 0 || code === 15) continue;

        const t = (a, b) => {
          const d = b - a;
          if (Math.abs(d) < 1e-9) return 0.5;
          return (iso - a) / d;
        };
        const top    = [x + t(tl, tr), y];
        const right  = [x + 1, y + t(tr, br)];
        const bottom = [x + t(bl, br), y + 1];
        const left   = [x, y + t(tl, bl)];

        switch (code) {
          case 1:  case 14: segs.push([left[0], left[1], top[0], top[1]]); break;
          case 2:  case 13: segs.push([top[0], top[1], right[0], right[1]]); break;
          case 4:  case 11: segs.push([right[0], right[1], bottom[0], bottom[1]]); break;
          case 8:  case 7:  segs.push([bottom[0], bottom[1], left[0], left[1]]); break;
          case 3:  case 12: segs.push([left[0], left[1], right[0], right[1]]); break;
          case 6:  case 9:  segs.push([top[0], top[1], bottom[0], bottom[1]]); break;
          case 5:
            segs.push([left[0], left[1], top[0], top[1]]);
            segs.push([right[0], right[1], bottom[0], bottom[1]]);
            break;
          case 10:
            segs.push([top[0], top[1], right[0], right[1]]);
            segs.push([bottom[0], bottom[1], left[0], left[1]]);
            break;
        }
      }
    }
    return segs;
  }

  window.TerrainEngine = { makeNoise, buildTextSDF, marchingSquares };
})();
