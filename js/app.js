/* ============================================================
   Salco Lente: lógica de la app
   Escanear (código de barras) > vista RA del producto > comparar > lista
   Todo ocurre en el celular: no se envían imágenes ni datos.
   ============================================================ */
(function () {
  const SL = window.SL, C = SL.CONFIG; C.MI_SALCO = C.MI_SALCO || { activo: true, corto: 'No olvides usar tu código Mi Salcobrand en caja.', largo: 'Antes de pagar, indica tu código Mi Salcobrand en caja para aprovechar tus beneficios.' };
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clp = (n) => '$ ' + Math.round(n).toLocaleString('es-CL');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const qs = new URLSearchParams(location.search);
  const DEBUG = qs.has('debug');

  /* ---------- Almacenamiento local (historial, lista y categorías vistas) ---------- */
  const mem = {};
  const sget = (k, d) => { try { const v = localStorage.getItem('sl_' + k); return v ? JSON.parse(v) : d; } catch (e) { return mem[k] !== undefined ? mem[k] : d; } };
  const sset = (k, v) => { mem[k] = v; try { localStorage.setItem('sl_' + k, JSON.stringify(v)); } catch (e) {} };

  const S = {
    cat: [], byId: {}, byEan: {},
    profile: { embarazo: false, fragancias: false, sensible: false },
    hist: sget('historial', []),        // [{id, t}] más reciente primero
    list: sget('lista', []),            // [{id, qty}]
    cmp: { a: null, b: null }, mode: 'view', pick: null,
    cur: null, pvFromScan: false, screen: 'home', view: null, arMode: false
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
  /* Imagen del producto (campo "imagen" del catálogo); si falta o no carga, se usa el ícono de la categoría */
  const pimg = (p, cls) => p.imagen
    ? '<span class="ic pimg ' + (cls || '') + '"><img src="' + esc(p.imagen) + '" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentNode.classList.remove(\'pimg\');this.parentNode.style.cssText=\'--c1:' + catMeta(p).c1 + ';--c2:' + catMeta(p).c2 + '\';this.parentNode.textContent=\'' + catMeta(p).emoji + '\'"></span>'
    : '';
  const icBubble = (p, cls) => pimg(p, cls) || '<span class="ic ' + (cls || '') + '" style="--c1:' + catMeta(p).c1 + ';--c2:' + catMeta(p).c2 + '">' + catMeta(p).emoji + '</span>';

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
    if (name === 'home') renderHome(); else if (name === 'search') renderSearch(); else if (name === 'compare') renderCompare(); else if (name === 'list') renderList(); else if (name === 'history') renderHistory();
  }
  $$('.nb[data-go]').forEach((b) => b.addEventListener('click', () => { S.pick = null; go(b.dataset.go); }));

  /* ---------- Inicio ---------- */
  function renderHome() {
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
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
    } catch (e) { toast('No pudimos usar la cámara. Permite el acceso o busca el producto por nombre.', 4500); return false; }
    vid.srcObject = stream; document.body.classList.add('cam');
    try { await vid.play(); } catch (e) {}
    return true;
  }
  function camStop() {
    if (SL.AR) SL.AR.stop();
    if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
    vid.srcObject = null; document.body.classList.remove('cam');
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && stream) { const pl = vid.play(); if (pl && pl.catch) pl.catch(() => {}); } });

  /* ---------- Visión: lectura del código + anclaje (js/ar.js) ---------- */
  let lastCode = '', lastT = 0, cand = '', candN = 0;
  function visionOn() {
    if (SL.AR.running) return;
    SL.AR.start(vid, { onDetect, onTrack }, { ancho: C.SCAN.ANCHO_ANALISIS, intervalo: C.SCAN.INTERVALO_MS });
  }
  function onDetect(d) {
    const now = Date.now(), p = S.byEan[d.key];
    if (S.view === 'scan') {
      if (d.key === lastCode && now - lastT < 6000) return;
      lastCode = d.key; lastT = now;
      if (!p) { toast('Código ' + d.code + ': aún no está en el catálogo. Prueba con otro o búscalo por nombre.', 3800); return; }
      found(p);
    } else if (S.view === 'pv' && S.arMode) {
      if (p && S.cur && p.id !== S.cur.id) {          // apuntó a otro producto: cambiar la información
        if (cand === d.key) candN++; else { cand = d.key; candN = 1; }
        if (candN >= 2) { cand = ''; candN = 0; openProduct(p, true); }
      } else { cand = ''; candN = 0; }
    }
  }
  function found(p) {
    addHist(p);
    if (navigator.vibrate) try { navigator.vibrate(30); } catch (e) {}
    $('#reticle').classList.add('ok');
    const fl = document.createElement('div'); fl.className = 'flash'; $('#scan').appendChild(fl); setTimeout(() => fl.remove(), 600);
    if (S.mode === 'slotA' || S.mode === 'slotB') { S.cmp[S.mode === 'slotA' ? 'a' : 'b'] = p; setTimeout(() => { $('#reticle').classList.remove('ok'); closeScan(true); go('compare'); }, 300); return; }
    S.view = 'wait';
    setTimeout(() => { $('#reticle').classList.remove('ok'); $('#scan').classList.remove('on'); openProduct(p, !!stream && SL.AR.hasLock()); }, 300);
  }

  /* ---------- Overlay de escaneo ---------- */
  let scanTok = 0;
  async function openScan(mode) {
    S.mode = mode; const tok = ++scanTok;
    const titles = { view: 'Escanear producto', slotA: 'Escanea el primer producto', slotB: 'Escanea el segundo producto' };
    $('#scTitle').textContent = titles[mode] || titles.view;
    const ok = await camStart();
    if (tok !== scanTok) return; // se cerró mientras se activaba la cámara
    if (!ok) { S.pick = mode === 'slotA' ? 'a' : mode === 'slotB' ? 'b' : null; go('search'); return; }
    $('#pv').classList.remove('on', 'ar');
    $('#scan').classList.add('on'); S.view = 'scan';
    SL.AR.lock(null); visionOn();
  }
  function closeScan(stopCam) {
    scanTok++; S.view = null; $('#scan').classList.remove('on');
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
  function cupBar() {
    const el = $('#pvCupon');
    if (!C.MI_SALCO.activo) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    el.innerHTML = '<img src="img/mi-salcobrand.png" alt="Mi Salcobrand"><span>' + esc(C.MI_SALCO.corto) + '</span>';
  }
  const inList = (id) => S.list.find((i) => i.id === id);

  let model3 = null;
  function openProduct(p, fromScan) {
    if (model3) { model3.destroy(); model3 = null; }
    const ar = !!fromScan && !!stream;
    S.cur = p; S.pvFromScan = !!fromScan; S.arMode = ar; S.view = 'pv';
    $('#pvName').textContent = p.nombre; $('#pvBrand').textContent = p.marca + ' · ' + p.formato;
    const sm = sema(p), pr = unitTxt(p);
    const card = (k, tit, color, body, delay) => '<button class="glass acard' + (ar ? ' ar' : '') + '" data-k="' + k + '" style="--ac:' + color + ';animation-delay:' + delay + 's"><b>' + tit + '</b><span class="more" aria-hidden="true"></span>' + body + '</button>';
    const c1 = card('sirve', 'Para qué sirve', 'var(--blue)', esc(p.resumen), 0.35);
    const c2 = card('precio', 'Precio por unidad', 'var(--orange)', '<span class="big">' + esc(pr.split(' / ')[0]) + ' <small>/ ' + esc(p.cantidad.unidad) + '</small></span><br>' + clp(p.precio) + ' · ' + esc(p.formato), 0.5);
    const c3 = card('ingr', 'Ingredientes y semáforo', 'var(--green)', pills(sm, 3) || 'Revisa el envase', 0.65);
    const c4 = card('uso', 'Cómo usar', 'var(--coral)', esc(p.cuando), 0.8);
    if (ar) {
      $('#arCards').innerHTML = c1 + c2 + c3 + c4; $('#rowT').innerHTML = ''; $('#rowB').innerHTML = ''; $('#stage').innerHTML = '';
      AP.has = false; $('#arLayer').classList.add('wait'); $('#arLayer').classList.remove('lost', 'gone');
      SL.AR.lock(norm(p.ean));
    } else {
      $('#arCards').innerHTML = ''; $('#rowT').innerHTML = c1 + c2; $('#rowB').innerHTML = c3 + c4;
      if (!(SL.Model3D && (model3 = SL.Model3D.mount($('#stage'), p)))) $('#stage').innerHTML = '<div class="hero2">' + icBubble(p, 'xl') + '<b>' + esc(p.marca) + '</b><span>' + esc(p.nombre) + '</span></div>';
    }
    $$('.acard').forEach((b) => b.addEventListener('click', () => openSheet(b.dataset.k)));
    syncAdd(); cupBar();
    $('#pv').classList.add('on'); $('#pv').classList.toggle('ar', ar);
  }
  function closePV() {
    if (model3) { model3.destroy(); model3 = null; }
    $('#pv').classList.remove('on', 'ar'); closeSheet(); S.view = null; S.arMode = false; $('#arCards').innerHTML = '';
    if (S.screen === 'history') renderHistory(); else if (S.screen === 'list') renderList();
  }
  $('#pvBack').addEventListener('click', () => {
    closePV();
    if (S.pvFromScan && stream) { lastCode = norm(S.cur && S.cur.ean); lastT = Date.now(); openScan(S.mode); } else camStop();
  });

  /* ---------- Anclaje: la información sigue al producto ---------- */
  const AP = { x: 0, y: 0, has: false };
  function toScreen(x, y) {
    const W = innerWidth, H = innerHeight, vw = vid.videoWidth, vh = vid.videoHeight, sc = Math.max(W / vw, H / vh);
    return { x: x * sc + (W - vw * sc) / 2, y: y * sc + (H - vh * sc) / 2, sc };
  }
  function onTrack(t) {
    if (S.view !== 'pv' || !S.arMode || !vid.videoWidth) return;
    const s = toScreen(t.x, t.y);
    if (!AP.has) { AP.x = s.x; AP.y = s.y; AP.has = true; $('#arLayer').classList.remove('wait'); }
    else { AP.x += (s.x - AP.x) * 0.6; AP.y += (s.y - AP.y) * 0.6; }
    layoutAR(AP.x, AP.y, Math.max(36, Math.min(380, (t.w || 200) * s.sc)), t);
  }
  function layoutAR(ax, ay, wS, t) {
    const W = innerWidth, H = innerHeight, cw = Math.min(158, Math.floor((W - 24) / 2)), gap = 8, topMin = 76, botMax = H - 172;
    const cards = $$('#arCards .acard'), ln = $('#arSvg line'), dot = $('#arSvg circle');
    if (cards.length < 4) return;
    cards.forEach((c) => { c.style.width = cw + 'px'; });
    const hs = cards.map((c) => c.offsetHeight || 96);
    const r1 = Math.max(hs[0], hs[1]), r2 = Math.max(hs[2], hs[3]), bh = r1 + r2 + gap, bw = cw * 2 + gap;
    const boxW = Math.min(W - 16, wS * 1.7), boxH = Math.max(40, Math.min(260, wS * 1.05)), g = 14;
    const roomA = ay - boxH / 2 - g - topMin, roomB = botMax - (ay + boxH / 2 + g);
    const above = roomA >= bh || (roomB < bh && roomA >= roomB);
    const bx = Math.max(8, Math.min(W - bw - 8, ax - bw / 2));
    let by = above ? ay - boxH / 2 - g - bh : ay + boxH / 2 + g;
    by = Math.max(topMin, Math.min(botMax - bh, by));
    const pos = [[bx, by], [bx + cw + gap, by], [bx, by + r1 + gap], [bx + cw + gap, by + r1 + gap]];
    cards.forEach((c, i) => { c.style.transform = 'translate3d(' + pos[i][0].toFixed(1) + 'px,' + pos[i][1].toFixed(1) + 'px,0)'; });
    // línea guía desde el producto hasta el bloque de información
    const ex = Math.max(bx + 24, Math.min(bx + bw - 24, ax)), ey = above ? by + bh : by;
    const sy = above ? ay - boxH / 2 : ay + boxH / 2;
    ln.setAttribute('x1', ax.toFixed(1)); ln.setAttribute('y1', sy.toFixed(1)); ln.setAttribute('x2', ex.toFixed(1)); ln.setAttribute('y2', ey.toFixed(1));
    dot.setAttribute('cx', ex.toFixed(1)); dot.setAttribute('cy', ey.toFixed(1));
    const box = $('#arBox');
    box.style.width = boxW + 'px'; box.style.height = boxH + 'px';
    box.style.transform = 'translate3d(' + (ax - boxW / 2).toFixed(1) + 'px,' + (ay - boxH / 2).toFixed(1) + 'px,0)';
    const L = $('#arLayer'); L.classList.toggle('lost', !t.ok); L.classList.toggle('gone', !!t.lost);
    if (DEBUG) $('#arDbg').textContent = 'ok:' + t.ok + ' sad:' + t.score.toFixed(1) + ' x:' + ax.toFixed(0) + ' y:' + ay.toFixed(0);
  }

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
        adv + aviso;
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
      ? '<div class="card cmpP"><div class="mini">' + (p.imagen ? '<img src="' + esc(p.imagen) + '" alt="" referrerpolicy="no-referrer">' : catMeta(p).emoji) + '</div><b>' + esc(p.marca) + '</b><small>' + esc(p.nombre) + '</small><button class="btn sm alt" data-slot="' + slot + '">Cambiar</button></div>'
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
    if (C.MI_SALCO.activo) h += '<div class="card misalco"><img src="img/mi-salcobrand.png" alt="Mi Salcobrand"><p>' + esc(C.MI_SALCO.largo) + '</p></div>';
    if (items.length) h += '<button class="btn ghost" id="lClear" style="margin-top:8px">Vaciar lista</button>';
    el.innerHTML = h;
    if (items.length && window.qrcode) {
      try {
        const txt = 'SALCOLENTE:' + items.map((i) => i.p.ean + 'x' + i.qty).join(',');
        const q = qrcode(0, 'M'); q.addData(txt); q.make();
        $('#qrBox').innerHTML = q.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
      } catch (e) { console.warn(e); }
    }
    $$('#s-list [data-rm]').forEach((b) => b.addEventListener('click', () => { S.list = S.list.filter((i) => i.id !== b.dataset.rm); sset('lista', S.list); badge(); renderList(); }));
    const lc = $('#lClear'); if (lc) lc.addEventListener('click', () => { S.list = []; sset('lista', S.list); badge(); renderList(); });
    const le = $('#lEmpty'); if (le) le.addEventListener('click', () => openScan('view'));
  }

  /* ---------- Historial de escaneos ---------- */
  function addHist(p) {
    S.hist = S.hist.filter((h) => h.id !== p.id);
    S.hist.unshift({ id: p.id, t: Date.now() });
    S.hist = S.hist.slice(0, 50); sset('historial', S.hist);
  }
  function ago(t) {
    const m = Math.round((Date.now() - t) / 60000);
    if (m < 1) return 'Recién escaneado';
    if (m < 60) return 'Hace ' + m + ' min';
    const h = Math.round(m / 60);
    if (h < 24) return 'Hace ' + h + ' h';
    const d = Math.round(h / 24);
    return d === 1 ? 'Ayer' : 'Hace ' + d + ' días';
  }
  function renderHistory() {
    const el = $('#s-history'), items = S.hist.map((h) => ({ p: S.byId[h.id], t: h.t })).filter((i) => i.p);
    let h = '<h2 style="font-size:28px;margin-bottom:4px">Historial</h2><p style="color:var(--muted);font-weight:700;margin-bottom:14px">Los productos que escaneaste, del más reciente al más antiguo. Tócalos para ver su información de nuevo.</p>';
    if (!items.length) {
      h += '<div class="empty">Aún no has escaneado productos.<br><button class="btn" id="hEmpty" style="margin-top:14px">Escanear un producto 📷</button></div>';
    } else {
      h += items.map((i) => {
        const on = !!inList(i.p.id);
        return '<div class="hrow"><button class="pit" data-id="' + esc(i.p.id) + '">' + icBubble(i.p) + '<span><b>' + esc(i.p.marca) + ' ' + esc(i.p.nombre) + '</b><span class="s">' + esc(i.p.formato) + ' · ' + esc(catMeta(i.p).nombre) + '</span><span class="htime">' + ago(i.t) + '</span></span><span class="p">' + clp(i.p.precio) + '<small>' + unitTxt(i.p) + '</small></span></button>' +
          '<button class="hadd' + (on ? ' sel' : '') + '" data-add="' + esc(i.p.id) + '" aria-label="' + (on ? 'Quitar de mi lista' : 'Agregar a mi lista') + '"><span>' + (on ? '✓' : '＋') + '</span>' + (on ? 'En lista' : 'Lista') + '</button></div>';
      }).join('') + '<button class="btn ghost" id="hClear" style="margin-top:6px">Borrar historial</button>';
    }
    el.innerHTML = h;
    $$('#s-history .pit').forEach((b) => b.addEventListener('click', () => openProduct(S.byId[b.dataset.id], false)));
    $$('#s-history [data-add]').forEach((b) => b.addEventListener('click', () => {
      const id = b.dataset.add;
      if (inList(id)) S.list = S.list.filter((i) => i.id !== id); else { S.list.push({ id, qty: 1 }); toast('Agregado a tu lista ✓', 1500); }
      sset('lista', S.list); badge(); renderHistory();
    }));
    const hc = $('#hClear'); if (hc) hc.addEventListener('click', () => { S.hist = []; sset('historial', S.hist); renderHistory(); });
    const he = $('#hEmpty'); if (he) he.addEventListener('click', () => openScan('view'));
  }
  $('#openHist').addEventListener('click', () => { S.pick = null; go('history'); });

  /* ---------- Inicio ---------- */
  (async function init() {
    await loadCatalog();
    badge(); renderHome();
    if (DEBUG) window.__SL = { S, openProduct, openScan, go, found, AR: SL.AR, AP };
    const e = qs.get('ean'); if (e && S.byEan[norm(e)]) openProduct(S.byEan[norm(e)], false);
  })();
})();
