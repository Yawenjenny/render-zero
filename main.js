import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { VRButton } from 'three/addons/webxr/VRButton.js';

// ---------- tuning ----------
const M = 'assets/models/';
// the giant palm: `level` tips the model until the palm lies flat, `squash` then softens what relief is left
const HAND = { len: 18, flip: false, yaw: -Math.PI / 2, shift: [-0.8, -4.0], squash: 0.6, level: [-0.28, -0.09] };
// Each creation: where it stands, how long it has, and which fragment its socket accepts
// (socket positions are fractions of the model's width / height / depth).
const CREATIONS = [
  { key: 'phoenix', files: ['phoenix', 'bird_c'], glow: 0.3, H: 1.8, yaw: 0, pos: [0.4, -3.6], rest: 0.35, time: 100,
    sockets: [{ kind: 'wing', accept: 'fan', side: -1, at: [-0.2, 0.6, 0.0], size: 0.95 }, { kind: 'wing', accept: 'fan', side: 1, at: [0.2, 0.6, 0.0], size: 0.95 }] },
  { key: 'guardian', files: ['guardian2', 'guardian'], H: 1.9, yaw: 0, pos: [-1.9, -2.3], rest: 0.5, time: 150,
    sockets: [{ kind: 'arm', accept: 'door', at: [0.95, 0.72, 0.1], size: 1.15 }] },
  { key: 'temple', files: ['temple', 'house'], H: 2.0, yaw: 0, pos: [2.75, -2.7], rest: -0.45, time: 200,
    sockets: [{ kind: 'roof', accept: 'leaf', at: [0, 1.0, 0], size: 3.0 }] },
];
const FRAGMENTS = [
  { key: 'fanA', type: 'fan', glow: 0.14, files: ['fan', 'leaf_c'], len: 0.8, home: [-0.9, 1.25, -0.9], flowers: 9 },
  { key: 'fanB', type: 'fan', glow: 0.14, files: ['fan', 'leaf_c'], len: 0.8, home: [1.5, 1.3, -1.0], flowers: 9 },
  { key: 'door', type: 'door', files: ['door2', 'door'], len: 1.1, home: [3.0, 1.4, 0.0], flowers: 8 },
  { key: 'leaf', type: 'leaf', files: ['yleaf', 'leaf_c'], len: 1.4, home: [-2.9, 1.6, 1.0], flowers: 0 },
];
const SKY_START_TURN = 0.75;      // turn each panorama (0..1 = full circle) so its best view sits ahead of the player
const SKY_END_TURN = 0.75;
const START = [0, 1.8];
// The living world is a Gaussian splat. It is sharpest seen from the point it was generated from, so that point is
// put at eye height where the player stands, and the world is scaled until its ground meets the palm.
// The full world is 1.9 million splats, which integrated and phone graphics chips cannot draw smoothly, so those
// get the 500,000-splat version. Add ?splat=full or ?splat=low to the address to choose by hand.
function weakGraphics() {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const name = info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : '';
    return /Intel|Mali|Adreno|PowerVR|SwiftShader|llvmpipe|Microsoft Basic/i.test(name) && !/Arc\b/i.test(name);
  } catch (e) { return false; }
}
const SPLAT = new URLSearchParams(location.search).get('splat');
const LOW = SPLAT ? SPLAT === 'low' : weakGraphics();
const WORLD = { file: LOW ? 'assets/world_500k.spz' : 'assets/world_full_res.spz', fallback: 'assets/world_500k.spz', collider: 'assets/world_collider.glb',
  centre: [0, 0.4], eye: 1.45, ground: -0.8, yaw: 0,
  scale: 4.75,                       // re-measured from the world's ground mesh when it loads
  reach: [0, 10, 24, 1e5],           // metres of world revealed after 0 / 1 / 2 / 3 saves
  far: [0, 0],                       // world units beyond which splats hand over to the panorama (0, 0 = never)
  extent: 120 };                     // world units after which the reveal counts as finished
const WIRE = 0.3;                 // how strong the mesh lines are on a white model (0 = none)
const WIRE_MAX_TRIS = 60000;      // denser models than this get no lines (they would read as a solid colour)

const V3 = THREE.Vector3;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
let seed = 11;
const rnd = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

// ---------- renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, LOW ? 1 : 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.xr.enabled = true;
document.body.appendChild(renderer.domElement);
// the ENTER VR button appears only on a device that can start a VR session
if (navigator.xr && navigator.xr.isSessionSupported) {
  navigator.xr.isSessionSupported('immersive-vr').then(ok => { if (ok) document.body.appendChild(VRButton.createButton(renderer)); }).catch(() => {});
}

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x121418, 0.03);
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 500);
const rig = new THREE.Group();
rig.position.set(START[0], 0, START[1]);
camera.position.set(0, 1.6, 0);
rig.add(camera);
scene.add(rig);
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// Lights and fog blend from a grey "dead" colour to a "living" one as the world comes alive.
const tints = [];
function tint(color, to, from) {
  tints.push({ c: color, from: new THREE.Color(from), to: new THREE.Color(to) });
  color.copy(tints[tints.length - 1].from);
}
const hemi = new THREE.HemisphereLight(0xffffff, 0xffffff, 1.2);
tint(hemi.color, 0xffe6cc, 0x8a93a0);
tint(hemi.groundColor, 0x6a5a7a, 0x2c3036);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 1.8);
sun.position.set(-4, 7, 4);
tint(sun.color, 0xffc58a, 0xcfd8e6);
scene.add(sun);
tint(scene.fog.color, 0xc99a94, 0x121418);
const flash = new THREE.PointLight(0xffd070, 0, 14, 1.6);   // the gold flash of a magic moment
scene.add(flash);

// Every model starts as a white model with its mesh lines showing. Its "life" brings the texture in;
// "reveal" is a wave of colour that spreads outward from the point where the right part was attached.
const mkUni = (v = 0, glow = 0) => ({ value: v, origin: { value: new V3() }, reveal: { value: -1 }, glow: { value: glow } });
const LIFE = mkUni(0), FULL = mkUni(1, 0.85);
const wires = [];
function colourise(obj, uni, wire = false) {
  const meshes = [];
  let tris = 0;
  obj.traverse(o => { if (o.isMesh) { meshes.push(o); tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; } });
  const wm = wire && tris < WIRE_MAX_TRIS ? new THREE.LineBasicMaterial({ color: 0xbfe9f7, transparent: true, opacity: WIRE, depthWrite: false }) : null;
  if (wm) wires.push({ m: wm, uni });
  meshes.forEach(o => {
    if (wm) o.add(new THREE.LineSegments(new THREE.WireframeGeometry(o.geometry), wm));
    const m = o.material = o.material.clone();
    m.onBeforeCompile = sh => {
      sh.uniforms.uLife = uni; sh.uniforms.uOrigin = uni.origin; sh.uniforms.uReveal = uni.reveal; sh.uniforms.uGlow = uni.glow;
      sh.vertexShader = sh.vertexShader
        .replace('void main() {', 'varying vec3 vRZ;\nvoid main() {')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vRZ = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader
        .replace('void main() {', 'uniform float uLife; uniform vec3 uOrigin; uniform float uReveal; uniform float uGlow; varying vec3 vRZ;\nvoid main() {')
        .replace('#include <map_fragment>', `#include <map_fragment>
          float rzD = distance(vRZ, uOrigin);
          float rzIn = (1.0 - smoothstep(uReveal - 0.25, uReveal, rzD)) * step(0.0, uReveal);
          float rzEdge = smoothstep(uReveal - 0.5, uReveal - 0.06, rzD) * (1.0 - smoothstep(uReveal - 0.06, uReveal + 0.06, rzD)) * step(0.0, uReveal);
          float rzMix = max(uLife, rzIn);
          diffuseColor.rgb = mix(vec3(0.60 + 0.28 * dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11))), diffuseColor.rgb, rzMix);`)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = mix(0.85, roughnessFactor, rzMix);')
        .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n  metalnessFactor *= rzMix * 0.75;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += vec3(1.0, 0.74, 0.22) * rzEdge * 3.0 + diffuseColor.rgb * uGlow * rzMix;');
    };
  });
  obj.userData.tris = Math.round(tris);
  return obj;
}

// ---------- text ----------
function makeText(text, { w = 1024, h = 128, size = 60, color = '#cfd6dd', width = 2 } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(width, width * h / w, 1);
  let last = null;
  function set(t, col = color) {
    if (t + col === last) return;
    last = t + col;
    ctx.clearRect(0, 0, w, h);
    ctx.font = `${size}px Consolas, "Courier New", monospace`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,.9)'; ctx.shadowBlur = 10;
    ctx.fillStyle = col;
    ctx.fillText(t, w / 2, h / 2);
    tex.needsUpdate = true;
  }
  set(text);
  return { sprite, set, mat };
}
const sky1 = makeText('', { size: 70, color: '#ffffff', width: 7 });
sky1.sprite.position.set(0, 3.9, -7);
sky1.mat.opacity = 0; sky1.mat.depthTest = false; sky1.sprite.renderOrder = 10;
scene.add(sky1.sprite);
let skyUntil = 0;
function say(text, dur) { sky1.set(text); skyUntil = G.clock + dur; }

