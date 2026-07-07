/* ============================================================================
 *  scene.js  —  Three.js setup: renderer, ortho camera, bloom composer,
 *  desaturated webcam backdrop shader, the central sigil, chi-trail material,
 *  GPU particle pools, hand ribbons, the translucent ghost hand, and shared
 *  FX state (screen shake / slow-mo). Pure presentation — imports no game logic.
 * ==========================================================================*/
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CFG } from './config.js';

export { THREE };

/* ── helpers ─────────────────────────────────────────────────────────────*/
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const dist2 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const randRange = (a, b) => a + (b - a) * Math.random();

/* ── renderer / scene / camera ───────────────────────────────────────────*/
const VIEW_H = CFG.view.height;
let aspect = window.innerWidth / window.innerHeight;

export const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.domElement.id = 'three-canvas';
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
document.getElementById('stage').appendChild(renderer.domElement);

export const scene = new THREE.Scene();
scene.background = null; // backdrop is an in-scene quad (see below)

export const camera = new THREE.OrthographicCamera(
  -VIEW_H * aspect / 2, VIEW_H * aspect / 2, VIEW_H / 2, -VIEW_H / 2, -100, 100);
camera.position.z = 10;

scene.add(new THREE.AmbientLight(0x334455, 1.4));
const keyLight = new THREE.PointLight(CFG.colors.cyan, 40, 60);
keyLight.position.set(0, 4, 8);
scene.add(keyLight);

/* Coordinate mapping: MediaPipe normalized [0..1] → world units on z=0. */
export function getAspect() { return aspect; }
export function normToWorld(nx, ny) {
  const w = VIEW_H * aspect;
  return { x: (nx - 0.5) * w, y: (0.5 - ny) * VIEW_H };
}
export function worldHalf() { return { w: VIEW_H * aspect / 2, h: VIEW_H / 2 }; }

/* ── post-processing: bloom ──────────────────────────────────────────────*/
export const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
export const bloom = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  CFG.bloom.base, CFG.bloom.radius, CFG.bloom.threshold);
composer.addPass(bloom);
composer.addPass(new OutputPass());

