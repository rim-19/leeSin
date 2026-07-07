/* ============================================================================
 *  abilities.js  —  Lee Sin's kit as gesture-driven effects, plus the orb
 *  physics (Matter.js), scoring/combo system, and escalating wave counter.
 *
 *  Gesture → ability:
 *    Q  Sonic Wave        point + flick
 *    Q2 Resonating Strike fist-hold-then-release within comboWindow of a Q
 *    W  Safeguard         open palm to chest
 *    E  Tempest           two open palms pushed apart
 *    R  Dragon's Rage     both fists together, then thrust (shake + slow-mo)
 *
 *  Emits events (drainEvents) the HUD/orchestrator reacts to:
 *    {type:'fired', ab}  {type:'milestone', key}  {type:'coach', text, hold}
 *    {type:'finale'}
 * ==========================================================================*/
import { CFG } from './config.js';
import {
  THREE, scene, particles, makeChiMaterial, normToWorld, worldHalf,
  addShake, triggerSlowmo, bumpSigilPulse, dist2, clamp, lerp, randRange,
} from './scene.js';
import {
  handState, isFist, isPointing, isOpenPalm, extendedCount,
} from './gestures.js';

const Matter = window.Matter;
const G = CFG.gesture;
const PPU = CFG.physics.ppu;

/* ── shared game state (read by the HUD) ─────────────────────────────────*/
export const Game = {
  score: 0, combo: 1, comboTimer: 0, wave: 0, orbsLeft: 0,
  ultimatesUsed: 0, finaleTriggered: false, running: false,
};
export const unlocked = { Q: false, Q2: false, W: false, E: false, R: false };
export const COOLDOWN = CFG.cooldowns;
export const cd = { Q: 0, Q2: 0, W: 0, E: 0, R: 0 };
export function setUnlocked(ab) { unlocked[ab] = true; }

const events = [];
export function drainEvents() { const e = events.slice(); events.length = 0; return e; }
function emit(ev) { events.push(ev); }

/* ── scoring / combo ─────────────────────────────────────────────────────*/
function addScore(base) {
  Game.score += Math.round(base * Game.combo);
  Game.combo = Math.min(CFG.scoring.comboMax, Game.combo + 1);
  Game.comboTimer = CFG.scoring.comboDecay;
  if (Game.combo === 5) emit({ type: 'milestone', key: 'comboX5' });
}
function breakCombo() { Game.combo = 1; }

/* ── Matter.js physics world ─────────────────────────────────────────────*/
const engine = Matter.Engine.create();
engine.gravity.x = 0; engine.gravity.y = 0;
const mWorld = engine.world;
const w2m = (x, y) => ({ x: x * PPU, y: -y * PPU });
const m2w = (x, y) => ({ x: x / PPU, y: -y / PPU });

let orbs = [];