// Deletion clock: seven-segment digits with running hundredths, a draining bar, and a red panic below ten seconds.
const SEG = { 0: 'abcdef', 1: 'bc', 2: 'abdeg', 3: 'abcdg', 4: 'bcfg', 5: 'acdfg', 6: 'acdefg', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg' };
function seg7(ctx, x, y, w, h, digit, on, off) {
  const t = w * 0.17, g = t * 0.3, hh = h / 2;
  const hbar = (px, py, L) => { ctx.beginPath(); ctx.moveTo(px, py + t / 2); ctx.lineTo(px + t / 2, py); ctx.lineTo(px + L - t / 2, py); ctx.lineTo(px + L, py + t / 2); ctx.lineTo(px + L - t / 2, py + t); ctx.lineTo(px + t / 2, py + t); ctx.closePath(); ctx.fill(); };
  const vbar = (px, py, L) => { ctx.beginPath(); ctx.moveTo(px + t / 2, py); ctx.lineTo(px + t, py + t / 2); ctx.lineTo(px + t, py + L - t / 2); ctx.lineTo(px + t / 2, py + L); ctx.lineTo(px, py + L - t / 2); ctx.lineTo(px, py + t / 2); ctx.closePath(); ctx.fill(); };
  const draw = { a: () => hbar(x + g, y, w - 2 * g), g: () => hbar(x + g, y + hh - t / 2, w - 2 * g), d: () => hbar(x + g, y + h - t, w - 2 * g),
    f: () => vbar(x, y + g, hh - g), b: () => vbar(x + w - t, y + g, hh - g), e: () => vbar(x, y + hh, hh - g), c: () => vbar(x + w - t, y + hh, hh - g) };
  const lit = SEG[digit];
  ctx.shadowBlur = 0; ctx.fillStyle = off;
  for (const k in draw) if (!lit.includes(k)) draw[k]();
  ctx.shadowBlur = 18; ctx.fillStyle = on;
  for (const k of lit) draw[k]();
}
function makeClock() {
  const W = 640, H = 224;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }));
  const base = 1.75;
  function timer(time, total) {
    const panic = time < 10, warn = time < 30;
    const blink = panic && Math.floor(time * 6) % 2 === 0;
    const col = blink ? '#ffffff' : panic ? '#ff2a1a' : warn ? '#ff5a3c' : '#ffb14a';
    const off = panic ? 'rgba(255,60,40,.13)' : 'rgba(255,170,90,.10)';
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    if (panic) ctx.translate((Math.random() - 0.5) * 7, (Math.random() - 0.5) * 3);
    ctx.shadowColor = panic ? '#ff2a1a' : col;
    ctx.shadowBlur = 12; ctx.fillStyle = col;
    ctx.font = '600 24px Consolas, "Courier New", monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    try { ctx.letterSpacing = '9px'; } catch (e) { /* older browsers */ }
    ctx.fillText('PERMANENT DELETION IN', W / 2 + 4, 24);
    ctx.transform(1, 0, -0.09, 1, 14, 0);
    const t = Math.max(0, time), mm = Math.floor(t / 60), ss = Math.floor(t % 60), cc = Math.floor((t * 100) % 100);
    const d = [Math.floor(mm / 10), mm % 10, Math.floor(ss / 10), ss % 10];
    let x = 70;
    const y = 50, w = 66, h = 112;
    d.forEach((n, i) => {
      seg7(ctx, x, y, w, h, n, col, off);
      x += w + 14;
      if (i === 1) {
        ctx.shadowBlur = 16; ctx.fillStyle = (t * 2) % 1 < 0.5 || panic ? col : off;
        ctx.fillRect(x + 2, y + h * 0.28, 12, 12); ctx.fillRect(x + 2, y + h * 0.66, 12, 12);
        x += 30;
      }
    });
    ctx.fillStyle = col; ctx.fillRect(x, y + h - 12, 10, 10);
    x += 20;
    seg7(ctx, x, y + 44, 40, 68, Math.floor(cc / 10), col, off);
    seg7(ctx, x + 50, y + 44, 40, 68, cc % 10, col, off);
    ctx.restore();
    // the bar that drains
    const f = Math.max(0, Math.min(1, time / total));
    ctx.shadowBlur = 0; ctx.fillStyle = off; ctx.fillRect(70, 184, 500, 10);
    ctx.shadowColor = col; ctx.shadowBlur = 14; ctx.fillStyle = col; ctx.fillRect(70, 184, 500 * f, 10);
    if (panic && Math.random() < 0.35) {   // a torn scanline
      const yy = 40 + Math.random() * 130;
      ctx.drawImage(c, 0, yy, W, 10, (Math.random() - 0.5) * 40, yy, W, 10);
    }
    tex.needsUpdate = true;
    // every second lands with a beat; it hits harder as time runs out
    const beat = Math.max(0, ((time % 1) - 0.72) / 0.28);
    const s = base * (1 + beat * (panic ? 0.16 : warn ? 0.08 : 0.03));
    sprite.scale.set(s, s * H / W, 1);
  }
  function message(text, col) {
    ctx.clearRect(0, 0, W, H);
    ctx.shadowColor = col; ctx.shadowBlur = 18; ctx.fillStyle = col;
    ctx.font = '600 40px Consolas, "Courier New", monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    try { ctx.letterSpacing = '6px'; } catch (e) { /* older browsers */ }
    ctx.fillText(text, W / 2, H / 2);
    tex.needsUpdate = true;
    sprite.scale.set(base, base * H / W, 1);
  }
  return { sprite, timer, message };
}

// ---------- sky ----------
const skyMat = new THREE.ShaderMaterial({
  uniforms: { mapA: { value: null }, hasA: { value: 0 }, offA: { value: SKY_START_TURN },
    mapB: { value: null }, hasB: { value: 0 }, offB: { value: SKY_END_TURN }, life: { value: 0 } },
  vertexShader: `varying vec2 vUv; varying vec3 vDir;
    void main(){ vUv = uv; vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `uniform sampler2D mapA; uniform sampler2D mapB; uniform float hasA; uniform float hasB;
    uniform float offA; uniform float offB; uniform float life;
    varying vec2 vUv; varying vec3 vDir;
    void main(){
      vec3 col;
      if (hasB > 0.5) { col = texture2D(mapB, vec2(vUv.x + offB, vUv.y)).rgb;
        col = mix(vec3(dot(col, vec3(0.299,0.587,0.114))), col, 1.3) * 1.35; }
      else { float h = normalize(vDir).y;
        col = mix(vec3(0.90,0.52,0.36), vec3(0.20,0.24,0.50), smoothstep(-0.05,0.6,h)); }
      vec3 dead;
      if (hasA > 0.5) {
        vec3 a = texture2D(mapA, vec2(vUv.x + offA, vUv.y)).rgb;
        dead = mix(a, vec3(dot(a, vec3(0.299,0.587,0.114))), 0.8) * 0.6 + vec3(0.01,0.012,0.016);
      } else {
        dead = vec3(dot(col, vec3(0.299,0.587,0.114))) * 0.30 + vec3(0.025,0.03,0.04);
      }
      col = mix(dead, col, smoothstep(0.0, 1.0, life));
      gl_FragColor = vec4(col, 1.0);
      #include <colorspace_fragment>
    }`,
  side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false,
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(200, 64, 32), skyMat);
sky.scale.x = -1;
sky.renderOrder = -1;
scene.add(sky);

// ---------- effects ----------
// Socket indicator: a soft ring of light with a glint running round it and ripples breathing outward.
const ringGeo = new THREE.PlaneGeometry(1, 1);
function makeIndicator(size) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { t: { value: 0 }, hot: { value: 0 }, bad: { value: 0 }, dim: { value: 1 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform float t; uniform float hot; uniform float bad; uniform float dim; varying vec2 vUv;
      void main(){
        vec2 p = vUv * 2.0 - 1.0; float r = length(p); float a = atan(p.y, p.x);
        float ring = exp(-pow((r - 0.56) / 0.035, 2.0));
        float halo = exp(-pow((r - 0.56) / 0.2, 2.0)) * 0.4;
        float core = exp(-r * r * 9.0) * 0.3 * (0.6 + 0.4 * sin(t * 3.0));
        float glint = pow(0.5 + 0.5 * sin(a - t * 2.6), 8.0) + pow(0.5 + 0.5 * sin(a * 3.0 + t * 1.6), 12.0) * 0.4;
        float f = fract(t * 0.5);
        float ripple = exp(-pow((r - f) / 0.045, 2.0)) * (1.0 - f) * 0.55;
        float I = ring * (0.5 + 1.1 * glint) + halo + core + ripple;
        I *= smoothstep(1.0, 0.8, r) * dim;
        vec3 col = mix(mix(vec3(0.35, 0.9, 1.0), vec3(1.0, 0.82, 0.38), hot), vec3(1.0, 0.2, 0.15), bad);
        gl_FragColor = vec4(col * I * (1.0 + hot), I);
      }`,
    transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, fog: false,
  });
  const mesh = new THREE.Mesh(ringGeo, mat);
  mesh.scale.setScalar(size);
  mesh.renderOrder = 6;
  mesh.userData.size = size;
  return mesh;
}

// Gold sparkles: one pool of star-shaped points.
const SP = 2200;
const sp = { pos: new Float32Array(SP * 3), vel: new Float32Array(SP * 3), age: new Float32Array(SP).fill(9), life: new Float32Array(SP).fill(1),
  size: new Float32Array(SP), alpha: new Float32Array(SP), ph: new Float32Array(SP), next: 0 };