/* ── webcam backdrop shader (desaturated, dimmed, mirrored, vignetted) ────*/
const bgMat = new THREE.ShaderMaterial({
  uniforms: {
    uTex: { value: null }, uHasTex: { value: 0 }, uTime: { value: 0 },
    uAspectVideo: { value: 16 / 9 }, uAspectScreen: { value: aspect }, uDim: { value: 0.34 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.0,1.0); }`,
  fragmentShader: `
    varying vec2 vUv; uniform sampler2D uTex; uniform float uHasTex, uTime, uDim;
    uniform float uAspectVideo, uAspectScreen;
    void main(){
      vec2 uv = vUv;
      float ar = uAspectScreen / uAspectVideo;
      if (ar > 1.0) uv.y = (uv.y - 0.5)/ar + 0.5; else uv.x = (uv.x - 0.5)*ar + 0.5;
      uv.x = 1.0 - uv.x; // mirror (selfie)
      vec3 col = vec3(0.02,0.04,0.07);
      if (uHasTex > 0.5) {
        vec3 c = texture2D(uTex, uv).rgb;
        float g = dot(c, vec3(0.299,0.587,0.114));
        c = mix(vec3(g), c, 0.25);        // desaturate
        c *= vec3(0.55, 0.85, 1.05);      // cool cyan tint
        col = c * uDim;                   // dim
      }
      vec2 d = vUv - 0.5; float vig = smoothstep(0.85, 0.35, length(d));
      col *= mix(0.35, 1.0, vig);
      gl_FragColor = vec4(col, 1.0);
    }`,
  depthTest: false, depthWrite: false,
});
const bgQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), bgMat);
bgQuad.frustumCulled = false; bgQuad.renderOrder = -1; // paints first, behind all
scene.add(bgQuad);
export function setVideoTexture(tex) { bgMat.uniforms.uTex.value = tex; bgMat.uniforms.uHasTex.value = tex ? 1 : 0; }
export function updateBackground(time, video) {
  bgMat.uniforms.uTime.value = time;
  bgMat.uniforms.uAspectScreen.value = aspect;
  if (video && video.videoWidth) bgMat.uniforms.uAspectVideo.value = video.videoWidth / video.videoHeight;
}

/* ── central sigil shader (rotating glyph disc that "opens") ──────────────*/
export const sigilUniforms = {
  uTime: { value: 0 }, uOpen: { value: 0.15 }, uPulse: { value: 0.0 }, uIntensity: { value: 0.6 },
  uCyan: { value: new THREE.Color(CFG.colors.cyan) }, uGold: { value: new THREE.Color(CFG.colors.gold) },
};
const sigilMat = new THREE.ShaderMaterial({
  uniforms: sigilUniforms, transparent: true, depthWrite: false,
  blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: `
    varying vec2 vUv; uniform float uTime,uOpen,uPulse,uIntensity; uniform vec3 uCyan,uGold;
    float ring(float r,float c,float w){ return smoothstep(w,0.0,abs(r-c)); }
    void main(){
      vec2 p = vUv*2.0-1.0; float r = length(p); float a = atan(p.y,p.x);
      if (r > 1.0) discard;
      float t = uTime; float glow = 0.0;
      float spokes = 0.5 + 0.5*sin(a*12.0 - t*0.8);
      glow += ring(r,0.92,0.02) * (0.4+0.6*spokes);
      glow += ring(r,0.82,0.006);
      float inner = mix(0.0, 0.7, uOpen);
      glow += ring(r, 0.55*uOpen+0.08, 0.03) * (0.6+0.4*sin(a*6.0+t));
      glow += ring(r, inner, 0.02);
      glow += ring(r, 0.3, 0.05)*(0.5+0.5*sin(a*3.0 + t*1.3))*uOpen;
      glow += smoothstep(0.16,0.0,r) * (0.5 + uOpen*0.8);
      float pulse = 1.0 + uPulse*0.9;
      vec3 col = mix(uCyan, uGold, smoothstep(0.2,0.95,r));
      float alpha = clamp(glow*uIntensity*pulse, 0.0, 1.0) + uOpen*0.06*smoothstep(1.0,0.2,r);
      gl_FragColor = vec4(col*glow*pulse, alpha);
    }`,
});
export const sigil = new THREE.Mesh(new THREE.PlaneGeometry(7, 7), sigilMat);
sigil.position.z = -0.5;
scene.add(sigil);
export function bumpSigilPulse(v) { sigilUniforms.uPulse.value = Math.max(sigilUniforms.uPulse.value, v); }

/* ── chi-trail material (used by ribbons, projectiles) ───────────────────*/
export function makeChiMaterial(color) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(color) }, uPulse: { value: 0 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: `
      varying vec2 vUv; varying float vA; attribute float aAlpha;
      void main(){ vUv=uv; vA=aAlpha; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `
      varying vec2 vUv; varying float vA; uniform vec3 uColor; uniform float uTime,uPulse;
      void main(){
        float edge = smoothstep(0.0,0.5,vUv.y)*smoothstep(1.0,0.5,vUv.y);
        float flow = 0.6+0.4*sin(vUv.x*20.0 - uTime*6.0);
        gl_FragColor = vec4(uColor*(1.4+uPulse), vA*edge*flow*(1.0+uPulse*0.6));
      }`,
  });
}

