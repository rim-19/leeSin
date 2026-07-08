/* ============================================================================
 *  scene.js  —  cinematic Ionia-temple atmosphere + ability VFX (Three.js).
 *  Godray light-shaft shader, drifting embers + fog, glowing lanterns, a chi
 *  hand-cursor with trail, bloom + motion-blur (afterimage), camera drift/shake,
 *  and the Sonic Wave / dash / Dragon's Rage effects. Pure presentation.
 * ==========================================================================*/
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { AfterimagePass } from 'three/addons/postprocessing/AfterimagePass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CFG } from './config.js';

export { THREE };
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const dist2 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const randRange = (a, b) => a + (b - a) * Math.random();

const VIEW_H = CFG.view.height;
let aspect = window.innerWidth / window.innerHeight;

export const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, CFG.perf.maxPixelRatio));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.domElement.id = 'three-canvas';
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;
document.getElementById('stage').appendChild(renderer.domElement);

export const scene = new THREE.Scene(); scene.background = null;
export const camera = new THREE.OrthographicCamera(-VIEW_H * aspect / 2, VIEW_H * aspect / 2, VIEW_H / 2, -VIEW_H / 2, -100, 100);
camera.position.z = 10;
let camBaseX = 0, camBaseY = 0;

export function normToWorld(nx, ny) { const w = VIEW_H * aspect; return { x: (nx - 0.5) * w, y: (0.5 - ny) * VIEW_H }; }
export function worldHalf() { return { w: VIEW_H * aspect / 2, h: VIEW_H / 2 }; }

/* ── post: bloom + motion-blur afterimage ────────────────────────────────*/
export const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
export const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth / 2, window.innerHeight / 2), CFG.bloom.base, CFG.bloom.radius, CFG.bloom.threshold);
composer.addPass(bloom);
const afterimage = new AfterimagePass(CFG.afterimage.damp);
composer.addPass(afterimage);
composer.addPass(new OutputPass());
export function bumpAfterimage(d) { afterimage.uniforms.damp.value = Math.max(afterimage.uniforms.damp.value, d); }