class Orb {
  constructor(x, y, r, hp) {
    this.r = r; this.hp = hp; this.maxHp = hp; this.dead = false; this.marked = false; this.markT = 0; this._hitBy = null;
    const p = w2m(x, y);
    this.body = Matter.Bodies.circle(p.x, p.y, r * PPU, { frictionAir: CFG.physics.frictionAir, restitution: 0.9 });
    Matter.Body.setVelocity(this.body, { x: randRange(-2, 2), y: randRange(-2, 2) });
    Matter.World.add(mWorld, this.body);

    const grp = new THREE.Group();
    this.core = new THREE.Mesh(new THREE.SphereGeometry(r * 0.55, 16, 16), new THREE.MeshBasicMaterial({ color: CFG.colors.orb }));
    this.shellMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uHp: { value: 1 } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      vertexShader: `varying vec3 vN; varying vec3 vP; void main(){ vN=normalize(normalMatrix*normal); vec4 mv=modelViewMatrix*vec4(position,1.0); vP=mv.xyz; gl_Position=projectionMatrix*mv; }`,
      fragmentShader: `varying vec3 vN; varying vec3 vP; uniform float uTime,uHp;
        void main(){ float fres=pow(1.0-abs(dot(normalize(vN),normalize(-vP))),2.0);
          vec3 hot=vec3(1.0,0.45,0.2), cool=vec3(1.0,0.8,0.3);
          vec3 c=mix(cool,hot,uHp); float p=0.6+0.4*sin(uTime*3.0);
          gl_FragColor=vec4(c*fres*p*2.0, fres*0.9); }`,
    });
    this.shell = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 20), this.shellMat);
    this.markRing = new THREE.Mesh(new THREE.RingGeometry(r * 1.2, r * 1.35, 24),
      new THREE.MeshBasicMaterial({ color: CFG.colors.gold, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    grp.add(this.core); grp.add(this.shell); grp.add(this.markRing);
    this.group = grp; scene.add(grp);
  }
  get pos() { return m2w(this.body.position.x, this.body.position.y); }
  damage(n) {
    this.hp -= n; const p = this.pos;
    particles.burst(p.x, p.y, 14, { color: [1, 0.6, 0.3], speed: randRange(2, 5) });
    if (this.hp <= 0) this.kill();
  }
  mark() { this.marked = true; this.markT = 0; }
  push(fx, fy, mag) { Matter.Body.applyForce(this.body, this.body.position, { x: fx * mag, y: -fy * mag }); }
  kill() {
    if (this.dead) return; this.dead = true; const p = this.pos;
    particles.burst(p.x, p.y, 40, { color: [1, 0.7, 0.35], speed: randRange(3, 8), life: randRange(0.5, 1.2) });
    particles.burst(p.x, p.y, 16, { color: [0.4, 0.9, 1], speed: randRange(4, 9) });
  }
  dispose() {
    Matter.World.remove(mWorld, this.body); scene.remove(this.group);
    this.core.geometry.dispose(); this.shell.geometry.dispose(); this.shellMat.dispose();
  }
  update(dt, now) {
    const p = this.pos; this.group.position.set(p.x, p.y, 0);
    this.shellMat.uniforms.uTime.value = now;
    this.shellMat.uniforms.uHp.value = 1 - this.hp / this.maxHp;
    this.core.material.color.setHSL(lerp(0.02, 0.09, this.hp / this.maxHp), 1, 0.55);
    if (this.marked) {
      this.markRing.material.opacity = 0.6 + 0.4 * Math.sin(now * 6);
      this.markRing.rotation.z += dt * 2;
    } else this.markRing.material.opacity = 0;
    // soft bounce off view edges
    const h = worldHalf(), b = this.body, v = b.velocity;
    if (p.x < -h.w && v.x < 0) Matter.Body.setVelocity(b, { x: -v.x, y: v.y });
    if (p.x >  h.w && v.x > 0) Matter.Body.setVelocity(b, { x: -v.x, y: v.y });
    if (p.y < -h.h && v.y > 0) Matter.Body.setVelocity(b, { x: v.x, y: -v.y });
    if (p.y >  h.h && v.y < 0) Matter.Body.setVelocity(b, { x: v.x, y: -v.y });
  }
}

function nearestOrb(w) {
  let best = null, bd = 1e9;
  for (const o of orbs) { if (o.dead) continue; const d = dist2(o.pos, w); if (d < bd) { bd = d; best = o; } }
  return best;
}

/* ── projectiles / shockwaves / shield ───────────────────────────────────*/
const projectiles = [], shockwaves = [];
let shield = null;
let lastSonicTime = -99, sonicMarkedOrb = null;

function fireSonicWave(x, y, dx, dy, opts = {}) {
  const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.5), makeChiMaterial(opts.color || CFG.colors.cyan));
  mesh.position.set(x, y, 0.1); mesh.rotation.z = Math.atan2(dy, dx); scene.add(mesh);
  const proj = { mesh, mat: mesh.material, x, y, dirx: dx, diry: dy, speed: opts.speed || 16, life: 1.1, dead: false, dmg: opts.dmg || 1, mark: opts.mark !== false };
  projectiles.push(proj);
  particles.burst(x, y, 18, { color: [0.4, 0.9, 1], angle: Math.atan2(dy, dx), speed: 6 });
  return proj;
}
function spawnShockwave(x, y, opts = {}) {
  const mesh = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.45, 64),
    new THREE.MeshBasicMaterial({ color: opts.color || CFG.colors.cyan, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  mesh.position.set(x, y, 0.05); scene.add(mesh);
  shockwaves.push({ mesh, mat: mesh.material, x, y, r: 0.3, maxR: opts.maxR || 4.5, speed: opts.speed || 9, force: opts.force || 0.02, damage: opts.damage || 0, dead: false });
  particles.burst(x, y, 30, { color: opts.spark || [0.4, 0.9, 1], speed: randRange(3, 7) });
}
function makeShield() {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: `varying vec3 vN; varying vec3 vP; void main(){ vN=normalize(normalMatrix*normal); vec4 mv=modelViewMatrix*vec4(position,1.0); vP=mv.xyz; gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `varying vec3 vN; varying vec3 vP; uniform float uTime;
      void main(){ float fres=pow(1.0-abs(dot(normalize(vN),normalize(-vP))),3.0);
        float hex=0.5+0.5*sin((vP.x+vP.y)*8.0+uTime*3.0);
        gl_FragColor=vec4(vec3(0.94,0.75,0.38)*(fres*2.0+hex*0.3), fres*0.8+0.05); }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1.4, 32, 32), mat);
  mesh.visible = false; scene.add(mesh);
  return { mesh, mat, until: 0 };
}

