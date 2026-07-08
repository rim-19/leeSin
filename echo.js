/* ============================================================================
 *  echo.js  —  the ECHO engine (the live "viewport" of THE OP).
 *
 *  A procedural Ionian temple exists only as ~60k points in darkness. Sonar
 *  pings — fired by the beat, the mic, or a click — expand as spherical shells
 *  and light the points they pass through, then everything fades back to black.
 *  "A duelist needs no eyes to see."
 *
 *  SMOOTHNESS CONTRACT
 *  -------------------
 *  · The point cloud is built ONCE into a static GPU buffer. Never touched again.
 *  · A ping is 4 floats in a uniform array (origin.xyz, birth time). All reveal
 *    math happens in the vertex shader → the CPU does ~nothing per frame.
 *  · Every user-facing parameter is lerped toward its target each frame, so
 *    slider drags and beat reactions glide instead of stepping.
 * ==========================================================================*/
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CFG } from './config.js';

export { THREE };
const lerp = (a, b, t) => a + (b - a) * t;

const MAX_PINGS = 12;

/* ── procedural temple point cloud ───────────────────────────────────────
   Columns, a stepped platform, two torii gates, hanging lanterns, a seated
   figure silhouette, and drifting dust — all just points. */
function buildTemple() {
  const pts = [], extra = []; // extra: per-point [type, seed]
  const P = (x, y, z, type = 0) => { pts.push(x, y, z); extra.push(type, Math.random()); };
  const R = (a, b) => a + Math.random() * (b - a);

  // stepped platform
  for (let s = 0; s < 3; s++) {
    const w = 16 - s * 2.4, d = 9 - s * 1.4, y = -3 + s * 0.42;
    const n = 2600 - s * 500;
    for (let i = 0; i < n; i++) {
      const e = Math.random() < 0.5; // edge-biased
      let x = R(-w / 2, w / 2), z = R(-d / 2, d / 2);
      if (e) { if (Math.random() < 0.5) x = Math.sign(x) * w / 2 * R(0.96, 1); else z = Math.sign(z) * d / 2 * R(0.96, 1); }
      P(x, y + R(0, 0.06), z, 0);
    }
  }
  // columns (two rows)
  for (const cx of [-6.4, -3.2, 3.2, 6.4]) {
    for (const cz of [-2.6, 2.6]) {
      for (let i = 0; i < 1500; i++) {
        const a = R(0, Math.PI * 2), r = 0.42 * R(0.92, 1);
        const y = R(-1.8, 2.6);
        // capital + base bulges
        const bulge = (y > 2.3 || y < -1.5) ? 1.35 : 1.0;
        P(cx + Math.cos(a) * r * bulge, y, cz + Math.sin(a) * r * bulge, 1);
      }
    }
  }
  // roof beams
  for (let i = 0; i < 3000; i++) {
    const x = R(-7.2, 7.2);
    const y = 2.9 + Math.abs(x) * -0.04 + R(0, 0.12);
    P(x, y, R(-3.0, 3.0) * (Math.random() < 0.8 ? 1 : 0.2), 1);
  }
  // torii gates (front / back)
  for (const gz of [-5.4, 5.4]) {
    for (let i = 0; i < 1200; i++) {
      const t = Math.random();
      if (t < 0.42) { const s = Math.random() < 0.5 ? -1 : 1; P(s * 2.2 + R(-0.13, 0.13), R(-3, 2.2), gz + R(-0.13, 0.13), 2); }
      else if (t < 0.8) { P(R(-2.9, 2.9), 2.2 + R(0, 0.22), gz + R(-0.16, 0.16), 2); }
      else { P(R(-3.4, 3.4), 2.75 + Math.cos(R(-1, 1)) * 0.25, gz + R(-0.16, 0.16), 2); }
    }
  }
  // hanging lanterns
  for (let k = 0; k < 10; k++) {
    const lx = R(-7, 7), lz = R(-3.4, 3.4), ly = R(0.6, 2.2);
    for (let i = 0; i < 260; i++) {
      const a = R(0, Math.PI * 2), b = R(0, Math.PI);
      const r = 0.24 * R(0.85, 1);
      P(lx + r * Math.sin(b) * Math.cos(a), ly + r * Math.cos(b) * 1.4, lz + r * Math.sin(b) * Math.sin(a), 3);
    }
  }
  // seated monk silhouette at center
  for (let i = 0; i < 4200; i++) {
    const t = Math.random();
    let x, y, z;
    if (t < 0.45) { const a = R(0, Math.PI * 2); const r = 0.85 * Math.sqrt(Math.random()); x = Math.cos(a) * r; z = Math.sin(a) * r * 0.75; y = -2.2 + R(0, 0.75) * (1 - r * 0.5); } // crossed legs
    else if (t < 0.8) { const a = R(0, Math.PI * 2); const h = R(0, 1); const r = 0.5 * (1 - h * 0.35); x = Math.cos(a) * r; z = Math.sin(a) * r * 0.8; y = -1.5 + h * 1.15; } // torso
    else if (t < 0.93) { const a = R(0, Math.PI * 2), b = R(0, Math.PI); const r = 0.3; x = r * Math.sin(b) * Math.cos(a); y = 0 + r * Math.cos(b) * 1.1; z = r * Math.sin(b) * Math.sin(a) * 0.9; } // head
    else { const s = Math.random() < 0.5 ? -1 : 1; const h = R(0, 1); x = s * (0.5 + h * 0.25); y = -1.4 + h * 0.6; z = 0.35 + R(-0.1, 0.1); } // arms
    P(x, y, z, 4);
  }
  // ambient dust
  for (let i = 0; i < 6000; i++) P(R(-11, 11), R(-3.2, 4.6), R(-7, 7), 5);

  return { pos: new Float32Array(pts), meta: new Float32Array(extra), count: pts.length / 3 };
}