const spGeo = new THREE.BufferGeometry();
spGeo.setAttribute('position', new THREE.BufferAttribute(sp.pos, 3));
spGeo.setAttribute('aSize', new THREE.BufferAttribute(sp.size, 1));
spGeo.setAttribute('aAlpha', new THREE.BufferAttribute(sp.alpha, 1));
const spMesh = new THREE.Points(spGeo, new THREE.ShaderMaterial({
  uniforms: { px: { value: 1 } },
  vertexShader: `attribute float aSize; attribute float aAlpha; varying float vA; uniform float px;
    void main(){ vA = aAlpha; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
      gl_PointSize = aSize * px * projectionMatrix[1][1] / max(0.1, -mv.z); }`,
  fragmentShader: `varying float vA;
    void main(){ vec2 p = gl_PointCoord * 2.0 - 1.0; float d = length(p);
      float core = exp(-d * d * 9.0);
      float star = exp(-abs(p.x) * 16.0) * exp(-abs(p.y) * 2.6) + exp(-abs(p.y) * 16.0) * exp(-abs(p.x) * 2.6);
      float I = (core + star * 0.8) * vA;
      gl_FragColor = vec4(mix(vec3(1.0, 0.72, 0.2), vec3(1.0, 0.97, 0.8), core) * I, I); }`,
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
}));
spMesh.frustumCulled = false;
scene.add(spMesh);
const bufSize = new THREE.Vector2();
function spark(x, y, z, vx, vy, vz, life, size) {
  const i = sp.next; sp.next = (i + 1) % SP;
  sp.pos[i * 3] = x; sp.pos[i * 3 + 1] = y; sp.pos[i * 3 + 2] = z;
  sp.vel[i * 3] = vx; sp.vel[i * 3 + 1] = vy; sp.vel[i * 3 + 2] = vz;
  sp.age[i] = 0; sp.life[i] = life; sp.size[i] = size; sp.ph[i] = Math.random() * 6.28;
}
// a burst that leaves a point in all directions
function burst(p, n, speed, size = 0.09) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * 6.28, u = Math.random() * 2 - 1, s = Math.sqrt(1 - u * u), v = speed * (0.3 + Math.random());
    spark(p.x, p.y, p.z, Math.cos(a) * s * v, u * v + 0.6, Math.sin(a) * s * v, 0.9 + Math.random() * 1.3, size * (0.5 + Math.random()));
  }
}
// sparkles spiralling up around something
function swirl(p, radius, height, n) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * 6.28, r = radius * (0.6 + Math.random() * 0.6);
    spark(p.x + Math.cos(a) * r, p.y + Math.random() * height * 0.4, p.z + Math.sin(a) * r,
      -Math.sin(a) * 1.3, 0.7 + Math.random() * 1.3, Math.cos(a) * 1.3, 1.4 + Math.random() * 1.6, 0.07 + Math.random() * 0.09);
  }
}
function updateSparks(dt, t) {
  for (let i = 0; i < SP; i++) {
    if (sp.age[i] >= sp.life[i]) { sp.alpha[i] = 0; continue; }
    sp.age[i] += dt;
    const k = sp.age[i] / sp.life[i], j = i * 3;
    sp.vel[j] *= 1 - dt * 1.4; sp.vel[j + 2] *= 1 - dt * 1.4; sp.vel[j + 1] += (0.25 - sp.vel[j + 1]) * dt * 1.2;
    sp.pos[j] += sp.vel[j] * dt; sp.pos[j + 1] += sp.vel[j + 1] * dt; sp.pos[j + 2] += sp.vel[j + 2] * dt;
    sp.alpha[i] = Math.sin(Math.min(1, k * 6) * 1.57) * (1 - k) * (0.55 + 0.45 * Math.sin(t * 18 + sp.ph[i]));
  }
  spGeo.attributes.position.needsUpdate = true; spGeo.attributes.aAlpha.needsUpdate = true; spGeo.attributes.aSize.needsUpdate = true;
  spMesh.material.uniforms.px.value = renderer.getDrawingBufferSize(bufSize).y * 0.5;
}
// a ring of light racing across the ground
const waves = [];
for (let i = 0; i < 3; i++) {
  const m = new THREE.Mesh(ringGeo, new THREE.ShaderMaterial({
    uniforms: { k: { value: 1 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform float k; varying vec2 vUv;
      void main(){ float r = length(vUv * 2.0 - 1.0);
        float I = (exp(-pow((r - k) / 0.03, 2.0)) + exp(-pow((r - k) / 0.14, 2.0)) * 0.35 * step(r, k)) * (1.0 - k) * smoothstep(1.0, 0.9, r);
        gl_FragColor = vec4(vec3(1.0, 0.8, 0.35) * I * 1.6, I); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
  }));
  m.rotation.x = -Math.PI / 2; m.scale.setScalar(12); m.visible = false;
  scene.add(m);
  waves.push({ m, k: 1 });
}
function wave(p) {
  const w = waves.find(x => x.k >= 1) || waves[0];
  w.k = 0; w.m.position.set(p.x, p.y + 0.12, p.z); w.m.visible = true;
}

// lights that become stars
const glowTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,230,190,.7)'); g.addColorStop(1, 'rgba(255,200,150,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();
const haloMat = new THREE.SpriteMaterial({ map: glowTex, color: 0xffc94a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, opacity: 0.5 });
const stars = [];
for (let i = 0; i < 16; i++) {
  const a = (i / 16) * Math.PI * 2 + rnd(), r = 3 + rnd() * 4;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, fog: false, opacity: 0 }));
  scene.add(s);
  stars.push({ s, pos: new V3(Math.cos(a) * r, 1.3 + rnd() * 2.6, Math.sin(a) * r - 1), up: 9 + rnd() * 16, ph: rnd() * 6, out: 1.5 + rnd() * 2.5 });
}

// ---------- model helpers ----------
// Every file is fetched through one counter, so the overlay can show real loading progress.
const loader = new GLTFLoader();
const wanted = [], prog = { loaded: 0, total: 0, ready: 0 };
function showProgress() {
  const got = prog.total ? Math.min(1, prog.loaded / prog.total) : 0;
  const k = got * 0.9 + (wanted.length ? prog.ready / wanted.length : 0) * 0.1;
  const mb = b => (b / 1048576).toFixed(0);
  document.getElementById('fill').style.width = (k * 100).toFixed(1) + '%';
  document.querySelector('#overlay .go').textContent = prog.ready === wanted.length ? 'BUILDING THE WORLD'
    : got < 1 ? 'LOADING ' + Math.round(k * 100) + '%   ' + mb(prog.loaded) + ' / ' + mb(prog.total) + ' MB' : 'PREPARING ' + Math.round(k * 100) + '%';
}
// ask for a file: the first of `urls` that exists, turned into something usable by `parse`
function want(urls, parse) {
  const w = { urls, parse, url: null, size: 0 };
  w.ready = new Promise(res => { w.done = res; });
  wanted.push(w);
  return w;
}
async function download(w) {
  for (const url of w.url ? [w.url] : w.urls) {
    let r;
    try { r = await fetch(url); } catch (e) { continue; }
    if (!r.ok) continue;
    w.url = url;
    const reader = r.body.getReader(), chunks = [];
    let n = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value); n += value.length;
      prog.loaded += value.length;
      if (prog.loaded > prog.total) prog.total = prog.loaded;
      showProgress();
    }
    const bytes = new Uint8Array(n);
    let o = 0;
    for (const c of chunks) { bytes.set(c, o); o += c.length; }
    return bytes;
  }
  return null;
}
async function loadAll() {
  // sizes first, so the bar knows the total before anything downloads
  await Promise.all(wanted.map(async w => {
    for (const url of w.urls) {
      try {
        const r = await fetch(url, { method: 'HEAD' });
        if (r.ok) { w.url = url; w.size = +r.headers.get('Content-Length') || 0; return; }
      } catch (e) { /* try the next candidate */ }
    }
  }));
  prog.total = wanted.reduce((sum, w) => sum + w.size, 0);
  showProgress();
  wanted.forEach(async w => {
    let out = null;
    try {
      const bytes = await download(w);
      if (bytes) out = await w.parse(bytes, w.url);
    } catch (e) { console.warn('could not load', w.urls[0], e); }
    prog.ready++;
    showProgress();
    w.done(out);
  });
}
// A rigged export can arrive with a skeleton whose bones were never posed, which scrambles the mesh when it is
// drawn skinned (and leaves its wireframe behind). Nothing here is animated by bones, so skinned meshes become plain ones.
function unskin(root) {
  const skinned = [];
  root.traverse(o => { if (o.isSkinnedMesh) skinned.push(o); });
  for (const o of skinned) {
    const m = new THREE.Mesh(o.geometry, o.material);
    m.name = o.name;
    m.position.copy(o.position); m.quaternion.copy(o.quaternion); m.scale.copy(o.scale);
    o.parent.add(m);
    o.parent.remove(o);
  }
  return root;
}
const asModel = bytes => new Promise(res => loader.parse(bytes.buffer, '', g => res(unskin(g.scene)), () => res(null)));
const asTexture = (bytes, url) => new Promise(res => {
  const src = URL.createObjectURL(new Blob([bytes], { type: url.endsWith('.png') ? 'image/png' : 'image/jpeg' }));
  new THREE.TextureLoader().load(src, t => { URL.revokeObjectURL(src); res(t); }, undefined, () => { URL.revokeObjectURL(src); res(null); });
});
const blank = (hex = 0xd8d2c8) => new THREE.MeshStandardMaterial({ color: hex, flatShading: true });
function stand(model, H, yaw) {
  const body = new THREE.Group();
  body.add(model);
  body.rotation.y = yaw;
  let box = new THREE.Box3().setFromObject(body);
  body.scale.setScalar(H / (box.max.y - box.min.y));
  box = new THREE.Box3().setFromObject(body);
  const c = box.getCenter(new V3());
  body.position.set(-c.x, -box.min.y, -c.z);
  return { body, size: box.getSize(new V3()) };
}
// lay a flat model down: longest axis along X, thinnest along Y, centred, longest side = L
function orientFlat(model, L) {
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new V3());
  model.position.sub(box.getCenter(new V3()));
  const ax = [['x', size.x], ['y', size.y], ['z', size.z]].sort((p, q) => q[1] - p[1]);
  const unit = { x: new V3(1, 0, 0), y: new V3(0, 1, 0), z: new V3(0, 0, 1) };
  const ea = unit[ax[0][0]], ec = unit[ax[2][0]];
  const m = new THREE.Matrix4().makeBasis(ea, ec, new V3().crossVectors(ea, ec)).transpose();
  const wrap = new THREE.Group();
  wrap.add(model);
  wrap.quaternion.setFromRotationMatrix(m);
  const holder = new THREE.Group();
  holder.add(wrap);
  holder.scale.setScalar(L / ax[0][1]);
  return holder;
}
function fallbackShape(key) {
  if (key === 'temple') return new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.2, 1.4), blank(0xe8dcc0));
  if (key === 'guardian') return new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 1.1, 3, 8), blank(0x5a78b8));
  if (key === 'door') return new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.3, 0.06), blank(0x3f8f8a));
  if (key === 'phoenix') return new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 1), blank(0xe0703a));
  return new THREE.Mesh(new THREE.CircleGeometry(0.5, 9, -0.9, 1.8), new THREE.MeshStandardMaterial({ color: 0xe0b040, side: THREE.DoubleSide }));
}

