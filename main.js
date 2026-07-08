/* ============================================================================
 *  main.js  —  THE OP: a mock TouchDesigner-style desktop app around ECHO.
 *  Node network (draggable ops + animated patch cords), a parameter panel
 *  whose sliders write straight into the live engine, a transport bar, and
 *  PERFORM mode that melts the chrome away into fullscreen sonar.
 * ==========================================================================*/
import * as ECHO from './echo.js';
import * as AUDIO from './audio.js';
import { CFG } from './config.js';

window.__eyeStarted = true;
const $ = (id) => document.getElementById(id);

/* ── viewport ────────────────────────────────────────────────────────────*/
const viewport = $('viewport');
ECHO.init(viewport);
function fitViewport() {
  const r = viewport.getBoundingClientRect();
  ECHO.resize(Math.max(2, r.width), Math.max(2, r.height));
}
new ResizeObserver(fitViewport).observe(viewport);
window.addEventListener('resize', fitViewport);

viewport.addEventListener('pointerdown', (e) => {
  const r = viewport.getBoundingClientRect();
  ECHO.pingAtScreen((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
  AUDIO.blip(1);
});

/* ── node network ────────────────────────────────────────────────────────*/
const netEl = $('network'), svg = $('cords');
const nodeEls = {};
let selected = 'sonar';

function buildNetwork() {
  for (const n of CFG.nodes) {
    const el = document.createElement('div');
    el.className = 'node kind-' + n.kind.toLowerCase();
    el.style.left = n.x + 'px'; el.style.top = n.y + 'px';
    el.innerHTML = `<div class="node-head"><span class="node-kind">${n.kind}</span><span class="node-title">${n.title}</span></div>
      <div class="node-body"><canvas class="node-thumb" width="64" height="36"></canvas></div>
      <span class="pin in"></span><span class="pin out"></span>`;
    netEl.appendChild(el);
    nodeEls[n.id] = el;
    el.addEventListener('pointerdown', (e) => { select(n.id); dragStart(n, el, e); });
  }
  select(selected);
}
function select(id) {
  selected = id;
  for (const k in nodeEls) nodeEls[k].classList.toggle('sel', k === id);
  buildParams(id);
}
/* drag ops around — cords follow live */
function dragStart(n, el, e) {
  const sx = e.clientX - n.x, sy = e.clientY - n.y;
  const move = (ev) => { n.x = ev.clientX - sx; n.y = ev.clientY - sy; el.style.left = n.x + 'px'; el.style.top = n.y + 'px'; drawCords(); };
  const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
}
function nodeBy(id) { return CFG.nodes.find((n) => n.id === id); }
function drawCords() {
  let html = '';
  for (const [a, b] of CFG.cords) {
    const na = nodeBy(a), nb = nodeBy(b);
    const x1 = na.x + 150, y1 = na.y + 34, x2 = nb.x, y2 = nb.y + 34;
    const mx = (x1 + x2) / 2;
    html += `<path class="cord" d="M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}"/>`;
    html += `<circle class="pulse" r="2.6"><animateMotion dur="${1.6 + Math.random()}s" repeatCount="indefinite" path="M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}"/></circle>`;
  }
  svg.innerHTML = html;
}

/* ── parameter panel (sliders write straight into CFG.params) ────────────*/
const paramsEl = $('params');
function buildParams(nodeId) {
  const n = nodeBy(nodeId);
  $('params-title').textContent = n.title + '  ·  ' + n.kind;
  paramsEl.innerHTML = '';
  const keys = n.params.length ? n.params : Object.keys(CFG.paramDefs);
  for (const key of keys) {
    const def = CFG.paramDefs[key];
    const row = document.createElement('div'); row.className = 'prow';
    row.innerHTML = `<label>${def.label}</label>
      <input type="range" min="${def.min}" max="${def.max}" step="${def.step}" value="${CFG.params[key]}">
      <span class="pval">${fmt(CFG.params[key])}${def.unit ? ' ' + def.unit : ''}</span>`;
    const input = row.querySelector('input'), val = row.querySelector('.pval');
    input.addEventListener('input', () => {
      CFG.params[key] = parseFloat(input.value);            // engine lerps toward it
      val.textContent = fmt(CFG.params[key]) + (def.unit ? ' ' + def.unit : '');
    });
    paramsEl.appendChild(row);
  }
}
const fmt = (v) => (Math.abs(v) >= 10 ? v.toFixed(0) : v.toFixed(2));

/* ── transport / toolbar ─────────────────────────────────────────────────*/
let performMode = false;
function setPerform(v) {
  performMode = v;
  document.body.classList.toggle('perform', v);
  ECHO.setPerform(v);
  $('btn-perform').textContent = v ? 'EDIT (Esc)' : 'PERFORM ▸';
  setTimeout(fitViewport, 320); // after the CSS transition settles
}
$('btn-perform').addEventListener('click', () => setPerform(!performMode));
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && performMode) setPerform(false);
  if (e.key === 'F1') { e.preventDefault(); setPerform(!performMode); }
  if (e.code === 'Space') { e.preventDefault(); ECHO.ping(0, -0.9, 0, 1.2); AUDIO.blip(1.2); }
});
$('btn-auto').addEventListener('click', () => {
  CFG.autoPing = !CFG.autoPing;
  $('btn-auto').classList.toggle('on', CFG.autoPing);
});
$('btn-mic').addEventListener('click', async () => {
  if (AUDIO.isMicOn()) return;
  const ok = await AUDIO.enableMic();
  if (ok) { $('btn-mic').classList.add('on'); $('btn-mic').textContent = '● MIC LIVE'; }
  else $('btn-mic').textContent = 'MIC BLOCKED';
});

