/* ============================================================
   Salco Lente: lógica de la app
   Escanear (código de barras) > vista RA del producto > comparar > lista
   Todo ocurre en el celular: no se envían imágenes ni datos.
   ============================================================ */
(function () {
  const SL = window.SL, C = SL.CONFIG;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clp = (n) => '$ ' + Math.round(n).toLocaleString('es-CL');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const qs = new URLSearchParams(location.search);
  const DEBUG = qs.has('debug');

  /* ---------- Almacenamiento local (solo perfil, lista y categorías vistas) ---------- */
  const mem = {};
  const sget = (k, d) => { try { const v = localStorage.getItem('sl_' + k); return v ? JSON.parse(v) : d; } catch (e) { return mem[k] !== undefined ? mem[k] : d; } };
  const sset = (k, v) => { mem[k] = v; try { localStorage.setItem('sl_' + k, JSON.stringify(v)); } catch (e) {} };

  const S = {
    cat: [], byId: {}, byEan: {},
    profile: Object.assign({ embarazo: false, fragancias: false, sensible: false }, sget('perfil', {})),
    list: sget('lista', []),            // [{id, qty}]
    seen: sget('vistas', []),           // categorías exploradas
    unlocked: sget('cupon', false),
    cmp: { a: null, b: null }, mode: 'view', pick: null,
    cur: null, pvFromScan: false, screen: 'home', model: null
  };

  function toast(msg, ms) {
    $$('.toast').forEach((t) => t.remove());
    const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t);
    setTimeout(() => t.remove(), ms || 3200);
  }

  /* ---------- Catálogo ---------- */
  const norm = (c) => String(c || '').replace(/\D/g, '').replace(/^0+/, '');
  async function loadCatalog() {
    try {
      const r = await fetch(C.CATALOGO_URL, { cache: 'no-cache' });
      if (!r.ok) throw new Error(r.status);
      const j = await r.json();
      S.cat = j.productos || []; S.updated = j.actualizado || '';
    } catch (e) {
      console.warn('catálogo', e);
      try { const r = await fetch('data/productos.json', { cache: 'no-cache' }); const j = await r.json(); S.cat = j.productos || []; } catch (e2) { toast('No pudimos cargar el catálogo. Revisa tu conexión.'); }
    }
    S.byId = {}; S.byEan = {};
    S.cat.forEach((p) => { S.byId[p.id] = p; S.byEan[norm(p.ean)] = p; });
  }

  /* ---------- Cálculos ---------- */
  const unitVal = (p) => p.precio / (p.cantidad && p.cantidad.valor ? p.cantidad.valor : 1);
  const unitTxt = (p) => { const v = unitVal(p); return '$ ' + (v < 10 ? v.toFixed(1).replace('.', ',') : Math.round(v).toLocaleString('es-CL')) + ' / ' + p.cantidad.unidad; };
  const catMeta = (p) => C.CATEGORIAS[p.categoria] || { nombre: p.categoria, emoji: '🛍️', c1: '#e3f4ff', c2: '#f0fadb' };
  const icBubble = (p, cls) => '<span class="ic ' + (cls || '') + '" style="--c1:' + catMeta(p).c1 + ';--c2:' + catMeta(p).c2 + '">' + catMeta(p).emoji + '</span>';

  /* Semáforo de ingredientes según el perfil */
  function sema(p, all) {
    const f = p.flags || {}, pr = S.profile, o = [];
    if (f.fragancia === false) o.push(['g', 'Sin fragancia declarada']);
    else if (f.fragancia === true) o.push([pr.fragancias ? 'r' : 'n', pr.fragancias ? 'Tiene fragancia (tú las evitas)' : 'Con fragancia']);
    else o.push(['y', 'Fragancia: revisa el envase']);
    if (f.alcohol === false) o.push(['g', 'Sin alcohol']); else if (f.alcohol === true) o.push(['n', 'Contiene alcohol']);
    const emb = { ok: ['g', 'Embarazo y lactancia: sin alerta conocida'], consultar: ['y', 'Embarazo y lactancia: consulta antes'], evitar: ['r', 'Embarazo y lactancia: evitar'] }[f.embarazo];
    if (emb && (pr.embarazo || all)) o.push(emb);
    if (f.sensible === 'revisar' && (pr.sensible || all)) o.push(['y', 'Piel sensible: prueba en una zona pequeña']);
    (f.alergenos || []).forEach((a) => o.push(['n', 'Contiene ' + a]));
    const ord = { r: 0, y: 1, g: 2, n: 3 };
    return o.sort((a, b) => ord[a[0]] - ord[b[0]]);
  }
  const pills = (arr, n) => arr.slice(0, n || 99).map((x) => '<span class="pill ' + x[0] + '">' + esc(x[1]) + '</span>').join('');

  /* ---------- Navegación ---------- */
  function go(name) {
    S.screen = name;
    $$('.screen').forEach((s) => s.classList.toggle('on', s.id === 's-' + name));
    $$('.nb[data-go]').forEach((b) => b.classList.toggle('on', b.dataset.go === name));
    window.scrollTo(0, 0);
    if (name === 'home') renderHome(); else if (name === 'search') renderSearch(); else if (name === 'compare') renderCompare(); else if (name === 'list') renderList();
  }
  $$('.nb[data-go]').forEach((b) => b.addEventListener('click', () => { S.pick = null; go(b.dataset.go); }));

  /* ---------- Inicio ---------- */
  function renderHome() {
    $('#homeCats').innerHTML = Object.keys(C.CATEGORIAS).map((k) => {
      const m = C.CATEGORIAS[k], n = S.cat.filter((p) => p.categoria === k).length;
      return '<button class="cat" data-cat="' + k + '"><span class="ic" style="--c1:' + m.c1 + ';--c2:' + m.c2 + '">' + m.emoji + '</span><span>' + m.nombre + '<small>' + n + ' producto' + (n === 1 ? '' : 's') + '</small></span></button>';
    }).join('');
    $$('#homeCats .cat').forEach((b) => b.addEventListener('click', () => { qcat = b.dataset.cat; qtext = ''; $('#q').value = ''; go('search'); }));
    $('#legalHome').textContent = C.TEXTO.AVISO;
  }
  $('#homeScan').addEventListener('click', () => openScan('view'));
  $('#navScan').addEventListener('click', () => openScan('view'));

  /* ---------- Buscar ---------- */
  let qcat = '', qtext = '';
  function renderSearch() {
    $('#qchips').innerHTML = '<button class="chp' + (qcat ? '' : ' on') + '" data-c="">Todo</button>' + Object.keys(C.CATEGORIAS).map((k) => '<button class="chp' + (qcat === k ? ' on' : '') + '" data-c="' + k + '">' + C.CATEGORIAS[k].emoji + ' ' + C.CATEGORIAS[k].nombre + '</button>').join('');
    $$('#qchips .chp').forEach((b) => b.addEventListener('click', () => { qcat = b.dataset.c; renderSearch(); }));
    const t = qtext.trim().toLowerCase();
    const list = S.cat.filter((p) => (!qcat || p.categoria === qcat) && (!t || (p.marca + ' ' + p.nombre + ' ' + catMeta(p).nombre + ' ' + (p.foco || '')).toLowerCase().includes(t)));
    $('#plist').innerHTML = (S.pick ? '<div class="note">Elige el producto para comparar.</div>' : '') + (list.length ? list.map((p) =>
      '<button class="pit" data-id="' + esc(p.id) + '">' + icBubble(p) + '<span><b>' + esc(p.marca) + ' ' + esc(p.nombre) + '</b><span class="s">' + esc(p.formato) + ' · ' + esc(catMeta(p).nombre) + '</span></span><span class="p">' + clp(p.precio) + '<small>' + unitTxt(p) + '</small></span></button>').join('') : '<div class="empty">No encontramos productos con esa búsqueda.</div>');
    $$('#plist .pit').forEach((b) => b.addEventListener('click', () => choose(S.byId[b.dataset.id])));
  }
  $('#q').addEventListener('input', (e) => { qtext = e.target.value; renderSearch(); });

  /* Elegir un producto desde la lista: ver o comparar */
  function choose(p) {
    if (!p) return;
    if (S.pick) { S.cmp[S.pick] = p; S.pick = null; go('compare'); return; }
    openProduct(p, false);
  }

  /* ---------- Cámara ---------- */
  const vid = $('#vid');
  let stream = null;
  async function camStart() {
    if (stream) { document.body.classList.add('cam'); return true; }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { toast('Tu navegador no permite usar la cámara. Abre este enlace en Safari o Chrome.', 4500); return false; }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    } catch (e) { toast('No pudimos usar la cámara. Permite el acceso o busca el producto por nombre.', 4500); return false; }
    vid.srcObject = stream; document.body.classList.add('cam');
    try { await vid.play(); } catch (e) {}
    return true;
  }
  function camStop() {
    if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
    vid.srcObject = null; document.body.classList.remove('cam');
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && stream) { const pl = vid.play(); if (pl && pl.catch) pl.catch(() => {}); } });

  /* ---------- Lectura de códigos de barras ---------- */
  let loopId = 0, scanning = false, lastCode = '', lastT = 0;
  function startLoop() {
    const id = ++loopId; scanning = true;
    let det = null;
    if ('BarcodeDetector' in window) { try { det = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'] }); } catch (e) { det = null; } }
    let reader = null;
    if (!det && window.ZXing) {
      const h = new Map(); h.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [ZXing.BarcodeFormat.EAN_13, ZXing.BarcodeFormat.EAN_8, ZXing.BarcodeFormat.UPC_A, ZXing.BarcodeFormat.UPC_E, ZXing.BarcodeFormat.CODE_128]);
      h.set(ZXing.DecodeHintType.TRY_HARDER, true);
      reader = new ZXing.MultiFormatReader(); reader.setHints(h);
    }
    const cv = document.createElement('canvas'), cx = cv.getContext('2d', { willReadFrequently: true });
    (async function tick() {
      while (loopId === id && scanning) {
        try {
          if (vid.readyState >= 2 && vid.videoWidth) {
            let code = null;
            if (det) {
              try { const r = await det.detect(vid); if (r.length) code = r[0].rawValue; } catch (e) { det = null; }
            }
            if (!det && reader) {
              const vw = vid.videoWidth, vh = vid.videoHeight, cw = Math.round(vw * 0.8), ch = Math.round(vh * 0.5), sx = (vw - cw) / 2, sy = (vh - ch) * 0.4;
              const sc = Math.min(1, C.SCAN.ANCHO_ANALISIS / cw); cv.width = Math.round(cw * sc); cv.height = Math.round(ch * sc);
              cx.drawImage(vid, sx, sy, cw, ch, 0, 0, cv.width, cv.height);
              try {
                const bmp = new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(new ZXing.HTMLCanvasElementLuminanceSource(cv)));
                code = reader.decode(bmp).getText();
              } catch (e) { /* no se encontró código en este cuadro */ }
            }
            if (code && loopId === id && scanning) onCode(code);
          }
        } catch (e) { console.warn(e); }
        await sleep(C.SCAN.INTERVALO_MS);
      }
    })();
  }
  function stopLoop() { scanning = false; loopId++; }

  function onCode(raw) {
    const k = norm(raw), now = Date.now();
    if (k === lastCode && now - lastT < 6000) return;
    lastCode = k; lastT = now;
    const p = S.byEan[k];
    if (!p) { toast('Código ' + raw + ': aún no está en el catálogo. Prueba con otro o búscalo por nombre.', 3800); return; }
    found(p);
  }
  function found(p) {
    stopLoop();
    if (navigator.vibrate) try { navigator.vibrate(30); } catch (e) {}
    $('#reticle').classList.add('ok');
    const fl = document.createElement('div'); fl.className = 'flash'; $('#scan').appendChild(fl); setTimeout(() => fl.remove(), 600);
    setTimeout(() => {
      $('#reticle').classList.remove('ok');
      if (S.mode === 'slotA' || S.mode === 'slotB') {
        S.cmp[S.mode === 'slotA' ? 'a' : 'b'] = p; closeScan(true); go('compare');
      } else { $('#scan').classList.remove('on'); openProduct(p, true); }
    }, 350);
  }

  /* ---------- Overlay de escaneo ---------- */
  let scanTok = 0;
  async function openScan(mode) {
    S.mode = mode; const tok = ++scanTok;
    requestTilt();
    const titles = { view: 'Escanear producto', slotA: 'Escanea el primer producto', slotB: 'Escanea el segundo producto' };
    $('#scTitle').textContent = titles[mode] || titles.view;
    const ok = await camStart();
    if (tok !== scanTok) return; // se cerró mientras se activaba la cámara
    if (!ok) { S.pick = mode === 'slotA' ? 'a' : mode === 'slotB' ? 'b' : null; go('search'); return; }
    $('#pv').classList.remove('on');
    $('#scan').classList.add('on');
    startLoop();
  }
  function closeScan(stopCam) {
    scanTok++; stopLoop(); $('#scan').classList.remove('on');
    if (stopCam) camStop();
  }
  $('#scClose').addEventListener('click', () => { closeScan(true); });
  $('#scList').addEventListener('click', () => { closeScan(true); S.pick = S.mode === 'slotA' ? 'a' : S.mode === 'slotB' ? 'b' : null; go('search'); });
  $('#manual').addEventListener('submit', (e) => {
    e.preventDefault();
    const v = $('#manualIn').value.trim(); if (!v) return;
    const p = S.byEan[norm(v)];
    if (p) { $('#manualIn').value = ''; found(p); } else toast('No encontramos ese código en el catálogo.');
  });

  /* ---------- Vista de producto (RA) ---------- */
  function categoriesSeen(p) {
    if (!S.seen.includes(p.categoria)) {
      S.seen.push(p.categoria); sset('vistas', S.seen);
      if (C.CUPON.activo && !S.unlocked && S.seen.length >= C.CUPON.categorias) { S.unlocked = true; sset('cupon', true); setTimeout(() => toast('🎁 ¡Desbloqueaste tu ' + C.CUPON.titulo.toLowerCase() + '! Míralo en Mi lista.', 4500), 900); }
    }
  }
  function cupBar() {
    const el = $('#pvCupon');
    if (!C.CUPON.activo) { el.classList.add('hidden'); return; }
    const n = Math.min(S.seen.length, C.CUPON.categorias);
    el.classList.remove('hidden');
    el.innerHTML = S.unlocked ? '🎁 <span><b>Cupón desbloqueado.</b> Míralo en Mi lista.</span>' : '🎁 <span>Explora <b>' + (C.CUPON.categorias - n) + ' categoría' + (C.CUPON.categorias - n === 1 ? '' : 's') + ' más</b> y desbloquea tu ' + esc(C.CUPON.titulo.toLowerCase()) + ' (' + n + ' de ' + C.CUPON.categorias + ')</span>';
  }
  const inList = (id) => S.list.find((i) => i.id === id);

  function openProduct(p, fromScan) {
    S.cur = p; S.pvFromScan = !!fromScan;
    categoriesSeen(p);
    $('#pvName').textContent = p.nombre; $('#pvBrand').textContent = p.marca + ' · ' + p.formato;
    const sm = sema(p), pr = unitTxt(p);
    const card = (k, tit, color, body, delay) => '<button class="glass acard" data-k="' + k + '" style="animation-delay:' + delay + 's"><b style="color:' + color + '">' + tit + '</b><span class="more">›</span>' + body + '</button>';
    $('#rowT').innerHTML =
      card('sirve', 'Para qué sirve', 'var(--blue)', esc(p.resumen), 0.05) +
      card('precio', 'Precio por unidad', 'var(--orange)', '<span class="big">' + esc(pr.split(' / ')[0]) + ' <small>/ ' + esc(p.cantidad.unidad) + '</small></span><br>' + clp(p.precio) + ' · ' + esc(p.formato), 0.12);
    $('#rowB').innerHTML =
      card('ingr', 'Ingredientes y semáforo', 'var(--green)', pills(sm, 3) || 'Revisa el envase', 0.19) +
      card('uso', 'Cómo usar', 'var(--coral)', esc(p.cuando) + ' ▶', 0.26);
    $$('.acard').forEach((b) => b.addEventListener('click', () => openSheet(b.dataset.k)));
    syncAdd(); cupBar();
    if (S.model) { S.model.dispose(); S.model = null; }
    $('#pv').classList.add('on');
    S.model = SL.mountProduct3D($('#stage'), p.modelo);
    if (!S.model) $('#stage').innerHTML = '<div class="fallback">' + catMeta(p).emoji + '</div>';
  }
  function closePV() {
    $('#pv').classList.remove('on'); closeSheet();
    if (S.model) { S.model.dispose(); S.model = null; }
  }
  $('#pvBack').addEventListener('click', () => {
    closePV();
    if (S.pvFromScan && stream) { lastCode = norm(S.cur && S.cur.ean); lastT = Date.now(); openScan(S.mode); } else camStop();
  });
  function syncAdd() {
    const b = $('#pvAdd'), on = !!(S.cur && inList(S.cur.id));
    b.classList.toggle('sel', on); b.textContent = on ? '✓ En mi lista' : '＋ A mi lista';
  }
  $('#pvAdd').addEventListener('click', () => {
    const p = S.cur; if (!p) return;
    const it = inList(p.id);
    if (it) S.list = S.list.filter((i) => i.id !== p.id); else S.list.push({ id: p.id, qty: 1 });
    sset('lista', S.list); syncAdd(); badge();
    if (!it) toast('Agregado a tu lista ✓', 1500);
  });
  $('#pvCompare').addEventListener('click', () => {
    const p = S.cur; if (!p) return;
    S.cmp = { a: p, b: null }; closePV(); openScan('slotB');
  });
  function badge() {
    const n = S.list.reduce((s, i) => s + i.qty, 0), b = $('#badge');
    b.textContent = n; b.classList.toggle('hidden', !n);
  }

  /* ---------- Hoja de detalle ---------- */
  function openSheet(k) {
    const p = S.cur; if (!p) return;
    let h = '<div class="grip"></div>';
    const adv = (p.advertencias || []).map((a) => '<div class="note">' + esc(a) + '</div>').join('');
    const aviso = '<p class="legal" style="margin-top:14px">' + esc(p.categoria === 'salud' ? C.TEXTO.AVISO_SALUD : C.TEXTO.AVISO) + '</p>';
    if (k === 'sirve') {
      h += '<h3>Para qué sirve</h3><p style="font-weight:600">' + esc(p.resumen) + '</p><h4>Enfoque</h4><p style="font-weight:700">' + esc(p.foco.charAt(0).toUpperCase() + p.foco.slice(1)) + '.</p>' + adv + aviso;
    } else if (k === 'ingr') {
      h += '<h3>Ingredientes y semáforo</h3><div>' + pills(sema(p, true)) + '</div><h4>Ingredientes clave</h4><ul>' + (p.ingredientes || []).map((i) => '<li>' + esc(i) + '</li>').join('') + '</ul>' +
        (S.profile.embarazo || S.profile.fragancias || S.profile.sensible ? '<p class="legal">Los avisos consideran tu perfil. Puedes cambiarlo en “Mi perfil”.</p>' : '<p class="legal">Tip: completa “Mi perfil” para ver avisos según embarazo, fragancias o piel sensible.</p>') + adv + aviso;
    } else if (k === 'precio') {
      h += '<h3>Precio por unidad</h3><p class="big">' + clp(p.precio) + ' <small>· ' + esc(p.formato) + '</small></p><p style="font-weight:800;margin-top:4px">' + esc(unitTxt(p)) + '</p>';
      const alts = (p.alternativas || []).map((id) => S.byId[id]).filter(Boolean);
      if (alts.length) {
        h += '<h4>Alternativas</h4>' + alts.map((a) => {
          let d = ''; if (a.cantidad.unidad === p.cantidad.unidad) { const pc = Math.round((unitVal(a) / unitVal(p) - 1) * 100); d = pc === 0 ? 'Mismo precio por unidad' : (pc < 0 ? Math.abs(pc) + '% más barato por unidad' : pc + '% más caro por unidad'); }
          return '<button class="alt" data-id="' + esc(a.id) + '">' + icBubble(a) + '<span><b>' + esc(a.marca) + ' ' + esc(a.nombre) + '</b><span class="s">' + esc(a.formato) + (d ? ' · ' + d : '') + '</span></span><span class="p">' + clp(a.precio) + '<br><span class="s">' + esc(unitTxt(a)) + '</span></span></button>';
        }).join('');
      } else h += '<p class="legal">No hay alternativas cargadas para este producto.</p>';
      h += '<p class="legal">El precio por unidad permite comparar formatos distintos de forma justa. Revisa el precio vigente en caja.</p>';
    } else {
      h += '<h3>Cómo usar</h3><p style="font-weight:700">' + esc(p.cuando) + '</p><ol>' + (p.pasos || []).map((s) => '<li>' + esc(s) + '</li>').join('') + '</ol>' + adv + aviso;
    }
    $('#sheet').innerHTML = h; $('#sheetBg').classList.add('on');
    $$('#sheet .alt').forEach((b) => b.addEventListener('click', () => { closeSheet(); openProduct(S.byId[b.dataset.id], S.pvFromScan); }));
  }
  function closeSheet() { $('#sheetBg').classList.remove('on'); }
  $('#sheetBg').addEventListener('click', (e) => { if (e.target.id === 'sheetBg') closeSheet(); });

  /* ---------- Comparar ---------- */
  function renderCompare() {
    const a = S.cmp.a, b = S.cmp.b, el = $('#s-compare');
    let h = '<h2 style="font-size:28px;font-weight:950;margin-bottom:12px">Comparar ⚖️</h2>';
    const col = (p, slot) => p
      ? '<div class="card cmpP"><div class="mini">' + catMeta(p).emoji + '</div><b>' + esc(p.marca) + '</b><small>' + esc(p.nombre) + '</small><button class="btn sm alt" data-slot="' + slot + '">Cambiar</button></div>'
      : '<div class="card cmpP"><div class="mini">➕</div><b>Elige un producto</b><button class="btn sm" data-slot="' + slot + '">Escanear</button><button class="btn sm ghost" data-pick="' + slot + '">Buscar por nombre</button></div>';
    h += '<div class="cmpH">' + col(a, 'a') + col(b, 'b') + '</div>';
    if (a && b) {
      const same = a.cantidad.unidad === b.cantidad.unidad;
      const ua = unitVal(a), ub = unitVal(b), best = same ? (ua < ub ? 'a' : ub < ua ? 'b' : '') : '';
      const bestPill = (s) => best === s ? ' <span class="pill g">Mejor</span>' : '';
      const fr = (p) => p.flags.fragancia === false ? '<span class="pill g">Sin fragancia</span>' : p.flags.fragancia === true ? '<span class="pill n">Con fragancia</span>' : '<span class="pill y">Revisar envase</span>';
      const al = (p) => p.flags.alcohol === false ? '<span class="pill g">Sin alcohol</span>' : p.flags.alcohol === true ? '<span class="pill n">Con alcohol</span>' : '<span class="pill y">Revisar envase</span>';
      const em = (p) => ({ ok: '<span class="pill g">Sin alerta</span>', consultar: '<span class="pill y">Consultar</span>', evitar: '<span class="pill r">Evitar</span>' }[p.flags.embarazo] || '<span class="pill y">Consultar</span>');
      const row = (t, x, y) => '<div class="cm"><small>' + t + '</small><span>' + x + '</span><span>' + y + '</span></div>';
      h += '<div class="card" style="margin-top:12px;padding:6px 14px">' +
        row('Para qué sirve', esc(a.foco), esc(b.foco)) +
        row('Precio', clp(a.precio), clp(b.precio)) +
        row('Precio por unidad', esc(unitTxt(a)) + bestPill('a'), esc(unitTxt(b)) + bestPill('b')) +
        row('Formato', esc(a.formato), esc(b.formato)) +
        row('Fragancia', fr(a), fr(b)) + row('Alcohol', al(a), al(b)) + row('Embarazo y lactancia', em(a), em(b)) +
        row('Se usa', esc(a.cuando), esc(b.cuando)) + '</div>';
      let tip = '';
      if (a.categoria === 'salud' || b.categoria === 'salud') tip = 'Los medicamentos se comparan solo en precio e información de ficha. Consulta a un químico farmacéutico para elegir.';
      else if (same && best) { const w = best === 'a' ? a : b, l = best === 'a' ? b : a, d = Math.round((1 - unitVal(w) / unitVal(l)) * 100); tip = '<b>' + esc(w.marca + ' ' + w.nombre) + '</b> sale ' + d + '% más barato por ' + esc(w.cantidad.unidad) + '.' + (a.foco !== b.foco ? ' Si buscas <b>' + esc(a.foco) + '</b>, mira ' + esc(a.marca) + '; si buscas <b>' + esc(b.foco) + '</b>, mira ' + esc(b.marca) + '.' : ''); }
      else if (a.foco !== b.foco) tip = 'Si buscas <b>' + esc(a.foco) + '</b>, mira ' + esc(a.marca) + '. Si buscas <b>' + esc(b.foco) + '</b>, mira ' + esc(b.marca) + '.';
      else tip = 'Son parecidos. Revisa el precio por unidad y los ingredientes.';
      h += '<div class="card tip"><span style="font-size:22px">🎯</span><span>' + tip + '</span></div>';
      h += '<div style="margin-top:14px;display:grid;gap:10px"><button class="btn" data-open="a">Ver ' + esc(a.marca) + '</button><button class="btn alt" data-open="b">Ver ' + esc(b.marca) + '</button></div>';
    } else h += '<p class="legal" style="margin-top:16px">Escanea dos productos (o elígelos por nombre) para verlos lado a lado, con precio por unidad e ingredientes.</p>';
    el.innerHTML = h;
    $$('#s-compare [data-slot]').forEach((b2) => b2.addEventListener('click', () => openScan(b2.dataset.slot === 'a' ? 'slotA' : 'slotB')));
    $$('#s-compare [data-pick]').forEach((b2) => b2.addEventListener('click', () => { S.pick = b2.dataset.pick; go('search'); }));
    $$('#s-compare [data-open]').forEach((b2) => b2.addEventListener('click', () => openProduct(S.cmp[b2.dataset.open], false)));
  }

  /* ---------- Mi lista ---------- */
  function renderList() {
    const el = $('#s-list'), items = S.list.map((i) => ({ p: S.byId[i.id], qty: i.qty })).filter((i) => i.p);
    let h = '<h2 style="font-size:28px;font-weight:950;margin-bottom:12px">Mi lista 🛒</h2>';
    if (!items.length) h += '<div class="card empty">Aún no has agregado productos.<br>Escanea uno y toca “A mi lista”.<div style="margin-top:14px"><button class="btn" id="lEmpty">Escanear 📷</button></div></div>';
    else {
      h += items.map((i) => '<div class="card lit">' + icBubble(i.p) + '<div><b>' + esc(i.p.marca + ' ' + i.p.nombre) + '</b><span class="s">' + esc(i.p.formato) + '</span></div><div class="p">' + clp(i.p.precio * i.qty) + '</div><button class="x" data-rm="' + esc(i.p.id) + '" aria-label="Quitar">✕</button></div>').join('');
      const total = items.reduce((s, i) => s + i.p.precio * i.qty, 0);
      h += '<div class="card" style="display:flex;justify-content:space-between;font-weight:950;font-size:17px"><span>Total referencial</span><span>' + clp(total) + '</span></div>';
      h += '<div class="card qrbox" style="margin-top:12px"><small class="k" style="font-size:12px;font-weight:900;letter-spacing:.1em;color:var(--muted)">MUESTRA ESTE QR EN CAJA</small><div class="qr" id="qrBox"></div><p class="legal" style="margin-top:8px">Los precios son referenciales: confirma el valor vigente en caja.</p></div>';
    }
    if (C.CUPON.activo) {
      const n = Math.min(S.seen.length, C.CUPON.categorias);
      h += S.unlocked
        ? '<div class="card coupon"><span style="font-size:32px">🎁</span><div><b>' + esc(C.CUPON.titulo) + ' desbloqueado</b><div style="font-weight:700;font-size:13px">' + esc(C.CUPON.detalle) + '</div><div style="font-weight:950;font-size:18px;margin-top:4px;letter-spacing:.06em">' + esc(C.CUPON.codigo) + '</div></div></div>'
        : '<div class="card coupon"><span style="font-size:32px">🎁</span><div style="flex:1"><b>' + esc(C.CUPON.titulo) + '</b><div style="font-weight:700;font-size:13px">Explora ' + C.CUPON.categorias + ' categorías distintas para desbloquearlo (' + n + ' de ' + C.CUPON.categorias + ').</div><div class="meter"><i style="width:' + (n / C.CUPON.categorias * 100) + '%"></i></div></div></div>';
    }
    if (items.length) h += '<button class="btn ghost" id="lClear" style="margin-top:8px">Vaciar lista</button>';
    el.innerHTML = h;
    if (items.length && window.qrcode) {
      try {
        const txt = 'SALCOLENTE:' + items.map((i) => i.p.ean + 'x' + i.qty).join(',') + (S.unlocked ? ';CUPON=' + C.CUPON.codigo : '');
        const q = qrcode(0, 'M'); q.addData(txt); q.make();
        $('#qrBox').innerHTML = q.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
      } catch (e) { console.warn(e); }
    }
    $$('#s-list [data-rm]').forEach((b) => b.addEventListener('click', () => { S.list = S.list.filter((i) => i.id !== b.dataset.rm); sset('lista', S.list); badge(); renderList(); }));
    const lc = $('#lClear'); if (lc) lc.addEventListener('click', () => { S.list = []; sset('lista', S.list); badge(); renderList(); });
    const le = $('#lEmpty'); if (le) le.addEventListener('click', () => openScan('view'));
  }

  /* ---------- Perfil ---------- */
  $('#openProfile').addEventListener('click', () => {
    const pr = S.profile;
    const tog = (k, t, d) => '<label class="tog"><span>' + t + '<small>' + d + '</small></span><span class="sw"><input type="checkbox" data-k="' + k + '"' + (pr[k] ? ' checked' : '') + '><i></i></span></label>';
    $('#sheet').innerHTML = '<div class="grip"></div><h3>Mi perfil</h3><p style="color:var(--muted);font-weight:600;margin-bottom:8px">Personaliza los avisos del semáforo de ingredientes. Se guarda solo en tu celular.</p>' +
      tog('embarazo', '🤰 Embarazo o lactancia', 'Muestra el aviso en cada producto') + tog('fragancias', '🌸 Evito las fragancias', 'Marca en rojo los productos con fragancia') + tog('sensible', '🌿 Piel sensible', 'Sugiere hacer una prueba en zona pequeña') +
      '<p class="legal">' + esc(C.TEXTO.AVISO) + '</p>';
    $('#sheetBg').classList.add('on');
    $$('#sheet input[data-k]').forEach((i) => i.addEventListener('change', () => { S.profile[i.dataset.k] = i.checked; sset('perfil', S.profile); if (S.cur && $('#pv').classList.contains('on')) openProduct(S.cur, S.pvFromScan); }));
  });

  /* ---------- Paralaje con el giroscopio (efecto RA) ---------- */
  let tiltOn = false;
  function onTilt(e) {
    const x = Math.max(-1, Math.min(1, (e.gamma || 0) / 25)), y = Math.max(-1, Math.min(1, ((e.beta || 0) - 50) / 30));
    const pv = $('#pv'); pv.style.setProperty('--tx', x.toFixed(3)); pv.style.setProperty('--ty', y.toFixed(3));
    if (S.model) S.model.setTilt(x, y);
  }
  async function requestTilt() {
    if (tiltOn || !window.DeviceOrientationEvent) return;
    try { if (typeof DeviceOrientationEvent.requestPermission === 'function') { const r = await DeviceOrientationEvent.requestPermission(); if (r !== 'granted') return; } } catch (e) { return; }
    tiltOn = true; window.addEventListener('deviceorientation', onTilt);
  }

  /* ---------- Inicio ---------- */
  (async function init() {
    await loadCatalog();
    badge(); renderHome();
    if (DEBUG) window.__SL = { S, openProduct, openScan, go, found, onCode };
    const e = qs.get('ean'); if (e && S.byEan[norm(e)]) openProduct(S.byEan[norm(e)], false);
  })();
})();
