// board/client/sfx.js
// Synthesized cockpit sounds — Web Audio only, no asset files. Every sound is
// oscillators/filtered noise built at call time. The AudioContext unlocks on
// the first user gesture (browsers block audio before one) via unlock().

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};

let ac = null;
let master = null;
let muted = store.get('shipit-sfx') === 'off';

function ctx() {
  if (!ac) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ac = new AC();
    master = ac.createGain();
    master.gain.value = 0.5;
    master.connect(ac.destination);
  }
  if (ac.state === 'suspended') ac.resume();
  return ac;
}

function blip(freq, { dur = 0.08, type = 'sine', gain = 0.15, at = 0, slide = 0 } = {}) {
  if (muted) return;
  const a = ctx();
  if (!a) return;
  const t = a.currentTime + at;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(1, freq + slide), t + dur);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function whoosh({ dur = 0.3, from = 400, to = 2400, gain = 0.2 } = {}) {
  if (muted) return;
  const a = ctx();
  if (!a) return;
  const t = a.currentTime;
  const len = Math.ceil(a.sampleRate * dur);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = 'bandpass';
  f.Q.value = 1;
  f.frequency.setValueAtTime(from, t);
  f.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = a.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f);
  f.connect(g);
  g.connect(master);
  src.start(t);
  src.stop(t + dur + 0.02);
}

export const sfx = {
  get muted() { return muted; },
  set muted(v) { muted = v; store.set('shipit-sfx', v ? 'off' : 'on'); },
  unlock() { if (!muted) ctx(); },
  // Correct keystroke: short high tick, pitch-jittered so a line of typing
  // doesn't sound like a metronome.
  key() { blip(1500 + Math.random() * 600, { dur: 0.03, type: 'square', gain: 0.045 }); },
  // Wrong character: low dull thud.
  miss() { blip(150, { dur: 0.06, type: 'square', gain: 0.06 }); },
  // Command fully typed (awaiting ENTER): two rising chirps.
  ready() { blip(880, { dur: 0.07, gain: 0.12 }); blip(1320, { dur: 0.09, gain: 0.12, at: 0.07 }); },
  // ENTER boost: noise sweep + rising sawtooth — the thruster.
  boost() { whoosh({ dur: 0.35, from: 300, to: 3200, gain: 0.25 }); blip(220, { dur: 0.3, type: 'sawtooth', gain: 0.1, slide: 440 }); },
  // ENTER on a wrong line: short low buzz.
  error() { blip(110, { dur: 0.18, type: 'sawtooth', gain: 0.12 }); },
  // Race went live: two marks and a GO.
  go() { blip(660, { dur: 0.09, gain: 0.15 }); blip(660, { dur: 0.09, gain: 0.15, at: 0.15 }); blip(990, { dur: 0.25, gain: 0.18, at: 0.3 }); },
  // All prompts done: little ascending fanfare.
  finish() { [523, 659, 784, 1047].forEach((f, i) => blip(f, { dur: 0.12, gain: 0.15, at: i * 0.09 })); },
};
