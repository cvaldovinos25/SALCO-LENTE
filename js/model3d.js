/* ============================================================
   Salco Lente: modelo 3D del producto (vista sin cámara)
   Formas genéricas generadas por código con three.js según
   p.modelo.tipo: ampolla | frasco | bomba | pote | tubo | caja.
   Son representaciones estilizadas, no el envase exacto. La
   etiqueta usa la foto del producto si el servidor permite
   cargarla en 3D; si no, muestra marca y nombre.
   Se gira con el dedo (o el mouse) y gira sola mientras no se toca.
   ============================================================ */
(function () {
  const SL = (window.SL = window.SL || {});
  const M3 = (SL.Model3D = {});

  M3.supported = function () {
    if (!window.THREE) return false;
    try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; }
  };

  function wrap(ctx, text, x, y, maxW, lh, maxLines) {
    const words = String(text).split(/\s+/); let line = '', n = 0;
    for (const w of words) {
      const t = line ? line + ' ' + w : w;
      if (ctx.measureText(t).width > maxW && line) { ctx.fillText(line, x, y); y += lh; line = w; if (++n >= maxLines - 1) { break; } } else line = t;
    }
    ctx.fillText(line, x, y); return y + lh;
  }

  function labelTexture(THREE, p, m, aspect) {
    aspect = aspect || 1;
    const W = aspect >= 1 ? 1024 : Math.round(1024 * aspect * 1.0), H = Math.round(W / aspect);
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d'), tex = new THREE.CanvasTexture(cv);
    tex.anisotropy = 8; tex.encoding = THREE.sRGBEncoding;
    const u = H / 512, mw = Math.min(W * 0.84, H * 1.45), cx = W / 2, F = '"Avenir Next",Avenir,Nunito,Arial,sans-serif';
    const draw = (img) => {
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = m.acento; ctx.fillRect(0, 0, W, 30 * u); ctx.fillRect(0, H - 30 * u, W, 30 * u);
      ctx.textAlign = 'center'; ctx.fillStyle = '#0b2540';
      if (img) {
        const s = Math.min(mw / img.width, (H - 120 * u) / img.height);
        ctx.drawImage(img, cx - img.width * s / 2, H / 2 - img.height * s / 2, img.width * s, img.height * s);
      } else {
        ctx.font = '700 ' + 84 * u + 'px ' + F;
        let y = wrap(ctx, p.marca, cx, 150 * u, mw, 90 * u, 2);
        ctx.font = '600 ' + 52 * u + 'px ' + F; ctx.fillStyle = '#35506b';
        y = wrap(ctx, p.nombre, cx, y + 10 * u, mw, 62 * u, 3);
        ctx.font = '700 ' + 44 * u + 'px ' + F; ctx.fillStyle = m.acento;
        ctx.fillText(p.formato || '', cx, Math.min(y + 24 * u, H - 60 * u));
      }
      tex.needsUpdate = true;
    };
    draw(null);
    if (p.imagen) {
      const im = new Image(); im.crossOrigin = 'anonymous'; im.referrerPolicy = 'no-referrer';
      im.onload = () => { try { draw(im); } catch (e) { draw(null); } };
      im.src = p.imagen;
    }
    return tex;
  }


  /* ---------- Modelo 3D a partir de la foto del producto ----------
     1) Se separa el producto del fondo (color de los bordes o transparencia).
     2) Con su silueta se arma un sólido de revolución (frascos, tubos, ampollas)
        o una caja (envases rectangulares), a la altura y ancho de la foto.
     3) La foto se proyecta sobre el frente; la parte de atrás lleva el color medio.
     Requiere que el servidor de la imagen permita leerla (CORS) o que esté en el mismo sitio. */
  function fromImage(THREE, im, m) {
    const IW = im.naturalWidth || im.width, IH = im.naturalHeight || im.height, rc = m.recorte || [0, 0, 1, 1];
    const sx = rc[0] * IW, sy = rc[1] * IH, sw = (rc[2] - rc[0]) * IW, sh = (rc[3] - rc[1]) * IH;
    const MAXS = 520, k = Math.min(1, MAXS / Math.max(sw, sh));
    const cw = Math.max(8, Math.round(sw * k)), ch = Math.max(8, Math.round(sh * k));
    const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(im, sx, sy, sw, sh, 0, 0, cw, ch);
    let d; try { d = ctx.getImageData(0, 0, cw, ch).data; } catch (e) { return null; }   // imagen "contaminada" (sin CORS)
    // fondo = degradado entre el borde izquierdo y derecho de cada fila (soporta fondos con degradé)
    const px = (x, y) => { const i = (y * cw + x) * 4; return [d[i], d[i + 1], d[i + 2], d[i + 3]]; };
    const avg3 = (x, y0, dx) => { let r = 0, g = 0, b = 0, n = 0; for (let q = -2; q <= 2; q++) { const yy = Math.max(0, Math.min(ch - 1, y0 + q)); for (let t = 0; t < 3; t++) { const c = px(Math.max(0, Math.min(cw - 1, x + dx * t)), yy); if (c[3] > 40) { r += c[0]; g += c[1]; b += c[2]; n++; } } } return n ? [r / n, g / n, b / n] : [255, 255, 255]; };
    const bgL = [], bgR = []; for (let y = 0; y < ch; y++) { bgL.push(avg3(0, y, 1)); bgR.push(avg3(cw - 1, y, -1)); }
    const TH = 40;
    const isFg = (x, y) => {
      const i = (y * cw + x) * 4; if (d[i + 3] < 40) return false;
      const t = x / (cw - 1), l = bgL[y], r = bgR[y];
      const e = Math.abs(d[i] - (l[0] + (r[0] - l[0]) * t)) + Math.abs(d[i + 1] - (l[1] + (r[1] - l[1]) * t)) + Math.abs(d[i + 2] - (l[2] + (r[2] - l[2]) * t));
      return e > TH;
    };
    const xl = new Int16Array(ch).fill(-1), xr = new Int16Array(ch).fill(-1); let top = -1, bot = -1, area = 0, L = cw, R = 0, sr = 0, sg = 0, sb = 0, sn = 0;
    for (let y = 0; y < ch; y++) {
      let a = -1, b = -1, run = 0;
      for (let x = 0; x < cw; x++) { if (isFg(x, y)) { run++; if (a < 0) a = x; b = x; area++; const i = (y * cw + x) * 4; sr += d[i]; sg += d[i + 1]; sb += d[i + 2]; sn++; } }
      if (run >= 3) { xl[y] = a; xr[y] = b; if (top < 0) top = y; bot = y; if (a < L) L = a; if (b > R) R = b; }
    }
    if (top < 0 || bot - top < 12 || area < cw * ch * 0.05) return null;
    const Hp = bot - top + 1, Wp = R - L + 1, asp = Wp / Hp;
    if (asp > 1.8 || asp < 0.12) return null;
    const avg = new THREE.Color(sr / sn / 255, sg / sn / 255, sb / sn / 255).lerp(new THREE.Color(1, 1, 1), 0.15);
    const tex = new THREE.CanvasTexture(cv); tex.encoding = THREE.sRGBEncoding; tex.anisotropy = 8;
    const H = 2.6, sc = H / Hp, tipo = m.tipo;
    const g = new THREE.Group();
    if (tipo === 'caja') {
      const w = Wp * sc, dep = Math.max(0.3, Math.min(0.7, w * 0.4));
      const box = new THREE.Mesh(new THREE.BoxGeometry(w, H, dep), new THREE.MeshStandardMaterial({ color: avg, roughness: .55 }));
      const t2 = tex.clone(); t2.needsUpdate = true; t2.repeat.set(Wp / cw, Hp / ch); t2.offset.set(L / cw, 1 - (top + Hp) / ch);
      const face = new THREE.Mesh(new THREE.PlaneGeometry(w, H), new THREE.MeshStandardMaterial({ map: t2, roughness: .5 }));
      face.position.z = dep / 2 + 0.003; g.add(box, face);
      return g;
    }
    // sólido de revolución a partir del ancho de la silueta fila a fila
    const cxs = []; for (let y = top; y <= bot; y++) if (xl[y] >= 0) cxs.push((xl[y] + xr[y]) / 2); cxs.sort((a, b) => a - b);
    const cx0 = cxs[cxs.length >> 1], N = 120, rad = new Float32Array(N);
    // radio por fila (menos 1,5 px para no mostrar el halo del fondo); las filas sin borde claro se interpolan
    const rr = new Float32Array(ch).fill(-1);
    for (let y = top; y <= bot; y++) if (xl[y] >= 0) rr[y] = Math.max(Math.abs(cx0 - xl[y]), Math.abs(xr[y] - cx0) , 1) - 1.5;
    let last = top; for (let y = top; y <= bot; y++) { if (rr[y] >= 0) { if (y - last > 1 && rr[last] >= 0) for (let q = last + 1; q < y; q++) rr[q] = rr[last] + (rr[y] - rr[last]) * (q - last) / (y - last); last = y; } }
    for (let i = 0; i < N; i++) {
      const y0 = Math.round(top + (Hp - 1) * i / (N - 1)); let r = 0, c = 0;
      for (let dy = -1; dy <= 1; dy++) { const yy = Math.max(top, Math.min(bot, y0 + dy)); if (rr[yy] >= 0) { r += rr[yy]; c++; } }
      rad[i] = c ? Math.max(1, r / c) * sc : 0.02;
    }
    // suavizado gaussiano (2 pasadas) para quitar los dientes de la silueta, respetando los bordes marcados
    let sm = rad;
    for (let pass = 0; pass < 2; pass++) {
      const t = new Float32Array(N);
      for (let i = 0; i < N; i++) { let a = 0, w = 0; for (let j = -3; j <= 3; j++) { const q = i + j; if (q < 0 || q >= N) continue; const wt = Math.exp(-(j * j) / 4.5) * (Math.abs(sm[q] - sm[i]) > 0.22 ? 0.25 : 1); a += sm[q] * wt; w += wt; } t[i] = a / w; }
      sm = t;
    }
    sm = Float32Array.from(sm, (v) => Math.min(1.5, Math.max(0.03, v)));
    // extremos redondeados (base y tapa con bisel)
    const pts = [new THREE.Vector2(0.0001, -H / 2)], yb = (i) => H / 2 - (Hp - 1) * (i / (N - 1)) * sc;
    const rB = sm[N - 1], rT = sm[0], bv = (r) => Math.min(0.09, r * 0.35);
    for (let k2 = 1; k2 <= 5; k2++) { const a = (k2 / 5) * Math.PI / 2, b2 = bv(rB); pts.push(new THREE.Vector2(Math.max(0.0001, rB - b2 + b2 * Math.sin(a)), -H / 2 + b2 - b2 * Math.cos(a))); }
    for (let i = N - 1; i >= 0; i--) pts.push(new THREE.Vector2(sm[i], yb(i)));
    for (let k2 = 1; k2 <= 5; k2++) { const a = (k2 / 5) * Math.PI / 2, b2 = bv(rT); pts.push(new THREE.Vector2(Math.max(0.0001, rT - b2 + b2 * Math.cos(a)), H / 2 - b2 + b2 * Math.sin(a))); }
    pts.push(new THREE.Vector2(0.0001, H / 2));
    const geo = new THREE.LatheGeometry(pts, 96), pos = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      const px = cx0 + pos.getX(i) / sc, py = top + (H / 2 - pos.getY(i)) / sc;
      uv.setXY(i, Math.max(0.001, Math.min(0.999, px / cw)), 1 - Math.max(0, Math.min(ch - 1, py)) / ch);
    }
    uv.needsUpdate = true; geo.computeVertexNormals();
    const rmax = Math.max.apply(null, Array.from(sm));
    // parte de atrás: color medio de cada fila del producto (franjas del envase), en vez de un color plano
    const bc = document.createElement('canvas'); bc.width = 1; bc.height = ch; const bx2 = bc.getContext('2d');
    const rowC = [];
    for (let y = 0; y < ch; y++) {
      let r = 0, g2 = 0, b2 = 0, n = 0;
      if (xl[y] >= 0) for (let x = xl[y] + 2; x <= xr[y] - 2; x += 2) { const i = (y * cw + x) * 4; r += d[i]; g2 += d[i + 1]; b2 += d[i + 2]; n++; }
      rowC.push(n ? [r / n, g2 / n, b2 / n] : [avg.r * 255, avg.g * 255, avg.b * 255]);
    }
    for (let y = 0; y < ch; y++) {   // desenfoque vertical: franjas suaves, sin rayas
      let r = 0, g2 = 0, b2 = 0, n = 0;
      for (let q = -5; q <= 5; q++) { const c = rowC[Math.max(0, Math.min(ch - 1, y + q))]; r += c[0]; g2 += c[1]; b2 += c[2]; n++; }
      bx2.fillStyle = 'rgb(' + Math.round(r / n * 0.97) + ',' + Math.round(g2 / n * 0.97) + ',' + Math.round(b2 / n * 0.97) + ')'; bx2.fillRect(0, y, 1, 1);
    }
    const btex = new THREE.CanvasTexture(bc); btex.encoding = THREE.sRGBEncoding; btex.magFilter = btex.minFilter = THREE.LinearFilter; btex.generateMipmaps = false;
    const mat = new THREE.MeshPhysicalMaterial({ map: tex, roughness: .34, metalness: .04, clearcoat: .55, clearcoatRoughness: .25, side: THREE.DoubleSide });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uBackTex = { value: btex }; sh.uniforms.uR = { value: rmax };
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vObjZ;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvObjZ = position.z;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vObjZ;\nuniform sampler2D uBackTex;\nuniform float uR;')
        .replace('#include <map_fragment>', 'vec4 sampledDiffuseColor = texture2D( map, vUv );\nvec4 backC = texture2D( uBackTex, vec2(0.5, vUv.y) );\nfloat fr = smoothstep(-0.3, 0.38, vObjZ / uR);\nsampledDiffuseColor.rgb = mix(backC.rgb, sampledDiffuseColor.rgb, fr);\ndiffuseColor *= sampledDiffuseColor;');
    };
    const mesh = new THREE.Mesh(geo, mat);
    if (tipo === 'tubo') mesh.scale.z = 0.42;
    g.add(mesh);
    return g;
  }

  function build(THREE, p) {
    const m = Object.assign({ tipo: 'frasco', color: '#8fd3ff', acento: '#007dc3' }, p.modelo || {});
    const g = new THREE.Group();
    const col = new THREE.Color(m.color), acc = new THREE.Color(m.acento);
    const body = (op) => new THREE.MeshPhysicalMaterial({ color: col, roughness: .22, metalness: .05, clearcoat: .8, clearcoatRoughness: .2, transparent: op < 1, opacity: op });
    const cap = new THREE.MeshStandardMaterial({ color: acc, roughness: .35, metalness: .15 });
    const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .4 });
    const lathe = (pts, mat, seg) => new THREE.Mesh(new THREE.LatheGeometry(pts.map((a) => new THREE.Vector2(a[0], a[1])), seg || 64), mat);
    let H = 2; // altura total para centrar
    const label = (mesh) => mesh;
    const lbl = (r, h, y, arc) => {
      const mat = new THREE.MeshStandardMaterial({ map: labelTexture(THREE, p, m, (r * arc) / h), roughness: .5, side: THREE.FrontSide });
      const geo = new THREE.CylinderGeometry(r + .012, r + .012, h, 64, 1, true, -arc / 2, arc);
      const me = new THREE.Mesh(geo, mat); me.position.y = y; return me;
    };
    const t = m.tipo;
    if (t === 'ampolla') {
      g.add(lathe([[0, 0], [.52, 0], [.56, .06], [.56, 1.15], [.5, 1.32], [.26, 1.42], [.24, 1.6], [0, 1.6]], body(.92)));
      g.add(lbl(.56, .78, .62, Math.PI * 0.95));
      const collar = new THREE.Mesh(new THREE.CylinderGeometry(.3, .3, .26, 40), cap); collar.position.y = 1.72; g.add(collar);
      const bulb = lathe([[0, 0], [.17, 0], [.2, .25], [.17, .6], [.1, .78], [0, .84]], new THREE.MeshStandardMaterial({ color: acc, roughness: .6 })); bulb.position.y = 1.84; g.add(bulb);
      H = 2.7;
    } else if (t === 'frasco' || t === 'bomba') {
      g.add(lathe([[0, 0], [.66, 0], [.7, .07], [.7, 1.45], [.62, 1.62], [.3, 1.74], [.3, 1.84], [0, 1.84]], body(1)));
      g.add(lbl(.7, 1.0, .78, Math.PI * 0.95));
      if (t === 'frasco') { const c = new THREE.Mesh(new THREE.CylinderGeometry(.36, .38, .42, 48), cap); c.position.y = 2.02; g.add(c); H = 2.3; }
      else {
        const c = new THREE.Mesh(new THREE.CylinderGeometry(.22, .26, .22, 40), cap); c.position.y = 1.92; g.add(c);
        const st = new THREE.Mesh(new THREE.CylinderGeometry(.07, .07, .32, 20), cap); st.position.y = 2.15; g.add(st);
        const hd = new THREE.Mesh(new THREE.BoxGeometry(.62, .16, .2), cap); hd.position.set(.14, 2.38, 0); g.add(hd);
        H = 2.6;
      }
    } else if (t === 'pote') {
      g.add(lathe([[0, 0], [.92, 0], [.96, .06], [.96, .86], [.9, .92], [0, .92]], body(1)));
      g.add(lbl(.96, .6, .46, Math.PI * 0.9));
      const lid = new THREE.Mesh(new THREE.CylinderGeometry(.99, .99, .3, 56), cap); lid.position.y = 1.07; g.add(lid);
      H = 1.4;
    } else if (t === 'tubo') {
      const tb = new THREE.Mesh(new THREE.CylinderGeometry(.52, .5, 1.9, 48), body(1)); tb.scale.z = .5; tb.position.y = 1.1; g.add(tb);
      const flat = new THREE.Mesh(new THREE.BoxGeometry(1.04, .16, .12), white); flat.position.y = 2.1; g.add(flat);
      const c = new THREE.Mesh(new THREE.CylinderGeometry(.34, .4, .36, 40), cap); c.position.y = .0; c.scale.z = .75; c.position.y = .0; g.add(c);
      const face = new THREE.Mesh(new THREE.PlaneGeometry(.88, .98), new THREE.MeshStandardMaterial({ map: labelTexture(THREE, p, m, .88 / .98), roughness: .5 }));
      face.position.set(0, 1.2, .26); g.add(face);
      const back = face.clone(); back.rotation.y = Math.PI; back.position.z = -.26; g.add(back);
      H = 2.3; g.position.y = .2;
    } else { // caja
      const bx = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.9, .55), body(1)); bx.position.y = .95; g.add(bx);
      const mat = new THREE.MeshStandardMaterial({ map: labelTexture(THREE, p, m, 1.22 / 1.82), roughness: .5 });
      const face = new THREE.Mesh(new THREE.PlaneGeometry(1.22, 1.82), mat); face.position.set(0, .95, .278); g.add(face);
      const back = new THREE.Mesh(new THREE.PlaneGeometry(1.22, 1.82), new THREE.MeshStandardMaterial({ color: col.clone().lerp(new THREE.Color(0xffffff), .6), roughness: .5 })); back.rotation.y = Math.PI; back.position.set(0, .95, -.278); g.add(back);
      const strip = new THREE.Mesh(new THREE.BoxGeometry(1.32, .16, .57), cap); strip.position.y = 1.78; g.add(strip);
      H = 1.9;
    }
    g.position.y -= H / 2;
    const wrapG = new THREE.Group(); wrapG.add(g);
    return wrapG;
  }

  M3.mount = function (el, p) {
    if (!M3.supported()) return null;
    const THREE = window.THREE;
    let renderer;
    try { renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true }); } catch (e) { return null; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputEncoding = THREE.sRGBEncoding;
    const cv = renderer.domElement; cv.className = 'm3d'; cv.setAttribute('aria-label', 'Modelo 3D de ' + p.nombre);
    el.innerHTML = ''; el.appendChild(cv);
    const hint = document.createElement('div'); hint.className = 'm3dhint'; hint.textContent = '↔ Arrastra para girar'; el.appendChild(hint);
    const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(32, 1, .1, 50);
    cam.position.set(0, .15, 7.2);
    scene.add(new THREE.HemisphereLight(0xffffff, 0xbcd6ea, .95));
    const key = new THREE.DirectionalLight(0xffffff, 1.15); key.position.set(3, 4, 5); scene.add(key);
    const rim = new THREE.DirectionalLight(0x9fd8ff, .6); rim.position.set(-4, 2, -3); scene.add(rim);
    const model = build(THREE, p); const pivot = new THREE.Group(); pivot.add(model); scene.add(pivot);
    let pop = 1;
    if (p.imagen) {
      const im = new Image(); im.crossOrigin = 'anonymous'; im.referrerPolicy = 'no-referrer';
      im.onload = () => {
        if (dead) return;
        try {
          const g2 = fromImage(THREE, im, Object.assign({ tipo: 'frasco' }, p.modelo || {}));
          if (g2) { pivot.remove(model); model.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach((mm) => { if (mm.map) mm.map.dispose(); mm.dispose(); }); } }); pivot.add(g2); pop = 0.82; }
          else console.info('Salco Lente: no se pudo separar el producto del fondo en', p.imagen);
        } catch (e) { console.info('Salco Lente: modelo desde la foto no disponible', e); }
      };
      im.onerror = () => console.info('Salco Lente: la imagen no se pudo cargar para el 3D', p.imagen);
      im.src = p.imagen;
    }
    // sombra suave en el piso
    const sc = document.createElement('canvas'); sc.width = sc.height = 128; const sx = sc.getContext('2d');
    const gr = sx.createRadialGradient(64, 64, 4, 64, 64, 64); gr.addColorStop(0, 'rgba(0,40,90,.38)'); gr.addColorStop(1, 'rgba(0,40,90,0)'); sx.fillStyle = gr; sx.fillRect(0, 0, 128, 128);
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 2.8), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc), transparent: true, depthWrite: false }));
    sh.rotation.x = -Math.PI / 2; sh.position.y = -1.55; scene.add(sh);

    let dead0 = 0, rx = -.12, ry = -.5, vx = 0, vy = 0, drag = false, lx = 0, ly = 0, idle = 0, raf = 0, dead = false, w = 0, h = 0;
    const resize = () => {
      const r = el.getBoundingClientRect(); const nw = Math.max(1, Math.round(r.width)), nh = Math.max(1, Math.round(r.height));
      if (nw === w && nh === h) return; w = nw; h = nh; renderer.setSize(w, h, false); cv.style.width = w + 'px'; cv.style.height = h + 'px';
      cam.aspect = w / h; cam.position.z = w / h < .8 ? 8.4 : 7.2; cam.updateProjectionMatrix();
    };
    const down = (e) => { drag = true; lx = e.clientX; ly = e.clientY; vx = vy = 0; idle = 0; hint.classList.add('off'); try { cv.setPointerCapture(e.pointerId); } catch (x) {} };
    const move = (e) => { if (!drag) return; const dx = e.clientX - lx, dy = e.clientY - ly; lx = e.clientX; ly = e.clientY; vy = dx * .012; vx = dy * .008; ry += vy; rx = Math.max(-.8, Math.min(.8, rx + vx)); };
    const up = () => { drag = false; };
    cv.addEventListener('pointerdown', down); cv.addEventListener('pointermove', move); cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    const ro = window.ResizeObserver ? new ResizeObserver(resize) : null; if (ro) ro.observe(el);
    const t0 = performance.now();
    const loop = (t) => {
      if (dead) return; raf = requestAnimationFrame(loop); resize();
      if (!drag) { idle++; if (idle > 90) ry += .008; ry += vy * .92; vy *= .92; rx += vx * .9; vx *= .9; rx += (-.12 - rx) * .01; rx = Math.max(-.8, Math.min(.8, rx)); }
      const f = Math.sin((t - t0) / 900) * .05;
      if (pop < 1) pop = Math.min(1, pop + .06); pivot.scale.setScalar(pop);
      pivot.rotation.set(rx, ry, 0); pivot.position.y = f; sh.scale.setScalar(1 - f * .6);
      renderer.render(scene, cam);
    };
    resize(); raf = requestAnimationFrame(loop);
    // entrada suave
    cv.style.opacity = 0; requestAnimationFrame(() => { cv.style.transition = 'opacity .6s'; cv.style.opacity = 1; });
    return {
      destroy() {
        dead = true; cancelAnimationFrame(raf); if (ro) ro.disconnect();
        scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach((mm) => { if (mm.map) mm.map.dispose(); mm.dispose(); }); } });
        renderer.dispose(); try { renderer.forceContextLoss(); } catch (e) {} el.innerHTML = '';
      }
    };
  };
})();
