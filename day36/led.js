// Dot-matrix LED panel: text is rasterized with a pixel font at 16px tall,
// then each pixel is drawn as a round lamp. Long text scrolls.
window.Led = (() => {
  const COLS = 168;
  const ROWS = 16;
  const FONT = '12px Galmuri11, monospace';
  const SCROLL_SPEED = 28; // columns per second
  const COLORS = { ok: '#45f08a', error: '#ff4b3a', info: '#ffb93a' };
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let canvas, ctx, raster, rctx;
  let bitmap = null, bitmapW = 0, color = COLORS.info, since = 0, blink = false;

  function init(el) {
    canvas = el;
    ctx = canvas.getContext('2d');
    raster = document.createElement('canvas');
    rctx = raster.getContext('2d', { willReadFrequently: true });
    resize();
    new ResizeObserver(resize).observe(canvas);
    requestAnimationFrame(loop);
  }

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    canvas.width = Math.round(w * ratio);
    canvas.height = Math.round((w * ROWS / COLS) * ratio);
  }

  function rasterize(text) {
    rctx.font = FONT;
    const w = Math.ceil(rctx.measureText(text).width) + 2;
    raster.width = Math.max(w, 1);
    raster.height = ROWS;
    rctx.font = FONT;
    rctx.fillStyle = '#fff';
    rctx.textBaseline = 'middle';
    rctx.fillText(text, 1, ROWS / 2 + 1);
    const { data } = rctx.getImageData(0, 0, raster.width, ROWS);
    const lit = new Uint8Array(raster.width * ROWS);
    for (let i = 0; i < lit.length; i++) lit[i] = data[i * 4 + 3] > 110 ? 1 : 0;
    return { lit, width: raster.width };
  }

  function show(text, tone = 'info', opts = {}) {
    const r = rasterize(text);
    bitmap = r.lit;
    bitmapW = r.width;
    color = COLORS[tone];
    blink = !!opts.blink;
    since = performance.now();
    canvas.setAttribute('aria-label', text);
  }

  function draw(now) {
    const { width, height } = canvas;
    const pitch = width / COLS;
    const rad = pitch * 0.38;
    ctx.fillStyle = '#0b0b0b';
    ctx.fillRect(0, 0, width, height);
    const t = (now - since) / 1000;
    const scrolls = bitmapW > COLS;
    // Scrolling text enters from the right; short text sits centered
    const offset = scrolls
      ? COLS - Math.floor((t * SCROLL_SPEED) % (bitmapW + COLS))
      : Math.floor((COLS - bitmapW) / 2);
    const isOn = !blink || reduceMotion || t > 1.2 || Math.floor(t * 4) % 2 === 0;

    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const bx = x - offset;
        const isLit = isOn && bitmap && bx >= 0 && bx < bitmapW && bitmap[y * bitmapW + bx];
        ctx.fillStyle = isLit ? color : '#1e1e1e';
        ctx.beginPath();
        ctx.arc(x * pitch + pitch / 2, y * pitch + pitch / 2, rad, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function loop(now) {
    draw(reduceMotion ? since + 1300 : now);
    requestAnimationFrame(loop);
  }

  return { init, show };
})();
