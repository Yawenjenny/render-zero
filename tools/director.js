// Renders the Render Zero walkthrough video frame by frame.
// Load the game at http://localhost:8123/ with tools/record_server.py running, wait for CLICK TO ENTER, then in the
// console:  (await import('/tools/director.js')).run()        frames land in video/frames, the sound in video/audio.wav
// The game is stepped at a fixed 1/30 s per frame, so the result is smooth however long each frame takes to draw.

const FPS = 30, W = 1920, H = 1080, EYE = 1.6;
const GAME_START = 4.5;                 // the countdowns begin here; everything before it is the title
const END = 118;

// ---- what the player does, and when (seconds of video) ----
const DOOR = 24.0, LEAF = 45.0, FAN1 = 65.0, FAN2 = 86.5;
const ACTIONS = [
  [GAME_START, rz => rz.start()],
  [17.5, rz => grab(rz, 'door')],
  [DOOR, rz => rz.give('door', 'guardian')],
  [37.5, rz => grab(rz, 'leaf')],
  [LEAF, rz => rz.give('leaf', 'temple')],
  [59.5, rz => grab(rz, 'fanA')],
  [FAN1, rz => rz.give('fanA', 'phoenix')],
  [73.0, rz => grab(rz, 'fanB')],
  [FAN2, rz => rz.give('fanB', 'phoenix')],
];
const grab = (rz, key) => rz.grab(rz.hands[0], rz.fragments.find(f => f.key === key));

// ---- where the camera stands and what it looks at: [time, [x, z], [lookX, lookY, lookZ]] ----
// A look target may also be the name of a creation or a piece, which is then followed as it moves.
const SHOTS = [
  [0.0, [0.0, 2.9], [0.3, 1.0, -3.2]],
  [4.5, [0.0, 2.0], [0.3, 1.0, -3.2]],
  [7.0, [0.0, 1.6], [-1.9, 1.25, -2.3]],          // the guardian
  [9.5, [0.0, 1.5], [-1.9, 1.25, -2.3]],
  [11.5, [0.1, 1.4], [0.4, 1.2, -3.6]],           // the phoenix
  [12.5, [0.1, 1.4], [0.4, 1.2, -3.6]],
  [14.2, [0.2, 1.4], [2.75, 1.3, -2.7]],          // the temple
  [15.2, [0.3, 1.3], [2.75, 1.3, -2.7]],
  [17.0, [0.9, 1.2], 'door'],                     // find the door
  [18.2, [0.9, 1.2], 'door'],
  [21.5, [-1.9, 0.6], [-1.8, 1.15, -2.3]],        // carry it to the guardian
  [DOOR + 1.0, [-1.9, 0.6], [-1.8, 1.15, -2.3]],
  [27.5, [-1.5, 1.2], 'guardian'],                // watch it take colour and step down
  [30.5, [-1.4, 1.3], 'guardian'],
  [33.0, [-1.2, 1.3], [9.0, 0.5, 1.5]],           // the first points of the world, out past the edge of the palm
  [34.8, [-1.1, 1.3], [9.0, 0.5, 1.5]],
  [37.0, [-0.6, 1.4], 'leaf'],                    // find the leaf
  [38.5, [-0.6, 1.4], 'leaf'],
  [42.5, [3.1, 0.4], [2.75, 1.9, -2.7]],          // carry it to the temple
  [LEAF + 1.2, [3.1, 0.4], [2.75, 1.9, -2.7]],
  [49.5, [2.6, 1.2], 'temple'],                   // lights on, it lifts
  [51.5, [2.6, 1.3], 'temple'],
  [54.5, [2.6, 1.3], [11.0, 1.4, -5.0]],          // the world has grown
  [56.3, [2.5, 1.3], [11.0, 1.4, -5.0]],
  [59.0, [0.3, 0.9], 'fanA'],                     // first fan
  [60.3, [0.3, 0.9], 'fanA'],
  [63.5, [0.3, -1.3], [0.4, 1.05, -3.6]],         // to the phoenix
  [68.0, [0.3, -1.3], [0.4, 1.3, -3.6]],
  [72.5, [0.2, 0.3], 'fanB'],                     // back for the second fan
  [74.0, [0.2, 0.3], 'fanB'],
  [78.0, [0.4, -1.3], [0.4, 2.35, -3.6]],         // the clock has turned red
  [82.5, [0.4, -1.3], [0.4, 2.3, -3.6]],
  [85.0, [0.4, -1.4], [0.4, 1.1, -3.6]],
  [FAN2 + 2.5, [0.4, -1.3], [0.4, 1.2, -3.6]],
  [91.0, [0.3, -0.4], 'phoenix'],                 // it rises
  [96.5, [0.2, 0.4], 'phoenix'],
  [99.0, [0.1, 0.9], [0.0, 3.3, -9.0]],           // the words in the sky, and the whole world behind them
  [106.0, [0.0, 1.3], [0.0, 3.5, -9.0]],
  [112.0, [0.0, 1.9], [0.0, 3.2, -9.0]],
  [END, [0.0, 2.3], [0.0, 3.0, -9.0]],
];