/* ── engine ──────────────────────────────────────────────────────────────*/
let renderer, scene, camera, composer, bloomPass, points, mat;
let live = {};            // lerped live params
let target = CFG.params;  // slider targets (shared object, mutated by app UI)
const pingData = new Float32Array(MAX_PINGS * 4).fill(-1e3);
let pingCursor = 0, revealBoost = 0, perform = 0;

export function init(container) {
  renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  container.appendChild(renderer.domElement);
  renderer.domElement.id = 'echo-canvas';

  scene = new THREE.Scene();
  scene.background = new THREE.Color(CFG.colors.bg);
  camera = new THREE.PerspectiveCamera(50, 1, 0.1, 120);
  camera.position.set(0, 0.4, 13);

  const t = buildTemple();
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(t.pos, 3));
  geo.setAttribute('aMeta', new THREE.BufferAttribute(t.meta, 2));

  // fill live params from targets
  for (const k in target) live[k] = target[k];

  mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uPings: { value: pingData },
      uSpeed: { value: live.pingSpeed }, uThick: { value: live.thickness }, uDecay: { value: live.decay },
      uDensity: { value: live.density }, uHue: { value: live.hue }, uHue2: { value: live.hue2 },
      uLevel: { value: live.brightness }, uBoost: { value: 0 },
    },
    vertexShader: `
      attribute vec2 aMeta;
      uniform float uTime,uSpeed,uThick,uDecay,uDensity,uBoost;
      uniform vec4 uPings[${MAX_PINGS}];
      varying float vGlow; varying float vType; varying float vSeed;
      void main(){
        vType=aMeta.x; vSeed=aMeta.y;
        vec3 p=position;
        // dust drifts slowly; everything else is still
        if(vType>4.5){ p.y+=sin(uTime*0.25+vSeed*40.0)*0.3; p.x+=cos(uTime*0.18+vSeed*31.0)*0.3; }
        float glow=0.0;
        for(int i=0;i<${MAX_PINGS};i++){
          vec4 pg=uPings[i];
          float age=uTime-pg.w;
          if(age<0.0||age>7.0) continue;
          float shell=abs(distance(p,pg.xyz)-age*uSpeed);
          glow+=smoothstep(uThick,0.0,shell)*exp(-age*uDecay);
        }
        // faint ambient shimmer so the void isn't 100% empty
        glow+=0.004+uBoost*0.012;
        // lanterns keep a tiny pilot light
        if(vType>2.5&&vType<3.5) glow+=0.03;
        vGlow=glow;
        // density culling (stable per-point via seed)
        float culled=step(vSeed,uDensity);
        vec4 mv=modelViewMatrix*vec4(p,1.0);
        float sz=(vType>4.5?0.9:1.3)*(0.7+0.6*vSeed);
        gl_PointSize=sz*(46.0/-mv.z)*(0.6+min(vGlow,1.4))*culled;
        gl_Position=projectionMatrix*mv;
      }`,
    fragmentShader: `
      uniform float uHue,uHue2,uLevel;
      varying float vGlow; varying float vType; varying float vSeed;
      vec3 hsl2rgb(vec3 c){ vec3 rgb=clamp(abs(mod(c.x*6.0+vec3(0.0,4.0,2.0),6.0)-3.0)-1.0,0.0,1.0);
        return c.z+c.y*(rgb-0.5)*(1.0-abs(2.0*c.z-1.0)); }
      void main(){
        float d=length(gl_PointCoord-0.5); if(d>0.5) discard;
        float soft=smoothstep(0.5,0.05,d);
        float h=mix(uHue,uHue2,step(0.5,fract(vSeed*7.31)));      // two-tone chi
        if(vType>3.5&&vType<4.5) h=uHue2;                          // the monk glows gold
        vec3 col=hsl2rgb(vec3(h,0.85,0.6));
        col=mix(col,vec3(1.0),clamp(vGlow-1.1,0.0,0.6));           // hot core → white
        float a=soft*min(vGlow,1.5)*uLevel;
        if(a<0.004) discard;
        gl_FragColor=vec4(col*a*1.7,a);
      }`,
  });
  points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  scene.add(points);

  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  bloomPass = new UnrealBloomPass(new THREE.Vector2(2, 2), live.bloomStrength, live.bloomRadius, 0.25);
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());
  window.__echo = { renderer, scene, camera, composer, bloomPass, mat, live, pingData, CFG }; // debug hook
  return renderer.domElement;
}

