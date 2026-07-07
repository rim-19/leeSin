/* ============================================================================
 *  main.js  —  orchestration: webcam, HUD, guided trial, finale, note cadence,
 *  event handling, and the single requestAnimationFrame game loop that ties
 *  scene / gestures / abilities / audio together.
 * ==========================================================================*/
import * as SCENE from './scene.js';
import * as GES from './gestures.js';
import * as AB from './abilities.js';
import * as AUDIO from './audio.js';
import { CFG } from './config.js';
import { midGameNotes, milestoneNotes, finaleLetter } from './messages.js';

const { THREE } = SCENE;
const $ = (id) => document.getElementById(id);
const clamp = SCENE.clamp, lerp = SCENE.lerp;

/* signal the HTML watchdog that modules loaded & are running */
window.__eyeStarted = true;

/* ── DOM ─────────────────────────────────────────────────────────────────*/
const video = $('webcam');
const el = {
  hud: $('hud'), score: $('score'), combo: $('combo'), wave: $('wave'), orbs: $('orbs-left'),
  coach: $('coach'), note: $('note'), fps: $('fps-hint'),
  intro: $('intro'), trialPanel: $('trial-panel'), trialSkip: $('trial-skip'),
  finale: $('finale'), finaleText: $('finale-text'),
};
const abilEls = {};
document.querySelectorAll('.ability').forEach((e) => abilEls[e.dataset.ab] = e);

/* ── HUD helpers ─────────────────────────────────────────────────────────*/
function refreshScoreHud() {
  el.score.textContent = AB.Game.score;
  el.combo.textContent = 'x' + AB.Game.combo;
  el.wave.textContent = Math.max(1, AB.Game.wave);
  el.orbs.textContent = 'Orbs ' + AB.Game.orbsLeft;
}
function setAbilityUnlocked(ab) { const e = abilEls[ab]; if (e) e.classList.remove('locked'); }
function flashAbility(ab) {
  const e = abilEls[ab]; if (!e) return;
  e.classList.add('fired', 'ready');
  clearTimeout(e._t); e._t = setTimeout(() => e.classList.remove('fired'), 260);
}
function setCooldown(ab, frac) {
  const e = abilEls[ab]; if (!e) return;
  e.querySelector('.cd').style.setProperty('--cd', (frac * 100) + '%');
  e.classList.toggle('ready', frac <= 0);
}

let coachTimer = 0;
function coach(text, hold = 3) {
  if (!text) { el.coach.classList.remove('show'); coachTimer = 0; return; }
  el.coach.textContent = text; el.coach.classList.add('show'); coachTimer = hold;
}

/* ── personal messages (from messages.js) ────────────────────────────────*/
let noteTimer = SCENE.randRange(CFG.notes.intervalMin, CFG.notes.intervalMax);
let noteIdx = 0;
const shownMilestones = {};
function showNote(text) {
  if (!text) return;
  el.note.textContent = text; el.note.classList.add('show');
  clearTimeout(el.note._t);
  el.note._t = setTimeout(() => el.note.classList.remove('show'), CFG.notes.holdMs);
}
function nextAmbientNote() {
  showNote(midGameNotes[noteIdx % midGameNotes.length]); noteIdx++;
  noteTimer = SCENE.randRange(CFG.notes.intervalMin, CFG.notes.intervalMax);
}
function milestoneNote(key) {
  // firstUltimate shows once; comboX5 / waveCleared may recur.
  if (key === 'firstUltimate') { if (shownMilestones[key]) return; shownMilestones[key] = true; }
  showNote(milestoneNotes[key] || midGameNotes[noteIdx++ % midGameNotes.length]);
}

/* ── drain gameplay events emitted by abilities.js ───────────────────────*/
function handleEvents() {
  for (const ev of AB.drainEvents()) {
    if (ev.type === 'fired') flashAbility(ev.ab);
    else if (ev.type === 'coach') coach(ev.text, ev.hold);
    else if (ev.type === 'milestone') milestoneNote(ev.key);
    else if (ev.type === 'finale') enterFinale();
  }
}

/* ── guided trial (mandatory; teaches then unlocks each gesture) ──────────*/
const TRIAL = [
  { ab: 'Q',  key: '[Q]',  name: 'Sonic Wave',        desc: 'Extend your index finger and FLICK it forward, like loosing an arrow of sound.',       detect: GES.detectFlick },
  { ab: 'Q2', key: '[Q2]', name: 'Resonating Strike', desc: 'After a Sonic Wave: make a FIST, hold a beat, then open your hand to dash in.',         detect: GES.detectFistRelease },
  { ab: 'W',  key: '[W]',  name: 'Safeguard',         desc: 'Bring an OPEN PALM to the center of your chest to raise a protective aura.',            detect: GES.detectPalmChest },
  { ab: 'E',  key: '[E]',  name: 'Tempest',           desc: 'With BOTH open palms in view, push them briskly APART to release a shockwave.',         detect: GES.detectPushApart },
  { ab: 'R',  key: '[R]',  name: "Dragon's Rage",     desc: 'Bring BOTH FISTS together, then THRUST them forward to unleash the dragon.',            detect: GES.detectFistsThrust },
];
let trialActive = false, trialIndex = 0, trialDemo = 0;