// ---- words on screen: [from, to, text] ----
const CAPTIONS = [
  [6.2, 10.6, 'A holding space for unfinished 3D generations.'],
  [11.2, 15.6, 'Each one is counting down to permanent deletion.'],
  [16.4, 20.6, 'Find a discarded piece.'],
  [21.2, 23.8, 'Give it to a creation it was never made for.'],
  [26.0, 30.6, 'The system sees a mismatch. The creation accepts its new form.'],
  [31.6, 36.2, 'Each one you save brings a world back.'],
  [47.2, 52.0, 'A leaf becomes a roof.'],
  [66.6, 71.0, 'A fan becomes a wing.'],
  [76.4, 82.6, 'You cannot keep the clock from running.'],
];
const TITLE = { until: GAME_START, big: 'RENDER ZERO', small: 'A gift for the unfinished' };
const ENDCARD = { from: 111.0, lines: ['Not everything unfinished needs to become', 'what it was meant to be.', '', 'Sometimes it only needs another possibility.'],
  credit: 'RENDER ZERO   ·   models generated with Tripo   ·   world generated with World Labs Marble   ·   three.js + WebXR' };

const smoother = t => t * t * t * (t * (t * 6 - 15) + 10);
const clamp01 = x => Math.min(1, Math.max(0, x));
const fade = (t, a, b, f = 0.45) => clamp01((t - a) / f) * clamp01((b - t) / f);

export const state = { frame: 0, total: 0, done: false, error: null, msPerFrame: 0, started: 0 };

// one dropped connection must not cost a twenty-minute render: every save is retried
async function save(name, body, b64) {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch('/save?' + (b64 ? 'b64=1&' : '') + 'name=' + encodeURIComponent(name), { method: 'POST', body });
      if (res.ok) return;
      throw new Error('status ' + res.status);
    } catch (e) {
      if (attempt >= 8) throw new Error('could not save ' + name + ': ' + e);
      state.retries = (state.retries || 0) + 1;
      await new Promise(r => setTimeout(r, 250 * (attempt + 1)));
    }
  }
}

function target(rz, look, out) {
  if (typeof look !== 'string') return out.set(look[0], look[1], look[2]);
  const c = rz.creations.find(x => x.key === look);
  if (c) return out.copy(c.group.position).setY(c.group.position.y + c.H * 0.55);
  return out.copy(rz.fragments.find(x => x.key === look).home);      // where the piece floats, not where it is carried
}