/* ── GPU particles (THREE.Points) ────────────────────────────────────────*/
function makeSparkTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(200,240,255,0.9)');
  grd.addColorStop(1, 'rgba(60,180,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const sparkTex = makeSparkTexture();

export class ParticlePool {
  constructor(max = 1400) {
    this.max = max;
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max); this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max); this.maxLife = new Float32Array(max);
    this.cursor = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('psize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo = geo;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uTex: { value: sparkTex } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: true,
      vertexShader: `
        attribute float psize; varying vec3 vC;
        void main(){ vC=color; vec4 mv=modelViewMatrix*vec4(position,1.0);
          // ortho camera sits ~10 units back; ~1000/10 ≈ 100px per world unit
          gl_PointSize = psize * (1000.0/-mv.z); gl_Position=projectionMatrix*mv; }`,
      fragmentShader: `uniform sampler2D uTex; varying vec3 vC;
        void main(){ gl_FragColor = vec4(vC,1.0)*texture2D(uTex,gl_PointCoord); }`,
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false; scene.add(this.points);
  }
  spawn(x, y, z, opts = {}) {
    const i = this.cursor; this.cursor = (this.cursor + 1) % this.max;
    this.pos[i*3] = x; this.pos[i*3+1] = y; this.pos[i*3+2] = z || 0;
    const c = opts.color || [0.4, 0.9, 1.0];
    this.col[i*3] = c[0]; this.col[i*3+1] = c[1]; this.col[i*3+2] = c[2];
    this.size[i] = opts.size || randRange(0.04, 0.11);
    const sp = opts.speed != null ? opts.speed : randRange(0.5, 3);
    const ang = opts.angle != null ? opts.angle : Math.random() * Math.PI * 2;
    this.vel[i*3] = Math.cos(ang) * sp + (opts.vx || 0);
    this.vel[i*3+1] = Math.sin(ang) * sp + (opts.vy || 0);
    this.vel[i*3+2] = (Math.random() - 0.5) * 0.5;
    this.maxLife[i] = this.life[i] = opts.life || randRange(0.4, 1.1);
  }
  burst(x, y, n, opts = {}) { for (let k = 0; k < n; k++) this.spawn(x, y, 0, opts); }
  update(dt, slow) {
    const d = dt * (slow ? 0.35 : 1);
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) { this.size[i] = 0; continue; }
      this.life[i] -= d;
      const f = clamp(this.life[i] / this.maxLife[i], 0, 1);
      this.pos[i*3] += this.vel[i*3] * d;
      this.pos[i*3+1] += this.vel[i*3+1] * d + 0.6 * d; // updraft
      this.pos[i*3+2] += this.vel[i*3+2] * d;
      this.vel[i*3] *= 0.96; this.vel[i*3+1] *= 0.96;
      this.size[i] = Math.max(0, this.size[i]) * f + this.size[i] * 0.001;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
    this.geo.attributes.psize.needsUpdate = true;
  }
}
export const particles = new ParticlePool(1600);
export const ambient = new ParticlePool(300);
export function seedAmbient() {
  const h = worldHalf();
  for (let i = 0; i < 120; i++)
    ambient.spawn(randRange(-h.w, h.w), randRange(-h.h, h.h), randRange(-1, -3),
      { color: [0.9, 0.72, 0.36], size: randRange(0.02, 0.05), speed: randRange(0.05, 0.2), life: randRange(4, 9) });
}
export function ambientTick() {
  if (Math.random() < 0.3) {
    const h = worldHalf();
    ambient.spawn(randRange(-h.w, h.w), -h.h, -2,
      { color: [0.9, 0.72, 0.36], size: randRange(0.02, 0.05), speed: 0.15, life: randRange(4, 8) });
  }
}

/* ── hand ribbons (chi trails following the hands) ───────────────────────*/
class Ribbon {
  constructor(color, len = 26, width = 0.16) {
    this.len = len; this.width = width; this.points = [];
    const geo = new THREE.BufferGeometry();
    this.positions = new Float32Array(len * 2 * 3);
    this.uvs = new Float32Array(len * 2 * 2);
    this.alphas = new Float32Array(len * 2);
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('uv', new THREE.BufferAttribute(this.uvs, 2));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alphas, 1).setUsage(THREE.DynamicDrawUsage));
    const idx = [];
    for (let i = 0; i < len - 1; i++) { const a=i*2,b=i*2+1,c=(i+1)*2,d=(i+1)*2+1; idx.push(a,b,c,b,d,c); }
    geo.setIndex(idx);
    this.mat = makeChiMaterial(color);
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false; this.mesh.visible = false; scene.add(this.mesh);
  }
  push(x, y, z) { this.points.unshift({ x, y, z: z || 0 }); if (this.points.length > this.len) this.points.pop(); }
  clear() { this.points.length = 0; this.mesh.visible = false; }
  update() {
    if (this.points.length < 2) { this.mesh.visible = false; return; }
    this.mesh.visible = true; const n = this.points.length;
    for (let i = 0; i < this.len; i++) {
      const p = this.points[Math.min(i, n - 1)];
      const pn = this.points[Math.min(i + 1, n - 1)];
      let dx = pn.x - p.x, dy = pn.y - p.y; const L = Math.hypot(dx, dy) || 1;
      const t = i / (this.len - 1); const w = (1 - t) * this.width;
      const nx = -dy / L * w, ny = dx / L * w;
      this.positions[i*6]=p.x-nx; this.positions[i*6+1]=p.y-ny; this.positions[i*6+2]=p.z;
      this.positions[i*6+3]=p.x+nx; this.positions[i*6+4]=p.y+ny; this.positions[i*6+5]=p.z;
      const a = (1 - t);
      this.alphas[i*2]=a; this.alphas[i*2+1]=a;
      this.uvs[i*4]=t; this.uvs[i*4+1]=0; this.uvs[i*4+2]=t; this.uvs[i*4+3]=1;
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.mesh.geometry.attributes.aAlpha.needsUpdate = true;
  }
  setPulse(time, pulse) { this.mat.uniforms.uTime.value = time; this.mat.uniforms.uPulse.value = pulse; }
}
export const ribbons = [new Ribbon(CFG.colors.cyan), new Ribbon(CFG.colors.gold)];

