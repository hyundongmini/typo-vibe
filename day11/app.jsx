// app.jsx — "등고선으로 만든 산"
/* global React, ReactDOM, TerrainEngine, useTweaks, TweaksPanel,
   TweakSection, TweakSlider, TweakToggle, TweakRadio, TweakButton */

const { useEffect, useRef, useState, useCallback } = React;

const TWEAK_DEFAULTS = {
  "fontSizeRel": 0.46,
  "noise": 28,
  "layers": 18,
  "lineWeight": 1.0,
  "showShadow": true,
  "showLabels": true,
  "showGrid": true,
  "showAltitudes": true,
  "showCaption": true,
  "palette": "neon",
  "breathe": true
};

const PALETTES = {
  neon: { bg: '#FFE600', grid: '#1F1A12', line: '#171717', lineFaint: '#171717',
          fill: '#FF3DA5', fillDark: '#A0E0D2', accent: '#FF3DA5', label: '#171717', paper: '#FFF6BF' },
  mint: { bg: '#B5F0DC', grid: '#1A2A26', line: '#0F1A14', lineFaint: '#0F1A14',
          fill: '#FFD93D', fillDark: '#FF6B9E', accent: '#E8178A', label: '#0F1A14', paper: '#D6F8E8' },
  pink: { bg: '#FFC9DD', grid: '#1F1014', line: '#171717', lineFaint: '#171717',
          fill: '#FFE600', fillDark: '#7BD8C4', accent: '#1A7CFF', label: '#171717', paper: '#FFE0EC' },
  topo: { bg: '#EBE2D1', grid: '#C7B79A', line: '#3A2D1A', lineFaint: '#7A5E32',
          fill: '#D9C9A6', fillDark: '#B89E6F', accent: '#A93226', label: '#2A1F0F', paper: '#F2EAD8' }
};

