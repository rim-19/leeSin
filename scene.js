/* ============================================================================
 *  scene.js  —  Three.js presentation layer.
 *  Renderer + ortho camera + half-res bloom, desaturated webcam backdrop,
 *  the central defended core (with danger ring + HP feedback), the rotating
 *  sigil, rich per-hand chi cursors (open aura / fist strike) with trails,
 *  GPU particles, the trial ghost hand, and shared FX (shake / slow-mo).
 *  Pure presentation — imports no game logic.
 * ==========================================================================*/
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
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
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
document.getElementById('stage').appendChild(renderer.domElement);

export const scene = new THREE.Scene();
scene.background = null;
export const camera = new THREE.OrthographicCamera(-VIEW_H * aspect / 2, VIEW_H * aspect / 2, VIEW_H / 2, -VIEW_H / 2, -100, 100);
camera.position.z = 10;
scene.add(new THREE.AmbientLight(0x334455, 1.4));

export function getAspect() { return aspect; }
export function normToWorld(nx, ny) { const w = VIEW_H * aspect; return { x: (nx - 0.5) * w, y: (0.5 - ny) * VIEW_H }; }
export function worldHalf() { return { w: VIEW_H * aspect / 2, h: VIEW_H / 2 }; }

/* ── bloom (half-res render targets → much cheaper) ──────────────────────*/
export const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
export const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth / 2, window.innerHeight / 2), CFG.bloom.base, CFG.bloom.radius, CFG.bloom.threshold);
composer.addPass(bloom);
composer.addPass(new OutputPass());

/* ── webcam backdrop ─────────────────────────────────────────────────────*/
const bgMat = new THREE.ShaderMaterial({
  uniforms: { uTex: { value: null }, uHasTex: { value: 0 }, uAspectVideo: { value: 16 / 9 }, uAspectScreen: { value: aspect }, uDim: { value: 0.32 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.0,1.0); }`,
  fragmentShader: `varying vec2 vUv; uniform sampler2D uTex; uniform float uHasTex,uDim,uAspectVideo,uAspectScreen;
    void main(){ vec2 uv=vUv; float ar=uAspectScreen/uAspectVideo;
      if(ar>1.0) uv.y=(uv.y-0.5)/ar+0.5; else uv.x=(uv.x-0.5)*ar+0.5; uv.x=1.0-uv.x;
      vec3 col=vec3(0.02,0.04,0.07);
      if(uHasTex>0.5){ vec3 c=texture2D(uTex,uv).rgb; float g=dot(c,vec3(0.299,0.587,0.114));
        c=mix(vec3(g),c,0.22); c*=vec3(0.5,0.85,1.08); col=c*uDim; }
      vec2 d=vUv-0.5; col*=mix(0.3,1.0,smoothstep(0.9,0.3,length(d)));
      gl_FragColor=vec4(col,1.0); }`,
  depthTest: false, depthWrite: false,
});
const bgQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), bgMat);
bgQuad.frustumCulled = false; bgQuad.renderOrder = -10; scene.add(bgQuad);
export function setVideoTexture(tex) { bgMat.uniforms.uTex.value = tex; bgMat.uniforms.uHasTex.value = tex ? 1 : 0; }
export function updateBackground(video) { if (video && video.videoWidth) { bgMat.uniforms.uAspectScreen.value = aspect; bgMat.uniforms.uAspectVideo.value = video.videoWidth / video.videoHeight; } }

/* ── central defended core (danger ring + HP) ────────────────────────────*/
const coreUniforms = { uTime: { value: 0 }, uHp: { value: 1 }, uFlash: { value: 0 } };
const coreMat = new THREE.ShaderMaterial({
  uniforms: coreUniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: `varying vec2 vUv; uniform float uTime,uHp,uFlash;
    void main(){ vec2 p=vUv*2.0-1.0; float r=length(p); if(r>1.0) discard;
      vec3 good=mix(vec3(1.0,0.35,0.4), vec3(0.25,0.88,1.0), uHp);
      float coreGlow=smoothstep(0.42,0.0,r)*(0.8+0.3*sin(uTime*2.0));
      float ring=smoothstep(0.04,0.0,abs(r-0.92))*(0.6+0.4*sin(uTime*1.5));
      vec3 col=good*(coreGlow+ring) + vec3(1.0,0.2,0.25)*uFlash*smoothstep(1.0,0.0,r);
      float a=clamp(coreGlow+ring+uFlash*0.5,0.0,1.0);
      gl_FragColor=vec4(col*1.6,a); }`,
});
const coreMesh = new THREE.Mesh(new THREE.PlaneGeometry(CFG.core.radius * 2, CFG.core.radius * 2), coreMat);
coreMesh.position.z = -0.3; coreMesh.visible = false; scene.add(coreMesh);
export function showCore(v) { coreMesh.visible = v; }
export function setCoreHealth(frac) { coreUniforms.uHp.value = frac; }
export function flashCore() { coreUniforms.uFlash.value = 1; }

/* ── sigil ───────────────────────────────────────────────────────────────*/
export const sigilUniforms = { uTime: { value: 0 }, uOpen: { value: 0.15 }, uPulse: { value: 0 }, uIntensity: { value: 0.55 }, uCyan: { value: new THREE.Color(CFG.colors.cyan) }, uGold: { value: new THREE.Color(CFG.colors.gold) } };
const sigilMat = new THREE.ShaderMaterial({
  uniforms: sigilUniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: `varying vec2 vUv; uniform float uTime,uOpen,uPulse,uIntensity; uniform vec3 uCyan,uGold;
    float ring(float r,float c,float w){ return smoothstep(w,0.0,abs(r-c)); }
    void main(){ vec2 p=vUv*2.0-1.0; float r=length(p); float a=atan(p.y,p.x); if(r>1.0) discard;
      float t=uTime; float glow=0.0;
      glow+=ring(r,0.92,0.02)*(0.4+0.6*(0.5+0.5*sin(a*12.0-t*0.8)));
      glow+=ring(r,0.55*uOpen+0.08,0.03)*(0.6+0.4*sin(a*6.0+t));
      glow+=ring(r,mix(0.0,0.7,uOpen),0.02);
      glow+=ring(r,0.3,0.05)*(0.5+0.5*sin(a*3.0+t*1.3))*uOpen;
      float pulse=1.0+uPulse*0.9; vec3 col=mix(uCyan,uGold,smoothstep(0.2,0.95,r));
      gl_FragColor=vec4(col*glow*pulse, clamp(glow*uIntensity*pulse,0.0,1.0)+uOpen*0.05); }`,
});
export const sigil = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), sigilMat);
sigil.position.z = -0.6; scene.add(sigil);
export function bumpSigilPulse(v) { sigilUniforms.uPulse.value = Math.max(sigilUniforms.uPulse.value, v); }

/* ── chi-trail material ──────────────────────────────────────────────────*/
export function makeChiMaterial(color) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(color) }, uPulse: { value: 0 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: `varying vec2 vUv; varying float vA; attribute float aAlpha; void main(){ vUv=uv; vA=aAlpha; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `varying vec2 vUv; varying float vA; uniform vec3 uColor; uniform float uTime,uPulse;
      void main(){ float edge=smoothstep(0.0,0.5,vUv.y)*smoothstep(1.0,0.5,vUv.y);
        float flow=0.6+0.4*sin(vUv.x*20.0-uTime*6.0);
        gl_FragColor=vec4(uColor*(1.4+uPulse), vA*edge*flow); }`,
  });
}

