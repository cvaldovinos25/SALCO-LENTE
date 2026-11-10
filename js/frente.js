/* ============================================================
   Salco Lente: reconocer el producto por su frente (sin código de barras)
   Compara el cuadro de la cámara con una imagen de referencia del frente de cada producto
   (img/productos/ref/<id>.png, recortada y con fondo transparente) usando "template matching":
   desliza la referencia, a varios tamaños, sobre el cuadro y mide cuánto se parecen
   (correlación cruzada normalizada, por canal de color). Gana el producto con mayor parecido.
   Todo ocurre en el celular. No se guarda ni se envía ninguna imagen.
   ============================================================ */
(function () {
  const SL = (window.SL = window.SL || {});
  const FW = 176;                       // ancho del cuadro reducido sobre el que se busca
  const TW = 32;                        // ancho de la referencia al comparar
  const HFR = [0.32, 0.42, 0.54, 0.68, 0.84, 0.96];   // alto probable del producto, como fracción del alto del cuadro
  const COLOR_K = 3;                    // cuánto pesa la diferencia de color (0 = ignorarla)
  const MAXPTS = 420;                   // muestras por referencia (solo píxeles del producto)
  const refs = {};                      // id -> { id, w, h, pts:[{u,v}], t:[canales normalizados] }
  let loading = null, cv = null, cx = null;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const loadImg = (src) => new Promise((ok) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => ok(null); im.src = src; });

  /* ---------- Referencias ---------- */
  function build(id, im) {
    const w = TW, h = Math.max(8, Math.round(im.height * TW / im.width));
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d', { willReadFrequently: true }); g.imageSmoothingQuality = 'high'; g.drawImage(im, 0, 0, w, h);
    const d = g.getImageData(0, 0, w, h).data, idx = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 140) idx.push(y * w + x);
    if (idx.length < 40) return;
    const step = Math.max(1, Math.ceil(idx.length / MAXPTS)), pts = [];
    for (let i = 0; i < idx.length; i += step) pts.push(idx[i]);
    const n = pts.length, t = [0, 1, 2].map((ch) => {
      const a = new Float32Array(n); let m = 0;
      for (let i = 0; i < n; i++) { a[i] = d[pts[i] * 4 + ch]; m += a[i]; }
      m /= n; let s = 0; for (let i = 0; i < n; i++) { a[i] -= m; s += a[i] * a[i]; }
      s = Math.sqrt(s) || 1; for (let i = 0; i < n; i++) a[i] /= s;
      return a;
    });
    const mean = [0, 1, 2].map((ch) => { let m = 0; for (let i = 0; i < n; i++) m += d[pts[i] * 4 + ch]; return m / n; });
    refs[id] = { id, w, h, n, mean, u: Int16Array.from(pts, (p) => p % w), v: Int16Array.from(pts, (p) => (p / w) | 0), t };
  }
  function load(items) {   // items: [{ id, src }] (solo productos con imagen real del frente)
    if (!loading) loading = Promise.all(items.map((it) => loadImg(it.src).then((im) => { if (im) build(it.id, im); })));
    return loading;
  }

  /* ---------- Cuadro de la cámara ---------- */
  function frame(vid) {
    const vw = vid.videoWidth, vh = vid.videoHeight; if (!vw || vid.readyState < 2) return null;
    const w = FW, h = Math.round(FW * vh / vw);
    if (!cv) { cv = document.createElement('canvas'); cx = cv.getContext('2d', { willReadFrequently: true }); cx.imageSmoothingQuality = 'high'; }
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    cx.drawImage(vid, 0, 0, w, h);
    const d = cx.getImageData(0, 0, w, h).data, ch = [new Float32Array(w * h), new Float32Array(w * h), new Float32Array(w * h)], gr = new Float32Array(w * h);
    for (let i = 0, j = 0; i < w * h; i++, j += 4) { ch[0][i] = d[j]; ch[1][i] = d[j + 1]; ch[2][i] = d[j + 2]; gr[i] = (d[j] * 77 + d[j + 1] * 150 + d[j + 2] * 29) / 256; }
    return { w, h, ch, gr, k: vw / w };
  }

  /* Correlación cruzada normalizada de la referencia puesta en (x0, y0) con ancho sw y alto sh (px del cuadro). */
  function ncc(f, r, x0, y0, sw, sh, chans, mo) {
    const n = r.n, sx = sw / r.w, sy = sh / r.h; let tot = 0;
    for (const c of chans) {
      const src = c < 0 ? f.gr : f.ch[c], t = r.t[c < 0 ? 1 : c];
      let sf = 0, sff = 0, sft = 0;
      for (let i = 0; i < n; i++) {
        const v = src[((y0 + (r.v[i] + 0.5) * sy) | 0) * f.w + ((x0 + (r.u[i] + 0.5) * sx) | 0)];
        sf += v; sff += v * v; sft += v * t[i];
      }
      if (mo) mo[c] = sf / n;
      const va = sff - sf * sf / n;
      tot += va > 25 * n ? sft / Math.sqrt(va) : 0;     // zonas casi lisas (pared, mesa) no cuentan como parecido
    }
    return tot / chans.length;
  }

  /* Mejor posición y tamaño de una referencia en el cuadro. */
  function best(f, r) {
    const asp = r.w / r.h; let b = { s: -1, x: 0, y: 0, sw: 0, sh: 0 };
    const tryAt = (x, y, sw, sh, chans) => {
      if (x < 0 || y < 0 || x + sw >= f.w || y + sh >= f.h) return -1;
      const mo = [0, 0, 0], s0 = ncc(f, r, x, y, sw, sh, chans, mo);
      // el color también cuenta: un envase blanco no puede pasar por uno naranja aunque tenga una silueta parecida
      const sa = mo[0] + mo[1] + mo[2] + 1, sb = r.mean[0] + r.mean[1] + r.mean[2] + 1;
      let cd = 0; for (let c = 0; c < 3; c++) cd += Math.abs(mo[c] / sa - r.mean[c] / sb);
      const s = s0 * (1 - Math.min(0.6, COLOR_K * cd)); if (s > b.s) b = { s, x, y, sw, sh, s0, cd }; return s;
    };
    const cand = [];
    for (const fr of HFR) {                                  // paso grueso: solo gris, cada 4 px
      let sh = f.h * fr, sw = sh * asp; if (sw > f.w * 0.95) { sw = f.w * 0.95; sh = sw / asp; }
      for (let y = 0; y + sh < f.h; y += 4) for (let x = 0; x + sw < f.w; x += 4) cand.push([ncc(f, r, x, y, sw, sh, [-1]), x, y, sw, sh]);
    }
    cand.sort((a, c) => c[0] - a[0]);
    for (const [, x, y, sw, sh] of cand.slice(0, 4)) {        // afinado: color, ±3 px y ±10 % de tamaño
      for (const m of [0.9, 1, 1.1]) for (let dy = -3; dy <= 3; dy += 3) for (let dx = -3; dx <= 3; dx += 3) {
        const w2 = sw * m, h2 = sh * m; tryAt(Math.round(x + dx - (w2 - sw) / 2), Math.round(y + dy - (h2 - sh) / 2), w2, h2, [0, 1, 2]);
      }
    }
    return b;
  }

  /* ---------- API ---------- */
  /* Mira 'veces' cuadros y devuelve los productos ordenados por parecido. */
  async function identify(vid, items, veces) {
    await load(items);
    const tot = {}, pos = {}; let n = 0;
    for (let i = 0; i < (veces || 2); i++) {
      const f = frame(vid); if (!f) break;
      for (const id of Object.keys(refs)) {
        const b = best(f, refs[id]); if (b.s < -0.5) continue;
        tot[id] = (tot[id] || 0) + b.s;
        pos[id] = { s0: b.s0, cd: b.cd, x: (b.x + b.sw / 2) * f.k, y: (b.y + b.sh / 2) * f.k, w: b.sw * f.k, h: b.sh * f.k };
      }
      n++; if (i < (veces || 2) - 1) await sleep(120);
    }
    if (!n) return [];
    return Object.keys(tot).map((id) => Object.assign({ id, score: tot[id] / n }, pos[id])).sort((a, b) => b.score - a.score);
  }
  /* ¿Es una coincidencia clara? Mejor parecido alto y con ventaja sobre el segundo. */
  function decide(r) {
    if (!r.length) return { tipo: 'nada' };
    const a = r[0], b = r[1] ? r[1].score : 0;
    if (a.score >= SL.Frente.UMBRAL && a.score - b >= SL.Frente.VENTAJA) return { tipo: 'seguro', top: a };
    if (a.score >= SL.Frente.SUGERIR) return { tipo: 'duda', top: r.slice(0, 2).filter((x) => x.score >= SL.Frente.SUGERIR) };
    return { tipo: 'nada' };
  }
  SL.Frente = { identify, decide, UMBRAL: 0.62, VENTAJA: 0.12, SUGERIR: 0.48, refs };
})();