/* ── temple atmosphere shader (gradient + godrays + fog + vignette) ───────*/
const atmoU = {
  uTime: { value: 0 }, uReveal: { value: 0 }, uMood: { value: 0 }, uAspect: { value: aspect },
  uGold: { value: new THREE.Color(CFG.colors.gold) }, uPink: { value: new THREE.Color(CFG.colors.magenta) }, uBlue: { value: new THREE.Color(CFG.colors.blue) },
};
const atmoMat = new THREE.ShaderMaterial({
  uniforms: atmoU, depthTest: false, depthWrite: false,
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.0,1.0); }`,
  fragmentShader: `
    varying vec2 vUv; uniform float uTime,uReveal,uMood,uAspect; uniform vec3 uGold,uPink,uBlue;
    float hash(vec2 p){ return fract(sin(dot(p,vec2(41.3,289.1)))*43758.5); }
    float noise(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f);
      float a=hash(i),b=hash(i+vec2(1,0)),c=hash(i+vec2(0,1)),d=hash(i+vec2(1,1));
      return mix(mix(a,b,f.x),mix(c,d,f.x),f.y); }
    float fbm(vec2 p){ float v=0.0,a=0.5; for(int i=0;i<4;i++){ v+=a*noise(p); p*=2.0; a*=0.5; } return v; }
    void main(){
      vec2 uv=vUv; vec2 p=uv; p.x*=uAspect;
      // warm base gradient, brighter toward the light
      vec2 sun=vec2(0.70*uAspect,0.24);
      float dl=length(p-sun);
      vec3 col=mix(vec3(0.02,0.015,0.02), vec3(0.10,0.06,0.05), smoothstep(1.4,0.0,dl));
      // volumetric-ish godray shafts from the sun
      vec2 dir=p-sun; float ang=atan(dir.y,dir.x);
      float shaft=0.0;
      shaft+=0.5+0.5*sin(ang*26.0+uTime*0.25);
      shaft*=0.6+0.4*sin(ang*11.0-uTime*0.15);
      shaft*=smoothstep(1.5,0.05,length(dir));
      col+=uGold*shaft*0.30*uReveal;
      col+=uGold*smoothstep(0.35,0.0,dl)*0.9*uReveal;          // sun core glow
      // drifting fog
      float fog=fbm(p*1.6+vec2(uTime*0.03,uTime*0.015));
      col+=mix(uPink,uBlue,fog)*fog*0.10*uReveal*(0.6+0.4*uMood);
      col+=uGold*fbm(p*2.4-vec2(uTime*0.02,0.0))*0.05*uReveal;
      // mystical energy tint grows in the calm finale
      col=mix(col, col+uPink*0.06+uBlue*0.04, uMood);
      // vignette
      float vig=smoothstep(1.25,0.35,length(uv-0.5));
      col*=mix(0.25,1.0,vig);
      col*=mix(0.04,1.0,uReveal);
      gl_FragColor=vec4(col,1.0);
    }`,
});
const atmoQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), atmoMat);
atmoQuad.frustumCulled = false; atmoQuad.renderOrder = -10; scene.add(atmoQuad);
export function setReveal(v) { atmoU.uReveal.value = v; }
export function setMood(v) { atmoU.uMood.value = v; }

/* ── particles (embers + dust) ───────────────────────────────────────────*/
function sparkTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.3, 'rgba(255,210,150,0.85)'); grd.addColorStop(1, 'rgba(255,150,80,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const sparkTex = sparkTexture();
export class ParticlePool {
  constructor(max = 1200) {
    this.max = max; this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max); this.vel = new Float32Array(max * 3); this.life = new Float32Array(max); this.maxLife = new Float32Array(max); this.cursor = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('psize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo = geo;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uTex: { value: sparkTex } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: true,
      vertexShader: `attribute float psize; varying vec3 vC; void main(){ vC=color; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=psize*(1000.0/-mv.z); gl_Position=projectionMatrix*mv; }`,
      fragmentShader: `uniform sampler2D uTex; varying vec3 vC; void main(){ gl_FragColor=vec4(vC,1.0)*texture2D(uTex,gl_PointCoord); }`,
    });
    this.points = new THREE.Points(geo, this.mat); this.points.frustumCulled = false; scene.add(this.points);
  }
  spawn(x, y, z, o = {}) {
    const i = this.cursor; this.cursor = (this.cursor + 1) % this.max;
    this.pos[i*3] = x; this.pos[i*3+1] = y; this.pos[i*3+2] = z || 0;
    const c = o.color || [1, 0.7, 0.4]; this.col[i*3] = c[0]; this.col[i*3+1] = c[1]; this.col[i*3+2] = c[2];
    this.size[i] = o.size || randRange(0.05, 0.13);
    const sp = o.speed != null ? o.speed : randRange(0.5, 3), a = o.angle != null ? o.angle : Math.random() * Math.PI * 2;
    this.vel[i*3] = Math.cos(a) * sp + (o.vx || 0); this.vel[i*3+1] = Math.sin(a) * sp + (o.vy || 0); this.vel[i*3+2] = (Math.random() - 0.5) * 0.4;
    this.maxLife[i] = this.life[i] = o.life || randRange(0.5, 1.3);
  }
  burst(x, y, n, o = {}) { for (let k = 0; k < n; k++) this.spawn(x, y, 0, o); }
  update(dt, slow) {
    const d = dt * (slow ? 0.4 : 1);
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) { this.size[i] = 0; continue; }
      this.life[i] -= d; const f = clamp(this.life[i] / this.maxLife[i], 0, 1);
      this.pos[i*3] += this.vel[i*3] * d; this.pos[i*3+1] += this.vel[i*3+1] * d + 0.5 * d; this.pos[i*3+2] += this.vel[i*3+2] * d;
      this.vel[i*3] *= 0.97; this.vel[i*3+1] *= 0.97; this.size[i] = Math.max(0, this.size[i]) * f + this.size[i] * 0.001;
    }
    this.geo.attributes.position.needsUpdate = true; this.geo.attributes.color.needsUpdate = true; this.geo.attributes.psize.needsUpdate = true;
  }
}
export const particles = new ParticlePool(1400);
export const embers = new ParticlePool(400);
let emberReveal = 0;
export function seedEmbers() { const h = worldHalf(); for (let i = 0; i < 160; i++) embers.spawn(randRange(-h.w, h.w), randRange(-h.h, h.h), randRange(-2, -5), { color: [1, 0.7, 0.4], size: randRange(0.02, 0.06), speed: randRange(0.05, 0.25), life: randRange(5, 11) }); }
export function emberTick(reveal) { emberReveal = reveal; if (Math.random() < 0.5 * reveal) { const h = worldHalf(); embers.spawn(randRange(-h.w, h.w), -h.h - 0.5, randRange(-2, -5), { color: [1, 0.68, 0.38], size: randRange(0.02, 0.06), speed: randRange(0.1, 0.35), life: randRange(5, 10) }); } }

/* ── lanterns (brighten in the finale) ───────────────────────────────────*/
const lanternMat = new THREE.MeshBasicMaterial({ map: sparkTex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, color: new THREE.Color(CFG.colors.gold) });
const lanterns = [];
(function () {
  const spots = [[-6, 2.5], [6.2, 2.2], [-4.5, -2.8], [5, -2.6], [-7.5, -0.5], [7.6, 0.3]];
  for (const [x, y] of spots) { const m = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.4), lanternMat.clone()); m.position.set(x, y, -3.5); scene.add(m); lanterns.push(m); }
})();
export function setLanternGlow(v) { for (const l of lanterns) l.material.opacity = v; }

/* ── chi hand-cursor + trail ─────────────────────────────────────────────*/
function makeChiTrailMat(color) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(color) } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: `varying vec2 vUv; varying float vA; attribute float aAlpha; void main(){ vUv=uv; vA=aAlpha; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `varying vec2 vUv; varying float vA; uniform vec3 uColor; uniform float uTime; void main(){ float e=smoothstep(0.0,0.5,vUv.y)*smoothstep(1.0,0.5,vUv.y); gl_FragColor=vec4(uColor*1.6, vA*e); }`,
  });
}
class Ribbon {
  constructor(color, len = 24, width = 0.16) {
    this.len = len; this.width = width; this.points = [];
    const geo = new THREE.BufferGeometry();
    this.positions = new Float32Array(len * 2 * 3); this.uvs = new Float32Array(len * 2 * 2); this.alphas = new Float32Array(len * 2);
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('uv', new THREE.BufferAttribute(this.uvs, 2)); geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alphas, 1).setUsage(THREE.DynamicDrawUsage));
    const idx = []; for (let i = 0; i < len - 1; i++) { const a=i*2,b=i*2+1,c=(i+1)*2,d=(i+1)*2+1; idx.push(a,b,c,b,d,c); } geo.setIndex(idx);
    this.mat = makeChiTrailMat(color); this.mesh = new THREE.Mesh(geo, this.mat); this.mesh.frustumCulled = false; this.mesh.visible = false; scene.add(this.mesh);
  }
  push(x, y, z) { this.points.unshift({ x, y, z: z || 0 }); if (this.points.length > this.len) this.points.pop(); }
  clear() { this.points.length = 0; this.mesh.visible = false; }
  setColor(c) { this.mat.uniforms.uColor.value.set(c); }
  update() {
    if (this.points.length < 2) { this.mesh.visible = false; return; } this.mesh.visible = true; const n = this.points.length;
    for (let i = 0; i < this.len; i++) {
      const p = this.points[Math.min(i, n - 1)], pn = this.points[Math.min(i + 1, n - 1)];
      let dx = pn.x - p.x, dy = pn.y - p.y; const L = Math.hypot(dx, dy) || 1; const t = i / (this.len - 1), w = (1 - t) * this.width, nx = -dy / L * w, ny = dx / L * w;
      this.positions[i*6]=p.x-nx; this.positions[i*6+1]=p.y-ny; this.positions[i*6+2]=p.z; this.positions[i*6+3]=p.x+nx; this.positions[i*6+4]=p.y+ny; this.positions[i*6+5]=p.z;
      const a = 1 - t; this.alphas[i*2]=a; this.alphas[i*2+1]=a; this.uvs[i*4]=t; this.uvs[i*4+1]=0; this.uvs[i*4+2]=t; this.uvs[i*4+3]=1;
    }
    this.mesh.geometry.attributes.position.needsUpdate = true; this.mesh.geometry.attributes.aAlpha.needsUpdate = true;
  }
}
const ribbon = new Ribbon(CFG.colors.gold);
const cursor = (function () {
  const grp = new THREE.Group(); grp.visible = false;
  const auraMat = new THREE.MeshBasicMaterial({ color: CFG.colors.gold, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const aura = new THREE.Mesh(new THREE.RingGeometry(0.34, 0.46, 40), auraMat);
  const dotMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
  const dot = new THREE.Mesh(new THREE.CircleGeometry(0.12, 20), dotMat);
  grp.add(aura, dot); grp.position.z = 0.4; scene.add(grp);
  return { grp, aura, auraMat, dot, dotMat };
})();
export function updateCursor(st, time) {
  if (!st.present) { cursor.grp.visible = false; ribbon.clear(); ribbon.update(); return; }
  const w = normToWorld(st.x, st.y);
  cursor.grp.visible = true; cursor.grp.position.set(w.x, w.y, 0.4); cursor.grp.rotation.z += 0.03;
  let col = CFG.colors.gold, scl = 1;
  if (st.pinch) { col = CFG.colors.blue; scl = 0.7; }
  else if (st.fist) { col = CFG.colors.magenta; scl = 0.85; }
  else if (st.open) { col = CFG.colors.gold; scl = 1.25; }
  cursor.auraMat.color.set(col); cursor.dotMat.color.set(col); cursor.aura.scale.setScalar(scl);
  ribbon.setColor(col); ribbon.push(w.x, w.y, clamp(-st.z * CFG.hands.depthScale, -2, 2)); ribbon.mat.uniforms.uTime.value = time; ribbon.update();
  return w;
}

/* ── ability VFX ─────────────────────────────────────────────────────────*/
const projectiles = [], shocks = [], streaks = [];
function ringMesh(color, op) { return new THREE.Mesh(new THREE.RingGeometry(0.2, 0.44, 64), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); }

export function sonicWave(x, y, dx, dy) {
  const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
  const mat = makeChiTrailMat(CFG.colors.blue);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.55), mat); mesh.position.set(x, y, 0.2); mesh.rotation.z = Math.atan2(dy, dx); scene.add(mesh);
  // fake a bright body
  const core = new THREE.Mesh(new THREE.CircleGeometry(0.3, 20), new THREE.MeshBasicMaterial({ color: CFG.colors.blue, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
  mesh.add(core);
  projectiles.push({ mesh, mat, x, y, dx, dy, speed: 15, life: 1.2 });
  spawnShock(x, y, CFG.colors.blue, 3.4, 9);
  particles.burst(x, y, 20, { color: [0.3, 0.72, 1], angle: Math.atan2(dy, dx), speed: 6, life: 0.7 });
}
function spawnShock(x, y, color, maxR, speed) { const m = ringMesh(color, 0.9); m.position.set(x, y, 0.1); scene.add(m); shocks.push({ m, x, y, r: 0.3, maxR, speed }); }
export function dashStreak(x, y, dx, dy) {
  const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
  const mat = new THREE.MeshBasicMaterial({ color: CFG.colors.magenta, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.4), mat); mesh.position.set(x, y, 0.25); mesh.rotation.z = Math.atan2(dy, dx); scene.add(mesh);
  streaks.push({ mesh, mat, life: 0.35, max: 0.35 });
  particles.burst(x, y, 26, { color: [1, 0.35, 0.6], speed: randRange(4, 10), life: 0.6 });
  bumpAfterimage(CFG.afterimage.dashDamp); addShake(0.25);
}
export function rageBurst(x, y) {
  spawnShock(x, y, CFG.colors.gold, 9, 14); spawnShock(x, y, CFG.colors.pink, 6.5, 11); spawnShock(x, y, CFG.colors.blue, 5, 9);
  particles.burst(x, y, 90, { color: [1, 0.7, 0.35], speed: randRange(4, 14), life: randRange(0.6, 1.4) });
  particles.burst(x, y, 40, { color: [1, 0.35, 0.6], speed: randRange(6, 16), life: randRange(0.5, 1.1) });
  bumpAfterimage(CFG.afterimage.dashDamp); addShake(0.95); flashScene();
}
let sceneFlash = 0; function flashScene() { sceneFlash = 1; }
export function getFlash() { return sceneFlash; }

export function updateVFX(dt) {
  for (const p of projectiles) { p.x += p.dx * p.speed * dt; p.y += p.dy * p.speed * dt; p.mesh.position.set(p.x, p.y, 0.2); p.life -= dt; p.mat.uniforms.uTime.value += dt; p.mesh.material.opacity = clamp(p.life, 0, 1); if (Math.random() < 0.6) particles.spawn(p.x, p.y, 0.2, { color: [0.3, 0.72, 1], size: 0.06, speed: 0.6, life: 0.4 }); }
  for (let i = projectiles.length - 1; i >= 0; i--) if (projectiles[i].life <= 0) { scene.remove(projectiles[i].mesh); projectiles.splice(i, 1); }
  for (const s of shocks) { s.r += s.speed * dt; s.m.scale.setScalar(s.r); s.m.material.opacity = clamp(1 - s.r / s.maxR, 0, 1) * 0.9; }
  for (let i = shocks.length - 1; i >= 0; i--) if (shocks[i].r >= shocks[i].maxR) { scene.remove(shocks[i].m); shocks.splice(i, 1); }
  for (const st of streaks) { st.life -= dt; st.mat.opacity = clamp(st.life / st.max, 0, 1); }
  for (let i = streaks.length - 1; i >= 0; i--) if (streaks[i].life <= 0) { scene.remove(streaks[i].mesh); streaks.splice(i, 1); }
  if (sceneFlash > 0) sceneFlash = Math.max(0, sceneFlash - dt * 2.4);
  afterimage.uniforms.damp.value = lerp(afterimage.uniforms.damp.value, CFG.afterimage.damp, dt * 4);
}

/* ── camera drift + shake ────────────────────────────────────────────────*/
let _shake = 0, _slow = 0;
export function addShake(v) { _shake = Math.min(1.6, _shake + v); }
export function triggerSlowmo(d) { _slow = Math.max(_slow, d); }
export function getSlowmo() { return _slow; }
export function tickCamera(dt, time) {
  if (_slow > 0) _slow -= dt;
  camBaseX = Math.sin(time * 0.13) * 0.28; camBaseY = Math.cos(time * 0.10) * 0.18; // gentle cinematic drift
  let sx = 0, sy = 0; if (_shake > 0) { _shake = Math.max(0, _shake - dt * 2.6); sx = (Math.random() - 0.5) * _shake; sy = (Math.random() - 0.5) * _shake; }
  camera.position.x = camBaseX + sx; camera.position.y = camBaseY + sy;
}

export function resize() {
  aspect = window.innerWidth / window.innerHeight; atmoU.uAspect.value = aspect;
  camera.left = -VIEW_H * aspect / 2; camera.right = VIEW_H * aspect / 2; camera.top = VIEW_H / 2; camera.bottom = -VIEW_H / 2; camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight); composer.setSize(window.innerWidth, window.innerHeight); bloom.setSize(window.innerWidth / 2, window.innerHeight / 2);
}
window.addEventListener('resize', resize);
export function updateTime(t) { atmoU.uTime.value = t; }
export function render() { composer.render(); }
