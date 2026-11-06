/* ============================================================
   Salco Lente: encuesta de satisfacción anónima
   - Cuenta el tiempo de uso (solo con la página visible).
   - La burbuja está SIEMPRE visible en la esquina inferior derecha del INICIO.
     Durante los primeros 2 minutos de uso muestra solo el icono; al cumplirlos se despliega el texto "¿Qué te pareció?".
   - Al tocarla abre la pantalla de la encuesta (nota de 1 a 5 + comentario opcional).
   - Se envía a una hoja de Google Sheets mediante un Apps Script (tools/google-sheets-encuesta.gs).
   - Anónima: solo se envían la nota, el comentario, los segundos de uso, la versión de la app
     y los nombres de las funciones usadas (escáner, comparación, búsqueda...).
     No se envía ni se guarda ningún identificador, correo, IP ni dato del dispositivo.
   Para probar sin esperar: abrir la página con ?encuesta=ahora (el texto aparece a los 5 s).
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
    if (test) { cfg.PRIMERA_S = 5; }
    const st = { respondida: false, funciones: [], uso: 0, next: cfg.PRIMERA_S, shown: 0, left: 0, bubble: null, rating: 0, inSurvey: false, sent: false };
    
    // funciones de la herramienta que la persona usó (solo nombres, en orden de primer uso)
    document.addEventListener('sl:uso', (e) => { if (e.detail && st.funciones.indexOf(e.detail) < 0) st.funciones.push(e.detail); });

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

    /* ---------- Burbuja (siempre visible en el inicio) ---------- */
    // Primeros PRIMERA_S segundos: solo el icono. Después se despliega el texto "¿Qué te pareció?".
    function makeBubble() {
      const b = document.createElement('div'); b.className = 'svBubble'; b.hidden = true; b.setAttribute('role', 'button'); b.tabIndex = 0;
      b.setAttribute('aria-label', 'Responder encuesta de satisfacción');
      b.innerHTML = '<span class="ic"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-6.5L8 20.5V17H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"/><path d="M8.5 10.2h7M8.5 13h4.2"/></svg></span>' +
        '<span class="tx"><b>¿Qué te pareció?</b></span>';
      b.addEventListener('click', abrir);
      b.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir(); } });
      document.body.appendChild(b); return b;
    }
    function sync() {
      const b = st.bubble || (st.bubble = makeBubble());
      const on = SL.app.onHome() && !st.inSurvey && !st.respondida;   // respondida: no vuelve a aparecer mientras la página siga abierta (al reabrirla con el QR, vuelve)
      if (on && b.hidden) { b.classList.remove('out'); b.hidden = false; }
      else if (!on && !b.hidden) { b.hidden = true; }
      b.classList.toggle('open', st.uso >= cfg.PRIMERA_S);
    }

    /* ---------- Pantalla de la encuesta ---------- */
    function abrir() { st.opened = true; SL.app.go('survey'); }
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
      st.sent = true; st.respondida = true; sync(); $('#svSend').disabled = true; $('#svSend').textContent = 'Enviando…';
      // solo datos de la respuesta: sin identificadores ni datos del dispositivo
      await enviar({ r: st.rating, c: $('#svTxt').value.trim().slice(0, 500), u: st.uso, v: VER, f: st.funciones.join(', ') });
      $('#svForm').hidden = true; $('#svDone').hidden = false;
    });

    document.addEventListener('sl:screen', (e) => {
      if (e.detail === 'survey') { st.inSurvey = true; reset(); }
      else st.inSurvey = false;
      sync();
    });

    /* ---------- Reloj de uso (solo con la página visible) ---------- */
    setInterval(() => { if (!document.hidden) { st.uso++; } sync(); }, 1000);
    sync();

    if (test) window.__enc = { st, cfg, sync };
  }
  if (SL.app) boot(); else document.addEventListener('sl:ready', boot, { once: true });
})();