/* rotating Lee Sin quotes in the status bar */
let quoteIdx = 0;
setInterval(() => {
  quoteIdx = (quoteIdx + 1) % CFG.quotes.length;
  const q = $('quote'); q.style.opacity = 0;
  setTimeout(() => { q.textContent = '“' + CFG.quotes[quoteIdx] + '”'; q.style.opacity = 0.75; }, 600);
}, 9000);

/* ── boot gate ───────────────────────────────────────────────────────────*/
$('begin-btn').addEventListener('click', () => {
  AUDIO.start();
  $('loader').classList.add('gone');
  setTimeout(() => { $('loader').style.display = 'none'; }, 900);
  // opening salvo — three pings sweep the temple out of darkness
  setTimeout(() => { ECHO.ping(0, -0.9, 0, 1.3); AUDIO.blip(1.2); }, 500);
  setTimeout(() => { ECHO.ping(-5, 0.5, 0, 1); AUDIO.blip(0.9); }, 1400);
  setTimeout(() => { ECHO.ping(5, 0.5, 0, 1); AUDIO.blip(0.9); }, 2300);
});

/* ── main loop ───────────────────────────────────────────────────────────*/
let last = performance.now() / 1000, pingClock = 0, fpsA = 0, fpsN = 0;
function loop() {
  requestAnimationFrame(loop);
  const now = performance.now() / 1000;
  const dt = Math.min(0.05, now - last); last = now;

  // auto-ping on the tempo clock
  if (CFG.autoPing) {
    pingClock += dt;
    const beat = 60 / CFG.params.tempo;
    if (pingClock >= beat) {
      pingClock -= beat;
      const a = Math.random() * Math.PI * 2;
      ECHO.ping(Math.cos(a) * 4 * Math.random(), -0.5 + Math.random() * 2, 0, 0.8);
      AUDIO.blip(0.55 + Math.random() * 0.3);
    }
  }
  // mic beats fire pings too
  const au = AUDIO.analyze(now);
  if (au.beat) { ECHO.ping((Math.random() - 0.5) * 8, Math.random() * 3 - 1, 0, 1); AUDIO.blip(0.8); }

  ECHO.update(dt, au.level);

  // node thumbnails: tiny CHOP-style waveforms (cheap, 12fps is plenty)
  fpsA += dt; fpsN++;
  if (fpsA > 0.5) {
    $('fps').textContent = Math.round(fpsN / fpsA) + ' FPS · 60k pts';
    fpsA = 0; fpsN = 0;
    drawThumbs(now, au.level);
  }
  ECHO.getTime(); // keep clock display honest
  $('clock').textContent = formatClock(now);
}
function drawThumbs(now, level) {
  for (const id in nodeEls) {
    const c = nodeEls[id].querySelector('.node-thumb'); if (!c) continue;
    const g = c.getContext('2d');
    g.clearRect(0, 0, 64, 36);
    g.strokeStyle = id === selected ? '#3fe0d6' : '#3fe0d688';
    g.beginPath();
    for (let x = 0; x < 64; x++) {
      const y = 18 + Math.sin(x * 0.35 + now * 3 + id.length) * (5 + level * 10) * Math.sin(x * 0.05 + now);
      x === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
    }
    g.stroke();
  }
}
function formatClock(s) {
  const m = Math.floor(s / 60), sec = Math.floor(s % 60), f = Math.floor((s % 1) * 30);
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(f).padStart(2, '0')}`;
}

buildNetwork();
drawCords();
fitViewport();
loop();