/* ── ability casts ───────────────────────────────────────────────────────*/
function castResonatingStrike(st) {
  const from = normToWorld(st.palm.x, st.palm.y);
  let target = (sonicMarkedOrb && !sonicMarkedOrb.dead) ? sonicMarkedOrb : nearestOrb(from);
  if (target) {
    const p = target.pos;
    fireSonicWave(from.x, from.y, p.x - from.x, p.y - from.y, { speed: 40, color: 0xffe08a, mark: false });
    target.damage(3); addScore(CFG.scoring.resonate); addShake(0.25);
    particles.burst(p.x, p.y, 50, { color: [1, 0.85, 0.4], speed: randRange(4, 10) });
  } else addScore(40);
  emit({ type: 'coach', text: '', hold: 0 });
}
function castSafeguard() {
  if (!shield) shield = makeShield();
  shield.until = performance.now() / 1000 + 3.5; shield.mesh.visible = true;
  particles.burst(0, -1, 40, { color: [0.94, 0.75, 0.38], speed: randRange(1, 4) });
  addScore(CFG.scoring.safeguard);
}
function castTempest(x, y) {
  spawnShockwave(x, y, { maxR: 4.6, speed: 10, force: 0.05, damage: 1, color: CFG.colors.cyan, spark: [0.4, 0.9, 1] });
  addShake(0.18);
}
function castDragonsRage(x, y) {
  spawnShockwave(x, y, { maxR: 8, speed: 14, force: 0.16, damage: 2, color: CFG.colors.gold, spark: [1, 0.8, 0.4] });
  spawnShockwave(x, y, { maxR: 6, speed: 11, force: 0.10, damage: 1, color: 0xff7a3c, spark: [1, 0.5, 0.3] });
  addShake(0.9); triggerSlowmo(1.1); bumpSigilPulse(1.2);
  Game.ultimatesUsed++; addScore(CFG.scoring.ultimate);
  if (Game.ultimatesUsed === 1) emit({ type: 'milestone', key: 'firstUltimate' });
}

/* ── gesture → ability driver (call once per frame) ──────────────────────*/
let twoHandPrevDist = null, bothFistSince = 0;