const PLACE_NAMES = [
  '필선봉', '획곡', '점자령', '여백 분지', '자획령',
  '음각 골', '양각 능선', '받침 협곡', '초성 고지',
  '종성 분기점', '모음 평원', '자음 절벽', '구두점 폭포'
];

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const canvasRef = useRef(null);
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  const [seed, setSeed] = useState(1337);
  const [labels, setLabels] = useState([]);
  const mouseRef = useRef({ x: -1e6, y: -1e6, hot: 0, gx: 0, gy: 0 });
  const timeRef = useRef(0);
  const cacheRef = useRef(null);

  const palette = PALETTES[t.palette] || PALETTES.neon;

  useEffect(() => {
    const onR = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onR);
    return () => window.removeEventListener('resize', onR);
  }, []);

  // precompute everything that doesn't depend on time/mouse
  const recompute = useCallback(() => {
    const W = size.w, H = size.h;
    if (W < 100 || H < 100) return;
    const target = 80000;
    const aspect = W / H;
    let gh = Math.round(Math.sqrt(target / aspect));
    let gw = Math.round(gh * aspect);
    gw = Math.max(120, Math.min(450, gw));
    gh = Math.max(80, Math.min(320, gh));

    const isWide = aspect > 2.4;
    const lines = isWide ? ['등고선으로 만든 산'] : ['등고선으로', '만든 산'];
    const fontSize = Math.round(gh * t.fontSizeRel * (isWide ? 0.55 : 1));
    const letterSpacing = -fontSize * 0.04;

    const sdfData = TerrainEngine.buildTextSDF({
      text: lines.join('\n'), width: gw, height: gh,
      font: '"Black Han Sans", "Spoqa Han Sans Neo", sans-serif',
      fontSize, letterSpacing, lineHeight: 0.94, lines
    });

    const noise = TerrainEngine.makeNoise(seed);
    const noiseAmp = (t.noise / 100) * Math.min(gw, gh) * 0.14 + 1.0;
    const noiseFreq = 0.035;

    const field = new Float32Array(gw * gh);
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        const i = y * gw + x;
        const base = sdfData.sdf[i];
        const n = noise.fbm(x * noiseFreq, y * noiseFreq, 4, 2.0, 0.5);
        const outside = Math.max(0, -base);
        const fall = 1 / (1 + Math.pow(outside / (noiseAmp * 0.6), 1.8));
        field[i] = base + n * noiseAmp * fall;
      }
    }
    let maxV = 0;
    for (let i = 0; i < field.length; i++) if (field[i] > maxV) maxV = field[i];
    const topVal = Math.max(maxV, 1);

    const layerCount = Math.max(4, Math.min(40, Math.round(t.layers)));
    const contours = [];
    for (let k = 0; k <= layerCount; k++) {
      const iso = topVal * (k / layerCount) - 0.001;
      const segs = TerrainEngine.marchingSquares(field, gw, gh, iso);
      contours.push({ iso, segs, isMajor: k % 5 === 0, k });
    }

    const fillLayers = [];
    const fillSteps = 5;
    for (let k = 1; k <= fillSteps; k++) {
      const iso = topVal * (k / (fillSteps + 1));
      const mask = new Uint8Array(gw * gh);
      for (let i = 0; i < field.length; i++) mask[i] = field[i] > iso ? 1 : 0;
      fillLayers.push({ mask, t: k / fillSteps });
    }

    const altSamples = [];
    for (let k = 5; k <= layerCount; k += 5) {
      const iso = topVal * (k / layerCount);
      const candidates = [];
      const stride = Math.max(5, Math.floor(gw / 28));
      for (let y = 4; y < gh - 4; y += stride) {
        for (let x = 4; x < gw - 4; x += stride) {
          const v = field[y * gw + x];
          if (v > iso && v < iso + topVal * 0.04) candidates.push([x, y]);
        }
      }
      const thinned = thinSamples(candidates, gw * 0.18).slice(0, 3);
      thinned.forEach(p => altSamples.push({ x: p[0], y: p[1], altitude: k * 100 }));
    }

    // background terrain
    const bgNoise = TerrainEngine.makeNoise(seed * 7 + 11);
    const bgField = new Float32Array(gw * gh);
    const bgFreq = 0.018;
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        const i = y * gw + x;
        const n1 = bgNoise.fbm(x * bgFreq, y * bgFreq, 5, 2.0, 0.55);
        const cx = gw * 0.5, cy = gh * 0.5;
        const r = Math.sqrt((x-cx)*(x-cx)/(gw*gw) + (y-cy)*(y-cy)/(gh*gh));
        bgField[i] = n1 - r * 0.4;
      }
    }
    let bgMin = Infinity, bgMax = -Infinity;
    for (let i = 0; i < bgField.length; i++) {
      if (bgField[i] < bgMin) bgMin = bgField[i];
      if (bgField[i] > bgMax) bgMax = bgField[i];
    }
    const bgRange = bgMax - bgMin || 1;
    for (let i = 0; i < bgField.length; i++) {
      const inside = sdfData.sdf[i];
      if (inside > -2) {
        const fade = Math.min(1, Math.max(0, (inside + 2) / 6));
        bgField[i] = bgField[i] * (1 - fade);
      }
    }
    const bgLayerCount = 14;
    const bgContours = [];
    for (let k = 0; k < bgLayerCount; k++) {
      const iso = bgMin + bgRange * (k + 0.5) / bgLayerCount;
      const segs = TerrainEngine.marchingSquares(bgField, gw, gh, iso);
      bgContours.push({ segs, isMajor: k % 4 === 0 });
    }

    const anchors = pickLabelAnchors(sdfData, 7, seed);

    cacheRef.current = { gw, gh, contours, fillLayers, bgContours, altSamples, topVal, sdfData };

    const sx = W / gw, sy = H / gh;
    setLabels(anchors.map((a, i) => ({
      x: a.x * sx, y: a.y * sy,
      name: PLACE_NAMES[(i + (seed % PLACE_NAMES.length)) % PLACE_NAMES.length],
      coord: `${(35 + a.x / gw * 2).toFixed(3)}\u00B0N  ${(127 + a.y / gh * 2).toFixed(3)}\u00B0E`,
      size: a.dist
    })).sort((a, b) => b.size - a.size).slice(0, 6));
  }, [size.w, size.h, t.fontSizeRel, t.noise, t.layers, seed]);

  useEffect(() => {
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => recompute());
    } else { recompute(); }
  }, [recompute]);

  // render loop
  useEffect(() => {
    let prev = performance.now();
    let raf = 0, interval = 0, stopped = false;
    const tick = () => {
      if (stopped) return;
      const now = performance.now();
      const dt = Math.min(0.05, (now - prev) / 1000); prev = now;
      timeRef.current += dt;
      mouseRef.current.hot = Math.max(0, mouseRef.current.hot - dt * 0.6);
      render();
    };
    const rafTick = () => { if (stopped) return; tick(); raf = requestAnimationFrame(rafTick); };
    raf = requestAnimationFrame(rafTick);
    interval = setInterval(tick, 1000 / 30);
    return () => { stopped = true; cancelAnimationFrame(raf); clearInterval(interval); };
  }, [size.w, size.h, t, palette, seed]);

  const render = () => {
    const cache = cacheRef.current;
    const canvas = canvasRef.current;
    if (!cache || !canvas) return;
    const W = size.w, H = size.h;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    if (canvas.width !== W * dpr || canvas.height !== H * dpr) {
      canvas.width = W * dpr; canvas.height = H * dpr;
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = palette.bg;
    ctx.fillRect(0, 0, W, H);

    if (t.showGrid) drawGrid(ctx, W, H, palette);

    const sx = W / cache.gw, sy = H / cache.gh;
    const breathT = t.breathe ? Math.sin(timeRef.current * 0.65) : 0;
    const wobbleX = breathT * 1.2;
    const wobbleY = Math.cos(timeRef.current * 0.55) * 1.0;
    const sunHot = mouseRef.current.hot;
    const sunGX = mouseRef.current.gx;
    const sunGY = mouseRef.current.gy;
    const sunR = Math.min(cache.gw, cache.gh) * 0.32;

    if (t.showShadow) drawFills(ctx, cache.fillLayers, cache.gw, cache.gh, sx, sy, palette);

    if (cache.bgContours) {
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (const c of cache.bgContours) {
        ctx.strokeStyle = palette.line;
        ctx.lineWidth = (c.isMajor ? 0.7 : 0.4) * t.lineWeight;
        ctx.globalAlpha = c.isMajor ? 0.22 : 0.13;
        drawSegsAnimated(ctx, c.segs, sx, sy, wobbleX * 0.4, wobbleY * 0.4, sunGX, sunGY, sunR, sunHot * 0.3);
      }
      ctx.globalAlpha = 1;
    }

    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const c of cache.contours) {
      ctx.strokeStyle = palette.line;
      ctx.lineWidth = (c.isMajor ? 1.4 : 0.7) * t.lineWeight;
      ctx.globalAlpha = c.isMajor ? 1 : 0.85;
      drawSegsAnimated(ctx, c.segs, sx, sy, wobbleX, wobbleY, sunGX, sunGY, sunR, sunHot);
    }
    ctx.globalAlpha = 1;

    if (t.showAltitudes) drawAltitudeNumbers(ctx, cache.altSamples, sx, sy, palette);
    if (mouseRef.current.x > -1000) drawSun(ctx, mouseRef.current.x, mouseRef.current.y, sunHot, palette);
    if (t.showCaption) drawCaption(ctx, W, H, palette, seed);
  };

  const onMouseMove = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    mouseRef.current.x = x; mouseRef.current.y = y;
    mouseRef.current.hot = Math.min(1, mouseRef.current.hot + 0.06);
    const cache = cacheRef.current;
    if (cache) {
      mouseRef.current.gx = x / (size.w / cache.gw);
      mouseRef.current.gy = y / (size.h / cache.gh);
    }
  };
  const onMouseLeave = () => { mouseRef.current.x = -1e6; mouseRef.current.y = -1e6; };
  const onClick = () => setSeed(Math.floor(Math.random() * 999999));

  return (
    <div className="root">
      <canvas ref={canvasRef} className="terrain"
              onMouseMove={onMouseMove} onMouseLeave={onMouseLeave} onClick={onClick} />
      <div className="labels" aria-hidden="true">
        {t.showLabels && labels.map((lb, i) => (
          <div key={i} className="lb" style={{ left: lb.x, top: lb.y, color: palette.label }}>
            <span className="lb-x" style={{ color: palette.accent }}>{'\u00D7'}</span>
            <span className="lb-name">{lb.name}</span>
            <span className="lb-coord">{lb.coord}</span>
          </div>
        ))}
      </div>

      <div className="chrome">
        <div className="strip top" style={{color: palette.label}}>
          <div className="dotrow">{Array.from({length: 60}).map((_, i) => <span key={i} className="dot" />)}</div>
          <div className="strip-meta">ISOLINE STUDY {'\u00B7'} 2026 {'\u00B7'} TEXT-AS-TERRAIN</div>
          <div className="dotrow">{Array.from({length: 60}).map((_, i) => <span key={i} className="dot" />)}</div>
        </div>
        <div className="corner tl" style={{color: palette.label}}>
          <div className="cnum">N{'\u00B0'}{String(seed).padStart(6,'0').slice(0,6)}</div>
          <div className="csub">SCALE 1 : 25,000</div>
          <div className="csub">CONTOUR INTERVAL {'\u2014'} 100m</div>
        </div>
        <div className="corner tr" style={{color: palette.label}}>
          <div className="cnum">SHEET 06 / 09</div>
          <div className="csub">RENDERED FROM VECTOR GLYPHS</div>
          <div className="csub">{'\u2014'} {'\uC784\uC120\uC774'} {'\u4F5C'} {'\u300C\uC0DD\uAC01\uC758 \uC6B4\uBC18\u300D'} {'\uC624\uB9C8\uC8FC'}</div>
        </div>
        <div className="corner bl" style={{color: palette.label}}>
          <div className="csub">PROJECTION {'\u00B7'} UTM-K</div>
          <div className="csub">DATUM {'\u00B7'} WGS84</div>
        </div>
        <div className="corner br" style={{color: palette.label}}>
          <div className="csub">{'\uC6C0\uC9C1\uC774\uC138\uC694'} {'\u2014'} {'\uB9C8\uC6B0\uC2A4\uAC00'} {'\uD0DC\uC591'}</div>
          <div className="csub">{'\uB20C\uB7EC\uBCF4\uC138\uC694'} {'\u2014'} {'\uC0C8\uB85C\uC6B4'} {'\uC0B0\uB9E5'}</div>
        </div>
        <div className="strip bottom" style={{color: palette.label}}>
          <div className="dotrow">{Array.from({length: 60}).map((_, i) => <span key={i} className="dot" />)}</div>
        </div>
      </div>

      <TweaksPanel title="Tweaks">
        <TweakSection label={'\uC9C0\uD615'} />
        <TweakSlider label={'\uB178\uC774\uC988 \uAC15\uB3C4'} value={t.noise} min={0} max={100} step={1} unit="%"
                     onChange={(v) => setTweak('noise', v)} />
        <TweakSlider label={'\uB4F1\uACE0\uC120 \uB808\uC774\uC5B4 \uC218'} value={t.layers} min={6} max={40} step={1} unit=""
                     onChange={(v) => setTweak('layers', v)} />
        <TweakSlider label={'\uC120 \uAD75\uAE30'} value={t.lineWeight} min={0.4} max={2.5} step={0.1} unit={'\u00D7'}
                     onChange={(v) => setTweak('lineWeight', v)} />
        <TweakToggle label={'\uC790\uB3D9 \uD638\uD761'} value={t.breathe} onChange={(v) => setTweak('breathe', v)} />

        <TweakSection label={'\uD0C0\uC774\uD3EC\uADF8\uB798\uD53C'} />
        <TweakSlider label={'\uAE00\uC790 \uD06C\uAE30'} value={t.fontSizeRel} min={0.25} max={0.7} step={0.02}
                     onChange={(v) => setTweak('fontSizeRel', v)} />

        <TweakSection label={'\uC0C9\uAC10'} />
        <TweakRadio label={'\uD314\uB808\uD2B8'} value={t.palette}
                    options={['neon','mint','pink','topo']}
                    onChange={(v) => setTweak('palette', v)} />

        <TweakSection label={'\uB808\uC774\uC5B4'} />
        <TweakToggle label={'\uC74C\uC601(\uACE0\uB3C4 \uCC44\uC6C0)'} value={t.showShadow} onChange={(v) => setTweak('showShadow', v)} />
        <TweakToggle label={'\uC9C0\uBA85 \uB77C\uBCA8'} value={t.showLabels} onChange={(v) => setTweak('showLabels', v)} />
        <TweakToggle label={'\uADF8\uB9AC\uB4DC'} value={t.showGrid} onChange={(v) => setTweak('showGrid', v)} />
        <TweakToggle label={'\uACE0\uB3C4 \uC22B\uC790'} value={t.showAltitudes} onChange={(v) => setTweak('showAltitudes', v)} />
        <TweakToggle label={'\uC5EC\uBC31 \uCEA1\uC158'} value={t.showCaption} onChange={(v) => setTweak('showCaption', v)} />

        <TweakSection label={'\uC2DC\uB4DC'} />
        <TweakButton onClick={() => setSeed(Math.floor(Math.random()*999999))}>
          {'\uC0C8 \uC0B0\uB9E5 \uC0DD\uC131 (\uB610\uB294 \uCE94\uBC84\uC2A4 \uD074\uB9AD)'}
        </TweakButton>
      </TweaksPanel>
    </div>
  );
}

