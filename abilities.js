/* ============================================================================
 *  abilities.js  —  direct chi combat.
 *
 *    Open hand  → sweeping aura: pushes orbs back + chips them (crowd control)
 *    Closed fist→ strike core:   shatters orbs on contact (damage)
 *    Both fists together (when charged) → DRAGON'S RAGE: clears the field,
 *                                          screen shake + slow-mo + big score.
 *
 *  Orbs (Matter.js bodies) seek your core at center. Let one reach it and the
 *  core takes damage (it regenerates — this is forgiving, no hard game-over).
 *  Kills build combo, combo feels good, kills charge the ultimate.
 *
 *  Emits events for the HUD: {type:'fired',ab} {type:'milestone',key}
 *  {type:'coach',text,hold} {type:'coreHit'} {type:'ult'} {type:'finale'}
 * ==========================================================================*/
import { CFG } from './config.js';
import {
  THREE, scene, particles, normToWorld, worldHalf,
  addShake, triggerSlowmo, bumpSigilPulse, setCoreHealth, flashCore,
  dist2, clamp, lerp, randRange,
} from './scene.js';
import { handState, bothFistsTogether } from './gestures.js';

const Matter = window.Matter;
const O = CFG.orbs, PPU = CFG.physics.ppu;

export const Game = {
  score: 0, combo: 1, comboTimer: 0, wave: 0, orbsLeft: 0,
  coreHp: CFG.core.hp, ultCharge: 0, ultimatesUsed: 0,
  finaleTriggered: false, running: false, unlocked: false,
};
const events = [];
export function drainEvents() { const e = events.slice(); events.length = 0; return e; }
function emit(ev) { events.push(ev); }
export function unlockPlay() { Game.unlocked = true; }

/* ── scoring / combo / charge ────────────────────────────────────────────*/
function registerKill(x, y) {
  Game.score += Math.round(CFG.scoring.kill * Game.combo);
  Game.combo = Math.min(CFG.scoring.comboMax, Game.combo + 1);
  Game.comboTimer = CFG.scoring.comboDecay;
  if (Game.combo === 5) emit({ type: 'milestone', key: 'comboX5' });
  Game.ultCharge = Math.min(CFG.ult.chargeMax, Game.ultCharge + CFG.ult.chargePerKill);
  particles.burst(x, y, 34, { color: [1, 0.7, 0.35], speed: randRange(3, 8), life: randRange(0.4, 1.0) });
  particles.burst(x, y, 12, { color: [0.4, 0.9, 1], speed: randRange(4, 9) });
}
function breakCombo() { Game.combo = 1; }

/* ── Matter world ────────────────────────────────────────────────────────*/
const engine = Matter.Engine.create();
engine.gravity.x = 0; engine.gravity.y = 0;
const mWorld = engine.world;
const w2m = (x, y) => ({ x: x * PPU, y: -y * PPU });
const m2w = (x, y) => ({ x: x / PPU, y: -y / PPU });
let orbs = [];

