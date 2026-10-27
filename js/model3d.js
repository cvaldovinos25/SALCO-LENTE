/* ============================================================
   Salco Lente: modelos 3D flotantes
   Formas genéricas (ampolla con gotario, tubo, caja, pote, frasco,
   envase con bomba) con los colores y textos de cada producto
   (campo "modelo" de data/productos.json). Son representaciones
   estilizadas, no copias exactas del envase real.
   ============================================================ */
(function () {
  const SL = (window.SL = window.SL || {});
  const TAU = Math.PI * 2;
  const V = (x, y) => new THREE.Vector2(x, y);

  function arc(cx, cy, r, a0, a1, n) {
    const o = []; for (let i = 0; i <= n; i++) { const a = a0 + ((a1 - a0) * i) / n; o.push(V(cx + r * Math.cos(a), cy + r * Math.sin(a))); }
    return o;
  }
  function shade(hex, k) {
    const c = new THREE.Color(hex); c.multiplyScalar(k); return '#' + c.getHexString();
  }

  /* Etiqueta en canvas con las líneas de texto del producto */
  function labelTexture(m, W, H, bg) {
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, bg ? bg[0] : '#ffffff'); g.addColorStop(1, bg ? bg[1] : shade(m.color, 1.02));
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    x.fillStyle = m.acento; x.fillRect(0, 0, W, H * 0.055); x.fillRect(0, H * 0.945, W, H * 0.055);
    x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = shade(m.acento, 0.6);
    const sc = H / 640;
    const sizes = { logo: [96, '800'], big: [78, '800'], sub: [40, '700'], small: [44, '600'], tiny: [34, '600'] };
    const gaps = { logo: 130, big: 100, sub: 62, small: 70, tiny: 54 };
    const lines = m.lineas || [];
    const total = lines.reduce((s, l) => s + gaps[l[1]], 0) * sc;
    let y = (H - total) / 2;
    lines.forEach(([t, k]) => {
      const s = sizes[k][0] * sc; let fs = s;
      x.font = sizes[k][1] + ' ' + fs + 'px system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif';
      x.letterSpacing = k === 'sub' ? (8 * sc) + 'px' : '0px';
      while (x.measureText(t).width > W * 0.88 && fs > 14) { fs -= 2; x.font = sizes[k][1] + ' ' + fs + 'px system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif'; }
      x.fillText(t, W / 2, y + (gaps[k] * sc) / 2);
      y += gaps[k] * sc;
    });
    const tex = new THREE.CanvasTexture(c); tex.anisotropy = 4; tex.encoding = THREE.sRGBEncoding;
    return tex;
  }

  const std = (o) => new THREE.MeshStandardMaterial(Object.assign({ roughness: 0.5, metalness: 0, envMapIntensity: 0.8 }, o));
  const metal = (c) => std({ color: c, metalness: 0.85, roughness: 0.28, envMapIntensity: 1.6 });

  /* Cilindro con etiqueta que envuelve el cuerpo */
  function wrapLabel(m, R, h, y, bg) {
    const len = TAU * 0.985;
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.006, R + 0.006, h, 96, 1, true, -len / 2, len),
      std({ map: labelTexture(m, 1024, Math.round(1024 * h / (TAU * R) * 1.0) || 640, bg), side: THREE.DoubleSide, envMapIntensity: 0.5 }));
    mesh.position.y = y; mesh.renderOrder = 2; return mesh;
  }

  /* ---------- Formas ---------- */
  function ampolla(m) {
    const R = 0.48, H = 1.26, g = new THREE.Group(), rc = 0.09, nr = 0.19;
    const prof = [V(0, 0), ...arc(R - rc, rc, rc, -Math.PI / 2, 0, 8)];
    prof.push(V(R, H - 0.22), ...arc(R - 0.2, H - 0.22, 0.2, 0, Math.PI / 2 * 0.85, 10));
    const shY = H - 0.22 + 0.2 * Math.sin(Math.PI / 2 * 0.85);
    prof.push(V(nr + 0.02, shY + 0.04), V(nr, shY + 0.1), V(nr, H + 0.18));
    const glass = new THREE.Mesh(new THREE.LatheGeometry(prof, 72), std({ color: m.color, transparent: true, opacity: 0.55, roughness: 0.08, metalness: 0.05, envMapIntensity: 1.5, side: THREE.DoubleSide, depthWrite: false }));
    glass.renderOrder = 3;
    const lp = [V(0, 0.05), ...arc(R - 0.14, 0.12, 0.07, -Math.PI / 2, 0, 6), V(R - 0.075, H * 0.78), V(0, H * 0.78)];
    const liquid = new THREE.Mesh(new THREE.LatheGeometry(lp, 64), std({ color: m.liquido || m.color, transparent: true, opacity: 0.9, roughness: 0.2 }));
    liquid.renderOrder = 1;
    const label = wrapLabel(m, R, H * 0.52, H * 0.4, ['#ffffff', shade(m.color, 1)]);
    const collarY = H + 0.18;
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(nr + 0.05, nr + 0.05, 0.2, 48), metal(m.acento)); collar.position.y = collarY + 0.04;
    const bp = [[0, 0], [0.17, 0], [0.19, 0.04], [0.18, 0.14], [0.16, 0.3], [0.15, 0.46], [0.13, 0.6], [0.07, 0.69], [0, 0.71]].map((p) => V(p[0], p[1]));
    const bulb = new THREE.Mesh(new THREE.LatheGeometry(bp, 48), std({ color: 0xffffff, roughness: 0.55, envMapIntensity: 0.7 })); bulb.position.y = collarY + 0.14;
    const pip = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.04, H * 0.92, 20), std({ color: 0xffffff, transparent: true, opacity: 0.4, roughness: 0.05, envMapIntensity: 1.5, depthWrite: false }));
    pip.position.y = collarY - H * 0.46 + 0.02; pip.renderOrder = 2;
    g.add(liquid, pip, glass, label, collar, bulb);
    g.userData = { height: collarY + 0.14 + 0.71, width: R * 2 };
    return g;
  }

  function frasco(m) { // frasco de cápsulas con tapa
    const R = 0.5, H = 1.1, g = new THREE.Group();
    const prof = [V(0, 0), ...arc(R - 0.1, 0.1, 0.1, -Math.PI / 2, 0, 8), V(R, H - 0.2), ...arc(R - 0.14, H - 0.2, 0.14, 0, Math.PI / 2, 8), V(0.3, H)];
    const body = new THREE.Mesh(new THREE.LatheGeometry(prof, 72), std({ color: m.color, roughness: 0.35, envMapIntensity: 1 }));
    const label = wrapLabel(m, R, H * 0.62, H * 0.42, ['#ffffff', '#ffffff']);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.36, 0.3, 48), std({ color: m.acento, roughness: 0.4 })); cap.position.y = H + 0.12;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.31, 0.02, 10, 48), std({ color: 0xffffff })); ring.rotation.x = Math.PI / 2; ring.position.y = H - 0.02;
    g.add(body, label, cap, ring); g.userData = { height: H + 0.27, width: R * 2 }; return g;
  }

  function pote(m) { // pote o crema
    const R = 0.62, H = 0.72, g = new THREE.Group();
    const prof = [V(0, 0), ...arc(R - 0.1, 0.1, 0.1, -Math.PI / 2, 0, 8), V(R, H)];
    const body = new THREE.Mesh(new THREE.LatheGeometry([...prof, V(R - 0.02, H), V(0, H)], 72), std({ color: m.color, roughness: 0.4 }));
    const label = wrapLabel(m, R, H * 0.8, H * 0.46, ['#ffffff', shade(m.color, 1)]);
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.015, R + 0.015, 0.22, 72), std({ color: m.acento, roughness: 0.4 })); lid.position.y = H + 0.11;
    g.add(body, label, lid); g.userData = { height: H + 0.22, width: R * 2 }; return g;
  }

  function tubo(m) { // tubo de pie
    const g = new THREE.Group(), W = 0.9, H = 1.6;
    const shape = new THREE.Shape(); shape.moveTo(-W / 2, 0); shape.lineTo(W / 2, 0); shape.lineTo(W / 2 - 0.05, H); shape.lineTo(-W / 2 + 0.05, H); shape.closePath();
    const body = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.34, bevelEnabled: true, bevelSize: 0.08, bevelThickness: 0.08, bevelSegments: 4 }), std({ color: m.color, roughness: 0.35, envMapIntensity: 1 }));
    body.position.set(0, 0, -0.17);
    const mk = (z, flip) => { const p = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.84, H * 0.7), std({ map: labelTexture(m, 640, Math.round(640 * 0.7 * H / (W * 0.84)), ['#ffffff', shade(m.color, 1)]), transparent: false })); p.position.set(0, H * 0.45, z); if (flip) p.rotation.y = Math.PI; return p; };
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.3, 0.28, 40), std({ color: m.acento, roughness: 0.4 })); cap.position.y = -0.14;
    g.add(body, mk(0.26), mk(-0.26, true), cap); g.position.y = 0.0; g.userData = { height: H + 0.3, width: W, yoff: 0.14 }; return g;
  }

  function caja(m) { // caja de cartón
    const g = new THREE.Group(), W = 1.0, H = 1.3, D = 0.5;
    const tex = labelTexture(m, 640, Math.round(640 * H / W), ['#ffffff', shade(m.color, 1)]);
    const side = std({ color: m.color, roughness: 0.55 });
    const front = std({ map: tex, roughness: 0.45 });
    const box = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), [side, side, side, side, front, front]);
    g.add(box); g.userData = { height: H, width: W, mid: true }; return g;
  }

  function bomba(m) { // frasco con dosificador
    const R = 0.44, H = 1.25, g = new THREE.Group();
    const prof = [V(0, 0), ...arc(R - 0.12, 0.12, 0.12, -Math.PI / 2, 0, 8), V(R, H - 0.3), ...arc(R - 0.3, H - 0.3, 0.3, 0, Math.PI / 2, 10), V(0.16, H)];
    const body = new THREE.Mesh(new THREE.LatheGeometry(prof, 72), std({ color: m.color, roughness: 0.3, envMapIntensity: 1.1 }));
    const label = wrapLabel(m, R, H * 0.55, H * 0.4, ['#ffffff', '#ffffff']);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.16, 32), std({ color: m.acento })); neck.position.y = H + 0.06;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.22, 20), std({ color: m.acento })); stem.position.y = H + 0.24;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 0.14), std({ color: m.acento })); head.position.set(0.1, H + 0.38, 0);
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.2, 16), std({ color: m.acento })); nozzle.rotation.z = Math.PI / 2; nozzle.position.set(0.3, H + 0.38, 0);
    g.add(body, label, neck, stem, head, nozzle); g.userData = { height: H + 0.44, width: R * 2 + 0.3 }; return g;
  }

  const BUILD = { ampolla, frasco, pote, tubo, caja, bomba };

  function makeEnv(rend) {
    const pg = new THREE.PMREMGenerator(rend), es = new THREE.Scene();
    es.background = new THREE.Color(0x2a4a68);
    const panel = (c, k, w, h, x, y, z) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k), side: THREE.DoubleSide }));
      m.position.set(x, y, z); m.lookAt(0, 0, 0); es.add(m);
    };
    panel(0xffffff, 3.6, 7, 4, 0, 6, 2); panel(0xe9f5ff, 2.2, 3, 7, -6, 1, 2); panel(0xfff3dd, 2.2, 3, 7, 6, 1, -1);
    panel(0xffffff, 1.8, 9, 2.4, 0, -1, 7); panel(0xcfe9ff, 1, 7, 3, 0, -4, -5);
    const t = pg.fromScene(es, 0.03).texture; pg.dispose(); return t;
  }
  function shadowTexture() {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 4, 64, 64, 64);
    g.addColorStop(0, 'rgba(0,20,40,.55)'); g.addColorStop(1, 'rgba(0,20,40,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c);
  }

  /* mount(el, modelo) devuelve { dispose(), setTilt(x, y) } o null si no hay WebGL */
  SL.mountProduct3D = function (el, modelo) {
    if (!window.THREE || !modelo) return null;
    let renderer;
    try { renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' }); } catch (e) { return null; }
    if (!renderer.getContext()) return null;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputEncoding = THREE.sRGBEncoding; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
    renderer.setClearColor(0x000000, 0);
    el.innerHTML = ''; el.appendChild(renderer.domElement);
    renderer.domElement.style.cssText = 'width:100%;height:100%;display:block;touch-action:pan-y;cursor:grab';

    const scene = new THREE.Scene();
    let env = null; try { env = makeEnv(renderer); scene.environment = env; } catch (e) {}
    scene.add(new THREE.HemisphereLight(0xffffff, 0x88aacc, 0.7));
    const k1 = new THREE.DirectionalLight(0xffffff, 1.1); k1.position.set(2, 4, 4); scene.add(k1);
    const rim = new THREE.DirectionalLight(0xbfe4ff, 0.8); rim.position.set(-3, 2, -3); scene.add(rim);

    const obj = (BUILD[modelo.tipo] || ampolla)(modelo), holder = new THREE.Group(), H = obj.userData.height, Wd = obj.userData.width || 1;
    obj.position.y = obj.userData.mid ? 0 : -H / 2 + (obj.userData.yoff || 0);
    holder.add(obj); holder.rotation.z = -0.06; scene.add(holder);
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.8), new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = -H / 2 - 0.3; scene.add(shadow);

    const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
    function resize() {
      const w = Math.max(60, el.clientWidth), h = Math.max(60, el.clientHeight);
      renderer.setSize(w, h, false); cam.aspect = w / h;
      const t = Math.tan((cam.fov * Math.PI) / 360);
      const need = (H + 0.7) / 2 / t, needW = (Wd * 0.95) / cam.aspect / t;
      cam.position.set(0, 0.05, Math.max(need, needW) + 0.3); cam.lookAt(0, -0.05, 0); cam.updateProjectionMatrix();
    }
    resize();
    const ro = window.ResizeObserver ? new ResizeObserver(resize) : null; if (ro) ro.observe(el);

    let dragging = false, lastX = 0, vel = 0, idle = 0, spin = 0, tx = 0, ty = 0;
    const cv = renderer.domElement;
    cv.addEventListener('pointerdown', (e) => { dragging = true; lastX = e.clientX; cv.setPointerCapture(e.pointerId); cv.style.cursor = 'grabbing'; });
    cv.addEventListener('pointermove', (e) => { if (!dragging) return; const dx = e.clientX - lastX; lastX = e.clientX; spin += dx * 0.012; vel = dx * 0.012; idle = 0; });
    const up = () => { dragging = false; cv.style.cursor = 'grab'; };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);

    const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0, last = performance.now(), t = 0, disposed = false;
    function frame(now) {
      if (disposed) return;
      raf = requestAnimationFrame(frame);
      if (document.hidden) { last = now; return; }
      const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
      if (!dragging) { idle += dt; spin += vel; vel *= 0.94; if (idle > 1.2 && !reduce) spin += dt * 0.7; }
      const bob = reduce ? 0 : Math.sin(t * 1.5) * 0.07;
      holder.position.y = bob; holder.position.x += (tx * 0.12 - holder.position.x) * 0.1;
      holder.rotation.y = spin - 0.5 + tx * 0.2; holder.rotation.x = (reduce ? 0 : Math.sin(t * 0.9) * 0.04) + ty * 0.1;
      const s = 1 - bob * 0.5; shadow.scale.set(s, s, s); shadow.material.opacity = 0.75 - bob * 1.2;
      renderer.render(scene, cam);
    }
    raf = requestAnimationFrame(frame);
    return {
      setTilt(x, y) { tx = Math.max(-1, Math.min(1, x)); ty = Math.max(-1, Math.min(1, y)); },
      dispose() {
        disposed = true; cancelAnimationFrame(raf); if (ro) ro.disconnect();
        scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((mm) => { if (mm.map) mm.map.dispose(); mm.dispose(); }); });
        if (env) env.dispose(); renderer.dispose(); if (renderer.forceContextLoss) renderer.forceContextLoss(); el.innerHTML = '';
      }
    };
  };
})();