// ─────────────────── helpers ───────────────────
function drawSegsAnimated(ctx, segs, sx, sy, wx, wy, sunGX, sunGY, sunR, sunHot) {
  ctx.beginPath();
  const sr2 = sunR * sunR;
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    let x1 = s[0], y1 = s[1], x2 = s[2], y2 = s[3];
    if (sunHot > 0.01) {
      const dx1 = x1 - sunGX, dy1 = y1 - sunGY;
      const r1sq = dx1*dx1 + dy1*dy1;
      if (r1sq < sr2) {
        const f = (1 - r1sq / sr2);
        const k = sunHot * f * f * 4;
        const r = Math.sqrt(r1sq) || 1;
        x1 += (dx1 / r) * k; y1 += (dy1 / r) * k;
      }
      const dx2 = x2 - sunGX, dy2 = y2 - sunGY;
      const r2sq = dx2*dx2 + dy2*dy2;
      if (r2sq < sr2) {
        const f = (1 - r2sq / sr2);
        const k = sunHot * f * f * 4;
        const r = Math.sqrt(r2sq) || 1;
        x2 += (dx2 / r) * k; y2 += (dy2 / r) * k;
      }
    }
    ctx.moveTo((x1 + wx) * sx, (y1 + wy) * sy);
    ctx.lineTo((x2 + wx) * sx, (y2 + wy) * sy);
  }
  ctx.stroke();
}