/* ── particles ───────────────────────────────────────────────────────────*/
function makeSparkTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.25, 'rgba(200,240,255,0.9)'); grd.addColorStop(1, 'rgba(60,180,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const sparkTex = makeSparkTexture();
export class ParticlePool {
  constructor(max = 1200) {
    this.max = max; this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max); this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max); this.maxLife = new Float32Array(max); this.cursor = 0;
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
  spawn(x, y, z, opts = {}) {
    const i = this.cursor; this.cursor = (this.cursor + 1) % this.max;
    this.pos[i*3] = x; this.pos[i*3+1] = y; this.pos[i*3+2] = z || 0;
    const c = opts.color || [0.4, 0.9, 1.0]; this.col[i*3] = c[0]; this.col[i*3+1] = c[1]; this.col[i*3+2] = c[2];
    this.size[i] = opts.size || randRange(0.05, 0.13);
    const sp = opts.speed != null ? opts.speed : randRange(0.5, 3), ang = opts.angle != null ? opts.angle : Math.random() * Math.PI * 2;
    this.vel[i*3] = Math.cos(ang) * sp + (opts.vx || 0); this.vel[i*3+1] = Math.sin(ang) * sp + (opts.vy || 0); this.vel[i*3+2] = (Math.random() - 0.5) * 0.5;
    this.maxLife[i] = this.life[i] = opts.life || randRange(0.4, 1.1);
  }
  burst(x, y, n, opts = {}) { for (let k = 0; k < n; k++) this.spawn(x, y, 0, opts); }
  update(dt, slow) {
    const d = dt * (slow ? 0.35 : 1);
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) { this.size[i] = 0; continue; }
      this.life[i] -= d; const f = clamp(this.life[i] / this.maxLife[i], 0, 1);
      this.pos[i*3] += this.vel[i*3] * d; this.pos[i*3+1] += this.vel[i*3+1] * d + 0.6 * d; this.pos[i*3+2] += this.vel[i*3+2] * d;
      this.vel[i*3] *= 0.96; this.vel[i*3+1] *= 0.96; this.size[i] = Math.max(0, this.size[i]) * f + this.size[i] * 0.001;
    }
    this.geo.attributes.position.needsUpdate = true; this.geo.attributes.color.needsUpdate = true; this.geo.attributes.psize.needsUpdate = true;
  }
}
export const particles = new ParticlePool(1200);
export const ambient = new ParticlePool(260);
export function seedAmbient() { const h = worldHalf(); for (let i = 0; i < 100; i++) ambient.spawn(randRange(-h.w, h.w), randRange(-h.h, h.h), randRange(-1, -3), { color: [0.9, 0.72, 0.36], size: randRange(0.02, 0.05), speed: randRange(0.05, 0.2), life: randRange(4, 9) }); }
export function ambientTick() { if (Math.random() < 0.25) { const h = worldHalf(); ambient.spawn(randRange(-h.w, h.w), -h.h, -2, { color: [0.9, 0.72, 0.36], size: randRange(0.02, 0.05), speed: 0.15, life: randRange(4, 8) }); } }