function makeHandGlow(color) {
  const m = new THREE.Mesh(new THREE.CircleGeometry(0.35, 24),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
  m.visible = false; scene.add(m); return m;
}
export const handGlows = [makeHandGlow(CFG.colors.cyan), makeHandGlow(CFG.colors.gold)];

/* ── translucent ghost hand (guided-trial demonstrator) ──────────────────*/
function makeGhostHand() {
  const grp = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: 0x8fe8ff, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false });
  const palm = new THREE.Mesh(new THREE.CircleGeometry(0.5, 24), mat);
  grp.add(palm); grp.fingers = [];
  for (let i = 0; i < 5; i++) { const f = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.5, 4, 8), mat); grp.add(f); grp.fingers.push(f); }
  grp.palm = palm; grp.mat = mat; grp.visible = false; grp.position.z = 0.2; scene.add(grp);
  return grp;
}
export const ghostHand = makeGhostHand();
export function poseGhost(t, kind) {
  const g = ghostHand; g.visible = true;
  const angs = [-1.4, -0.6, 0, 0.6, 1.4];
  const baseExtend = [0.55, 0.75, 0.8, 0.75, 0.6];
  let curl = 0, spread = 1, px = 0, py = 0.4;
  if (kind === 'Q') { px = Math.sin(t * Math.PI * 2) * 1.4; }
  else if (kind === 'Q2') { curl = t < 0.5 ? 1 : 0; }
  else if (kind === 'W') { py = 0.4 - t * 1.2; }
  else if (kind === 'E') { spread = 1 + t; px = -t * 1.2; }
  else if (kind === 'R') { curl = 1; py = 0.4 - Math.max(0, (t - 0.5)) * 1.4; }
  g.position.set(px, py, 0.2);
  for (let i = 0; i < 5; i++) {
    const f = g.fingers[i];
    const ext = kind === 'Q' ? (i === 1 ? 1.2 : 0.35) : baseExtend[i] * (1 - curl * 0.7);
    const a = angs[i];
    f.position.set(Math.sin(a) * 0.45 * spread, 0.4 + Math.cos(a) * ext, 0);
    f.rotation.z = -a; f.scale.y = 0.6 + ext;
  }
  g.mat.opacity = 0.22 + 0.12 * Math.sin(t * Math.PI * 2);
  g.palm.scale.setScalar(1 - curl * 0.35);
}
export function hideGhost() { ghostHand.visible = false; }

/* ── shared FX: screen shake + slow-motion ───────────────────────────────*/
let _shake = 0, _slowmo = 0;
export function addShake(v) { _shake = Math.min(1.2, _shake + v); }
export function triggerSlowmo(d) { _slowmo = Math.max(_slowmo, d); }
export function getSlowmo() { return _slowmo; }
export function tickFx(dt) {
  if (_slowmo > 0) _slowmo -= dt;
  if (_shake > 0) {
    _shake = Math.max(0, _shake - dt * 2.5);
    camera.position.x = (Math.random() - 0.5) * _shake;
    camera.position.y = (Math.random() - 0.5) * _shake;
  } else { camera.position.x = 0; camera.position.y = 0; }
}

/* ── resize ──────────────────────────────────────────────────────────────*/
export function resize() {
  aspect = window.innerWidth / window.innerHeight;
  camera.left = -VIEW_H * aspect / 2; camera.right = VIEW_H * aspect / 2;
  camera.top = VIEW_H / 2; camera.bottom = -VIEW_H / 2; camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
  bloom.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', resize);

export function render() { composer.render(); }
