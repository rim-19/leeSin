/* ============================================================================
 *  scene.js  —  "Chi Sculptor": a GPU particle field you shape with your hand.
 *  All particle motion happens in the vertex shader (curl-noise flow + pull /
 *  swirl toward the hand + an outward burst), so tens of thousands of embers
 *  run at 60fps. Bloom + afterimage give the glowing, painted-with-fire look.
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

const VIEW_H = CFG.view.height;
let aspect = window.innerWidth / window.innerHeight;

export const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, CFG.perf.maxPixelRatio));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.domElement.id = 'three-canvas';
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
document.getElementById('stage').appendChild(renderer.domElement);

export const scene = new THREE.Scene(); scene.background = null;
export const camera = new THREE.OrthographicCamera(-VIEW_H * aspect / 2, VIEW_H * aspect / 2, VIEW_H / 2, -VIEW_H / 2, -100, 100);
camera.position.z = 12;

export function normToWorld(nx, ny) { const w = VIEW_H * aspect; return { x: (nx - 0.5) * w, y: (0.5 - ny) * VIEW_H }; }

/* ── dim webcam backdrop (you conjuring the chi) ─────────────────────────*/
const bgMat = new THREE.ShaderMaterial({
  uniforms: { uTex: { value: null }, uHas: { value: 0 }, uAspV: { value: 16 / 9 }, uAspS: { value: aspect } },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.0,1.0); }`,
  fragmentShader: `varying vec2 vUv; uniform sampler2D uTex; uniform float uHas,uAspV,uAspS;
    void main(){ vec2 uv=vUv; float ar=uAspS/uAspV; if(ar>1.0) uv.y=(uv.y-0.5)/ar+0.5; else uv.x=(uv.x-0.5)*ar+0.5; uv.x=1.0-uv.x;
      vec3 col=vec3(0.015,0.01,0.02);
      if(uHas>0.5){ vec3 c=texture2D(uTex,uv).rgb; float g=dot(c,vec3(0.299,0.587,0.114)); c=mix(vec3(g),c,0.2); c*=vec3(1.05,0.75,0.6); col=c*0.2; }
      col*=mix(0.3,1.0,smoothstep(1.1,0.35,length(vUv-0.5)));
      gl_FragColor=vec4(col,1.0); }`,
  depthTest: false, depthWrite: false,
});
const bgQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), bgMat); bgQuad.frustumCulled = false; bgQuad.renderOrder = -10; scene.add(bgQuad);
export function setVideoTexture(t) { bgMat.uniforms.uTex.value = t; bgMat.uniforms.uHas.value = t ? 1 : 0; }
export function updateBg(video) { if (video && video.videoWidth) { bgMat.uniforms.uAspS.value = aspect; bgMat.uniforms.uAspV.value = video.videoWidth / video.videoHeight; } }

/* ── post: bloom + motion-blur afterimage ────────────────────────────────*/
export const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
export const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth / 2, window.innerHeight / 2), CFG.bloom.base, CFG.bloom.radius, CFG.bloom.threshold);
composer.addPass(bloom);
const after = new AfterimagePass(CFG.afterimage.damp); composer.addPass(after);
composer.addPass(new OutputPass());

/* ── the chi particle field ──────────────────────────────────────────────*/
const F = CFG.field;
const N = F.count;
const base = new Float32Array(N * 3), seed = new Float32Array(N);
for (let i = 0; i < N; i++) {
  // flattened ellipsoid cloud, denser toward the center
  let x, y, z, r; do { x = Math.random() * 2 - 1; y = Math.random() * 2 - 1; z = Math.random() * 2 - 1; r = x * x + y * y + z * z; } while (r > 1);
  const k = Math.pow(Math.random(), 0.5);
  base[i*3] = x * F.box[0] * k; base[i*3+1] = y * F.box[1] * k; base[i*3+2] = z * F.box[2] * k;
  seed[i] = Math.random();
}
function sparkTex() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,220,180,0.7)'); gr.addColorStop(1, 'rgba(255,150,80,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const fieldU = {
  uTime: { value: 0 }, uHand: { value: new THREE.Vector3(0, 0, 0) }, uHandOn: { value: 0 },
  uGather: { value: 0 }, uBurst: { value: 0 }, uTex: { value: sparkTex() },
  uSize: { value: F.size }, uFlowScale: { value: F.flowScale }, uFlowAmp: { value: F.flowAmp },
  uAttract: { value: F.attract }, uSwirl: { value: F.swirl }, uBurstForce: { value: F.burstForce },
  uGold: { value: new THREE.Color(CFG.colors.gold) }, uPink: { value: new THREE.Color(CFG.colors.pink) }, uBlue: { value: new THREE.Color(CFG.colors.blue) },
};
const geo = new THREE.BufferGeometry();
geo.setAttribute('position', new THREE.BufferAttribute(base, 3));
geo.setAttribute('aBase', new THREE.BufferAttribute(base, 3));
geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
geo.setDrawRange(0, N);
const fieldMat = new THREE.ShaderMaterial({
  uniforms: fieldU, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
  vertexShader: `
    uniform float uTime,uHandOn,uGather,uBurst,uSize,uFlowScale,uFlowAmp,uAttract,uSwirl,uBurstForce;
    uniform vec3 uHand;
    attribute vec3 aBase; attribute float aSeed;
    varying float vGlow; varying float vSeed;
    // gradient noise + curl
    vec3 hash3(vec3 p){ p=vec3(dot(p,vec3(127.1,311.7,74.7)),dot(p,vec3(269.5,183.3,246.1)),dot(p,vec3(113.5,271.9,124.6))); return -1.0+2.0*fract(sin(p)*43758.5453); }
    float gnoise(vec3 p){ vec3 i=floor(p),f=fract(p); vec3 u=f*f*(3.0-2.0*f);
      return mix(mix(mix(dot(hash3(i+vec3(0,0,0)),f-vec3(0,0,0)),dot(hash3(i+vec3(1,0,0)),f-vec3(1,0,0)),u.x),
                     mix(dot(hash3(i+vec3(0,1,0)),f-vec3(0,1,0)),dot(hash3(i+vec3(1,1,0)),f-vec3(1,1,0)),u.x),u.y),
                 mix(mix(dot(hash3(i+vec3(0,0,1)),f-vec3(0,0,1)),dot(hash3(i+vec3(1,0,1)),f-vec3(1,0,1)),u.x),
                     mix(dot(hash3(i+vec3(0,1,1)),f-vec3(0,1,1)),dot(hash3(i+vec3(1,1,1)),f-vec3(1,1,1)),u.x),u.y),u.z); }
    vec3 curl(vec3 p){ float e=0.35; vec3 dx=vec3(e,0,0),dy=vec3(0,e,0),dz=vec3(0,0,e);
      float x=gnoise(p+dy)-gnoise(p-dy)-(gnoise(p+dz)-gnoise(p-dz));
      float y=gnoise(p+dz)-gnoise(p-dz)-(gnoise(p+dx)-gnoise(p-dx));
      float z=gnoise(p+dx)-gnoise(p-dx)-(gnoise(p+dy)-gnoise(p-dy));
      return vec3(x,y,z)/(2.0*e); }
    void main(){
      vec3 p=aBase;
      // churning flow
      vec3 fl=curl(p*uFlowScale + vec3(0.0,0.0,uTime*0.05));
      p += fl*uFlowAmp*(0.6+0.8*aSeed);
      // pull + swirl toward the hand
      vec3 toH=uHand-p; float d=length(toH)+0.001; vec3 nH=toH/d;
      float within=smoothstep(7.0,0.0,d);
      float pull=uAttract*uGather*within;
      p += nH*pull*1.2;
      vec3 tang=normalize(cross(toH, vec3(0.0,0.0,1.0))+1e-4);
      p += tang*uSwirl*(0.4+uGather)*within*uHandOn;
      // outward burst on release
      vec3 outw=normalize(p-uHand+1e-4);
      p += outw*uBurst*uBurstForce*(0.5+aSeed);
      // brightness: hotter near hand, twinkle
      vGlow=0.35+within*(0.5+0.9*uGather)+uBurst*0.8+0.15*sin(uTime*3.0+aSeed*40.0);
      vSeed=aSeed;
      vec4 mv=modelViewMatrix*vec4(p,1.0);
      gl_PointSize=uSize*(0.6+0.8*aSeed)*(70.0/-mv.z)*(0.7+vGlow*0.4);
      gl_Position=projectionMatrix*mv;
    }`,
  fragmentShader: `
    uniform sampler2D uTex; uniform vec3 uGold,uPink,uBlue; uniform float uBurst;
    varying float vGlow; varying float vSeed;
    void main(){
      vec4 t=texture2D(uTex,gl_PointCoord); if(t.a<0.02) discard;
      vec3 col=mix(uGold,uPink,smoothstep(0.2,0.8,vSeed));
      col=mix(col,uBlue,smoothstep(0.6,1.0,vSeed)*0.6);
      col=mix(col, vec3(1.0,0.95,0.85), clamp(vGlow-0.9,0.0,1.0)); // white-hot core
      gl_FragColor=vec4(col*(0.14+vGlow*0.5), 1.0)*t;
    }`,
});
const field = new THREE.Points(geo, fieldMat); field.frustumCulled = false; scene.add(field);

/* ── hand cursor glow ────────────────────────────────────────────────────*/
const cursor = new THREE.Mesh(new THREE.CircleGeometry(0.5, 32), new THREE.MeshBasicMaterial({ map: fieldU.uTex.value, color: 0xfff0e0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
cursor.position.z = 0.5; scene.add(cursor);

/* ── control from main ───────────────────────────────────────────────────*/
let gatherTarget = 0, burst = 0, shake = 0, flash = 0;
export function setHand(present, nx, ny, gather) {
  fieldU.uHandOn.value = present ? 1 : 0;
  if (present) { const w = normToWorld(nx, ny); fieldU.uHand.value.set(w.x, w.y, 0); cursor.position.set(w.x, w.y, 0.5); }
  cursor.material.opacity = present ? (0.25 + gather * 0.6) : 0;
  cursor.scale.setScalar(present ? (0.7 + gather * 1.1) : 0.7);
  gatherTarget = present ? gather : 0;
}
export function triggerBurst() { burst = 1; flash = 1; shake = 1.1; after.uniforms.damp.value = CFG.afterimage.burstDamp; }
export function getFlash() { return flash; }

export function update(dt, time) {
  fieldU.uTime.value = time;
  fieldU.uGather.value = lerp(fieldU.uGather.value, gatherTarget, dt * 4);
  burst = Math.max(0, burst - dt * 1.6); fieldU.uBurst.value = burst;
  flash = Math.max(0, flash - dt * 2.2);
  after.uniforms.damp.value = lerp(after.uniforms.damp.value, CFG.afterimage.damp, dt * 3);
  // bloom swells during a burst
  bloom.strength = lerp(bloom.strength, CFG.bloom.base + burst * CFG.bloom.burst + flash * 0.6, 0.25);
  // camera drift + shake
  const dx = Math.sin(time * 0.15) * 0.22, dy = Math.cos(time * 0.11) * 0.14;
  let sx = 0, sy = 0; if (shake > 0) { shake = Math.max(0, shake - dt * 2.4); sx = (Math.random() - 0.5) * shake; sy = (Math.random() - 0.5) * shake; }
  camera.position.x = dx + sx; camera.position.y = dy + sy;
}

export function resize() {
  aspect = window.innerWidth / window.innerHeight; bgMat.uniforms.uAspS.value = aspect;
  camera.left = -VIEW_H * aspect / 2; camera.right = VIEW_H * aspect / 2; camera.top = VIEW_H / 2; camera.bottom = -VIEW_H / 2; camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight); composer.setSize(window.innerWidth, window.innerHeight); bloom.setSize(window.innerWidth / 2, window.innerHeight / 2);
}
window.addEventListener('resize', resize);
export function render() { composer.render(); }
