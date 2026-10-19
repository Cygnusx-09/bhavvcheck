// UI sound feedback (earcons) + haptics — plain Web Audio, no files, nothing leaves the device.
// Recipes follow the create-sound skill (tap / modal-close / toggle / modal-open / click+body / copy / notification),
// tuned warmer and lower for older ears, and quiet enough to sit under the read-aloud voice.
// Rule: buttons that already SPEAK get no sound — the voice is their feedback.

const SFX = {
  enabled: true,    // master switch (also: press M; remembered per device)
  volume:  0.9,     // master trim on top of each sound's own gain (gains follow the skill's budget, ≤0.6 per sound)
  haptics: true,    // navigator.vibrate on phones that support it (Android Chrome)
};

// layer = { wave, f (Hz or [start,end]), fm:[ratio,depth], lp (lowpass Hz), a/d/r (s), gain, delay (s) }
const EARCONS = {
  // BASSY set: everything ~an octave down + a low "body" layer. Phone speakers can't play much under ~150 Hz,
  // so the weight comes from 120–220 Hz bodies with their harmonics (FM / triangle), not from true sub-bass.
  // navigation tap — skill "tap" an octave down, with a short thump underneath
  tap:    [{ wave: 'sine', f: 560, fm: [0.5, 50], lp: 1800, a: 0, d: 0.025, r: 0.008, gain: 0.12 },
           { wave: 'sine', f: [170, 120], fm: [1, 30], a: 0, d: 0.05, r: 0.015, gain: 0.2 }],
  // back / home / cancel — skill "modal-close", lower sweep + body
  back:   [{ wave: 'sine', f: [480, 230], lp: 1800, a: 0.002, d: 0.08, r: 0.02, gain: 0.12 },
           { wave: 'triangle', f: [150, 100], lp: 700, a: 0.002, d: 0.08, r: 0.02, gain: 0.16 }],
  // 7/30 toggle — skill "toggle" pair (C5 → G5) over a soft knock
  toggle: [{ wave: 'sine', f: 523, lp: 2000, a: 0, d: 0.035, r: 0.01, gain: 0.1 },
           { wave: 'sine', f: 784, lp: 2000, a: 0, d: 0.04, r: 0.012, gain: 0.1, delay: 0.025 },
           { wave: 'sine', f: [160, 110], a: 0, d: 0.05, r: 0.015, gain: 0.16 }],
  // mic opens — skill "modal-open" sweep (lower) over a round body
  listen: [{ wave: 'sine', f: [220, 560], lp: 2000, a: 0.004, d: 0.1, r: 0.025, gain: 0.13 },
           { wave: 'triangle', f: [110, 140], lp: 600, a: 0.003, d: 0.09, r: 0.025, gain: 0.2 }],
  // sent — skill "click + body": a muffled tick over a deep thump
  send:   [{ wave: 'sine', f: 1300, lp: 2200, a: 0, d: 0.008, r: 0.004, gain: 0.05 },
           { wave: 'sine', f: [180, 85], fm: [0.5, 40], a: 0, d: 0.13, r: 0.04, gain: 0.24 }],
  // share — skill "copy": two rising notes, an octave down, with body
  share:  [{ wave: 'sine', f: 600, lp: 2000, a: 0, d: 0.035, r: 0.01, gain: 0.1 },
           { wave: 'sine', f: 700, lp: 2000, a: 0, d: 0.045, r: 0.012, gain: 0.1, delay: 0.04 },
           { wave: 'sine', f: [150, 110], a: 0, d: 0.06, r: 0.015, gain: 0.14 }],
  // notice (toast) — skill "notification": two FM bells a fifth apart, lower and darker, light reverb
  notice: [{ wave: 'sine', f: 330, fm: [1.5, 90], lp: 1800, a: 0.003, d: 0.26, r: 0.06, gain: 0.13, verb: 0.12 },
           { wave: 'sine', f: 495, fm: [1.5, 90], lp: 1800, a: 0.003, d: 0.3, r: 0.07, gain: 0.11, verb: 0.12, delay: 0.1 },
           { wave: 'sine', f: 110, a: 0.004, d: 0.2, r: 0.05, gain: 0.12 }],
};
const BUZZ = { listen: 25, send: 12 };   // ms of vibration

let sfxCtx = null, sfxOut = null, sfxVerb = null;
try { const v = localStorage.getItem('bhav.sfx'); if (v !== null) SFX.enabled = v === '1'; } catch {}

