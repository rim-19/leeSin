/* ============================================================================
 *  main.js  —  orchestration for the cinematic experience:
 *  BEGIN → opening sequence (black → line → world reveal → kick impact) →
 *  interactive hand-tracking (ability VFX) → ENTER → calm finale → fade to black.
 * ==========================================================================*/
import * as SCENE from './scene.js';
import * as GES from './gestures.js';
import * as AB from './abilities.js';
import * as AUDIO from './audio.js';
import { CFG } from './config.js';
import * as MSG from './messages.js';

const { THREE } = SCENE;
const $ = (id) => document.getElementById(id);
const clamp = SCENE.clamp, lerp = SCENE.lerp;
window.__eyeStarted = true;

// GSAP with a tiny fallback shim if the CDN is blocked.
const gsap = window.gsap || { to: (t, o) => { if (o && o.onComplete) o.onComplete(); if (t && o) for (const k in o) if (!['duration','delay','ease','onUpdate','onComplete','onStart'].includes(k)) try { t[k] = o[k]; } catch (e) {} }, timeline: () => ({ to() { return this; }, call(fn) { fn && fn(); return this; } }) };

const video = $('webcam');
let mode = 'load', time = 0, reveal = 0, last = performance.now() / 1000;

/* ── fill copy from messages.js ──────────────────────────────────────────*/
function fillCopy() {
  $('nav-summoner').textContent = MSG.summonerName;
  $('welcome-name').textContent = MSG.welcomeName;
  $('opening-line').textContent = MSG.openingLine;
  $('spirit-line').textContent = MSG.spiritLine;
  $('quote-text').innerHTML = MSG.heroQuote.text.replace(/\n/g, '<br>');
  $('quote-author').textContent = '– ' + MSG.heroQuote.author;
  $('love-title').textContent = MSG.loveCard.title;
  $('love-body').textContent = MSG.loveCard.body;
  $('love-sign').textContent = MSG.loveCard.sign;
}

/* ── ability icons ───────────────────────────────────────────────────────*/
const iconMap = { Q: 'ico-Q', Q2: 'ico-W', R: 'ico-R' };
function flashIcon(key) { const id = iconMap[key]; if (!id) return; const e = $(id); e.classList.add('fired'); clearTimeout(e._t); e._t = setTimeout(() => e.classList.remove('fired'), 420); }

/* ── live gesture readout ────────────────────────────────────────────────*/
const rows = { move: $('row-move'), pinch: $('row-pinch'), fist: $('row-fist'), open: $('row-open') };
function updateReadout(st) {
  Object.values(rows).forEach((r) => r && r.classList.remove('active'));
  const s = $('track-status');
  if (!st.present) { s.textContent = 'Tracking your hand…'; return; }
  if (st.pinch) { s.textContent = 'PINCH · Sonic Wave'; rows.pinch && rows.pinch.classList.add('active'); }
  else if (st.fist) { s.textContent = 'FIST · Resonating Strike'; rows.fist && rows.fist.classList.add('active'); }
  else if (st.open) { s.textContent = 'OPEN PALM · Safeguard / Kick'; rows.open && rows.open.classList.add('active'); }
  else { s.textContent = 'Move your hand'; rows.move && rows.move.classList.add('active'); }
}