// ---------- ground: the palm first, the living world once it has grown ----------
const caster = new THREE.Raycaster();
const DOWN = new V3(0, -1, 0), probe = new V3();
let palmMeshes = [], worldMeshes = [];
function palmAt(x, z) {
  if (!palmMeshes.length) return Math.hypot(x, z + 0.8) < 6.5 ? 0 : null;
  caster.set(probe.set(x, 40, z), DOWN);
  const h = caster.intersectObjects(palmMeshes, false);
  return h.length ? h[0].point.y : null;
}
function worldAt(x, z, from) {
  if (!worldMeshes.length) return null;
  caster.set(probe.set(x, from, z), DOWN);
  const h = caster.intersectObjects(worldMeshes, false);
  return h.length ? h[0].point.y : null;
}
function groundAt(x, z) {
  const p = palmAt(x, z);
  if (p !== null) return p;
  // off the palm you can only stand where the world has already appeared
  if (Math.hypot(x - WORLD.centre[0], z - WORLD.centre[1]) > G.reach - 2) return null;
  return worldAt(x, z, G.groundY + 2.2);
}

// ---------- audio ----------
let actx, master, pad, padFilter;
function audioInit() {
  if (actx) return;
  try {
    actx = new (window.AudioContext || window.webkitAudioContext)();
    master = actx.createGain(); master.gain.value = 0.5; master.connect(actx.destination);
  } catch (e) { actx = null; }
}
function blip(freq, dur = 0.6, type = 'sine', vol = 0.22, delay = 0) {
  if (G.rec) G.rec.push([G.clock + delay, 'blip', freq, dur, type, vol]);
  if (!actx) return;
  const o = actx.createOscillator(), g = actx.createGain(), t0 = actx.currentTime + delay;
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, actx.currentTime);
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  o.connect(g).connect(master); o.start(t0); o.stop(t0 + dur);
}
const chime = () => [880, 1108.7, 1318.5, 1760, 2217.5].forEach((f, i) => blip(f, 1.6, 'sine', 0.11, i * 0.09));
function voices(freqs, type, level, fade) {
  if (!actx) return;
  if (!pad) {
    pad = { gain: actx.createGain(), oscs: [] };
    padFilter = actx.createBiquadFilter(); padFilter.type = 'lowpass'; padFilter.frequency.value = 700;
    padFilter.connect(pad.gain).connect(master);
    pad.gain.gain.value = 0.5;
  }
  freqs.forEach((f, i) => {
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type; o.frequency.value = f; o.detune.value = (i % 2 ? 7 : -7);
    g.gain.setValueAtTime(0, actx.currentTime);
    g.gain.linearRampToValueAtTime(level, actx.currentTime + fade);
    o.connect(g).connect(padFilter); o.start();
    pad.oscs.push(o);
  });
}
const MUSIC = [() => voices([110, 164.81, 220], 'triangle', 0.16, 4),
  () => { voices([277.18, 329.63], 'sine', 0.1, 5); padFilter.frequency.linearRampToValueAtTime(1500, actx.currentTime + 6); },
  () => { voices([440, 554.37, 659.25], 'sine', 0.08, 6); padFilter.frequency.linearRampToValueAtTime(2800, actx.currentTime + 8); }];
function music(i) {
  if (G.rec) G.rec.push([G.clock, 'music', i]);
  if (actx) MUSIC[i]();
}
function musicStop() {
  if (G.rec) G.rec.push([G.clock, 'stop']);
  if (!pad) return;
  const p = pad; pad = null;
  p.gain.gain.linearRampToValueAtTime(0, actx.currentTime + 1.5);
  setTimeout(() => p.oscs.forEach(o => o.stop()), 1700);
}

// ---------- game state ----------
const G = { state: 'loading', life: 0, lifeTarget: 0, saved: 0, speed: 1, clock: 0, groundY: 0, freecam: false, glitch: false, reach: 0, lastTick: 0, rec: null, auto: true };
const creations = [], fragments = [], sockets = [], growers = [];
const timers = [];
const after = (sec, fn) => timers.push({ t: sec, fn });

function start() {
  if (G.state !== 'ready') return;
  G.state = 'play';
}

function attach(frag, s) {
  if (frag.hand) { frag.hand.frag = null; frag.hand = null; }
  s.frag = frag; frag.socket = s;
  s.inner.add(frag.group);
  frag.group.scale.setScalar(s.size / frag.len);
  if (s.kind === 'wing') { frag.group.position.set(s.size * 0.42, 0, 0); frag.group.rotation.set(0, 0, 0); }
  else if (s.kind === 'arm') { frag.group.position.set(0, -s.size * 0.4, 0.12); frag.group.rotation.set(0, Math.PI / 2, Math.PI / 2); }   // held upright like a shield
  else { frag.group.position.set(0, 0.04, 0); frag.group.rotation.set(0, 0, 0.1); }
  s.ring.visible = false;
  frag.bloom = 0;                                   // flowers start growing over the part
  const c = s.c, at = s.outer.getWorldPosition(new V3());
  blip(660, 0.8); blip(990, 1.1, 'sine', 0.12);
  burst(at, 70, 1.6);
  flash.position.copy(at); flash.intensity = 1.5;
  c.msg = 'MISMATCH DETECTED'; c.msgT = 1.6;
  after(1.6, () => { if (c.state !== 'deleted') { c.msg = 'NEW FORM ACCEPTED'; c.msgT = 2.4; } });
  if (c.sockets.every(x => x.frag)) {
    // the magic moment: colour sweeps out from the join, gold rises around the creation, light races across the ground
    c.state = 'saved'; c.tSaved = 0; c.sweep = 0; c.sweepFrom = s;
    chime();
    wave(c.group.position);
    swirl(c.group.position, Math.max(0.6, c.H * 0.45), c.H, 260);
    flash.intensity = 3.5;
    c.sparkle = 3.2;
    G.saved++;
    G.lifeTarget = Math.max(G.lifeTarget, [0, 0.35, 0.65, 1][G.saved]);
    music(G.saved - 1);
    checkEnd();
  }
}
function reject(s) {
  s.bad = 1;
  blip(140, 0.25, 'square', 0.07);
}

function checkEnd() {
  if (G.state !== 'play' || creations.some(c => c.state === 'wait' || c.state === 'deleting')) return;
  if (G.saved === 0) return after(4.5, resetAll);
  G.state = 'ending'; G.lifeTarget = 1;
  hands.forEach(h => { if (h.frag) { h.frag.hand = null; h.frag = null; } });
  after(6, () => say('EXPECTED FORMS: NOT FOUND', 3.2));
  after(10.5, () => say('NEW FORMS DETECTED', 3.2));
  after(15, () => { G.glitch = true; skyUntil = 1e9; blip(180, 0.5, 'square', 0.08); });     // the system starts one more countdown...
  after(18.5, () => { G.glitch = false; blip(880, 1.6, 'sine', 0.15); say('STILL BECOMING', 1e9); });   // ...which cannot hold together
}

function resetAll() {
  musicStop();
  G.saved = 0; G.lifeTarget = 0;
  for (const s of sockets) { s.frag = null; s.ring.visible = true; }
  for (const c of creations) {
    c.state = 'wait'; c.timer = c.time; c.group.visible = true; c.group.scale.setScalar(1);
    c.group.position.copy(c.home); c.group.rotation.set(0, c.rest, 0);
    c.uni.value = 0; c.uni.reveal.value = -1; c.sweep = -1;
  }
  for (const f of fragments) {
    f.socket = null; f.hand = null; scene.add(f.group); f.home.copy(f.home0); f.group.position.copy(f.home); f.group.scale.setScalar(1); f.group.visible = true;
    f.uni.value = 0; f.uni.reveal.value = -1;
    f.bloom = -1; f.blooms.forEach(b => { b.done = false; b.obj.scale.setScalar(0.0001); });
  }
  G.state = 'play';
}

