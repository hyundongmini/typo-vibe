// Draws one camera feed into a small offscreen buffer: the photo, the item aging on it,
// then the cheap-CCTV treatment. cctv.js copies the buffer onto the monitor wall.
window.CctvRender = (() => {
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const buf = document.createElement('canvas');
  const ctx = buf.getContext('2d', { willReadFrequently: true });

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const smooth = (a, b, v) => {
    const t = clamp((v - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };

  // Crop a photo to the 4:3 camera frame, centered
  function cropFor(img) {
    const want = 4 / 3, have = img.width / img.height;
    if (have > want) {
      const w = img.height * want;
      return { x: (img.width - w) / 2, y: 0, w, h: img.height };
    }
    const h = img.width / want;
    return { x: 0, y: (img.height - h) / 2, w: img.width, h };
  }

  // The item's box in camera-frame fractions (0..1)
  function boxInFrame(cam) {
    const { img, crop } = cam;
    const [bx, by, bw, bh] = cam.box;
    return {
      x: (bx * img.width - crop.x) / crop.w,
      y: (by * img.height - crop.y) / crop.h,
      w: (bw * img.width) / crop.w,
      h: (bh * img.height) / crop.h,
    };
  }

  // r: age as a share of shelf life (1 = the expiry date)
  function ageItem(cam, r, w, h, t) {
    const b = boxInFrame(cam);
    const x = b.x * w, y = b.y * h, bw = b.w * w, bh = b.h * h;
    const wear = smooth(0.75, 1.6, r);
    if (wear <= 0) return;
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(x + bw / 2, y + bh / 2, bw / 2, bh / 2, 0, 0, Math.PI * 2);
    ctx.clip();
    // Discolouration fades out toward the edge of the item instead of stopping at a hard oval
    const tint = (op, rgb, alpha) => {
      ctx.globalCompositeOperation = op;
      ctx.save();
      ctx.translate(x + bw / 2, y + bh / 2);
      ctx.scale(bw / 2, bh / 2);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      g.addColorStop(0, `rgba(${rgb}, ${alpha})`);
      g.addColorStop(0.55, `rgba(${rgb}, ${alpha * 0.85})`);
      g.addColorStop(1, `rgba(${rgb}, 0)`);
      ctx.fillStyle = g;
      ctx.fillRect(-1, -1, 2, 2);
      ctx.restore();
    };
    for (const kind of cam.decay) {
      if (kind === 'brown') {
        tint('multiply', '150, 105, 55', wear * 0.75);
        tint('saturation', '90, 80, 60', wear * 0.45);
      } else if (kind === 'grey') {
        tint('color', '115, 135, 100', wear * 0.9);
        tint('multiply', '160, 168, 140', wear * 0.75);
      } else if (kind === 'murky') {
        // Settles into a cloudy layer at the bottom
        ctx.globalCompositeOperation = 'source-over';
        const g = ctx.createLinearGradient(0, y, 0, y + bh);
        g.addColorStop(0, `rgba(200, 190, 150, ${wear * 0.15})`);
        g.addColorStop(1, `rgba(120, 105, 70, ${wear * 0.7})`);
        ctx.fillStyle = g;
        ctx.fillRect(x, y, bw, bh);
      } else if (kind === 'mold') {
        ctx.globalCompositeOperation = 'source-over';
        for (const m of cam.blobs) {
          const grow = clamp((r - m.start) / 0.5, 0, 1);
          if (grow <= 0) continue;
          const mx = x + m.x * bw, my = y + m.y * bh, mr = m.r * Math.min(bw, bh) * (0.3 + grow);
          // Dark green-grey stain under a pale fuzzy top, like real fridge mold
          const fuzz = m.tone > 0.65 ? '120, 140, 95' : m.tone > 0.3 ? '225, 230, 210' : '185, 195, 165';
          ctx.fillStyle = `rgba(60, 75, 50, ${0.45 * grow})`;
          ctx.beginPath();
          ctx.arc(mx, my, mr * 0.9, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = `rgba(${fuzz}, ${0.95 * grow})`;
          for (const sp of m.specks) {
            ctx.beginPath();
            ctx.arc(mx + sp.dx * mr, my + sp.dy * mr, Math.max(0.6, mr * sp.s * 0.45), 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
    }
    ctx.restore();

    // Flies circling once it has gone properly bad (drawn outside the clip, they wander)
    if (cam.flies && r > 1.15) {
      ctx.fillStyle = 'rgba(20, 20, 20, 0.9)';
      const n = Math.min(cam.flyPaths.length, 1 + Math.floor((r - 1.15) * 6));
      for (let i = 0; i < n; i++) {
        const f = cam.flyPaths[i];
        const s = reduceMotion ? f.phase : f.phase + t * f.speed;
        const fx = x + bw / 2 + Math.cos(s * 2.1) * bw * f.rx + Math.sin(s * 5.3) * bw * 0.05;
        const fy = y + bh * 0.3 + Math.sin(s * 1.7) * bh * f.ry;
        ctx.fillRect(Math.round(fx), Math.round(fy), Math.max(1, w / 160), Math.max(1, w / 220));
      }
    }
  }

  // Cheap CCTV look: oversharpened edges, chroma shift, noise, scanlines.
  // exposure > 1 blows the picture out, as when the fridge door lets the room light in.
  function cctvLook(w, h, t, exposure) {
    const frame = ctx.getImageData(0, 0, w, h);
    const src = frame.data;
    const out = new Uint8ClampedArray(src.length);
    const k = 0.6;
    const lift = (exposure - 1) * 90;
    let seed = reduceMotion ? 7 : (t * 1000) | 0;
    for (let y = 0; y < h; y++) {
      const scan = y % 2 ? 0.93 : 1;
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const up = y > 0 ? i - w * 4 : i, dn = y < h - 1 ? i + w * 4 : i;
        const lf = x > 0 ? i - 4 : i, rt = x < w - 1 ? i + 4 : i;
        seed = (seed * 1664525 + 1013904223) >>> 0;
        const noise = ((seed >>> 24) - 128) * 0.12;
        for (let c = 0; c < 3; c++) {
          let v = src[i + c] * (1 + 4 * k) - k * (src[up + c] + src[dn + c] + src[lf + c] + src[rt + c]);
          // Half of red comes from the pixel to the left: the colour bleed of cheap analog cameras
          if (c === 0) v = v * 0.55 + src[lf] * 0.45;
          v = (v - 128) * 1.08 + 128 + noise;
          out[i + c] = (v * exposure + lift) * scan;
        }
        out[i + 3] = 255;
      }
    }
    // Push saturation a little, like the reference's loud colour
    for (let i = 0; i < out.length; i += 4) {
      const l = (out[i] + out[i + 1] + out[i + 2]) / 3;
      out[i] = l + (out[i] - l) * 1.25;
      out[i + 1] = l + (out[i + 1] - l) * 1.25;
      out[i + 2] = l + (out[i + 2] - l) * 1.25;
    }
    frame.data.set(out);
    ctx.putImageData(frame, 0, 0);
  }

  function capture(cam, r, w, h, t, exposure = 1) {
    buf.width = w;
    buf.height = h;
    if (!cam.img) return staticNoise(w >> 1, h >> 1);
    const { crop } = cam;
    // Slight drift: the mount is never perfectly still
    const jx = reduceMotion ? 0 : Math.sin(t * 0.7 + cam.blobs[0].x * 9) * crop.w * 0.004;
    const jy = reduceMotion ? 0 : Math.cos(t * 0.5 + cam.blobs[1].y * 9) * crop.h * 0.004;
    ctx.drawImage(cam.img, crop.x + jx, crop.y + jy, crop.w, crop.h, 0, 0, w, h);
    ageItem(cam, r, w, h, t);
    cctvLook(w, h, t, exposure);
  }

  function staticNoise(w, h) {
    buf.width = w;
    buf.height = h;
    const frame = ctx.createImageData(w, h);
    const d = frame.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = Math.random() * 255;
      d[i] = d[i + 1] = d[i + 2] = v;
      d[i + 3] = 255;
    }
    ctx.putImageData(frame, 0, 0);
  }

  return { buf, cropFor, boxInFrame, capture, staticNoise };
})();