function sfxInit() {
  if (sfxCtx) { if (sfxCtx.state === 'suspended') sfxCtx.resume(); return; }
  sfxCtx = new AudioContext();                       // created inside a user gesture
  const comp = sfxCtx.createDynamicsCompressor();
  comp.connect(sfxCtx.destination);
  sfxOut = sfxCtx.createGain(); sfxOut.gain.value = SFX.volume; sfxOut.connect(comp);
  // small damped room (skill: decay 0.3–0.6s, low mix) — generated, no impulse file
  const len = Math.floor(sfxCtx.sampleRate * 0.45), ir = sfxCtx.createBuffer(2, len, sfxCtx.sampleRate);
  for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); let lp = 0; for (let i = 0; i < len; i++) { lp = lp * 0.55 + (Math.random() * 2 - 1) * 0.45; d[i] = lp * Math.pow(1 - i / len, 3); } }
  sfxVerb = sfxCtx.createConvolver(); sfxVerb.buffer = ir; sfxVerb.connect(sfxOut);
}

function playLayer(L, t0) {
  const c = sfxCtx, t = t0 + (L.delay || 0), end = t + L.a + L.d + L.r;
  const o = c.createOscillator(), g = c.createGain();
  o.type = L.wave;
  const [f0, f1] = Array.isArray(L.f) ? L.f : [L.f, L.f];
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + L.a + L.d);
  if (L.fm) {                                         // FM: modulator → carrier frequency
    const m = c.createOscillator(), mg = c.createGain();
    m.frequency.setValueAtTime(f0 * L.fm[0], t); mg.gain.value = L.fm[1];
    m.connect(mg); mg.connect(o.frequency); m.start(t); m.stop(end + 0.02);
  }
  let node = o;
  if (L.lp) { const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = L.lp; lp.Q.value = 0.7; o.connect(lp); node = lp; }
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(L.gain, t + Math.max(L.a, 0.002));
  g.gain.exponentialRampToValueAtTime(0.0001, end);
  node.connect(g); g.connect(sfxOut);
  if (L.verb) { const wet = c.createGain(); wet.gain.value = L.verb; g.connect(wet); wet.connect(sfxVerb); }
  o.start(t); o.stop(end + 0.03);
}

function sfx(name) {
  const layers = EARCONS[name];
  if (!layers || !SFX.enabled) return;
  if (SFX.haptics && BUZZ[name] && navigator.vibrate) navigator.vibrate(BUZZ[name]);
  sfxInit();
  const t0 = sfxCtx.currentTime + 0.005;
  for (const L of layers) playLayer(L, t0);
}

// ── Hooks into the app (app.js functions are global declarations, so these wrappers take over every call) ──
startHold = (orig => function (...a) { const was = listening; const r = orig.apply(this, a); if (!was && listening) sfx('listen'); return r; })(startHold);
stopListening = (orig => function (...a) { const was = listening; const r = orig.apply(this, a); if (was) sfx('send'); return r; })(stopListening);
toast = (orig => function (...a) { sfx('notice'); return orig.apply(this, a); })(toast);

// Buttons whose click is answered by the VOICE (or by its own earcon elsewhere) — no tap sound on these.
const SPEAKS = [
  '[data-say]', '[data-say-crop]', '[data-say-lang]', '.lang', '[data-crop]',   // read something aloud
  '[data-yes]', '[data-no]', '[data-continue]', '[data-open-trend]',            // lead to a screen that speaks
  '[data-mic]', '[data-send]',                                                  // mic has listen / send
  '[data-next-step]',                                                           // shows a toast → notice
].join(', ');
const SOUND_FOR = [
  ['[data-home], [data-back-price], [data-cancel]', 'back'],
  ['[data-range]', 'toggle'],
  ['[data-share]', 'share'],
];

document.addEventListener('pointerdown', e => {
  sfxInit();                                         // unlock audio on the first press
  const b = e.target.closest('button, [role="button"]');
  if (!b || b.matches(SPEAKS) || b.closest('[data-say-crop], [data-say-lang]')) return;
  for (const [sel, name] of SOUND_FOR) if (b.matches(sel)) return sfx(name);
  sfx('tap');
}, true);

addEventListener('keydown', e => {
  if (e.key === 'm' || e.key === 'M') {
    SFX.enabled = !SFX.enabled;
    try { localStorage.setItem('bhav.sfx', SFX.enabled ? '1' : '0'); } catch {}
    if (SFX.enabled) sfx('tap');
  }
});