// ---------- input ----------
const overlay = document.getElementById('overlay');
const cross = document.getElementById('cross');
const controls = new PointerLockControls(camera, renderer.domElement);
// `hold` is where a carried piece sits relative to the hand: low and to one side on desktop, so the view ahead stays clear
const hands = [{ obj: camera, hold: new V3(0.42, -0.32, -1.0), size: 0.5, frag: null, vr: false }];
const keys = {};
addEventListener('keydown', e => { keys[e.code] = true; if (e.code === 'KeyQ' && controls.isLocked) drop(hands[0]); });
addEventListener('keyup', e => { keys[e.code] = false; });
overlay.addEventListener('click', () => {
  if (G.state === 'loading') return;
  audioInit(); start();
  overlay.style.display = 'none';
  try { const p = controls.lock(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* no pointer lock available */ }
});
controls.addEventListener('unlock', () => {
  if (renderer.xr.isPresenting) return;
  overlay.querySelector('.go').textContent = 'CLICK TO RESUME';
  overlay.style.display = 'flex';
});
renderer.domElement.addEventListener('mousedown', e => {
  if (!controls.isLocked) return;
  if (e.button === 2) drop(hands[0]); else interact(hands[0]);
});
renderer.domElement.addEventListener('contextmenu', e => e.preventDefault());
renderer.xr.addEventListener('sessionstart', () => { audioInit(); start(); overlay.style.display = 'none'; cross.style.display = 'none'; });
renderer.xr.addEventListener('sessionend', () => { cross.style.display = ''; });

for (let i = 0; i < 2; i++) {
  const c = renderer.xr.getController(i);
  c.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new V3(0, 0, 0), new V3(0, 0, -4)]),
    new THREE.LineBasicMaterial({ color: 0x9fdcf0, transparent: true, opacity: 0.45 })));
  c.add(new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff })));
  rig.add(c);
  const hand = { obj: c, hold: new V3(0, 0, -0.3), size: 0.6, frag: null, vr: true };
  hands.push(hand);
  for (const ev of ['select', 'squeeze']) {
    c.addEventListener(ev + 'start', () => { if (!hand.frag) interact(hand); });
    c.addEventListener(ev + 'end', () => { if (hand.frag && !interact(hand)) drop(hand); });   // letting go: attach if it fits, otherwise leave it floating
  }
}

const ray = new THREE.Ray();
const tv = new V3(), tv2 = new V3(), tv3 = new V3(), tq = new THREE.Quaternion(), tq2 = new THREE.Quaternion();
const tilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(1.1, 0, 0));
function handRay(hand) {
  hand.obj.getWorldPosition(ray.origin);
  ray.direction.set(0, 0, -1).applyQuaternion(hand.obj.getWorldQuaternion(tq));
  return ray;
}
// how far off the aim a point is, as an angle
function aimAngle(r, p) {
  tv3.subVectors(p, r.origin);
  const d = tv3.length();
  return d < 1e-4 ? 0 : Math.acos(Math.min(1, Math.max(-1, tv3.dot(r.direction) / d)));
}
// the loose piece being pointed at: inside its own size, or anywhere within a cone of about nine degrees
function findFrag(r) {
  let best = null, bs = 1e9;
  for (const f of fragments) {
    if (f.socket || f.hand || !f.group.visible) continue;
    if (r.origin.distanceTo(f.group.position) > 16) continue;
    const ang = aimAngle(r, f.group.position);
    if (r.distanceToPoint(f.group.position) > 0.45 + f.len * 0.3 && ang > 0.16) continue;
    if (ang < bs) { bs = ang; best = f; }
  }
  return best;
}
// the socket a carried piece is being offered to: aim at its ring, at the creation itself, or stand close and face it
function findSocket(r, frag) {
  let best = null, bs = 1e9;
  for (const s of sockets) {
    if (s.frag || s.c.state !== 'wait') continue;
    s.outer.getWorldPosition(tv);
    const dist = r.origin.distanceTo(tv);
    if (dist > 9) continue;
    const c = s.c;
    tv2.copy(c.group.position); tv2.y += c.H * 0.5;
    const offRing = r.distanceToPoint(tv), offBody = r.distanceToPoint(tv2);
    const ang = Math.min(aimAngle(r, tv), aimAngle(r, tv2));
    const close = dist < 3.2 && ang < 0.6;
    if (offRing > 0.9 && offBody > c.H * 0.5 + 0.35 && ang > 0.2 && !close) continue;
    const score = ang + (frag && s.accept !== frag.type ? 10 : 0);      // prefer a socket the piece fits
    if (score < bs) { bs = score; best = s; }
  }
  return best;
}
function grab(hand, f) { f.hand = hand; hand.frag = f; blip(440, 0.25, 'triangle', 0.12); }
function drop(hand, home = false) {
  const f = hand.frag;
  if (!f) return;
  if (home) f.home.copy(f.home0);
  else { f.home.copy(f.group.position); f.home.y = Math.max(G.groundY + 0.9, f.home.y); }
  f.hand = null; hand.frag = null;
}
// one click (or trigger): pick a piece up, or give the carried piece to the creation being aimed at.
// A click that misses changes nothing, so a piece is never dropped by accident (Q or right-click lets go).
function interact(hand) {
  if (G.state !== 'play') return false;
  const r = handRay(hand);
  if (hand.frag) {
    const s = findSocket(r, hand.frag);
    if (s && s.accept === hand.frag.type) { attach(hand.frag, s); return true; }
    if (s) { reject(s); return false; }
    const other = findFrag(r);
    if (other) { drop(hand, true); grab(hand, other); return true; }     // pointing at another piece swaps to it
    return false;
  }
  const f = findFrag(r);
  if (f) { grab(hand, f); return true; }
  return false;
}

// ---------- per-frame ----------
let snapLatch = false;
const fwd = new V3(), right = new V3(), head = new V3();
function movePlayer(dt) {
  if (G.freecam) return;
  camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
  right.set(-fwd.z, 0, fwd.x);
  let mx = 0, mz = 0;
  if (controls.isLocked) {
    mz = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
    mx = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
  }
  const session = renderer.xr.getSession();
  if (session) {
    for (const src of session.inputSources) {
      const gp = src.gamepad; if (!gp) continue;
      const x = gp.axes.length > 3 ? gp.axes[2] : gp.axes[0] || 0, y = gp.axes.length > 3 ? gp.axes[3] : gp.axes[1] || 0;
      if (src.handedness === 'right') {
        if (Math.abs(x) > 0.7 && !snapLatch) {
          snapLatch = true;
          camera.getWorldPosition(head);
          rig.position.sub(head); rig.position.applyAxisAngle(new V3(0, 1, 0), -Math.sign(x) * Math.PI / 6); rig.position.add(head);
          rig.rotation.y -= Math.sign(x) * Math.PI / 6;
        } else if (Math.abs(x) < 0.3) snapLatch = false;
      } else {
        if (Math.abs(x) > 0.15) mx += x;
        if (Math.abs(y) > 0.15) mz -= y;
      }
    }
  }
  if (mx || mz) {
    const sp2 = (keys.ShiftLeft ? 4.5 : 2.6) * dt;
    const nx = rig.position.x + fwd.x * mz * sp2 + right.x * mx * sp2, nz = rig.position.z + fwd.z * mz * sp2 + right.z * mx * sp2;
    const g = groundAt(nx, nz);
    // no stepping into nothing or up a wall; a ledge of about a metre, such as the edge of the palm, can be climbed
    const up = 1.2;
    if (g !== null && g - G.groundY < up && G.groundY - g < 1.8) { rig.position.x = nx; rig.position.z = nz; G.groundY = g; }
  }
  rig.position.y += (G.groundY - rig.position.y) * Math.min(1, dt * 8);
}

const p1 = new V3(), p2 = new V3();
const GLITCH = '0123456789:#?%/_';
function turnTo(obj, yaw, k) { let d = yaw - obj.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); obj.rotation.y += d * Math.min(1, k); }

// what each creation does once it has accepted its new form
const ALIVE = {
  phoenix(c, t, dt) {
    const amp = smooth(1.5, 5, c.tSaved);
    c.flap = lerp(c.flap, 0.1 + Math.sin(t * 8.5) * 0.6, amp);
    const u = c.tSaved - 5;
    if (u <= 0) return;
    const pos = (v, out) => { const R = 4.6 * smooth(0, 6, v), th = v * 0.5;
      return out.set(c.home.x + Math.sin(th) * R, c.home.y + smooth(0, 4, v) * 3.4 + Math.sin(v * 0.9) * 0.35 * smooth(2, 5, v), c.home.z + (1 - Math.cos(th)) * R); };
    pos(u, p1); pos(u + 0.05, p2);
    c.group.position.copy(p1);
    turnTo(c.group, Math.atan2(p2.x - p1.x, p2.z - p1.z), dt * 2.5);
    c.group.rotation.z = -0.22 * smooth(1, 5, u);
    c.group.rotation.x = 0.35 * smooth(0, 4, u);
    if (Math.random() < dt * 22) spark(p1.x + (Math.random() - 0.5) * 0.5, p1.y + c.H * 0.5, p1.z + (Math.random() - 0.5) * 0.5, 0, -0.3, 0, 1.6, 0.08);   // it trails embers
  },
  guardian(c, t, dt) {       // steps down and patrols, the door swinging as its new arm
    const u = c.tSaved - 3;
    c.flap = Math.sin(t * 2.4) * 0.45 * smooth(0.5, 3, c.tSaved);
    if (u <= 0) return;
    const th = u * 0.45, R = 1.0 * smooth(0, 3, u);
    c.group.position.set(c.home.x + Math.sin(th) * R, c.home.y + Math.abs(Math.sin(t * 2.4)) * 0.07, c.home.z + (1 - Math.cos(th)) * R);
    turnTo(c.group, th + Math.PI / 2 * smooth(0, 2, u), dt * 2);
  },
  temple(c, t, dt) {         // lights come on, it lifts off the ground, the leaf roof breathes
    const k = smooth(0.5, 4, c.tSaved);
    c.flap = Math.sin(t * 1.3) * 0.07 * k;
    c.group.position.y = c.home.y + k * 0.45 + Math.sin(t * 0.9) * 0.08 * k;
    c.group.rotation.y = c.rest + Math.sin(t * 0.35) * 0.25 * k;
    c.light.intensity = 6 * k;
  },
};