/* fire a sonar ping. origin defaults to the monk's heart. strength bumps bloom. */
export function ping(x = 0, y = -0.9, z = 0, strength = 1) {
  const i = pingCursor; pingCursor = (pingCursor + 1) % MAX_PINGS;
  pingData[i * 4] = x; pingData[i * 4 + 1] = y; pingData[i * 4 + 2] = z;
  pingData[i * 4 + 3] = _time;
  revealBoost = Math.min(1.2, revealBoost + 0.35 * strength);
}
/* map a viewport click (0..1) into the temple and ping there */
export function pingAtScreen(nx, ny) {
  const v = new THREE.Vector3(nx * 2 - 1, -(ny * 2 - 1), 0.5).unproject(camera);
  const dir = v.sub(camera.position).normalize();
  const t = -camera.position.z / dir.z; // plane z=0
  const p = camera.position.clone().add(dir.multiplyScalar(t));
  ping(THREE.MathUtils.clamp(p.x, -9, 9), THREE.MathUtils.clamp(p.y, -3, 4), 0, 1);
}

export function setPerform(v) { perform = v ? 1 : 0; }

let _time = 0;
export function update(dt, audioLevel = 0) {
  _time += dt;
  // glide every live param toward its slider target — this is the smoothness
  const G = 1 - Math.pow(0.0018, dt); // ≈ fast but eased
  for (const k in target) live[k] = lerp(live[k], target[k], G);
  revealBoost = Math.max(0, revealBoost - dt * 0.9);

  mat.uniforms.uTime.value = _time;
  mat.uniforms.uSpeed.value = live.pingSpeed;
  mat.uniforms.uThick.value = live.thickness;
  mat.uniforms.uDecay.value = live.decay;
  mat.uniforms.uDensity.value = live.density;
  mat.uniforms.uHue.value = live.hue;
  mat.uniforms.uHue2.value = live.hue2;
  mat.uniforms.uLevel.value = live.brightness;
  mat.uniforms.uBoost.value = revealBoost + audioLevel * live.sensitivity;
  mat.uniforms.uPings.needsUpdate = true;

  bloomPass.strength = lerp(bloomPass.strength, live.bloomStrength + revealBoost * 0.5, 0.15);
  bloomPass.radius = live.bloomRadius;

  // slow cinematic orbit, slightly wider in perform mode
  const orbit = 0.10, rad = 13 - perform * 1.5;
  camera.position.x = Math.sin(_time * orbit) * rad * 0.28;
  camera.position.z = rad - Math.abs(Math.sin(_time * orbit * 0.7)) * 1.2;
  camera.position.y = 0.4 + Math.sin(_time * 0.07) * 0.35;
  camera.lookAt(0, -0.4, 0);

  composer.render();
}

export function resize(w, h) {
  camera.aspect = w / h; camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  bloomPass.setSize(w / 2, h / 2);
}
export function getTime() { return _time; }