function buildPips() {
  const p = $('trial-pips'); p.innerHTML = '';
  TRIAL.forEach(() => { const d = document.createElement('div'); d.className = 'trial-pip'; p.appendChild(d); });
}
function updatePips() {
  const pips = $('trial-pips').children;
  for (let i = 0; i < pips.length; i++)
    pips[i].className = 'trial-pip' + (i < trialIndex ? ' done' : i === trialIndex ? ' active' : '');
}
function loadTrialStep() {
  const s = TRIAL[trialIndex];
  $('trial-step').textContent = 'Trial ' + (trialIndex + 1) + ' / ' + TRIAL.length;
  $('trial-name').innerHTML = s.name + ' <span id="trial-key">' + s.key + '</span>';
  $('trial-desc').textContent = s.desc;
  const st = $('trial-status'); st.textContent = 'Watch the ghost hand, then try it…'; st.classList.remove('done');
  updatePips(); trialDemo = 0; GES.resetDetectors();
}
function beginTrial() {
  trialActive = true; trialIndex = 0;
  el.trialPanel.classList.add('show'); el.trialSkip.style.display = 'block';
  buildPips(); loadTrialStep();
}
function advanceTrial() {
  const s = TRIAL[trialIndex];
  AB.setUnlocked(s.ab); setAbilityUnlocked(s.ab);
  const st = $('trial-status'); st.textContent = '✓ ' + s.name + ' learned'; st.classList.add('done');
  SCENE.particles.burst(0, 0, 60, { color: [0.4, 0.9, 1], speed: SCENE.randRange(3, 8) });
  SCENE.bumpSigilPulse(0.8);
  trialIndex++;
  if (trialIndex >= TRIAL.length) setTimeout(endTrial, 900);
  else setTimeout(loadTrialStep, 950);
}
function endTrial() {
  trialActive = false; SCENE.hideGhost();
  el.trialPanel.classList.remove('show'); el.trialSkip.style.display = 'none';
  startFreePlay();
}
function skipTrialStep() {
  const s = TRIAL[trialIndex];
  AB.setUnlocked(s.ab); setAbilityUnlocked(s.ab);
  trialIndex++;
  if (trialIndex >= TRIAL.length) endTrial(); else loadTrialStep();
}
function updateTrial(dt, now) {
  if (!trialActive) return;
  trialDemo += dt;
  const s = TRIAL[trialIndex];
  SCENE.poseGhost((trialDemo % 2.4) / 2.4, s.ab);
  if (trialDemo > 1.2 && s.detect(now)) advanceTrial();
}

/* ── finale (calm scene, once per session) ───────────────────────────────*/
let finaleState = 0; // 0 none · 1 settling · 2 letter shown
function enterFinale() {
  if (finaleState) return;
  finaleState = 1; SCENE.triggerSlowmo(6); coach('', 0);
  setTimeout(() => { el.finaleText.textContent = finaleLetter.trim(); el.finale.classList.add('show'); finaleState = 2; }, 2600);
}

/* ── mode flow ───────────────────────────────────────────────────────────*/
let mode = 'intro'; // intro · trial · play
function startFreePlay() {
  mode = 'play'; el.hud.classList.add('show');
  AB.startWaves(); SCENE.seedAmbient();
  coach("The orbs are coming — use what you've learned", 3);
  setTimeout(nextAmbientNote, 4000);
}

$('btn-begin').addEventListener('click', () => {
  el.intro.classList.add('hidden'); AUDIO.resumeAudio(); mode = 'trial'; beginTrial();
});
$('btn-skip-trial').addEventListener('click', () => {
  el.intro.classList.add('hidden');
  for (const s of TRIAL) { AB.setUnlocked(s.ab); setAbilityUnlocked(s.ab); }
  startFreePlay();
});
el.trialSkip.addEventListener('click', skipTrialStep);
AUDIO.initAudioPicker($('audio-file'), $('audio-status'));

/* ── webcam ──────────────────────────────────────────────────────────────*/
async function initWebcam() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }, audio: false,
    });
    video.srcObject = stream; await video.play();
    const tex = new THREE.VideoTexture(video); tex.colorSpace = THREE.SRGBColorSpace;
    SCENE.setVideoTexture(tex);
    return true;
  } catch (e) { console.warn('Webcam unavailable:', e); return false; }
}