function update(rawDt) {
  const dt = rawDt * G.speed;
  G.clock += dt;
  const t = G.clock;
  for (let i = timers.length - 1; i >= 0; i--) { timers[i].t -= dt; if (timers[i].t <= 0) { const f = timers[i].fn; timers.splice(i, 1); f(); } }
  movePlayer(rawDt);
  const camQ = camera.getWorldQuaternion(tq2);

  // creations
  let soonest = null;
  for (const c of creations) {
    c.flap = 0.12 + Math.sin(t * 2.2) * 0.05;
    if (c.state === 'wait' && G.state === 'play') {
      c.timer -= dt;
      if (!soonest || c.timer < soonest.timer) soonest = c;
      if (c.timer <= 0) { c.state = 'deleting'; c.tDel = 0; c.msg = 'DELETED'; c.msgT = 3; blip(90, 1.4, 'sawtooth', 0.18); }
    } else if (c.state === 'deleting') {
      c.tDel += dt;
      const k = c.tDel / 1.4;
      if (k < 1) c.group.scale.set(1 + (Math.random() - 0.5) * 0.5 * k, Math.max(0.001, 1 - k), 1 + (Math.random() - 0.5) * 0.5 * k);
      else { c.state = 'deleted'; c.group.visible = false; checkEnd(); }
    } else if (c.state === 'saved') {
      c.tSaved += dt;
      ALIVE[c.key](c, t, dt);
      if (c.sparkle > 0) { c.sparkle -= dt; if (Math.random() < dt * 60) swirl(c.group.position, Math.max(0.5, c.H * 0.4), c.H, 3); }
    }
    // texture: a first hint with a partly filled creation, then the wave of colour once it is whole
    const filled = c.sockets.filter(s => s.frag).length / c.sockets.length;
    if (c.sweep >= 0) {
      c.sweep += dt * 1.5;
      c.sweepFrom.outer.getWorldPosition(c.uni.origin.value);
      c.uni.reveal.value = c.sweep;
      if (c.sweep > c.H * 1.6 + 2.5) { c.sweep = -1; c.uni.reveal.value = -1; c.uni.value = 1; }
    } else if (c.state !== 'saved') {
      c.uni.value += (filled * 0.35 - c.uni.value) * Math.min(1, dt * 0.6);
    }
    for (const s of c.sockets) {
      if (s.frag) { const u = s.frag.uni; u.value = c.uni.value; u.reveal.value = c.uni.reveal.value; u.origin.value.copy(c.uni.origin.value); }
      s.inner.rotation.set(0, 0, 0);
      if (s.kind === 'arm') s.inner.rotation.x = s.frag ? c.flap : 0; else s.inner.rotation.z = s.frag ? c.flap : 0;
    }
    if (c.fire) {     // the phoenix burns once it has colour: a flickering glow, firelight on the ground, embers rising
      const v = c.uni.value, fl = 0.8 + 0.2 * Math.sin(t * 9) * Math.sin(t * 5.3);
      c.uni.glow.value = 0.26 + 0.09 * Math.sin(t * 7) + 0.04 * Math.sin(t * 13.3);
      c.fire.intensity = 5 * v * fl; c.halo.material.opacity = 0.18 * v * fl;
      if (v > 0.5 && c.group.visible && Math.random() < dt * 16) { const g = c.group.position; spark(g.x + (Math.random() - 0.5) * 0.5, g.y + c.H * (0.2 + Math.random() * 0.5), g.z + (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.3, 0.5 + Math.random() * 0.6, (Math.random() - 0.5) * 0.3, 1.2 + Math.random(), 0.05 + Math.random() * 0.05); }
    }
    c.msgT -= dt;
    const showTimer = c.state === 'wait' && G.state !== 'ending';
    if (c.msgT > 0) c.label.message(c.msg, c.msg === 'DELETED' ? '#ff3a2a' : c.msg === 'NEW FORM ACCEPTED' ? '#ffd87a' : '#eaf6ff');
    else if (showTimer) c.label.timer(c.timer, c.time);
    c.label.sprite.visible = c.msgT > 0 || showTimer;
    c.label.sprite.position.set(c.group.position.x, c.group.position.y + c.H + 0.42, c.group.position.z);
  }
  // the clock closest to zero ticks out loud for its last twenty seconds
  if (soonest && soonest.timer < 20 && Math.ceil(soonest.timer) !== G.lastTick) {
    G.lastTick = Math.ceil(soonest.timer);
    blip(soonest.timer < 10 ? 1500 : 1000, 0.05, 'square', soonest.timer < 10 ? 0.07 : 0.04);
    if (soonest.timer < 10) blip(1500, 0.05, 'square', 0.05, 0.5);
  }

  // hands, fragments, sockets
  let hot = false;
  for (const s of sockets) { s.aimed = false; s.bad = Math.max(0, (s.bad || 0) - rawDt * 1.6); }
  for (const h of hands) {
    if (h.vr !== renderer.xr.isPresenting) continue;
    const r = handRay(h);
    if (h.frag) {
      const f = h.frag;
      const s = G.state === 'play' ? findSocket(r, f) : null, fits = !!s && s.accept === f.type;
      // carried low and to one side; it leans halfway toward a socket it fits, so the aim reads before the click
      tv.copy(h.hold).applyQuaternion(h.obj.getWorldQuaternion(tq)).add(r.origin);
      if (fits) { s.aimed = true; hot = true; tv.lerp(s.outer.getWorldPosition(tv2), 0.5); }
      f.group.position.lerp(tv, Math.min(1, rawDt * 12));
      f.group.quaternion.slerp(tq.multiply(tilt), Math.min(1, rawDt * 10));
      f.group.scale.setScalar(lerp(f.group.scale.x, Math.min(1, h.size / f.len) * (fits ? 1.3 : 1), Math.min(1, rawDt * 8)));
      let goal = null, gd = 1e9;
      for (const z of sockets) {
        if (z.frag || z.c.state !== 'wait' || z.accept !== f.type) continue;
        const d = z.outer.getWorldPosition(tv2).distanceTo(f.group.position);
        if (d < gd) { gd = d; goal = z; }
      }
      if (goal && G.state === 'play') {
        // gold dust drifts from the piece toward the creation it belongs to
        goal.outer.getWorldPosition(tv2);
        if (Math.random() < rawDt * 16) {
          const u = Math.random(), q = f.group.position;
          spark(lerp(q.x, tv2.x, u), lerp(q.y, tv2.y, u) + 0.04, lerp(q.z, tv2.z, u), 0, 0.1, 0, 0.7, 0.05);
        }
        if (gd < 0.8 && G.auto) attach(f, goal);    // close enough: it joins by itself
      }
    } else {
      const f = G.state === 'play' ? findFrag(r) : null;
      if (f) { f.hover = true; hot = true; }
    }
  }
  cross.classList.toggle('hot', hot);
  fragments.forEach((f, i) => {
    const free = !f.socket && !f.hand;
    f.glow = lerp(f.glow, f.hover ? 1 : 0, Math.min(1, rawDt * 10));
    for (const m of f.mats) m.emissiveIntensity = f.glow * 0.8;
    // a soft light behind every loose piece, so white pieces can be found against the grey
    f.beacon.material.opacity = lerp(f.beacon.material.opacity, free && G.state === 'play' ? 0.42 + 0.12 * Math.sin(t * 3 + i) + f.glow * 0.4 : 0, Math.min(1, rawDt * 6));
    f.hover = false;
    if (G.state === 'ending' && !f.socket) f.uni.value = LIFE.value;
    if (free) {
      f.group.position.set(f.home.x, f.home.y + Math.sin(t * 1.3 + i * 2) * 0.07, f.home.z);
      f.group.rotation.set(1.1, t * 0.5 + i * 2, 0, 'YXZ');
      f.group.scale.setScalar(lerp(f.group.scale.x, 1 + f.glow * 0.12, Math.min(1, rawDt * 6)));
    }
    if (f.bloom >= 0) {      // flowers open one after another across the attached part
      f.bloom += dt;
      f.blooms.forEach((b, j) => {
        const k = smooth(0, 0.7, f.bloom - 0.5 - j * 0.14);
        b.obj.scale.setScalar(Math.max(0.0001, b.size * k * (1 + 0.25 * Math.sin(Math.min(1, k) * Math.PI))));
        if (!b.done && k > 0.05) { b.done = true; burst(b.obj.getWorldPosition(tv), 5, 0.5, 0.05); }
      });
    }
  });
  const holding = hands.find(h => h.frag);
  for (const s of sockets) {
    if (!s.ring.visible) continue;
    s.ring.visible = s.c.state === 'wait';
    const u = s.ring.material.uniforms;
    const fits = holding && holding.frag.type === s.accept;
    u.t.value = t; u.bad.value = s.bad;
    u.hot.value = lerp(u.hot.value, fits ? 1 : 0, Math.min(1, rawDt * 6));
    u.dim.value = lerp(u.dim.value, holding ? (fits ? 1.25 : 0.35) : 0.75, Math.min(1, rawDt * 6));
    s.ring.scale.setScalar(s.ring.userData.size * (s.aimed ? 1.35 : 1) * (1 + s.bad * 0.25 * Math.sin(t * 40)));
    s.ring.quaternion.copy(s.outer.getWorldQuaternion(tq).invert().multiply(camQ));
  }

  // effects
  updateSparks(dt, t);
  flash.intensity *= Math.max(0, 1 - dt * 2.4);
  for (const w of waves) { if (w.k >= 1) continue; w.k = Math.min(1, w.k + dt * 0.55); w.m.material.uniforms.k.value = w.k; w.m.visible = w.k < 1; }

  // ending
  if (G.glitch) {
    let g = '';
    for (let i = 0; i < 5; i++) g += GLITCH[Math.floor(Math.random() * GLITCH.length)];
    sky1.set(Math.random() < 0.15 ? '' : 'DELETION IN ' + g, Math.random() < 0.3 ? '#ffffff' : '#ff8a7d');
  }
  sky1.mat.opacity = lerp(sky1.mat.opacity, t < skyUntil ? 1 : 0, Math.min(1, dt * 2));

  // world coming alive
  G.life += (G.lifeTarget - G.life) * Math.min(1, dt * 0.3);
  const k = G.life;
  LIFE.value = smooth(0.05, 1, k);
  for (const w of wires) { w.m.opacity = WIRE * (1 - smooth(0, 0.8, Math.max(w.uni.value, w.uni.reveal.value > 0 ? 1 : 0))); w.m.visible = w.m.opacity > 0.01; }
  for (const x of tints) x.c.lerpColors(x.from, x.to, smooth(0, 1, k));
  skyMat.uniforms.life.value = k;
  scene.fog.density = lerp(0.03, 0.004, smooth(0, 1, k));
  renderer.toneMappingExposure = lerp(0.9, 1.15, k);
  scene.environmentIntensity = lerp(0.5, 1.0, k);
  haloMat.opacity = 0.42 + 0.14 * Math.sin(t * 2.3);
  // the splat world grows outward from the palm, first as loose points of light, then as a place
  const reachTarget = WORLD.reach[G.state === 'ending' ? 3 : G.saved];
  G.reach += Math.min((reachTarget - G.reach) * Math.min(1, dt * 0.35), dt * (6 + G.reach * 0.25));   // it gathers speed as it spreads
  if (world.splat) {
    const units = G.reach / WORLD.scale, shown = G.reach > 0.05;
    world.splat.visible = shown;
    if (shown && units < WORLD.extent) {        // still spreading: keep the splats animated
      world.radius.value = units; world.time.value = t; world.settled = false;
      world.splat.updateVersion();
    } else if (shown && !world.settled) {       // finished: show everything and stop re-generating every frame
      world.radius.value = 1e6; world.settled = true;
      world.splat.updateVersion();
    }
  }
  const toLight = smooth(0.08, 0.38, k), toStar = smooth(0.5, 1, k);
  for (const e of stars) {
    e.s.material.opacity = toLight * (0.75 + Math.sin(t * 2 + e.ph) * 0.25);
    e.s.position.set(e.pos.x * (1 + toStar * e.out), e.pos.y + Math.sin(t * 0.6 + e.ph) * 0.12 + toStar * e.up, e.pos.z * (1 + toStar * e.out));
    e.s.scale.setScalar(lerp(0.3, 0.7, toStar));
  }
  for (const g of growers) {   // flowers open where the world has reached them
    const s = smooth(0, 1, (G.reach - g.r) / 2.5 - g.delay) * g.size;
    g.obj.visible = s > 0.001;
    g.obj.scale.setScalar(Math.max(0.001, s));
    g.obj.rotation.z = Math.sin(t * 1.4 + g.ph) * 0.08;
  }
  camera.getWorldPosition(sky.position);
}

// ---------- build ----------
const world = { root: new THREE.Group(), splat: null, spark: null, radius: null, time: null, settled: false };
scene.add(world.root);
async function buildWorld(col, splatBytes) {
  const inner = new THREE.Group();
  inner.quaternion.set(1, 0, 0, 0);            // World Labs data is y-down; turn it upright
  world.root.add(inner);
  world.inner = inner;
  world.root.rotation.y = WORLD.yaw;
  if (col) {
    // the ground mesh says how high above its own ground the world was captured; that fixes the scale
    col.traverse(o => { if (o.isMesh) { o.material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }); worldMeshes.push(o); } });
    col.visible = false;
    inner.add(col);
    world.collider = col;
    world.root.updateMatrixWorld(true);
    const g = worldAt(0, 0, 0);
    world.captureHeight = g === null ? null : -g;
    if (g !== null && g < -0.05) WORLD.scale = (WORLD.eye - WORLD.ground) / -g;
  }
  world.root.scale.setScalar(WORLD.scale);
  world.root.position.set(WORLD.centre[0], WORLD.eye, WORLD.centre[1]);
  world.root.updateMatrixWorld(true);
  if (!splatBytes) return;
  let spark3;
  try { spark3 = await import('@sparkjsdev/spark'); } catch (e) { console.warn('splat renderer unavailable', e); return; }
  const { SparkRenderer, SplatMesh, dyno } = spark3;
  world.spark = new SparkRenderer({ renderer });
  scene.add(world.spark);
  const splat = new SplatMesh({ fileBytes: splatBytes, fileType: 'spz' });
  inner.add(splat);
  world.radius = dyno.dynoFloat(0); world.time = dyno.dynoFloat(0);
  const m = v => (v / WORLD.scale).toFixed(4);          // metres -> world units
  const far = WORLD.far[1] > 0 ? `col.a *= 1.0 - smoothstep(${WORLD.far[0].toFixed(2)}, ${WORLD.far[1].toFixed(2)}, length(c));` : ' ';
  // the world arrives as loose points of light that swell into solid scenery behind an advancing front
  splat.objectModifier = dyno.dynoBlock({ gsplat: dyno.Gsplat }, { gsplat: dyno.Gsplat }, ({ gsplat }) => {
    const d = new dyno.Dyno({
      inTypes: { gsplat: dyno.Gsplat, R: 'float', t: 'float' },
      outTypes: { gsplat: dyno.Gsplat },
      statements: ({ inputs, outputs }) => dyno.unindentLines(`
        ${outputs.gsplat} = ${inputs.gsplat};
        vec3 c = ${inputs.gsplat}.center;
        float l = length(c.xz);
        float R = ${inputs.R};
        float inside = clamp((R - l) / ${m(7)}, 0.0, 1.0);
        float dots = clamp((R + ${m(9)} - l) / ${m(3)}, 0.0, 1.0) * step(0.001, R);
        float tw = 0.7 + 0.3 * sin(${inputs.t} * 5.0 + c.x * 37.0 + c.z * 23.0 + c.y * 11.0);
        vec3 sc = ${inputs.gsplat}.scales;
        ${outputs.gsplat}.scales = mix(min(sc, vec3(${m(0.035)})) * dots * tw, sc, inside * inside);
        ${outputs.gsplat}.center = c + vec3(0.0, (1.0 - inside) * dots * ${m(0.4)} * sin(${inputs.t} * 1.3 + c.x * 5.0 + c.z * 7.0), 0.0);
        vec4 col = ${inputs.gsplat}.rgba;
        ${far}
        ${outputs.gsplat}.rgba = mix(vec4(mix(col.rgb * 1.4, vec3(1.0, 0.86, 0.5), 0.45), min(1.0, col.a * 3.0) * dots * 0.85), col, inside);
      `),
    });
    return { gsplat: d.apply({ gsplat, R: world.radius, t: world.time }).gsplat };
  });
  splat.updateGenerator();
  splat.visible = false;
  await splat.initialized;
  world.splat = splat;
}