function drawFills(ctx, fillLayers, gw, gh, sx, sy, palette) {
  for (let li = 0; li < fillLayers.length; li++) {
    const fl = fillLayers[li];
    const c = mixHex(palette.fill, palette.fillDark, fl.t);
    ctx.fillStyle = hexToRgba(c, 0.55);
    ctx.beginPath();
    const cellW = sx, cellH = sy;
    const mask = fl.mask;
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        if (mask[y * gw + x]) ctx.rect(x * cellW, y * cellH, cellW + 0.6, cellH + 0.6);
      }
    }
    ctx.fill();
  }
}

function drawGrid(ctx, W, H, palette) {
  ctx.save();
  ctx.strokeStyle = palette.grid;
  ctx.globalAlpha = 0.18; ctx.lineWidth = 0.5;
  const step = 80;
  for (let x = 0; x <= W; x += step) { ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, H); ctx.stroke(); }
  for (let y = 0; y <= H; y += step) { ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(W, y + 0.5); ctx.stroke(); }
  ctx.globalAlpha = 0.32; ctx.lineWidth = 0.8;
  for (let x = 0; x <= W; x += step * 5) { ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, H); ctx.stroke(); }
  for (let y = 0; y <= H; y += step * 5) { ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(W, y + 0.5); ctx.stroke(); }
  ctx.restore();
}

