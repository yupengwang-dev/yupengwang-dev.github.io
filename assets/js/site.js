/* Yu-Peng Wang — site behaviour: image viewer, scroll reveals, glass cards that answer the pointer,
   and the liquid-metal background */

/* ---------- image viewer ---------- */
(function () {
  var viewer = document.getElementById('viewer');
  if (!viewer || typeof viewer.showModal !== 'function') return;
  var big = viewer.querySelector('img');
  var note = viewer.querySelector('p');
  viewer.tabIndex = -1;   // the viewer itself takes focus when it opens
  document.querySelectorAll('.zoom').forEach(function (b) {
    b.addEventListener('click', function () {
      var img = b.querySelector('img');
      big.src = img.currentSrc || img.src;
      big.alt = img.alt;
      note.textContent = img.alt;
      viewer.showModal();
      viewer.focus();   // a tap no longer leaves a focus ring on Close; Tab still reaches it
    });
  });
  viewer.addEventListener('click', function (e) {
    if (e.target === viewer || e.target === big) viewer.close();
  });
})();

/* ---------- cards rise into place as they enter the screen ---------- */
(function () {
  if (!('IntersectionObserver' in window)) return;
  document.documentElement.classList.add('js');
  var seen = new IntersectionObserver(function (items) {
    var n = 0;
    items.forEach(function (it) {
      if (!it.isIntersecting) return;
      it.target.style.transitionDelay = (n++ * 110) + 'ms';   // cards arriving together follow one another
      it.target.classList.add('in');
      seen.unobserve(it.target);
      setTimeout(function () { it.target.style.transitionDelay = ''; }, 1400);
    });
  }, { rootMargin: '0px 0px -7% 0px' });
  document.querySelectorAll('.rv').forEach(function (el) { seen.observe(el); });
})();

/* ---------- pressed look: Safari on iPhone applies :active only when the page listens for touches ---------- */
document.addEventListener('touchstart', function () {}, { passive: true });

/* ---------- glass cards: a soft light follows the pointer across them, and the home-page cards tilt towards it ----------
   Pointer moves are batched to one update per frame; the tilt follows the pointer directly and only eases back on leave. */
(function () {
  if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  document.querySelectorAll('.profile, .tile, .card').forEach(function (el) {
    var tilts = el.matches('.profile, .tile'), ev = null, raf = 0, out = 0;
    function update() {
      raf = 0;
      var r = el.getBoundingClientRect(), x = ev.clientX - r.left, y = ev.clientY - r.top;
      el.style.setProperty('--gx', x.toFixed(0) + 'px');
      el.style.setProperty('--gy', y.toFixed(0) + 'px');
      if (tilts && ev.pointerType === 'mouse') {
        var rx = (0.5 - y / r.height) * 9, ry = (x / r.width - 0.5) * 11, a = Math.sqrt(rx * rx + ry * ry) || 0.0001;
        el.style.setProperty('--tilt', (rx / a).toFixed(3) + ' ' + (ry / a).toFixed(3) + ' 0 ' + a.toFixed(2) + 'deg');
      }
    }
    el.addEventListener('pointerenter', function (e) {
      clearTimeout(out); el.classList.remove('tilt-out'); el.classList.add('lit');
      if (tilts && e.pointerType === 'mouse') el.classList.add('tilt');
    });
    el.addEventListener('pointermove', function (e) { ev = e; if (!raf) raf = requestAnimationFrame(update); });
    el.addEventListener('pointerleave', function () {
      cancelAnimationFrame(raf); raf = 0;
      el.classList.remove('lit'); el.classList.add('tilt-out');
      el.style.setProperty('--tilt', '1 0 0 0deg');
      out = setTimeout(function () { el.classList.remove('tilt', 'tilt-out'); }, 450);
    });
  });
})();

/* ---------- background: liquid metal ----------
   A silver surface made of 3-D gradient noise with time as the third axis (it morphs in place instead of sliding),
   lit like polished metal, with an optional thin-film (iridescent) sheen on the slopes.
   The pointer leaves a soft dent and carries the light.
   Drawn small and stretched, about 30 fps when idle; it lowers its own resolution if frames start to drop.
   Without WebGL the page keeps the plain silver tone set in style.css; with reduced motion it draws one still frame. */
