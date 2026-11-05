// Turns a photo into a small risograph print: a black key line, a navy halftone for the
// tones and a couple of flat spot colours, each ink a little off register. The print comes
// out on white so it can be multiplied onto the cream paper of the page.
window.Riso = (() => {
  const INKS = {
    key: [27, 25, 22],
    tone: [40, 54, 122],
    mustard: [227, 180, 72],
    brick: [169, 65, 43],
  };
  const ANGLE = Math.PI / 4;

  const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
  const smooth = (a, b, v) => {
    const t = clamp01((v - a) / (b - a));
    return t * t * (3 - 2 * t);
  };

  function blur(src, w, h, r) {
    const tmp = new Float32Array(src.length), out = new Float32Array(src.length);
    const k = 1 / (2 * r + 1);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let s = 0;
        for (let d = -r; d <= r; d++) s += src[y * w + Math.min(w - 1, Math.max(0, x + d))];
        tmp[y * w + x] = s * k;
      }
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let s = 0;
        for (let d = -r; d <= r; d++) s += tmp[Math.min(h - 1, Math.max(0, y + d)) * w + x];
        out[y * w + x] = s * k;
      }
    }
    return out;
  }

  // Reads the photo once at the working size: lightness (levels stretched), edges, and the
  // spot colour areas. The photo's own colours are too faint to trust, so spots are given as
  // ellipses (in 0..1 of the crop) and only ink where the photo is darker than `below`;
  // anything darker than `core` inside one is printed in key on top.
  function prepare(img, crop, width, spots = []) {
    const scale = width / crop.w;
    const w = Math.round(crop.w * scale), h = Math.round(crop.h * scale);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, crop.x, crop.y, crop.w, crop.h, 0, 0, w, h);
    const px = ctx.getImageData(0, 0, w, h).data;
    const n = w * h;
    const raw = new Float32Array(n);
    const hist = new Uint32Array(256);
    for (let i = 0; i < n; i++) {
      const l = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2];
      raw[i] = l;
      hist[l | 0]++;
    }
    let lo = 0, hi = 255, acc = 0;
    for (let v = 0; v < 256; v++) if ((acc += hist[v]) > n * 0.01) { lo = v; break; }
    acc = 0;
    for (let v = 255; v >= 0; v--) if ((acc += hist[v]) > n * 0.04) { hi = v; break; }
    for (let i = 0; i < n; i++) raw[i] = clamp01((raw[i] - lo) / Math.max(1, hi - lo));

    // Edges on a softened copy, so fur reads as a few strokes instead of fuzz
    const lum = blur(raw, w, h, Math.max(1, Math.round(width / 400)));
    const edge = new Float32Array(n);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        const gx = lum[i - w + 1] + 2 * lum[i + 1] + lum[i + w + 1] - lum[i - w - 1] - 2 * lum[i - 1] - lum[i + w - 1];
        const gy = lum[i + w - 1] + 2 * lum[i + w] + lum[i + w + 1] - lum[i - w - 1] - 2 * lum[i - w] - lum[i - w + 1];
        edge[i] = Math.hypot(gx, gy);
      }
    }

    const spot = new Uint8Array(n);
    spots.forEach((s, k) => {
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const dx = (x / w - s.x) / s.rx, dy = (y / h - s.y) / s.ry;
          if (dx * dx + dy * dy < 1 && lum[y * w + x] < s.below) spot[y * w + x] = k + 1;
        }
      }
    });
    return { w, h, cell: Math.max(5, w / 120), lum, edge, spot, spotInks: spots.map(s => Object.assign([...INKS[s.ink]], { core: s.core ?? 0 })) };
  }

  // Halftone dot coverage at (x, y) for a tone of 0..1
  const cos = Math.cos(ANGLE), sin = Math.sin(ANGLE);
  function dot(x, y, tone, cell) {
    const u = (x * cos + y * sin) / cell, v = (-x * sin + y * cos) / cell;
    const du = u - Math.round(u), dv = v - Math.round(v);
    return tone > Math.sqrt(du * du + dv * dv) * 1.414;
  }

  // Prints the prepared photo into ctx at (0, 0). sample(x, y) -> [sx, sy] lets the caller bend
  // the picture (the cat's ears folding back) before it's inked; pupil scales how much of each
  // spot's dark core goes to key (wide eyes when scared).
  function print(ctx, src, { sample, pupil = 1 } = {}) {
    const { w, h, cell, lum, edge, spot, spotInks } = src;
    const out = ctx.createImageData(w, h);
    const o = out.data;
    const idx = (x, y) => (y < 0 ? 0 : y >= h ? h - 1 : y | 0) * w + (x < 0 ? 0 : x >= w ? w - 1 : x | 0);
    let r, g, b;
    const ink = c => {
      r = (r * c[0]) / 255;
      g = (g * c[1]) / 255;
      b = (b * c[2]) / 255;
    };
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let sx = x, sy = y;
        if (sample) [sx, sy] = sample(x, y);
        r = g = b = 255;
        // Sides and top fade out into the paper; the bottom runs off the page
        const fade = smooth(0, 0.1, Math.min(x / w, 1 - x / w, y / h));
        // Each ink lands a pixel or two off the others, as a riso drum would
        const l = lum[idx(sx, sy)];
        const k = spot[idx(sx + 2, sy + 1)];
        if (k) {
          // Spot areas are flat colour with only the darkest core (a pupil) in key
          ink(spotInks[k - 1]);
          if (l < spotInks[k - 1].core * pupil) ink(INKS.key);
        } else {
          const tone = smooth(0.3, 1, 1 - lum[idx(sx - 2, sy - 1)]) * 0.9 * fade;
          if (dot(x, y, tone, cell)) ink(INKS.tone);
          if (fade > 0.6 && (edge[idx(sx + 1, sy)] > 0.18 || l < 0.05)) ink(INKS.key);
        }
        const j = (y * w + x) * 4;
        o[j] = r;
        o[j + 1] = g;
        o[j + 2] = b;
        o[j + 3] = 255;
      }
    }
    ctx.putImageData(out, 0, 0);
  }

  return { prepare, print };
})();