/* ── hand trails ─────────────────────────────────────────────────────────*/
class Ribbon {
  constructor(color, len = 22, width = 0.14) {
    this.len = len; this.width = width; this.points = [];
    const geo = new THREE.BufferGeometry();
    this.positions = new Float32Array(len * 2 * 3); this.uvs = new Float32Array(len * 2 * 2); this.alphas = new Float32Array(len * 2);
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('uv', new THREE.BufferAttribute(this.uvs, 2));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alphas, 1).setUsage(THREE.DynamicDrawUsage));
    const idx = []; for (let i = 0; i < len - 1; i++) { const a=i*2,b=i*2+1,c=(i+1)*2,d=(i+1)*2+1; idx.push(a,b,c,b,d,c); }
    geo.setIndex(idx); this.mat = makeChiMaterial(color);
    this.mesh = new THREE.Mesh(geo, this.mat); this.mesh.frustumCulled = false; this.mesh.visible = false; scene.add(this.mesh);
  }
  push(x, y, z) { this.points.unshift({ x, y, z: z || 0 }); if (this.points.length > this.len) this.points.pop(); }
  clear() { this.points.length = 0; this.mesh.visible = false; }
  setColor(c) { this.mat.uniforms.uColor.value.set(c); }
  update(time, pulse) {
    this.mat.uniforms.uTime.value = time; this.mat.uniforms.uPulse.value = pulse || 0;
    if (this.points.length < 2) { this.mesh.visible = false; return; }
    this.mesh.visible = true; const n = this.points.length;
    for (let i = 0; i < this.len; i++) {
      const p = this.points[Math.min(i, n - 1)], pn = this.points[Math.min(i + 1, n - 1)];
      let dx = pn.x - p.x, dy = pn.y - p.y; const L = Math.hypot(dx, dy) || 1;
      const t = i / (this.len - 1), w = (1 - t) * this.width, nx = -dy / L * w, ny = dx / L * w;
      this.positions[i*6]=p.x-nx; this.positions[i*6+1]=p.y-ny; this.positions[i*6+2]=p.z;
      this.positions[i*6+3]=p.x+nx; this.positions[i*6+4]=p.y+ny; this.positions[i*6+5]=p.z;
      const a = 1 - t; this.alphas[i*2]=a; this.alphas[i*2+1]=a;
      this.uvs[i*4]=t; this.uvs[i*4+1]=0; this.uvs[i*4+2]=t; this.uvs[i*4+3]=1;
    }
    this.mesh.geometry.attributes.position.needsUpdate = true; this.mesh.geometry.attributes.aAlpha.needsUpdate = true;
  }
}
export const ribbons = [new Ribbon(CFG.colors.cyan), new Ribbon(CFG.colors.gold)];