async function init() {
  const files = {
    panoA: want(['assets/pano_start.jpg', 'assets/pano_start.png'], asTexture),
    panoB: want(['assets/pano_end.jpg', 'assets/pano_end.png', 'assets/pano.png'], asTexture),
    hand: want([M + 'hand2.glb', M + 'hand.glb'], asModel),
    flower: want([M + 'yflower.glb', M + 'flower.glb'], asModel),
    collider: want([WORLD.collider], asModel),
    splat: want([WORLD.file, WORLD.fallback], bytes => bytes),
  };
  // one download per distinct model, however many creations or fragments use it
  const modelOf = cfg => { const k = cfg.files.join('|'); return files[k] || (files[k] = want(cfg.files.map(f => M + f + '.glb'), asModel)); };
  [...CREATIONS, ...FRAGMENTS].forEach(modelOf);
  await loadAll();
  const [panoA, panoB, handGLB, flowerGLB] = await Promise.all([files.panoA.ready, files.panoB.ready, files.hand.ready, files.flower.ready]);
  const cModels = await Promise.all(CREATIONS.map(c => modelOf(c).ready));
  const fModels = await Promise.all(FRAGMENTS.map(f => modelOf(f).ready));
  await buildWorld(await files.collider.ready, await files.splat.ready).catch(e => console.warn('world failed', e));
  for (const [tex, key] of [[panoA, 'A'], [panoB, 'B']]) {
    if (!tex) continue;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    skyMat.uniforms['map' + key].value = tex; skyMat.uniforms['has' + key].value = 1;
  }

  if (panoB) {      // the living world's sky lights the models, so metal and gloss have something to reflect
    const pm = new THREE.PMREMGenerator(renderer);
    panoB.mapping = THREE.EquirectangularReflectionMapping;
    scene.environment = pm.fromEquirectangular(panoB).texture;
    pm.dispose();
  }

  // the palm
  const palm = new THREE.Group();
  if (handGLB) {
    const level = new THREE.Group();
    level.rotation.set(HAND.level[0], 0, HAND.level[1]);
    level.add(orientFlat(colourise(handGLB, LIFE), HAND.len));
    palm.add(level);
    palm.rotation.set(HAND.flip ? Math.PI : 0, HAND.yaw, 0, 'YXZ');
    palm.position.set(HAND.shift[0], 0, HAND.shift[1]);
    palm.scale.y = HAND.squash;
    scene.add(palm);
    palm.updateMatrixWorld(true);
    palm.traverse(o => { if (o.isMesh) { o.material.side = THREE.DoubleSide; palmMeshes.push(o); } });
    palm.position.y = -(palmAt(START[0], START[1]) ?? palmAt(0, 0) ?? 0);
    palm.updateMatrixWorld(true);
  } else {
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(6.6, 5.6, 0.8, 11), blank(0xcfc8bb));
    disc.position.set(0, -0.4, -0.8);
    scene.add(disc);
  }
  G.groundY = palmAt(START[0], START[1]) ?? 0;
  rig.position.y = G.groundY;
  const gy = (x, z) => palmAt(x, z) ?? G.groundY;

  // creations
  CREATIONS.forEach((cfg, i) => {
    const uni = mkUni(0, cfg.glow || 0);
    const { body, size } = stand(colourise(cModels[i] || fallbackShape(cfg.key), uni, true), cfg.H, cfg.yaw);
    const group = new THREE.Group();
    group.rotation.order = 'YXZ';
    group.add(body);
    const home = new V3(cfg.pos[0], gy(cfg.pos[0], cfg.pos[1]), cfg.pos[1]);
    group.position.copy(home);
    group.rotation.y = cfg.rest;
    scene.add(group);
    const label = makeClock();
    scene.add(label.sprite);
    const c = { ...cfg, group, home, uni, label, size, tris: body.children[0].userData.tris, state: 'wait', timer: cfg.time, sockets: [], msg: '', msgT: 0, flap: 0, tSaved: 0, tDel: 0, sweep: -1, sparkle: 0 };
    for (const sc of cfg.sockets) {
      const outer = new THREE.Group();
      outer.position.set(sc.at[0] * size.x, sc.at[1] * cfg.H, sc.at[2] * size.z);
      if (sc.kind === 'wing' && sc.side < 0) outer.rotation.y = Math.PI;
      const inner = new THREE.Group();
      outer.add(inner);
      const ring = makeIndicator(sc.kind === 'roof' ? 1.3 : 0.85);
      outer.add(ring);
      group.add(outer);
      const s = { ...sc, c, outer, inner, ring, frag: null, aimed: false, bad: 0 };
      c.sockets.push(s); sockets.push(s);
    }
    if (cfg.key === 'phoenix') {
      c.fire = new THREE.PointLight(0xff7a2a, 0, 7, 1.6);
      c.fire.position.set(0, cfg.H * 0.4, 0);
      c.halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xff6a22, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, opacity: 0 }));
      c.halo.position.set(0, cfg.H * 0.45, 0); c.halo.scale.setScalar(cfg.H * 1.5);
      group.add(c.fire, c.halo);
    }
    if (cfg.key === 'temple') {
      c.light = new THREE.PointLight(0xffc27a, 0, 8, 1.5);
      c.light.position.set(0, cfg.H * 0.45, 0);
      group.add(c.light);
    }
    creations.push(c);
  });

  // fragments, each with flowers waiting to grow over it
  let flowerBase = null;
  if (flowerGLB) {
    flowerBase = new THREE.Group();
    flowerBase.add(stand(colourise(flowerGLB, FULL), 1, 0).body);
    const halo = new THREE.Sprite(haloMat);
    halo.position.y = 0.6; halo.scale.setScalar(2.1);
    flowerBase.add(halo);
  }
  const up = new V3(0, 1, 0);
  FRAGMENTS.forEach((cfg, i) => {
    const uni = mkUni(0, cfg.glow || 0);
    const src = fModels[i] ? fModels[i].clone(true) : fallbackShape(cfg.key);
    colourise(src, uni, true);
    const mats = [], meshes = [];
    src.traverse(o => { if (o.isMesh) { o.material.side = THREE.DoubleSide; o.material.emissive = new THREE.Color(0x2a7f90); o.material.emissiveIntensity = 0; mats.push(o.material); meshes.push(o); } });
    const group = new THREE.Group();
    group.add(orientFlat(src, cfg.len));
    group.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(group), blooms = [];
    for (let n = 0, tries = 0; flowerBase && n < cfg.flowers && tries < 200; tries++) {
      const x = lerp(box.min.x, box.max.x, 0.08 + rnd() * 0.84), z = lerp(box.min.z, box.max.z, 0.08 + rnd() * 0.84);
      caster.set(probe.set(x, box.max.y + 1, z), DOWN);
      const hit = caster.intersectObjects(meshes, false)[0];
      if (!hit) continue;
      const obj = new THREE.Group();
      obj.add(flowerBase.clone(true));
      obj.position.copy(hit.point);
      obj.quaternion.setFromUnitVectors(up, new V3((rnd() - 0.5) * 0.7, 1, (rnd() - 0.5) * 0.7).normalize());
      obj.rotateY(rnd() * 6.28);
      obj.scale.setScalar(0.0001);
      group.add(obj);
      blooms.push({ obj, size: cfg.len * (0.065 + rnd() * 0.045), done: false });
      n++;
    }
    const beacon = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0x8fe9ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, opacity: 0 }));
    beacon.scale.setScalar(cfg.len * 2.1);
    beacon.renderOrder = -0.5;
    group.add(beacon);
    const home = new V3(cfg.home[0], gy(cfg.home[0], cfg.home[2]) + cfg.home[1], cfg.home[2]);
    group.position.copy(home);
    scene.add(group);
    fragments.push({ ...cfg, group, home, home0: home.clone(), uni, mats, blooms, beacon, tris: src.userData.tris, bloom: -1, glow: 0, hand: null, socket: null, hover: false });
  });

  // flowers across the palm and out into the living world; each opens when the world reaches it
  if (flowerBase) {
    for (let n = 0, tries = 0; n < 70 && tries < 900; tries++) {
      const a = rnd() * Math.PI * 2, r = 1 + Math.pow(rnd(), 0.7) * 21;
      const x = WORLD.centre[0] + Math.cos(a) * r, z = WORLD.centre[1] + Math.sin(a) * r;
      const y = palmAt(x, z) ?? worldAt(x, z, 4);
      if (y === null || y < WORLD.ground - 2.5) continue;
      if (Math.hypot(x - START[0], z - START[1]) < 0.9 || creations.some(c => Math.hypot(x - c.home.x, z - c.home.z) < 1.1)) continue;
      const obj = new THREE.Group();
      obj.add(flowerBase.clone(true));
      obj.position.set(x, y, z);
      obj.rotation.y = rnd() * 6.28;
      obj.visible = false;
      scene.add(obj);
      growers.push({ obj, r, delay: rnd() * 0.8, size: 0.08 + rnd() * 0.09, ph: rnd() * 6.28 });
      n++;
    }
  }

  window.rz.palm = palm; window.rz.flower = flowerBase; window.rz.wires = wires;      // for tools/board.js
  G.state = 'ready';
  document.getElementById('bar').style.display = 'none';
  overlay.querySelector('.go').textContent = 'CLICK TO ENTER';
}

