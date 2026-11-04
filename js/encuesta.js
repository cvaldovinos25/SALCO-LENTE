/* ============================================================
   Salco Lente: encuesta de satisfacción anónima
   - Cuenta el tiempo de uso (solo con la página visible).
   - A los 2 minutos muestra una burbuja en la esquina inferior derecha del INICIO.
   - Si no la usan, se oculta sola a los 20 segundos. Si siguen usando la herramienta,
     vuelve 5 minutos después (hasta MAX_APARICIONES veces por visita).
   - Al tocarla abre la pantalla de la encuesta (nota de 1 a 5 + comentario opcional).
   - Se envía a una hoja de Google Sheets mediante un Apps Script (tools/google-sheets-encuesta.gs).
   - Anónima: solo se envían la nota, el comentario, los segundos de uso y la versión de la app.
     No se envía ni se guarda ningún identificador, correo, IP ni dato del dispositivo.
   Para probar sin esperar: abrir la página con ?encuesta=ahora (aparece a los 3 s y repite cada 10 s).
   ============================================================ */
(function () {
  const SL = (window.SL = window.SL || {});
  const VER = ((document.currentScript && document.currentScript.src.match(/v=(\d+)/)) || [])[1] || '';
  const $ = (s) => document.querySelector(s);
  const test = new URLSearchParams(location.search).get('encuesta') === 'ahora';
  const lget = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lset = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* sin almacenamiento: sigue funcionando en memoria */ } };

  function boot() {
    const cfg = Object.assign({ URL: '', PRIMERA_S: 120, VISIBLE_S: 20, REPETIR_S: 300, MAX_APARICIONES: 3, SILENCIO_DIAS: 30 }, (SL.CONFIG && SL.CONFIG.ENCUESTA) || {});
    if (test) { cfg.PRIMERA_S = 3; cfg.REPETIR_S = 10; cfg.MAX_APARICIONES = 99; }
    const st = { uso: 0, next: cfg.PRIMERA_S, shown: 0, left: 0, bubble: null, rating: 0, inSurvey: false, sent: false };
    const answered = () => { const t = +lget('sl_enc_ok'); return !test && t && Date.now() - t < cfg.SILENCIO_DIAS * 864e5; };

    /* ---------- Envío a Google Sheets (con cola si no hay conexión) ---------- */
    async function post(p) {
      if (!cfg.URL) throw new Error('sin-url');
      // text/plain evita la comprobación previa de CORS; Apps Script igual lee el JSON del cuerpo
      await fetch(cfg.URL, { method: 'POST', mode: 'no-cors', credentials: 'omit', referrerPolicy: 'no-referrer', keepalive: true, headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(p) });
    }
    const cola = () => { try { return JSON.parse(lget('sl_enc_cola') || '[]'); } catch (e) { return []; } };
    async function flush() {
      if (!cfg.URL) return;
      let q = cola(); if (!q.length) return;
      const rest = [];
      for (const p of q) { try { await post(p); } catch (e) { rest.push(p); } }
      lset('sl_enc_cola', JSON.stringify(rest));
    }
    async function enviar(p) {
      try { await post(p); }
      catch (e) { const q = cola(); q.push(p); lset('sl_enc_cola', JSON.stringify(q.slice(-20))); if (cfg.URL === '' && window.console) console.info('Salco Lente: encuesta guardada en el celular; falta configurar ENCUESTA.URL en js/config.js'); }
    }
    window.addEventListener('online', flush); flush();

    /* ---------- Burbuja ---------- */
    function makeBubble() {
      const b = document.createElement('div'); b.className = 'svBubble'; b.hidden = true; b.setAttribute('role', 'button'); b.tabIndex = 0;
      b.setAttribute('aria-label', 'Responder encuesta de satisfacción');
      b.innerHTML = '<span class="ic"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-6.5L8 20.5V17H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"/><path d="M8.5 10.2h7M8.5 13h4.2"/></svg></span>' +
        '<span><b>¿Qué tal te pareció?</b><small>Cuéntanos en menos de 1 min</small></span><i class="x" role="button" aria-label="Cerrar">✕</i><u class="bar"></u>';
      b.addEventListener('click', (e) => { if (e.target.closest('.x')) { e.stopPropagation(); hide(true); } else abrir(); });
      b.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir(); } });
      document.body.appendChild(b); return b;
    }
    function show() {
      const b = st.bubble || (st.bubble = makeBubble());
      st.left = cfg.VISIBLE_S; b.style.setProperty('--left', 1); b.classList.remove('out'); b.hidden = false;
      void b.offsetWidth;
    }
    function hide(contar) {
      const b = st.bubble; if (!b || b.hidden) return;
      b.classList.add('out'); setTimeout(() => { if (b.classList.contains('out')) b.hidden = true; }, 360);
      if (contar) { st.shown++; st.next = st.uso + cfg.REPETIR_S; }
    }
    const visible = () => st.bubble && !st.bubble.hidden && !st.bubble.classList.contains('out');

    /* ---------- Pantalla de la encuesta ---------- */
    function abrir() { hide(false); st.opened = true; SL.app.go('survey'); }
    function reset() {
      st.rating = 0; st.sent = false;
      document.querySelectorAll('#svScale button').forEach((x) => x.setAttribute('aria-checked', 'false'));
      $('#svTxt').value = ''; $('#svN').textContent = '0';
      $('#svSend').disabled = true; $('#svSend').textContent = 'Enviar mi opinión';
      $('#svForm').hidden = false; $('#svDone').hidden = true;
    }
    function elegir(n) {
      st.rating = n;
      document.querySelectorAll('#svScale button').forEach((x) => x.setAttribute('aria-checked', String(+x.dataset.n === n)));
      $('#svSend').disabled = false;
      if (navigator.vibrate) try { navigator.vibrate(10); } catch (e) {}
    }
    document.querySelectorAll('#svScale button').forEach((b) => {
      b.addEventListener('click', () => elegir(+b.dataset.n));
      b.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
          e.preventDefault(); const n = Math.min(5, Math.max(1, (st.rating || +b.dataset.n) + (e.key === 'ArrowRight' ? 1 : -1)));
          elegir(n); document.querySelector('#svScale [data-n="' + n + '"]').focus();
        }
      });
    });
    $('#svTxt').addEventListener('input', () => { $('#svN').textContent = String($('#svTxt').value.length); });
    $('#svBack').addEventListener('click', () => SL.app.go('home'));
    $('#svHome').addEventListener('click', () => SL.app.go('home'));
    $('#svSend').addEventListener('click', async () => {
      if (!st.rating || st.sent) return;
      st.sent = true; $('#svSend').disabled = true; $('#svSend').textContent = 'Enviando…';
      // solo datos de la respuesta: sin identificadores ni datos del dispositivo
      await enviar({ r: st.rating, c: $('#svTxt').value.trim().slice(0, 500), u: st.uso, v: VER });
      lset('sl_enc_ok', String(Date.now()));
      $('#svForm').hidden = true; $('#svDone').hidden = false;
    });

    // al salir de la encuesta sin enviar cuenta como "cerrada": vuelve a ofrecerse 5 min después
    document.addEventListener('sl:screen', (e) => {
      if (e.detail === 'survey') { st.inSurvey = true; reset(); return; }
      if (st.inSurvey) { st.inSurvey = false; if (!st.sent) { st.shown++; st.next = st.uso + cfg.REPETIR_S; } }
      if (e.detail !== 'home' && visible()) hide(false);       // fuera del inicio no se muestra la burbuja
    });

    /* ---------- Reloj de uso (solo con la página visible) ---------- */
    setInterval(() => {
      if (document.hidden) return;
      st.uso++;
      if (answered()) { if (visible()) hide(false); return; }
      if (visible()) {
        if (!SL.app.onHome()) { hide(false); return; }
        st.left--; st.bubble.style.setProperty('--left', Math.max(0, st.left - 1) / cfg.VISIBLE_S);
        if (st.left <= 0) hide(true);
      } else if (st.uso >= st.next && st.shown < cfg.MAX_APARICIONES && SL.app.onHome()) show();
    }, 1000);

    if (test) window.__enc = { st, cfg, show, hide };
  }
  if (SL.app) boot(); else document.addEventListener('sl:ready', boot, { once: true });
})();