/* ── opening cinematic ───────────────────────────────────────────────────*/
async function begin() {
  $('begin-btn').disabled = true;
  AUDIO.startAmbient();
  await initWebcam();
  GES.initHands(video); GES.pumpHands();
  $('loader').style.display = 'none';
  runOpening();
}
function runOpening() {
  mode = 'opening';
  const cine = $('cine'), line = $('opening-line');
  const C = CFG.cine;
  gsap.to(line, { opacity: 1, duration: C.lineIn, ease: 'power2.out' });
  const tl = { }; // sequence via timeouts (robust without gsap timelines)
  setTimeout(() => gsap.to(line, { opacity: 0, duration: 1.2 }), (C.lineIn + C.lineHold) * 1000);
  setTimeout(() => {
    SCENE.seedEmbers();
    const o = { v: 0 };
    gsap.to(o, { v: 1, duration: C.reveal, ease: 'power2.inOut', onUpdate: () => { reveal = o.v; SCENE.setReveal(reveal); }, onComplete: () => { reveal = 1; SCENE.setReveal(1); } });
    gsap.to(cine, { opacity: 0, duration: C.reveal, ease: 'power2.inOut', onComplete: () => { cine.style.display = 'none'; } });
    SCENE.setLanternGlow(0.15);
  }, (C.lineIn + C.lineHold + 1.0) * 1000);
  setTimeout(doImpact, (C.lineIn + C.lineHold + 1.0 + C.reveal * C.impactAt + 0.6) * 1000);
  setTimeout(revealSite, (C.lineIn + C.lineHold + 1.0 + C.reveal + 0.4) * 1000);
}
function doImpact() {
  AUDIO.impactBoom(); SCENE.addShake(1.3); SCENE.rageBurst(0, -0.6); SCENE.bumpAfterimage(0.9);
  const f = $('flash'); f.style.opacity = '1'; setTimeout(() => { f.style.opacity = '0'; }, 120);
  const sp = $('splash'); if (sp) sp.classList.add('land');
}
function revealSite() {
  $('site').classList.add('show');
  setTimeout(() => {
    const s = $('spirit'); s.classList.add('show');
    setTimeout(() => s.classList.remove('show'), CFG.cine.spiritHold * 1000);
    mode = 'interactive'; AB.setInteractive(true);
  }, 1400);
}

/* ── finale ──────────────────────────────────────────────────────────────*/
function runFinale() {
  if (mode === 'finale') return; mode = 'finale';
  AB.setInteractive(false); SCENE.triggerSlowmo(8);
  $('site').classList.remove('show'); $('site').classList.add('hide');
  const o = { m: 0 }; gsap.to(o, { m: 1, duration: 4, ease: 'power2.inOut', onUpdate: () => { SCENE.setMood(o.m); SCENE.setLanternGlow(0.15 + o.m * 0.85); } });
  AUDIO.fadeOut(3);
  const box = $('finale'); box.classList.add('show');
  const lines = MSG.finaleSequence;
  lines.forEach((txt, i) => {
    setTimeout(() => {
      const el = document.createElement('div'); el.className = 'finale-line'; el.textContent = txt; box.appendChild(el);
      requestAnimationFrame(() => el.classList.add('show'));
    }, 1200 + i * 3200);
  });
  setTimeout(() => { $('cine').style.display = 'flex'; gsap.to($('cine'), { opacity: 1, duration: 5, ease: 'power2.inOut' }); }, 1200 + lines.length * 3200 + 2600);
}

/* ── webcam ──────────────────────────────────────────────────────────────*/
async function initWebcam() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 960 }, height: { ideal: 540 }, facingMode: 'user' }, audio: false });
    video.srcObject = stream; await video.play(); return true;
  } catch (e) { console.warn('Webcam unavailable:', e); $('track-status').textContent = 'No webcam — grant access & reload'; return false; }
}

/* ── loop ────────────────────────────────────────────────────────────────*/
function loop() {
  requestAnimationFrame(loop);
  const now = performance.now() / 1000; let dt = Math.min(0.05, now - last); last = now; time += dt;
  const slow = SCENE.getSlowmo() > 0; const sdt = dt * (slow ? 0.4 : 1);

  GES.analyzeHands();
  const st = GES.handState[0];
  SCENE.updateCursor(st, time);

  if (mode === 'interactive') { AB.updateAbilities(dt, now); for (const ev of AB.drainEvents()) if (ev.type === 'ability') flashIcon(ev.key); updateReadout(st); }

  SCENE.updateVFX(sdt);
  SCENE.particles.update(sdt, slow); SCENE.embers.update(sdt, slow);
  if (reveal > 0.01) SCENE.emberTick(reveal);

  SCENE.updateTime(time); SCENE.tickCamera(dt, time);
  const moodBloom = CFG.bloom.base + SCENE.getFlash() * 0.9;
  SCENE.bloom.strength = lerp(SCENE.bloom.strength, moodBloom, 0.2);
  $('flash') && ($('flash').style.opacity = String(Math.min(1, SCENE.getFlash())));

  SCENE.render();
}

/* ── boot ────────────────────────────────────────────────────────────────*/
fillCopy();
$('begin-btn').addEventListener('click', begin);
$('enter-btn').addEventListener('click', runFinale);
loop();