export function tryGestures(dt, now) {
  const a = handState[0], b = handState[1];
  const both = a.present && b.present;

  // Q — Sonic Wave: point + flick
  if (unlocked.Q && cd.Q <= 0) {
    for (const st of handState) {
      if (st.present && isPointing(st.lm) && Math.hypot(st.idxVel.x, st.idxVel.y) > G.flickSpeed) {
        const tip = st.lm[8];
        const w = normToWorld(tip.x, tip.y);
        const to = normToWorld(tip.x + st.idxVel.x, tip.y + st.idxVel.y);
        fireSonicWave(w.x, w.y, to.x - w.x, to.y - w.y);
        lastSonicTime = now; sonicMarkedOrb = null;
        cd.Q = COOLDOWN.Q; emit({ type: 'fired', ab: 'Q' });
        if (unlocked.Q2) emit({ type: 'coach', text: 'FIST then release — Resonating Strike', hold: 2.4 });
        break;
      }
    }
  }

  // Q2 — Resonating Strike: fist-hold-release within comboWindow of a Q
  if (unlocked.Q2 && cd.Q2 <= 0 && (now - lastSonicTime) < G.comboWindow) {
    for (const st of handState) {
      if (!st.present) continue;
      if (st.fistSince && (now - st.fistSince) > G.fistHoldMin) st.releaseArmed = true;
      if (st.releaseArmed && !isFist(st.lm) && extendedCount(st.lm) >= 3) {
        castResonatingStrike(st); st.releaseArmed = false;
        cd.Q2 = COOLDOWN.Q2; emit({ type: 'fired', ab: 'Q2' });
        break;
      }
    }
  }

  // W — Safeguard: open palm to chest
  if (unlocked.W && cd.W <= 0) {
    for (const st of handState) {
      if (st.present && isOpenPalm(st.lm) && st.palm.y > G.chestY && Math.abs(st.palm.x - 0.5) < G.chestX
          && st.openSince && (now - st.openSince) > 0.35) {
        castSafeguard(); cd.W = COOLDOWN.W; emit({ type: 'fired', ab: 'W' }); break;
      }
    }
  }

  // E — Tempest: two open palms pushed apart
  if (unlocked.E && both && cd.E <= 0) {
    if (isOpenPalm(a.lm) && isOpenPalm(b.lm)) {
      const d = dist2(a.palm, b.palm);
      if (twoHandPrevDist != null) {
        const rate = (d - twoHandPrevDist) / Math.max(dt, 0.001);
        if (rate > G.pushApartRate && d > G.pushApartMinDist) {
          const mid = { x: (a.palm.x + b.palm.x) / 2, y: (a.palm.y + b.palm.y) / 2 };
          const w = normToWorld(mid.x, mid.y);
          castTempest(w.x, w.y); cd.E = COOLDOWN.E; emit({ type: 'fired', ab: 'E' });
        }
      }
      twoHandPrevDist = d;
    } else twoHandPrevDist = null;
  } else if (!both) twoHandPrevDist = null;

  // R — Dragon's Rage: both fists together, then thrust
  if (unlocked.R && both && cd.R <= 0) {
    const bothFist = isFist(a.lm) && isFist(b.lm);
    const together = dist2(a.palm, b.palm) < G.fistsTogetherDist;
    if (bothFist && together) {
      if (!bothFistSince) bothFistSince = now;
      const mid = { x: (a.palm.x + b.palm.x) / 2, y: (a.palm.y + b.palm.y) / 2 };
      const w = normToWorld(mid.x, mid.y);
      if ((now - bothFistSince) > 0.15) particles.burst(w.x, w.y, 3, { color: [1, 0.75, 0.35], speed: 1.5, life: 0.4 });
      const thrust = (a.palmVel.z + b.palmVel.z) < G.thrustZ || (Math.abs(a.palmVel.y) + Math.abs(b.palmVel.y)) > G.thrustY;
      if ((now - bothFistSince) > 0.2 && thrust) {
        castDragonsRage(w.x, w.y); bothFistSince = 0; cd.R = COOLDOWN.R; emit({ type: 'fired', ab: 'R' });
      }
    } else bothFistSince = 0;
  }
}

/* ── waves / escalating difficulty ───────────────────────────────────────*/
let waveActive = false, betweenTimer = 0;

export function startWaves() {
  Game.running = true; Game.wave = 0; waveActive = false; betweenTimer = CFG.waves.firstDelay;
}
function spawnWave(n) {
  const h = worldHalf();
  const hp = 1 + Math.floor((Game.wave - 1) * CFG.waves.hpPerWave);
  for (let i = 0; i < n; i++) {
    const edge = Math.floor(Math.random() * 4); let x, y;
    if (edge === 0) { x = -h.w * 0.9; y = randRange(-h.h, h.h); }
    else if (edge === 1) { x = h.w * 0.9; y = randRange(-h.h, h.h); }
    else if (edge === 2) { y = h.h * 0.9; x = randRange(-h.w, h.w); }
    else { y = -h.h * 0.9; x = randRange(-h.w, h.w); }
    orbs.push(new Orb(x, y, randRange(0.35, 0.6), hp));
  }
  waveActive = true;
}