// testing hooks (console): rz.give('door','guardian'), rz.creations[0].timer = 5, rz.G.speed = 3
window.rz = { THREE, renderer, LOW, G, creations, fragments, sockets, hands, camera, rig, skyMat, groundAt, palmAt, worldAt, scene, world, WORLD, HAND, growers,
  update, attach, grab, drop, interact, start, say,
  give(fk, ck) { const f = fragments.find(x => x.key === fk), s = sockets.find(x => x.c.key === ck && !x.frag); if (f && s) attach(f, s); },
  saveAll() { [['fanA', 'phoenix'], ['fanB', 'phoenix'], ['door', 'guardian'], ['leaf', 'temple']].forEach(p => this.give(p[0], p[1])); },
  enter() { overlay.style.display = 'none'; start(); },
  click() { interact(hands[0]); return hands[0].frag ? 'holding ' + hands[0].frag.key : 'empty'; },
  view(x, y, z, tx, ty, tz) { G.freecam = true; rig.position.set(x, y - 1.6, z); rig.updateMatrixWorld(true); camera.lookAt(tx, ty, tz); },
  // drive the game one frame at a time instead of in real time (used to render the walkthrough video)
  manual() { renderer.setAnimationLoop(null); },
  step(dt) { update(dt); renderer.render(scene, camera); },
};

let last = performance.now();
renderer.setAnimationLoop(now => {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  update(dt);
  renderer.render(scene, camera);
});
init();