class Orb {
  constructor(x, y, r, hp) {
    this.r = r; this.hp = hp; this.maxHp = hp; this.dead = false; this.chipT = 0;
    const p = w2m(x, y);
    this.body = Matter.Bodies.circle(p.x, p.y, r * PPU, { frictionAir: CFG.physics.frictionAir, restitution: 0.85 });
    Matter.World.add(mWorld, this.body);
    const grp = new THREE.Group();
    this.core = new THREE.Mesh(new THREE.SphereGeometry(r * 0.5, 14, 14), new THREE.MeshBasicMaterial({ color: CFG.colors.orb }));
    this.shellMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uHp: { value: 0 } }, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      vertexShader: `varying vec3 vN; varying vec3 vP; void main(){ vN=normalize(normalMatrix*normal); vec4 mv=modelViewMatrix*vec4(position,1.0); vP=mv.xyz; gl_Position=projectionMatrix*mv; }`,
      fragmentShader: `varying vec3 vN; varying vec3 vP; uniform float uTime,uHp;
        void main(){ float fres=pow(1.0-abs(dot(normalize(vN),normalize(-vP))),2.0);
          vec3 c=mix(vec3(1.0,0.8,0.3),vec3(1.0,0.4,0.2),uHp);
          gl_FragColor=vec4(c*fres*(1.6+0.5*sin(uTime*3.0))*2.0, fres*0.9); }`,
    });
    this.shell = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 18), this.shellMat);
    grp.add(this.core, this.shell); this.group = grp; scene.add(grp);
  }
  get pos() { return m2w(this.body.position.x, this.body.position.y); }
  damage(n, byPlayer) {
    this.hp -= n; const p = this.pos;
    particles.burst(p.x, p.y, 6, { color: [1, 0.6, 0.3], speed: randRange(2, 5), life: 0.4 });
    if (this.hp <= 0 && !this.dead) { this.dead = true; if (byPlayer) registerKill(p.x, p.y); }
  }
  push(fromX, fromY, mag) {
    const p = this.pos; let dx = p.x - fromX, dy = p.y - fromY; const L = Math.hypot(dx, dy) || 1;
    Matter.Body.setVelocity(this.body, { x: (dx / L) * mag, y: -(dy / L) * mag });
  }
  steer(dt, speed) {
    const p = this.pos; const L = Math.hypot(p.x, p.y) || 1;
    const jx = -p.y / L * O.jitter, jy = p.x / L * O.jitter;
    const desX = (-p.x / L) * speed + jx * Math.sin(p.x * 2 + p.y);
    const desY = (-p.y / L) * speed + jy * Math.cos(p.y * 2 - p.x);
    const v = this.body.velocity;
    Matter.Body.setVelocity(this.body, { x: lerp(v.x, desX, dt * 1.5), y: lerp(v.y, -desY, dt * 1.5) });
  }
  dispose() { Matter.World.remove(mWorld, this.body); scene.remove(this.group); this.core.geometry.dispose(); this.shell.geometry.dispose(); this.shellMat.dispose(); }
  update(now) {
    const p = this.pos; this.group.position.set(p.x, p.y, 0);
    this.shellMat.uniforms.uTime.value = now; this.shellMat.uniforms.uHp.value = 1 - this.hp / this.maxHp;
  }
}