/* ── per-frame ability/orb/wave update (call once per frame while playing) ─*/
export function updateAbilities(dt, now) {
  if (Game.comboTimer > 0) { Game.comboTimer -= dt; if (Game.comboTimer <= 0) breakCombo(); }

  Matter.Engine.update(engine, dt * 1000);
  for (const o of orbs) o.update(dt, now);

  // projectiles
  for (const p of projectiles) {
    p.x += p.dirx * p.speed * dt; p.y += p.diry * p.speed * dt;
    p.mesh.position.set(p.x, p.y, 0.1); p.life -= dt; p.mat.uniforms.uTime.value = now;
    if (p.life <= 0) p.dead = true;
    for (const o of orbs) {
      if (o.dead) continue;
      if (dist2(o.pos, p) < o.r + 0.4) {
        o.damage(p.dmg); o.push(p.dirx, p.diry, 0.05);
        if (p.mark && !sonicMarkedOrb) { sonicMarkedOrb = o; o.mark(); }
        p.dead = true; break;
      }
    }
  }
  for (let i = projectiles.length - 1; i >= 0; i--) if (projectiles[i].dead) { scene.remove(projectiles[i].mesh); projectiles.splice(i, 1); }

  // shockwaves
  for (const s of shockwaves) {
    s.r += s.speed * dt; s.mesh.scale.setScalar(s.r);
    s.mat.opacity = clamp(1 - s.r / s.maxR, 0, 1) * 0.9;
    for (const o of orbs) {
      if (o.dead || o._hitBy === s) continue;
      const p = o.pos, d = dist2(p, s);
      if (Math.abs(d - s.r) < 0.6) {
        let dx = p.x - s.x, dy = p.y - s.y; const L = Math.hypot(dx, dy) || 1;
        o.push(dx / L, dy / L, s.force); if (s.damage) o.damage(s.damage); o._hitBy = s;
      }
    }
    if (s.r >= s.maxR) s.dead = true;
  }
  for (let i = shockwaves.length - 1; i >= 0; i--) if (shockwaves[i].dead) { scene.remove(shockwaves[i].mesh); shockwaves.splice(i, 1); }

  // shield
  if (shield) {
    if (now < shield.until) {
      shield.mesh.visible = true; shield.mat.uniforms.uTime.value = now;
      let anchor = { x: 0, y: -0.6 };
      for (const st of handState) if (st.present && st.palm.y > 0.5) anchor = normToWorld(st.palm.x, st.palm.y);
      shield.mesh.position.set(anchor.x, anchor.y, 0);
    } else shield.mesh.visible = false;
  }

  // reap dead orbs → score
  orbs = orbs.filter((o) => { if (o.dead) { addScore(CFG.scoring.orbKill); o.dispose(); return false; } return true; });
  Game.orbsLeft = orbs.length;

  // wave lifecycle
  if (Game.finaleTriggered) return;
  if (waveActive && orbs.length === 0) {
    waveActive = false; betweenTimer = CFG.waves.betweenWaves;
    emit({ type: 'milestone', key: 'waveCleared' });
    if (Game.wave >= CFG.waves.finaleWave || Game.score >= CFG.waves.finaleScore) {
      Game.finaleTriggered = true; for (const o of orbs) o.kill(); emit({ type: 'finale' }); return;
    }
    emit({ type: 'coach', text: 'Wave ' + Game.wave + ' cleared — breathe', hold: 2.5 });
  }
  if (!waveActive && betweenTimer > 0) {
    betweenTimer -= dt;
    if (betweenTimer <= 0) {
      Game.wave++;
      const tips = ['Point and flick — Sonic Wave', 'Push both palms apart — Tempest', 'Both fists, then thrust — Dragon\'s Rage', 'Palm to your chest — Safeguard'];
      emit({ type: 'coach', text: tips[Game.wave % tips.length], hold: 2.6 });
      spawnWave(CFG.waves.baseCount + Math.floor(Game.wave * CFG.waves.perWave));
    }
  }
}