export async function run({ only = null, dir = 'frames', to = END, quality = 0.95, width = W, height = H } = {}) {
  const rz = window.rz, THREE = rz.THREE;
  if (rz.G.state !== 'ready') throw new Error('load the page fresh and wait for CLICK TO ENTER before recording');
  state.frame = 0; state.total = Math.round(to * FPS); state.done = false; state.error = null; state.started = performance.now();
  try {
    rz.manual();
    rz.G.freecam = true;
    rz.G.auto = false;                 // pieces join exactly when the script says, not when they drift close
    rz.G.rec = [];
    const clock0 = rz.G.clock;
    rz.renderer.setPixelRatio(1);
    rz.renderer.setSize(width, height, false);
    rz.camera.aspect = width / height;
    rz.camera.updateProjectionMatrix();
    const out = document.createElement('canvas');
    out.width = width; out.height = height;
    const ctx = out.getContext('2d');
    const k = width / W;                                  // overlay sizes are written for 1920 wide
    const cross = document.getElementById('cross');
    const a = new THREE.Vector3(), b = new THREE.Vector3(), eye = new THREE.Vector3();
    const todo = ACTIONS.map(x => ({ t: x[0], fn: x[1], done: false }));
    const wanted = only ? new Set(only.map(s => Math.round(s * FPS))) : null;
    let ground = rz.palmAt(SHOTS[0][1][0], SHOTS[0][1][1]) ?? 0;

    for (let n = 0; n < state.total; n++) {
      const t = n / FPS;
      for (const act of todo) if (!act.done && t >= act.t) { act.done = true; act.fn(rz); }

      // camera: ease between the two shots around this moment
      let i = 0;
      while (i < SHOTS.length - 2 && t >= SHOTS[i + 1][0]) i++;
      const s0 = SHOTS[i], s1 = SHOTS[i + 1];
      const u = smoother(clamp01((t - s0[0]) / (s1[0] - s0[0])));
      const x = s0[1][0] + (s1[1][0] - s0[1][0]) * u, z = s0[1][1] + (s1[1][1] - s0[1][1]) * u;
      const g = rz.palmAt(x, z);
      if (g !== null) ground += (g - ground) * 0.2;
      rz.rig.position.set(x, ground, z);
      rz.rig.rotation.set(0, 0, 0);
      rz.rig.updateMatrixWorld(true);
      target(rz, s0[2], a); target(rz, s1[2], b);
      a.lerp(b, u);
      a.x += Math.sin(t * 0.83) * 0.012; a.y += Math.sin(t * 1.31 + 1) * 0.01;      // a breath of hand-held life
      eye.set(x, ground + EYE, z);
      const dx = a.x - eye.x, dy = a.y - eye.y, dz = a.z - eye.z;
      rz.camera.rotation.set(Math.atan2(dy, Math.hypot(dx, dz)), Math.atan2(-dx, -dz), 0, 'YXZ');
      rz.camera.updateMatrixWorld(true);

      rz.update(1 / FPS);
      if (wanted && !wanted.has(n)) { state.frame = n + 1; continue; }

      rz.renderer.render(rz.scene, rz.camera);
      ctx.drawImage(rz.renderer.domElement, 0, 0, width, height);
      overlay(ctx, t, k, width, height, cross.classList.contains('hot') && rz.G.state === 'play');
      const url = out.toDataURL('image/jpeg', quality);
      const name = wanted ? dir + '/t_' + t.toFixed(1).padStart(6, '0') + '.jpg' : dir + '/f_' + String(n).padStart(5, '0') + '.jpg';
      await save(name, url, true);
      state.frame = n + 1;
      state.msPerFrame = (performance.now() - state.started) / (n + 1);
    }
    if (!wanted) {
      const wav = await renderAudio(rz.G.rec.map(e => [e[0] - clock0, ...e.slice(1)]), to);
      await save('audio.wav', wav, false);
    }
    state.events = rz.G.rec.length;
    state.done = true;
  } catch (e) {
    state.error = String(e && e.stack || e);
  }
  return state;
}

