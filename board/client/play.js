import './play.css';
import { typedState } from './typing.js';
import { createRaceTrack } from './race-track.js';
import { sfx } from './sfx.js';

const params = new URLSearchParams(location.search);
const callsign = (params.get('callsign') || '').toLowerCase();
const statusEl = document.getElementById('status');
const promptEl = document.getElementById('prompt');
const entry = document.getElementById('entry');
const track = createRaceTrack(document.getElementById('field'), { me: callsign });

let prompts = [];
let phase = 'idle';
let completed = 0;  // my confirmed position (optimistic; server is authoritative)
let synced = false; // true once we've trusted the server's position after (re)connect
let prevPhase = 'idle';
let lastTyped = { len: 0, matched: 0, done: false }; // for keystroke sfx deltas

const muteBtn = document.getElementById('mute');
const showMute = () => { muteBtn.textContent = sfx.muted ? '🔇' : '🔊'; };
muteBtn.onclick = () => { sfx.muted = !sfx.muted; showMute(); };
showMute();

function render() {
  const target = prompts[completed] || '';
  promptEl.textContent = target;
  let done = false;
  if (phase === 'running' && completed < prompts.length) {
    const st = typedState(target, entry.value);
    done = st.done;
    promptEl.dataset.matched = String(st.matched);
    const wasDisabled = entry.disabled;
    entry.disabled = false;
    // `autofocus` dies while the input is disabled pre-race — without this,
    // race start leaves focus nowhere and keystrokes go to the page.
    if (wasDisabled) entry.focus();
  } else {
    entry.disabled = true;
  }
  promptEl.dataset.done = done ? '1' : '';
  statusEl.textContent =
    phase === 'running' ? (done ? 'ENTER to run ⏎' : `RACING — ${completed}/${prompts.length}`)
    : phase === 'finished' ? 'FINISHED ✦'
    : 'waiting for race…';
}

// Trailing throttle: at most one frac report per 100ms. Completions bypass
// this and send immediately in the input handler.
function fracSender(ws) {
  let timer = null, latest = 0;
  const send = (frac) => {
    latest = frac;
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      if (ws.readyState === WebSocket.OPEN && phase === 'running') {
        ws.send(JSON.stringify({ t: 'progress', completed, frac: latest }));
      }
    }, 100);
  };
  send.cancel = () => { if (timer) { clearTimeout(timer); timer = null; } latest = 0; };
  return send;
}

function connect() {
  const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`);
  const sendFrac = fracSender(ws);
  ws.onopen = () => { synced = false; statusEl.textContent = 'joining…'; ws.send(JSON.stringify({ t: 'join', callsign })); };
  ws.onmessage = (e) => {
    let m; try { m = JSON.parse(e.data); } catch { return; }
    if (m.t === 'denied') { statusEl.textContent = 'Ship not found — run your pipeline first.'; entry.disabled = true; return; }
    if (m.t === 'race') {
      prompts = m.prompts || [];
      phase = m.phase;
      const mine = (m.ships || []).find((s) => s.callsign === callsign);
      const serverCompleted = mine ? mine.completed : 0;
      if (!synced) { completed = serverCompleted; synced = true; }             // (re)connect/reload: trust the server's position
      else if (m.phase === 'running' && prevPhase !== 'running') completed = serverCompleted; // new round: server reset us to 0
      // during a running round, keep the local optimistic `completed`; the server silently rejects bad progress
      if (m.phase === 'running' && prevPhase !== 'running') sfx.go();
      prevPhase = m.phase;
      track.update({ phase: m.phase, total: m.total, ships: m.ships || [] });
      render();
    }
  };
  entry.oninput = () => {
    const target = prompts[completed] || '';
    const { matched, done } = typedState(target, entry.value);
    if (phase === 'running') {
      if (entry.value.length > lastTyped.len) (matched > lastTyped.matched ? sfx.key() : sfx.miss());
      if (done && !lastTyped.done) sfx.ready();
    }
    lastTyped = { len: entry.value.length, matched, done };
    // A fully typed command holds just short of the boundary — ENTER runs it
    // (the boost). Typing a command and running it stay distinct beats.
    if (phase === 'running' && target.length > 0) sendFrac(done ? 0.9 : matched / target.length);
    render();
  };
  entry.onkeydown = (e) => {
    sfx.unlock();
    if (e.key !== 'Enter') return;
    const target = prompts[completed] || '';
    const { done } = typedState(target, entry.value);
    if (done && phase === 'running') {
      sendFrac.cancel();
      completed += 1;
      entry.value = '';
      lastTyped = { len: 0, matched: 0, done: false };
      ws.send(JSON.stringify({ t: 'progress', completed }));
      track.boost(callsign);
      if (completed >= prompts.length) sfx.finish(); else sfx.boost();
      render();
    } else if (phase === 'running') {
      sfx.error();
      entry.classList.remove('shake');
      void entry.offsetWidth; // restart the animation on rapid re-trigger
      entry.classList.add('shake');
    }
  };
  ws.onclose = () => { statusEl.textContent = 'disconnected — reconnecting…'; setTimeout(connect, 1000); };
  ws.onerror = () => ws.close();
}

// Click/tap anywhere returns focus to the input — racers never hunt for it.
// Doubles as the audio unlock gesture.
document.addEventListener('click', () => { sfx.unlock(); if (!entry.disabled) entry.focus(); });

if (!callsign) { statusEl.textContent = 'No callsign — open this from your ship\'s READY button.'; entry.disabled = true; }
else connect();