/* ── rich hand cursors (open aura / fist strike) ─────────────────────────*/
function makeHandCursor() {
  const grp = new THREE.Group(); grp.visible = false;
  const auraMat = new THREE.MeshBasicMaterial({ color: CFG.colors.cyan, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const aura = new THREE.Mesh(new THREE.RingGeometry(0.86, 1.0, 40), auraMat);
  const fillMat = new THREE.MeshBasicMaterial({ color: CFG.colors.cyan, transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending, depthWrite: false });
  const fill = new THREE.Mesh(new THREE.CircleGeometry(1.0, 40), fillMat);
  const dotMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
  const dot = new THREE.Mesh(new THREE.CircleGeometry(0.22, 24), dotMat);
  grp.add(fill, aura, dot); grp.position.z = 0.3; scene.add(grp);
  return { grp, aura, auraMat, fill, fillMat, dot, dotMat };
}
export const handCursors = [makeHandCursor(), makeHandCursor()];
export function poseHandCursor(i, o) {
  const hc = handCursors[i]; if (!o.present) { hc.grp.visible = false; return; }
  hc.grp.visible = true; hc.grp.position.set(o.x, o.y, 0.3); hc.grp.rotation.z += 0.02;
  const cyan = CFG.colors.cyan, gold = CFG.colors.gold;
  if (o.fist) {
    const s = CFG.hands.fistRadius; hc.aura.scale.setScalar(s * 0.7); hc.fill.scale.setScalar(s * 0.7);
    hc.dot.scale.setScalar(1.5); hc.auraMat.color.set(gold); hc.fillMat.color.set(gold); hc.dotMat.color.set(gold);
    hc.auraMat.opacity = 0.85; hc.fillMat.opacity = 0.22; hc.dotMat.opacity = 1;
  } else {
    const s = CFG.hands.openRadius; hc.aura.scale.setScalar(s); hc.fill.scale.setScalar(s);
    hc.dot.scale.setScalar(0.8); hc.auraMat.color.set(cyan); hc.fillMat.color.set(cyan); hc.dotMat.color.set(cyan);
    hc.auraMat.opacity = 0.4; hc.fillMat.opacity = 0.07; hc.dotMat.opacity = 0.8;
  }
}

/* ── trial ghost hand (open / fist demo) ─────────────────────────────────*/
function makeGhost() {
  const grp = new THREE.Group(); const mat = new THREE.MeshBasicMaterial({ color: 0x8fe8ff, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false });
  const palm = new THREE.Mesh(new THREE.CircleGeometry(0.5, 24), mat); grp.add(palm); grp.fingers = [];
  for (let i = 0; i < 5; i++) { const f = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.5, 4, 8), mat); grp.add(f); grp.fingers.push(f); }
  grp.palm = palm; grp.mat = mat; grp.visible = false; grp.position.set(0, 0.3, 0.4); scene.add(grp); return grp;
}
export const ghostHand = makeGhost();
export function poseGhost(t, kind) {
  const g = ghostHand; g.visible = true;
  const angs = [-1.4, -0.6, 0, 0.6, 1.4], baseExt = [0.55, 0.8, 0.85, 0.8, 0.6];
  const curl = kind === 'fist' ? (0.6 + 0.4 * Math.sin(t * Math.PI * 2)) : 0.05;
  for (let i = 0; i < 5; i++) { const f = g.fingers[i]; const ext = baseExt[i] * (1 - curl * 0.8); const a = angs[i];
    f.position.set(Math.sin(a) * 0.45, 0.3 + Math.cos(a) * ext, 0); f.rotation.z = -a; f.scale.y = 0.6 + ext; }
  g.mat.opacity = 0.24 + 0.12 * Math.sin(t * Math.PI * 2);
}
export function hideGhost() { ghostHand.visible = false; }

/* ── shared FX ───────────────────────────────────────────────────────────*/
let _shake = 0, _slowmo = 0;
export function addShake(v) { _shake = Math.min(1.4, _shake + v); }
export function triggerSlowmo(d) { _slowmo = Math.max(_slowmo, d); }
export function getSlowmo() { return _slowmo; }
export function tickFx(dt) {
  if (_slowmo > 0) _slowmo -= dt;
  coreUniforms.uFlash.value = Math.max(0, coreUniforms.uFlash.value - dt / CFG.core.staggerFlash);
  if (_shake > 0) { _shake = Math.max(0, _shake - dt * 2.5); camera.position.x = (Math.random() - 0.5) * _shake; camera.position.y = (Math.random() - 0.5) * _shake; }
  else { camera.position.x = 0; camera.position.y = 0; }
}

export function resize() {
  aspect = window.innerWidth / window.innerHeight;
  camera.left = -VIEW_H * aspect / 2; camera.right = VIEW_H * aspect / 2; camera.top = VIEW_H / 2; camera.bottom = -VIEW_H / 2; camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight); composer.setSize(window.innerWidth, window.innerHeight); bloom.setSize(window.innerWidth / 2, window.innerHeight / 2);
}
window.addEventListener('resize', resize);
export function updateSigilTime(t) { sigilUniforms.uTime.value = t; coreUniforms.uTime.value = t; }
export function render() { composer.render(); }