function drawAltitudeNumbers(ctx, samples, sx, sy, palette) {
  ctx.save();
  ctx.font = '600 9px "Spoqa Han Sans Neo", ui-sans-serif, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const s of samples) {
    const px = s.x * sx, py = s.y * sy;
    ctx.fillStyle = palette.paper;
    ctx.fillRect(px - 14, py - 5, 28, 10);
    ctx.fillStyle = palette.line;
    ctx.fillText(String(s.altitude), px, py);
  }
  ctx.restore();
}

function thinSamples(pts, minDist) {
  const kept = [];
  const md2 = minDist * minDist;
  for (const p of pts) {
    let ok = true;
    for (const q of kept) {
      const dx = p[0] - q[0], dy = p[1] - q[1];
      if (dx*dx + dy*dy < md2) { ok = false; break; }
    }
    if (ok) kept.push(p);
  }
  return kept;
}

function drawSun(ctx, x, y, hot, palette) {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = palette.accent;
  ctx.lineWidth = 1.2;
  const r = 14;
  ctx.beginPath();
  ctx.moveTo(-r, 0); ctx.lineTo(r, 0);
  ctx.moveTo(0, -r); ctx.lineTo(0, r);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, 8 + hot * 4, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = palette.accent;
  ctx.font = '600 10px "Spoqa Han Sans Neo", ui-sans-serif, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('\u2600 SUN', 18, 4);
  ctx.restore();
}