/* ── ultimate: Dragon's Rage ─────────────────────────────────────────────*/
let ultCd = 0;
function releaseUlt() {
  const mesh = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.5, 64),
    new THREE.MeshBasicMaterial({ color: CFG.colors.gold, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  scene.add(mesh); shockwaves.push({ mesh, mat: mesh.material, r: 0.4, maxR: 12, speed: 22 });
  for (const o of orbs) if (!o.dead) { const p = o.pos; o.dead = true; registerKill(p.x, p.y); }
  addShake(1.0); triggerSlowmo(1.2); bumpSigilPulse(1.4);
  Game.ultCharge = 0; ultCd = 1.5; Game.ultimatesUsed++;
  Game.score += CFG.ult.score;
  emit({ type: 'ult' });
  if (Game.ultimatesUsed === 1) emit({ type: 'milestone', key: 'firstUltimate' });
}
const shockwaves = [];

/* ── waves ───────────────────────────────────────────────────────────────*/
let waveActive = false, betweenTimer = 0;
export function startWaves() { Game.running = true; Game.wave = 0; waveActive = false; betweenTimer = CFG.waves.firstDelay; }
function seekSpeed() { return Math.min(O.seekMax, O.seekBase + (Game.wave - 1) * O.seekPerWave); }
function spawnWave(n) {
  const h = worldHalf(), R = Math.hypot(h.w, h.h) + 1;
  const hp = O.hpBase + Math.floor((Game.wave - 1)) * O.hpPerWave;
  for (let i = 0; i < n; i++) {
    const a = randRange(0, Math.PI * 2);
    orbs.push(new Orb(Math.cos(a) * R, Math.sin(a) * R, randRange(O.rMin, O.rMax), hp));
  }
  waveActive = true;
}

/* ── per-frame update ────────────────────────────────────────────────────*/
export function updateAbilities(dt, now) {
  if (Game.comboTimer > 0) { Game.comboTimer -= dt; if (Game.comboTimer <= 0) breakCombo(); }

  // core regen
  Game.coreHp = clamp(Game.coreHp + CFG.core.regen * dt, 0, CFG.core.hp);
  setCoreHealth(Game.coreHp / CFG.core.hp);

  // ultimate
  if (ultCd > 0) ultCd -= dt;
  if (Game.ultCharge >= CFG.ult.chargeMax && ultCd <= 0 && !Game.finaleTriggered && bothFistsTogether()) { releaseUlt(); emit({ type: 'fired', ab: 'R' }); }

  Matter.Engine.update(engine, Math.min(33, dt * 1000));

  const sp = seekSpeed();
  for (const o of orbs) { if (!o.dead) o.steer(dt, sp); o.update(now); }

  // hand-vs-orb collisions
  for (let hi = 0; hi < 2; hi++) {
    const st = handState[hi]; if (!st.present) continue;
    const hw = normToWorld(st.x, st.y);
    const fist = st.fist, rad = fist ? CFG.hands.fistRadius : CFG.hands.openRadius;
    for (const o of orbs) {
      if (o.dead) continue;
      const d = dist2(o.pos, hw);
      if (fist) {
        if (d < rad + o.r) {
          o.damage(O.fistDamage, true);
          o.push(hw.x, hw.y, 8);
          if (st.justClosed) { addShake(0.12); }
        }
      } else if (d < rad + o.r) {
        o.push(hw.x, hw.y, O.sweepPush);
        if (now - o.chipT > O.sweepChipCd) { o.chipT = now; o.damage(O.sweepChip, true); }
      }
    }
  }

  // orbs reaching the core
  for (const o of orbs) {
    if (o.dead) continue;
    const p = o.pos;
    if (Math.hypot(p.x, p.y) < CFG.core.radius + o.r * 0.4) {
      o.dead = true;
      Game.coreHp = Math.max(0, Game.coreHp - CFG.core.orbDamage);
      Game.combo = 1;
      flashCore(); addShake(0.28);
      particles.burst(p.x, p.y, 26, { color: [1, 0.25, 0.32], speed: randRange(3, 7) });
      emit({ type: 'coreHit' });
    }
  }

  // reap dead orbs
  orbs = orbs.filter((o) => { if (o.dead) { o.dispose(); return false; } return true; });
  Game.orbsLeft = orbs.length;

  // shockwaves (ult ring)
  for (const s of shockwaves) { s.r += s.speed * dt; s.mesh.scale.setScalar(s.r); s.mat.opacity = clamp(1 - s.r / s.maxR, 0, 1); if (s.r >= s.maxR) s.dead = true; }
  for (let i = shockwaves.length - 1; i >= 0; i--) if (shockwaves[i].dead) { scene.remove(shockwaves[i].mesh); shockwaves.splice(i, 1); }

  // wave lifecycle
  if (Game.finaleTriggered) return;
  if (waveActive && orbs.length === 0) {
    waveActive = false; betweenTimer = CFG.waves.betweenWaves;
    emit({ type: 'milestone', key: 'waveCleared' });
    if (Game.wave >= CFG.waves.finaleWave || Game.score >= CFG.waves.finaleScore) {
      Game.finaleTriggered = true; for (const o of orbs) o.dead = true; emit({ type: 'finale' }); return;
    }
    emit({ type: 'coach', text: 'Wave ' + Game.wave + ' cleared — breathe', hold: 2.4 });
  }
  if (!waveActive && betweenTimer > 0) {
    betweenTimer -= dt;
    if (betweenTimer <= 0) {
      Game.wave++;
      emit({ type: 'coach', text: 'Wave ' + Game.wave + ' — open hand to sweep, fist to shatter', hold: 2.6 });
      spawnWave(CFG.waves.baseCount + Math.floor(Game.wave * CFG.waves.perWave));
    }
  }
}