(function () {
  var c = null, gl = null, raf = 0, last = 0, t0 = performance.now(), prevT = 0, phase = 0, U = {};
  var SCALE = 0.34, frames = 0, slow = 0;
  // the look, as tuned in the preview: relief = how deep the waves are, speed = how fast the metal flows,
  // scale = how dense the waves are, bright = overall lightness, fx = how strongly the pointer dents the metal and glows,
  // iri = rainbow sheen on the slopes, spotI and spotR = brightness and size of the light that follows the pointer
  var P = { relief: 0.2, speed: 0.12, scale: 0.59, bright: 0.1, fx: 0.4, iri: 0.2, spotI: 0.45, spotR: 0.4 };
  var still = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  // colours: near-neutral silver; blue is only a hair stronger than red, which keeps the metal from looking flat grey
  var m = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5, s: 0, ts: 0, seen: -1e9 };
  var FS = [
    '#ifdef GL_FRAGMENT_PRECISION_HIGH',
    'precision highp float;',
    '#else',
    'precision mediump float;',
    '#endif',
    'uniform vec2 uRes;',
    'uniform float uTime, uPhase, uRelief, uScale, uBright, uFx, uIri, uSpotI, uSpotR;',
    'uniform vec3 uMouse;',
    'vec3 grad(vec3 p){',
    '  p = vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6)));',
    '  return fract(sin(p) * 43758.5453) * 2.0 - 1.0;',
    '}',
    'float gnoise(vec3 p){',
    '  vec3 i = floor(p), f = fract(p);',
    '  vec3 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);',
    '  float a = dot(grad(i), f);',
    '  float b = dot(grad(i + vec3(1.0, 0.0, 0.0)), f - vec3(1.0, 0.0, 0.0));',
    '  float c = dot(grad(i + vec3(0.0, 1.0, 0.0)), f - vec3(0.0, 1.0, 0.0));',
    '  float d = dot(grad(i + vec3(1.0, 1.0, 0.0)), f - vec3(1.0, 1.0, 0.0));',
    '  float e = dot(grad(i + vec3(0.0, 0.0, 1.0)), f - vec3(0.0, 0.0, 1.0));',
    '  float g = dot(grad(i + vec3(1.0, 0.0, 1.0)), f - vec3(1.0, 0.0, 1.0));',
    '  float h = dot(grad(i + vec3(0.0, 1.0, 1.0)), f - vec3(0.0, 1.0, 1.0));',
    '  float k = dot(grad(i + vec3(1.0, 1.0, 1.0)), f - vec3(1.0, 1.0, 1.0));',
    '  return mix(mix(mix(a, b, u.x), mix(c, d, u.x), u.y), mix(mix(e, g, u.x), mix(h, k, u.x), u.y), u.z);',
    '}',
    'float fbm(vec3 p){ return 0.62 * gnoise(p) + 0.26 * gnoise(p * 2.03 + vec3(1.7, 9.2, 3.1)); }',
    'float field(vec2 p){',
    '  float t = uPhase;',
    '  vec2 w = vec2(fbm(vec3(p * 0.8 * uScale, t)), fbm(vec3(p * 0.8 * uScale + vec2(4.3, 1.9), t + 7.1)));',
    '  float h = fbm(vec3(p * uScale + 0.75 * w, t * 0.8 + 3.0));',
    '  vec2 dm = p - uMouse.xy;',
    '  h -= 0.24 * uFx * uMouse.z * exp(-dot(dm, dm) * 11.0);',
    '  return h;',
    '}',
    'vec3 studio(vec3 r){',
    '  vec3 col = mix(vec3(0.535, 0.545, 0.56), vec3(0.855, 0.862, 0.875), smoothstep(-0.8, 0.8, r.y));',
    '  col += vec3(0.12) * smoothstep(0.25, 0.5, r.y) * (1.0 - smoothstep(0.6, 0.85, r.y));',
    '  col += vec3(0.06) * smoothstep(-0.35, -0.1, r.x) * (1.0 - smoothstep(0.05, 0.3, r.x));',
    '  return col;',
    '}',
    'void main(){',
    '  vec2 uv = gl_FragCoord.xy / uRes.y;',
    '  float e = 0.012;',
    '  float h = field(uv);',
    '  float gx = (field(uv + vec2(e, 0.0)) - h) / e;',
    '  float gy = (field(uv + vec2(0.0, e)) - h) / e;',
    '  vec3 n = normalize(vec3(-gx * uRelief, -gy * uRelief, 1.0));',
    '  vec3 col = studio(reflect(vec3(0.0, 0.0, -1.0), n)) + uBright;',
    '  vec2 lp = mix(vec2(0.3 * uRes.x / uRes.y, 0.9), uMouse.xy, uMouse.z);',
    '  vec3 L = normalize(vec3(lp - uv, mix(0.55, 0.55 * uSpotR, uMouse.z)));',
    '  col += vec3(mix(0.24, 0.24 * uSpotI, uMouse.z)) * pow(max(dot(n, normalize(L + vec3(0.0, 0.0, 1.0))), 0.0), 60.0);',
    '  vec2 dl = (uv - uMouse.xy) / max(uSpotR, 0.05);',
    '  col += vec3(0.11, 0.112, 0.118) * uSpotI * uFx * uMouse.z * exp(-dot(dl, dl) * 9.0);',
    '  vec3 film = 0.5 + 0.5 * cos(6.2831853 * (vec3(0.0, 0.33, 0.67) + h * 2.0 + n.x * 0.6 + n.y * 0.4));',
    '  col = mix(col, col * (0.72 + 0.56 * film), uIri * clamp((1.0 - n.z) * 7.0, 0.0, 1.0) * 0.7);',
    '  col *= mix(0.9, 1.0, n.z);',
    '  col *= vec3(1.0, 1.0, 1.004);',
    '  col += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233)) + uTime) * 43758.5453) - 0.5) / 255.0;',
    '  gl_FragColor = vec4(col, 1.0);',
    '}'
  ].join('\n');
  var VS = 'attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }';

  function seconds() { return (performance.now() - t0) / 1000; }
  function shader(type, src) {
    var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  function draw() {
    var t = still ? 20 : seconds();
    phase += Math.min(0.1, Math.max(0, t - prevT)) * P.speed; prevT = t;   // speed can change without the surface jumping
    m.x += (m.tx - m.x) * 0.12; m.y += (m.ty - m.y) * 0.12;
    if (performance.now() - m.seen > 2500) m.ts = 0;
    m.s += (m.ts - m.s) * 0.06;
    gl.uniform1f(U.time, t); gl.uniform1f(U.phase, still ? 0.8 : phase);
    gl.uniform1f(U.relief, P.relief); gl.uniform1f(U.scale, P.scale); gl.uniform1f(U.bright, P.bright);
    gl.uniform1f(U.fx, P.fx); gl.uniform1f(U.iri, P.iri); gl.uniform1f(U.spotI, P.spotI); gl.uniform1f(U.spotR, P.spotR);
    gl.uniform3f(U.mouse, m.x, m.y, m.s);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  function size() {
    if (!c) return;
    var w = Math.max(1, Math.round(innerWidth * SCALE)), h = Math.max(1, Math.round(innerHeight * SCALE));
    c.width = w; c.height = h; gl.viewport(0, 0, w, h); gl.uniform2f(U.res, w, h); draw();
  }
  function frame(now) {
    raf = 0;
    var busy = now - m.seen < 3000;
    var gap = now - last;
    if (gap > (busy ? 15 : 33)) {
      if (busy && last) {
        frames++; if (gap > 26) slow++;
        if (frames >= 40) { if (slow > 20 && SCALE > 0.22) { SCALE = Math.max(0.22, SCALE - 0.04); size(); } frames = slow = 0; }
      }
      last = now; draw();
    }
    if (!document.hidden) raf = requestAnimationFrame(frame);
  }
  function kick() { if (c && !still && !raf && !document.hidden) raf = requestAnimationFrame(frame); }
  function toUV(e) { return [e.clientX / innerHeight, (innerHeight - e.clientY) / innerHeight]; }
  function onMove(e) {
    var p = toUV(e); m.tx = p[0]; m.ty = p[1];
    if (m.s < 0.01) { m.x = p[0]; m.y = p[1]; }
    m.ts = 1; m.seen = performance.now(); kick();
  }
  function start() {
    if (c) return;
    c = document.createElement('canvas'); c.id = 'metal-bg'; c.setAttribute('aria-hidden', 'true');
    gl = c.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'low-power' });
    if (!gl) { c = null; return; }
    var pr;
    try {
      pr = gl.createProgram();
      gl.attachShader(pr, shader(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, shader(gl.FRAGMENT_SHADER, FS));
      gl.linkProgram(pr);
      if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
      gl.useProgram(pr);
    } catch (err) { console.warn('metal background:', err.message); c = null; gl = null; return; }
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(pr, 'p');
    gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    ['res:uRes', 'time:uTime', 'phase:uPhase', 'relief:uRelief', 'scale:uScale', 'bright:uBright', 'fx:uFx', 'iri:uIri', 'spotI:uSpotI', 'spotR:uSpotR', 'mouse:uMouse']
      .forEach(function (s) { var kv = s.split(':'); U[kv[0]] = gl.getUniformLocation(pr, kv[1]); });
    document.body.insertBefore(c, document.body.firstChild);
    prevT = seconds(); size(); kick();
  }
  addEventListener('resize', size);
  if (!still) {
    addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerleave', function () { m.ts = 0; });
  }
  document.addEventListener('visibilitychange', kick);
  start();
})();