/* ── main loop ───────────────────────────────────────────────────────────*/
let last = performance.now() / 1000, time = 0, fpsAccum = 0, fpsFrames = 0;

function loop() {
  requestAnimationFrame(loop);
  const now = performance.now() / 1000;
  let dt = Math.min(0.05, now - last); last = now; time += dt;

  const slow = SCENE.getSlowmo() > 0;
  const gdt = dt * (slow ? 0.35 : 1) * (finaleState ? 0.5 : 1);

  GES.analyzeHands(dt, now); // real dt: keep hand velocities accurate under slow-mo
  AUDIO.updateAudio(dt);
  const beat = AUDIO.getBeat();

  SCENE.updateBackground(time, video);

  // hand visuals (chi ribbons + palm glow), mapping z-depth into the scene
  for (let i = 0; i < 2; i++) {
    const st = GES.handState[i], rb = SCENE.ribbons[i], glow = SCENE.handGlows[i];
    if (st.present) {
      const tip = st.lm[8], w = SCENE.normToWorld(tip.x, tip.y);
      rb.push(w.x, w.y, clamp(-tip.z * 4, -2, 2));
      const pw = SCENE.normToWorld(st.palm.x, st.palm.y);
      glow.visible = true; glow.position.set(pw.x, pw.y, 0.15);
      const openness = GES.extendedCount(st.lm) / 5;
      glow.scale.setScalar(0.6 + openness * 0.8 + beat * 0.3);
      glow.material.opacity = 0.25 + openness * 0.35;
    } else { rb.clear(); glow.visible = false; }
    rb.setPulse(time, beat); rb.update();
  }

  if (mode === 'trial') updateTrial(dt, now);
  if (mode === 'play') {
    if (!finaleState) AB.tryGestures(gdt, now);
    AB.updateAbilities(gdt, now);
    handleEvents();
    refreshScoreHud();
    for (const k of ['Q', 'Q2', 'W', 'E', 'R']) {
      if (AB.cd[k] > 0) AB.cd[k] -= dt;
      if (AB.unlocked[k]) setCooldown(k, clamp(AB.cd[k] / AB.COOLDOWN[k], 0, 1));
    }
    if (!finaleState) { noteTimer -= dt; if (noteTimer <= 0) nextAmbientNote(); }
  }

  // sigil
  SCENE.sigilUniforms.uTime.value = time;
  SCENE.sigilUniforms.uPulse.value = Math.max(0, SCENE.sigilUniforms.uPulse.value - dt * 1.5) + beat * 0.3;
  const openTarget = mode === 'intro' ? 0.15 : (finaleState ? 1.0 : 0.4);
  SCENE.sigilUniforms.uOpen.value = lerp(SCENE.sigilUniforms.uOpen.value, openTarget, dt * (finaleState ? 0.6 : 2));
  SCENE.sigilUniforms.uIntensity.value = lerp(SCENE.sigilUniforms.uIntensity.value, finaleState ? 1.1 : 0.6, dt);
  SCENE.sigil.rotation.z += dt * (finaleState ? 0.05 : 0.15);

  // particles
  SCENE.particles.update(dt, slow || finaleState > 0);
  SCENE.ambient.update(dt, finaleState > 0);
  if (mode !== 'intro' && !finaleState) SCENE.ambientTick();

  // coach fade timer
  if (coachTimer > 0) { coachTimer -= dt; if (coachTimer <= 0) coach('', 0); }

  // bloom driven by audio + ability/finale pulses
  const bloomBase = finaleState ? CFG.bloom.finale : CFG.bloom.base;
  SCENE.bloom.strength = lerp(SCENE.bloom.strength,
    bloomBase + beat * 0.9 + AUDIO.getLevel() * 0.6 + SCENE.sigilUniforms.uPulse.value * 0.5, 0.2);
  SCENE.bloom.radius = CFG.bloom.radius + beat * 0.2;

  SCENE.tickFx(dt);
  SCENE.render();

  fpsAccum += dt; fpsFrames++;
  if (fpsAccum > 0.5) { el.fps.textContent = Math.round(fpsFrames / fpsAccum) + ' FPS · ' + GES.getHandCount() + ' hand(s)'; fpsAccum = 0; fpsFrames = 0; }
}

/* ── boot ────────────────────────────────────────────────────────────────*/
async function boot() {
  $('lmsg').textContent = 'Opening the eye…';
  const cam = await initWebcam();
  GES.initHands(video);
  GES.pumpHands();
  $('loader').style.display = 'none';
  if (!cam) setTimeout(() => coach('No webcam — grant camera access, then reload', 8), 1500);
  loop();
}
boot();