function drawCaption(ctx, W, H, palette, seed) {
  ctx.save();
  ctx.fillStyle = palette.label;
  ctx.font = '500 11px "Spoqa Han Sans Neo", ui-sans-serif, sans-serif';
  ctx.textAlign = 'center';
  const cx = W / 2;
  const lines = [
    '\u201C\uC218\uCC9C \uC7A5\uC758 \uB4F1\uACE0\uC120\uC744 \uC624\uB9AC\uACE0 \uACA9\uACA9\uC774 \uC313\uB294\uB2E4.\u201D \u2014 \uC784\uC120\uC774 \uC791\uAC00\uC758 \uC791\uC5C5 \uBA54\uBAA8\uC5D0 \uBD80\uCCD0',
    'TEXT-AS-TERRAIN  \u00B7  Glyph SDF + Perlin noise + Marching Squares  \u00B7  seed ' + String(seed)
  ];
  let y = H - 70;
  lines.forEach(l => { ctx.fillText(l, cx, y); y += 16; });
  ctx.restore();
}

function pickLabelAnchors(sdfData, n, seed) {
  const { sdf, width, height } = sdfData;
  const candidates = [];
  const stride = Math.max(4, Math.floor(width / 50));
  for (let y = stride; y < height - stride; y += stride) {
    for (let x = stride; x < width - stride; x += stride) {
      const v = sdf[y * width + x];
      if (v > 6) candidates.push({ x, y, dist: v });
    }
  }
  candidates.sort((a, b) => b.dist - a.dist);
  const minD = Math.max(width, height) * 0.09;
  const kept = [];
  for (const c of candidates) {
    let ok = true;
    for (const k of kept) {
      const dx = c.x - k.x, dy = c.y - k.y;
      if (dx*dx + dy*dy < minD * minD) { ok = false; break; }
    }
    if (ok) kept.push(c);
    if (kept.length >= n) break;
  }
  return kept;
}

function hexToRgba(hex, a) {
  const m = hex.replace('#','');
  const r = parseInt(m.slice(0,2),16);
  const g = parseInt(m.slice(2,4),16);
  const b = parseInt(m.slice(4,6),16);
  return `rgba(${r},${g},${b},${a})`;
}
function mixHex(h1, h2, t) {
  const a = h1.replace('#',''), b = h2.replace('#','');
  const r = Math.round(parseInt(a.slice(0,2),16)*(1-t) + parseInt(b.slice(0,2),16)*t);
  const g = Math.round(parseInt(a.slice(2,4),16)*(1-t) + parseInt(b.slice(2,4),16)*t);
  const bl= Math.round(parseInt(a.slice(4,6),16)*(1-t) + parseInt(b.slice(4,6),16)*t);
  return '#' + [r,g,bl].map(v => v.toString(16).padStart(2,'0')).join('');
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
