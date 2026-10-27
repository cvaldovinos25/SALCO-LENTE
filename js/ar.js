/* ============================================================
   Salco Lente: anclaje de la información al producto
   1) Detecta el código de barras y entrega su posición (centro y ancho).
   2) Entre detecciones, sigue esa zona del cuadro con "template matching"
      (compara un recorte de la imagen con el cuadro nuevo), así la
      información se mantiene pegada al producto aunque muevas el celular.
   3) Cada nueva lectura del código corrige cualquier deriva.
   Todo ocurre en el celular. No se guarda ninguna imagen.
   ============================================================ */
(function () {
  const SL = (window.SL = window.SL || {});
  const AR = (SL.AR = { last: null, running: false });
  const norm = (c) => String(c || '').replace(/\D/g, '').replace(/^0+/, '');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const SW = 200;                 // ancho del cuadro reducido que se usa para el seguimiento
  const COLS = 36, ROWS = 27;     // muestras del recorte (la huella en pantalla se adapta al tamaño del producto)
  const SCALES = [0.82, 0.9, 1.1, 1.22];   // cambios de tamaño que se prueban por cuadro (acercar o alejar el producto)
  const OK_SAD = 24;              // diferencia media máxima (0 a 255) para considerar válido el seguimiento
  let vid = null, cb = {}, cfg = {}, runId = 0;
  let mid = null, mctx = null, small = null, sctx = null, sw = 0, sh = 0, k = 1, lastVW = 0;
  let tpl = null, pos = null, vel = { x: 0, y: 0 }, lostN = 0, okN = 0, fresh = 0, target = null, wSm = 0;
  let raf = 0;

  /* ---------- Cuadro reducido en grises ---------- */
  function grab() {
    const vw = vid.videoWidth, vh = vid.videoHeight;
    if (!vw || vid.readyState < 2) return null;
    if (!small || lastVW !== vw) {
      sw = SW; sh = Math.max(40, Math.round(SW * vh / vw)); k = sw / vw; lastVW = vw;
      small = document.createElement('canvas'); small.width = sw; small.height = sh;
      sctx = small.getContext('2d', { willReadFrequently: true });
      sctx.imageSmoothingEnabled = true; sctx.imageSmoothingQuality = 'high';
      mid = document.createElement('canvas'); mid.width = sw * 2; mid.height = sh * 2;
      mctx = mid.getContext('2d'); mctx.imageSmoothingEnabled = true; mctx.imageSmoothingQuality = 'high';
    }
    // reducción en dos pasos (video > 2x > 1x) para evitar el aliasing de las barras finas
    mctx.drawImage(vid, 0, 0, sw * 2, sh * 2);
    sctx.drawImage(mid, 0, 0, sw, sh);
    const d = sctx.getImageData(0, 0, sw, sh).data, g0 = new Uint8Array(sw * sh);
    for (let i = 0, j = 0; i < g0.length; i++, j += 4) g0[i] = (d[j] * 77 + d[j + 1] * 150 + d[j + 2] * 29) >> 8;
    // desenfoque 3x3 suave
    const g = new Uint8Array(sw * sh);
    for (let y = 1; y < sh - 1; y++) for (let x = 1; x < sw - 1; x++) {
      const i = y * sw + x;
      g[i] = (g0[i - sw - 1] + 2 * g0[i - sw] + g0[i - sw + 1] + 2 * g0[i - 1] + 4 * g0[i] + 2 * g0[i + 1] + g0[i + sw - 1] + 2 * g0[i + sw] + g0[i + sw + 1]) >> 4;
    }
    return { g, w: sw, h: sh };
  }

  /* ---------- Recorte y búsqueda ---------- */
  /* La huella del recorte es proporcional al ancho del código (≈1,7 veces), así abarca el envase que lo rodea
     y se adapta cuando el producto se acerca o se aleja. */
  function foot() {
    const wb = Math.max(14, (wSm || 200) * k);
    const tw = Math.max(48, Math.min(170, Math.round(wb * 1.7)));
    return { tw, th: Math.round(tw * 0.75) };
  }
  function makeTpl(f, cx, cy) {
    const { tw, th } = foot();
    if (cx - tw / 2 < 0 || cy - th / 2 < 0 || cx + tw / 2 >= f.w || cy + th / 2 >= f.h) return null;
    const t = new Uint8Array(COLS * ROWS);
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const x = Math.round(cx + ((c + 0.5) / COLS - 0.5) * tw), y = Math.round(cy + ((r + 0.5) / ROWS - 0.5) * th);
      t[r * COLS + c] = f.g[y * f.w + x];
    }
    return { t, tw, th };
  }
  function sad(f, cx, cy, sc, best) {
    const { t, tw, th } = tpl, stw = tw * sc / COLS, sth = th * sc / ROWS;
    const x0 = cx - tw * sc / 2 + stw / 2, y0 = cy - th * sc / 2 + sth / 2;
    let s = 0;
    for (let r = 0; r < ROWS; r++) {
      const base = Math.round(y0 + r * sth) * f.w, tb = r * COLS;
      for (let c = 0; c < COLS; c++) { const d = f.g[base + Math.round(x0 + c * stw)] - t[tb + c]; s += d < 0 ? -d : d; }
      if (s >= best) return s;
    }
    return s;
  }
  function inside(f, cx, cy, sc) {
    const hw = tpl.tw * sc / 2 + 1, hh = tpl.th * sc / 2 + 1;
    return cx - hw >= 0 && cy - hh >= 0 && cx + hw < f.w && cy + hh < f.h;
  }
  function search(f, px, py, R) {
    let bx = Math.round(px), by = Math.round(py), bs = 1e12, bsc = 1;
    const tryAt = (cx, cy, sc) => {
      if (!inside(f, cx, cy, sc)) return;
      const v = sad(f, cx, cy, sc, bs); if (v < bs) { bs = v; bx = cx; by = cy; bsc = sc; }
    };
    const cx0 = Math.round(px), cy0 = Math.round(py);
    for (let dy = -R; dy <= R; dy += 2) for (let dx = -R; dx <= R; dx += 2) tryAt(cx0 + dx, cy0 + dy, 1);
    const rx = bx, ry = by;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) tryAt(rx + dx, ry + dy, 1);
    // ¿cambió el tamaño? (solo se acepta si mejora claramente, para no vibrar)
    const base = bs, n = COLS * ROWS;
    bs *= 0.9;
    for (const sc of SCALES) for (let dy = -2; dy <= 2; dy += 2) for (let dx = -2; dx <= 2; dx += 2) tryAt(rx + dx, ry + dy, sc);
    if (bsc === 1) bs = base;
    return { x: bx, y: by, sc: bsc, score: bs / n };
  }

  /* ---------- Anclar con una lectura del código ---------- */
  function anchor(det, pre) {
    // det en píxeles del video; pre = cuadro reducido tomado justo antes de leer
    const sx = det.x * k, sy = det.y * k;
    wSm = wSm ? wSm * 0.5 + det.w * 0.5 : det.w;
    if (pos && AR.last && AR.last.ok && Math.hypot(sx - pos.x, sy - pos.y) < 10) {
      pos.x = pos.x * 0.5 + sx * 0.5; pos.y = pos.y * 0.5 + sy * 0.5; // coincide con el seguimiento: solo suaviza
      if (pre) { const t = makeTpl(pre, sx, sy); if (t) tpl = t; }
      return;
    }
    if (!pre) return;
    const t = makeTpl(pre, sx, sy);
    if (!t) return;
    tpl = t; pos = { x: sx, y: sy }; vel = { x: 0, y: 0 }; lostN = 0; okN = 0; fresh = 4;
  }

  /* ---------- Bucle de seguimiento (cada cuadro) ---------- */
  function trackLoop(id) {
    if (id !== runId) return;
    raf = requestAnimationFrame(() => trackLoop(id));
    if (!tpl || !pos) return;
    const f = grab(); if (!f) return;
    const R = fresh > 0 ? 28 : (lostN > 2 ? 30 : 16);
    const r = search(f, pos.x + vel.x, pos.y + vel.y, R);
    if (fresh > 0) fresh--;
    const ok = r.score < OK_SAD;
    if (ok) {
      vel.x = vel.x * 0.4 + (r.x - pos.x) * 0.6; vel.y = vel.y * 0.4 + (r.y - pos.y) * 0.6;
      pos.x += (r.x - pos.x) * 0.8; pos.y += (r.y - pos.y) * 0.8; lostN = 0; okN++;
      if (r.sc !== 1) {                                   // el producto se acercó o se alejó
        wSm = Math.max(18, Math.min(lastVW * 0.9, wSm * r.sc));
        const t = makeTpl(f, pos.x, pos.y); if (t) tpl = t;
      } else if (okN % 8 === 0 && r.score < 14) { const t = makeTpl(f, pos.x, pos.y); if (t) tpl = t; }
    } else { lostN++; vel.x *= 0.7; vel.y *= 0.7; }
    AR.last = { x: pos.x / k, y: pos.y / k, w: wSm, ok, lost: lostN > 10, score: r.score, t: performance.now() };
    if (cb.onTrack) cb.onTrack(AR.last);
  }

  /* La lectura entrega la fila donde se leyó el código. El centro vertical real se estima
     buscando las filas con mucha variación horizontal (las barras) alrededor de esa fila. */
  function refineY(c2d, W, H, xl, xr, yRow) {
    try {
      const x0 = Math.max(0, Math.floor(xl)), x1 = Math.min(W - 2, Math.ceil(xr));
      if (x1 - x0 < 20) return yRow;
      const d = c2d.getImageData(0, 0, W, H).data, act = new Float32Array(H);
      let mx = 0;
      for (let y = 0; y < H; y++) {
        let a = 0;
        for (let x = x0; x < x1; x += 2) { const i = (y * W + x) * 4, j = i + 8; a += Math.abs(d[i] + d[i + 1] + d[i + 2] - d[j] - d[j + 1] - d[j + 2]); }
        act[y] = a; if (a > mx) mx = a;
      }
      const thr = mx * 0.45; let y = Math.max(0, Math.min(H - 1, Math.round(yRow)));
      if (act[y] < thr) { let best = y, bd = 1e9; for (let k2 = 0; k2 < H; k2++) if (act[k2] >= thr && Math.abs(k2 - y) < bd) { bd = Math.abs(k2 - y); best = k2; } y = best; }
      let t = y, b = y;
      while (t > 0 && act[t - 1] >= thr) t--;
      while (b < H - 1 && act[b + 1] >= thr) b++;
      return (t + b) / 2;
    } catch (e) { return yRow; }
  }

  /* ---------- Bucle de lectura del código ---------- */
  async function decodeLoop(id) {
    let det = null, iter = 0;
    if ('BarcodeDetector' in window) { try { det = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'] }); } catch (e) { det = null; } }
    let reader = null;
    if (!det && window.ZXing) {
      const h = new Map();
      h.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [ZXing.BarcodeFormat.EAN_13, ZXing.BarcodeFormat.EAN_8, ZXing.BarcodeFormat.UPC_A, ZXing.BarcodeFormat.UPC_E, ZXing.BarcodeFormat.CODE_128]);
      h.set(ZXing.DecodeHintType.TRY_HARDER, true);
      reader = new ZXing.MultiFormatReader(); reader.setHints(h);
    }
    const cv = document.createElement('canvas'), cx = cv.getContext('2d', { willReadFrequently: true });
    while (id === runId) {
      try {
        if (vid.readyState >= 2 && vid.videoWidth) {
          const vw = vid.videoWidth, vh = vid.videoHeight;
          const pre = grab();                     // cuadro reducido del mismo instante
          let res = null;
          if (det) {
            try {
              const r = await det.detect(vid);
              if (r.length) { const b = r[0].boundingBox; res = { code: r[0].rawValue, x: b.x + b.width / 2, y: b.y + b.height / 2, w: b.width }; }
            } catch (e) { det = null; }
          }
          if (!det && reader) {
            // alterna: cuadro completo y recorte central a resolución nativa (productos más lejos)
            iter++;
            const zoom = iter % 2 === 0 ? 1 : 0.5;
            const cw = Math.round(vw * 0.9 * zoom), ch = Math.round(vh * 0.8 * zoom), sx = (vw - cw) / 2, sy = (vh - ch) / 2;
            const sc = Math.min(1, (cfg.ancho || 1280) / cw); cv.width = Math.round(cw * sc); cv.height = Math.round(ch * sc);
            cx.drawImage(vid, sx, sy, cw, ch, 0, 0, cv.width, cv.height);
            try {
              const out = reader.decode(new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(new ZXing.HTMLCanvasElementLuminanceSource(cv))));
              const pts = (out.getResultPoints && out.getResultPoints()) || [];
              let x = vw / 2, y = vh / 2, w = vw * 0.3;
              if (pts.length >= 2) {
                const cxs = pts.map((p) => p.getX()), cys = pts.map((p) => p.getY());
                const xl = Math.min(...cxs), xr = Math.max(...cxs), yr = (Math.min(...cys) + Math.max(...cys)) / 2;
                x = sx + (xl + xr) / 2 / sc; w = Math.max((xr - xl) / sc, vw * 0.04);
                y = sy + refineY(cx, cv.width, cv.height, xl, xr, yr) / sc;   // centro vertical real de las barras
              }
              res = { code: out.getText(), x, y, w };
            } catch (e) { /* sin código en este cuadro */ }
          }
          if (res && id === runId) {
            const code = norm(res.code);
            if (!target || code === target) anchor(res, pre);
            if (cb.onDetect) cb.onDetect({ code: res.code, key: code, x: res.x, y: res.y, w: res.w });
          }
        }
      } catch (e) { console.warn(e); }
      await sleep(cfg.intervalo || 140);
    }
  }

  /* ---------- API ---------- */
  AR.start = function (video, callbacks, config) {
    AR.stop(); vid = video; cb = callbacks || {}; cfg = config || {}; AR.running = true;
    const id = ++runId; tpl = null; pos = null; target = null; wSm = 0; AR.last = null;
    raf = requestAnimationFrame(() => trackLoop(id));
    decodeLoop(id);
  };
  AR.stop = function () { runId++; AR.running = false; cancelAnimationFrame(raf); tpl = null; pos = null; target = null; AR.last = null; };
  /* Fija el código que se sigue (solo ese re-ancla). null = el primero que aparezca. */
  AR.lock = function (key) { target = key ? norm(key) : null; if (!key) { tpl = null; pos = null; AR.last = null; wSm = 0; } };
  AR.hasLock = () => !!(tpl && pos);
})();