// ---- crosshair, captions, title and end card, drawn over each rendered frame ----
function overlay(ctx, t, k, w, h, hot) {
  const text = (s, x, y, px, weight = 500, spacing = 0, alpha = 1, colour = '#ffffff') => {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = weight + ' ' + Math.round(px * k) + 'px "Segoe UI", "Helvetica Neue", Arial, sans-serif';
    try { ctx.letterSpacing = Math.round(spacing * k) + 'px'; } catch (e) { /* older browsers */ }
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.85)'; ctx.shadowBlur = 14 * k; ctx.shadowOffsetY = 2 * k;
    ctx.fillStyle = colour;
    ctx.fillText(s, x + spacing * k / 2, y);
    ctx.restore();
  };
  const veil = alpha => { if (alpha > 0) { ctx.fillStyle = 'rgba(6,7,10,' + alpha.toFixed(3) + ')'; ctx.fillRect(0, 0, w, h); } };

  if (t > GAME_START && t < ENDCARD.from) {              // the dot the player aims with
    ctx.save();
    ctx.globalAlpha = 0.85 * clamp01((t - GAME_START) / 0.6);
    ctx.strokeStyle = hot ? '#7fe7ff' : '#ffffff'; ctx.lineWidth = 2 * k;
    ctx.beginPath(); ctx.arc(w / 2, h / 2, (hot ? 13 : 6) * k, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
  for (const c of CAPTIONS) {
    const al = fade(t, c[0], c[1]);
    if (al > 0) text(c[2], w / 2, h - 96 * k, 40, 500, 1, al);
  }
  if (t < TITLE.until + 0.6) {
    const al = 1 - clamp01((t - (TITLE.until - 1.1)) / 1.5);
    veil(0.5 * al);
    text(TITLE.big, w / 2, h / 2 - 34 * k, 118, 300, 34, al * clamp01((t - 0.5) / 1.0));
    text(TITLE.small, w / 2, h / 2 + 70 * k, 38, 400, 6, al * clamp01((t - 1.3) / 1.0), '#d8dee6');
  }
  if (t > ENDCARD.from) {
    const al = clamp01((t - ENDCARD.from) / 1.6);
    veil(0.66 * al);
    ENDCARD.lines.forEach((line, i) => { if (line) text(line, w / 2, h / 2 - 96 * k + i * 62 * k, 46, 400, 2, clamp01((t - ENDCARD.from - 0.5 - i * 0.25) / 1.2)); });
    text(ENDCARD.credit, w / 2, h - 86 * k, 24, 400, 2, clamp01((t - ENDCARD.from - 2.2) / 1.2) * 0.85, '#c9d1da');
  }
  veil(1 - clamp01(t / 0.9));                            // in from black
  veil(clamp01((t - (END - 1.2)) / 1.1));                // out to black
}

// ---- the sound: every sound the game asked for during the run, rebuilt offline, plus a low room tone ----
async function renderAudio(events, dur) {
  const sr = 48000, ctx = new OfflineAudioContext(2, Math.ceil(dur * sr), sr);
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.55, 0);
  master.connect(ctx.destination);
  const pad = ctx.createGain(); pad.gain.value = 0.5;
  const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.setValueAtTime(700, 0);
  filter.connect(pad).connect(master);
  const voices = (t, freqs, type, level, fadeIn) => freqs.forEach((f, i) => {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = f; o.detune.value = i % 2 ? 7 : -7;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(level, t + fadeIn);
    o.connect(g).connect(filter); o.start(t);
  });
  // room tone for the holding space: it thins out as the music takes over
  const firstMusic = (events.find(e => e[1] === 'music') || [dur])[0];
  [[55, 0.085], [82.4, 0.05], [110.5, 0.03]].forEach(([f, level]) => {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(0, 0); g.gain.linearRampToValueAtTime(level, 2.5);
    g.gain.setValueAtTime(level, firstMusic); g.gain.linearRampToValueAtTime(level * 0.25, firstMusic + 10);
    o.connect(g).connect(master); o.start(0);
  });
  let cutoff = 700;
  for (const e of events) {
    const t = Math.max(0, e[0]);
    if (t >= dur) continue;
    if (e[1] === 'blip') {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = e[4]; o.frequency.value = e[2];
      g.gain.setValueAtTime(e[5], t); g.gain.exponentialRampToValueAtTime(0.001, t + e[3]);
      o.connect(g).connect(master); o.start(t); o.stop(t + e[3] + 0.02);
    } else if (e[1] === 'music') {
      const ramp = (to, secs) => { filter.frequency.setValueAtTime(cutoff, t); filter.frequency.linearRampToValueAtTime(to, t + secs); cutoff = to; };
      if (e[2] === 0) voices(t, [110, 164.81, 220], 'triangle', 0.16, 4);
      if (e[2] === 1) { voices(t, [277.18, 329.63], 'sine', 0.1, 5); ramp(1500, 6); }
      if (e[2] === 2) { voices(t, [440, 554.37, 659.25], 'sine', 0.08, 6); ramp(2800, 8); }
    }
  }
  master.gain.setValueAtTime(0.55, dur - 3.0); master.gain.linearRampToValueAtTime(0, dur - 0.1);
  const buf = await ctx.startRendering();
  // 16-bit stereo WAV
  const n = buf.length, L = buf.getChannelData(0), R = buf.getChannelData(1);
  const view = new DataView(new ArrayBuffer(44 + n * 4));
  const str = (o, s) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); view.setUint32(4, 36 + n * 4, true); str(8, 'WAVEfmt '); view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); view.setUint16(22, 2, true); view.setUint32(24, sr, true); view.setUint32(28, sr * 4, true);
  view.setUint16(32, 4, true); view.setUint16(34, 16, true); str(36, 'data'); view.setUint32(40, n * 4, true);
  for (let i = 0; i < n; i++) {
    view.setInt16(44 + i * 4, Math.max(-1, Math.min(1, L[i])) * 32767, true);
    view.setInt16(46 + i * 4, Math.max(-1, Math.min(1, R[i])) * 32767, true);
  }
  return view.buffer;
}
