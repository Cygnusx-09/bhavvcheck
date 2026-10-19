// Bhav Check — voice loop prototype: F0 Language → F2 Home → F3 Listening → F4 Echo → F5 Price, F4b on a miss.
// Speech: Chrome's built-in recognition (audio goes to Google — demo use only, get consent for testing).
// Strings, crop/mandi names and spoken lines live in i18n.js.

// ── Data (mock mandi prices, per crate ≈ 20 kg) ───────────
const CROPS = {
  tomato:      { img: 'assets/tomato.png',      accent: '#d93326' },
  garlic:      { img: 'assets/garlic.png',      accent: '#8a7a5c' },
  sweetpotato: { img: 'assets/sweetpotato.png', accent: '#b8562f', wide: true },
};
const MANDIS = { nashik: {}, lasalgaon: {}, pimpalgaon: {} };
const PRICES = {   // [today, change since yesterday]
  tomato:      { nashik: [360, 20], lasalgaon: [340, -10], pimpalgaon: [355, 15] },
  garlic:      { nashik: [1240, -40], lasalgaon: [1210, -25], pimpalgaon: [1260, 10] },
  sweetpotato: { nashik: [420, 0], lasalgaon: [400, 15], pimpalgaon: [410, -5] },
};
const SETUP = { mandi: 'nashik', crates: 20 };   // from F1 (one-time setup)
// every spelling of every name, in every language → recognised whichever language is selected
for (const id of [...Object.keys(CROPS), ...Object.keys(MANDIS)])
  (CROPS[id] || MANDIS[id]).say = [...Object.values(NAMES[id]), ...(EXTRA_SAY[id] || [])];

// ── Tunables ──────────────────────────────────────────────
const VOICE = {
  rate:      0.95,   // read-aloud speed — slower is clearer for older listeners (neural voices sound odd much below 0.9)
  pitch:     1,
  localOnly: false,  // true = only on-device voices (private, but robotic on Windows)
  // pick a specific voice per language by (part of) its name — see listVoices() in the console
  prefer:    { hi: 'Madhur', mr: 'Manohar', gu: 'Niranjan', kn: 'Gagan', en: 'Prabhat' },   // older-male neural voices in Edge (Shankar's register)
  minHoldMs: 350,    // shorter presses switch to tap-to-talk
  pauseMs:   1400,   // tap mode: this much silence after speech sends it
  maxListenMs: 9000, // tap mode: stop listening after this long regardless
  settleMs:  1800,   // after release, wait this long for the final transcript
  micGain:   5,      // mic loudness → dot push
};
// ─────────────────────────────────────────────────────────

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const inr = n => n.toLocaleString('en-IN');
let current = 'lang', ctx = { crop: 'tomato', mandi: SETUP.mandi };

// ── Language state ────────────────────────────────────────
const store = { get: k => { try { return localStorage.getItem(k); } catch { return null; } },
                set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };
let L = LANGS[store.get('bhav.lang')] ? store.get('bhav.lang') : 'hi';
const S = () => STR[L];
const nm = id => NAMES[id][L];

// ── Motion (GSAP) ─────────────────────────────────────────
// Emil Kowalski's curves as named GSAP eases: ui.out for entering, ui.inOut for on-screen movement.
gsap.registerPlugin(CustomEase);
CustomEase.create('ui.out', '0.23,1,0.32,1');
CustomEase.create('ui.inOut', '0.77,0,0.175,1');
gsap.defaults({ ease: 'ui.out', duration: 0.4 });
const MOTION = {
  exit:    0.2,    // s — old screen leaves (fast)
  enter:   0.45,   // s — new screen arrives
  shift:   28,     // px the screens slide
  rise:    14,     // px each block rises during the cascade
  stagger: 0.045,  // s between cascading blocks
};
// reduced motion → fades only (no slides, rises, springs or scale)
let calm = REDUCED;
gsap.matchMedia().add('(prefers-reduced-motion: reduce)', () => { calm = true; return () => { calm = false; }; });

// ── Screens ───────────────────────────────────────────────
let screenTl = null;
function show(name, { back = false } = {}) {
  if (name === current) return;
  const from = $(`[data-screen="${current}"]`), to = $(`[data-screen="${name}"]`);
  if (screenTl) screenTl.progress(1).kill();            // finish any transition still running
  from.classList.remove('active'); to.classList.add('active');
  current = name;
  const dir = back ? -1 : 1, blocks = $$(':scope > :not(.grow)', to);
  screenTl = gsap.timeline({ defaults: { ease: 'ui.out' } })
    .to(from, { autoAlpha: 0, x: calm ? 0 : -MOTION.shift * dir, duration: MOTION.exit })
    .fromTo(to, { autoAlpha: 0, x: calm ? 0 : MOTION.shift * dir },
                { autoAlpha: 1, x: 0, duration: MOTION.enter }, '-=0.08')
    // the screen's blocks cascade in — decorative, never blocks input
    .from(blocks, { autoAlpha: 0, y: calm ? 0 : MOTION.rise, duration: 0.5,
                    stagger: calm ? 0 : MOTION.stagger, clearProps: 'transform,opacity,visibility' }, '<0.04')
    .set(from, { clearProps: 'transform' });
  return screenTl;
}

function toast(msg) {
  const t = $('[data-toast]'); t.textContent = msg;
  gsap.killTweensOf(t);
  gsap.timeline()
    .fromTo(t, { autoAlpha: 0, yPercent: calm ? 0 : 100 }, { autoAlpha: 1, yPercent: 0, duration: 0.3 })
    .to(t, { autoAlpha: 0, yPercent: calm ? 0 : 60, duration: 0.18, delay: 2.4 });   // exit faster than enter
}

// count a number up, e.g. the 20-crate total
function countUp(el, to, prefix = '', dur = 0.9) {
  const o = { v: 0 };
  gsap.to(o, { v: to, duration: calm ? 0 : dur, ease: 'expo.out',
    onUpdate: () => { el.textContent = prefix + inr(Math.round(o.v)); } });
}

// ── Read-aloud (speechSynthesis) ──────────────────────────
// Prefer neural voices: Edge's "Natural" (Swara, Aarohi, Dhwani, Sapna…) > Google's > old on-device Windows voices.
// Neural voices run online: the TEXT is sent to Microsoft/Google (not your voice). Set VOICE.localOnly to avoid that.
// No voice for a language → say so once and stay text-only (never read Marathi with a Hindi voice).
const warned = new Set();
const voiceRank = v => (/natural/i.test(v.name) ? 0 : /online|neural/i.test(v.name) ? 1 : /google/i.test(v.name) ? 2 : 3);
function voiceFor(l) {
  let vs = speechSynthesis.getVoices().filter(v => v.lang.replace('_', '-').toLowerCase().startsWith(l));
  if (VOICE.localOnly) vs = vs.filter(v => v.localService);
  const want = VOICE.prefer[l];
  return vs.find(v => want && v.name.includes(want)) || vs.sort((a, b) => voiceRank(a) - voiceRank(b))[0] || null;
}
// debug: list what this browser offers → run listVoices() in the console
window.listVoices = () => console.table(speechSynthesis.getVoices().filter(v => /^(hi|mr|gu|kn|en-IN)/i.test(v.lang)).map(v => ({ name: v.name, lang: v.lang, local: v.localService, rank: voiceRank(v) })));
function speak(text, ring = null, l = L) {
  return new Promise(res => {
    speechSynthesis.cancel();
    const v = voiceFor(l);
    if (!v) { if (!warned.has(l) && speechSynthesis.getVoices().length) { warned.add(l); toast(STR[l].tNoVoice); } return res(); }
    const u = new SpeechSynthesisUtterance(text);
    u.lang = LANGS[l].code; u.voice = v; u.rate = VOICE.rate; u.pitch = VOICE.pitch;
    u.onstart = () => ring && (ring.speaking = true);
    u.onend = u.onerror = () => { if (ring) ring.speaking = false; res(); };
    speechSynthesis.speak(u);
  });
}
speechSynthesis.onvoiceschanged = () => {};   // voices load async; voiceFor() reads them at speak time
const LINES = {
  intro: () => S().intro,
  echo:  () => S().echo(nm(ctx.crop), nm(ctx.mandi)),
  retry: () => S().retry,
  price: () => { const [p, d] = PRICES[ctx.crop][ctx.mandi]; return S().price(nm(ctx.crop), nm(ctx.mandi), p, SETUP.crates, p * SETUP.crates, d); },
};

// ── Language: F0 list + applying a language everywhere ─────
function renderLangs() {
  const box = $('[data-langs]'); box.innerHTML = '';
  for (const [l, info] of Object.entries(LANGS)) {
    const b = document.createElement('button');
    b.className = 'lang' + (l === L ? ' on' : ''); b.dataset.l = l;
    b.innerHTML = `<span class="glyph">${info.glyph}</span><span class="lname">${info.name}</span>
      <span class="say" data-say-lang="${l}" role="button" aria-label="${info.name}"><svg><use href="#i-speaker"/></svg></span>`;
    box.appendChild(b);
  }
}

function renderCrops() {
  $$('[data-crops]').forEach(box => {
    box.innerHTML = '';
    for (const [id, c] of Object.entries(CROPS)) {
      const b = document.createElement('button');
      b.className = 'crop' + (c.wide ? ' wide' : ''); b.dataset.crop = id;
      b.innerHTML = `<img src="${c.img}" alt=""><span class="row"><span class="name">${nm(id)}</span>
        <span class="say" data-say-crop="${id}" role="button" aria-label="${nm(id)}"><svg><use href="#i-speaker"/></svg></span></span>`;
      box.appendChild(b);
    }
  });
}

function applyLang(l) {
  L = l; store.set('bhav.lang', l);
  document.documentElement.lang = l;
  document.documentElement.style.setProperty('--font', `${LANGS[l].font}, 'Anek Devanagari', 'Anek Gujarati', 'Anek Kannada', 'Anek Latin', system-ui, sans-serif`);
  for (const el of $$('[data-t]')) el.textContent = S()[el.dataset.t];
  for (const el of $$('[data-lang-name]')) el.textContent = LANGS[l].name;
  $('[data-lang-en]').hidden = l === 'en';            // "· Language" helper only when the title isn't already English
  $('[data-retry-pill]').textContent = `${S().speaking} ${S().retryPill}`;
  $('[data-continue]').textContent = S().next;
  $$('[data-mic]').forEach(m => m.setAttribute('aria-label', S().hold));
  $$('.lang').forEach(b => b.classList.toggle('on', b.dataset.l === l));
  renderCrops();
}

// ── Mic level → listening dots (Web Audio, stays local) ──
// The permission prompt must NOT appear mid-hold (clicking "Allow" = letting go of the mic),
// so it's asked on F0's Continue tap. The AudioContext is created inside that tap, otherwise
// Chrome starts it suspended and the dots stay flat even with a working mic.
let analyser = null, audioCtx = null, level = 0, micAsking = null, dbgMsg = '';
function ensureMicLevel() {
  if (analyser) { audioCtx.resume(); return Promise.resolve(true); }
  if (micAsking) return micAsking;
  audioCtx = audioCtx || new AudioContext();          // created synchronously, inside the user's tap
  micAsking = navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
    .then(stream => {
      audioCtx.resume();
      analyser = audioCtx.createAnalyser(); analyser.fftSize = 512;
      audioCtx.createMediaStreamSource(stream).connect(analyser);
      const buf = new Float32Array(analyser.fftSize);
      const tick = () => {
        analyser.getFloatTimeDomainData(buf);
        let s = 0; for (const v of buf) s += v * v;
        const target = Math.min(1, Math.sqrt(s / buf.length) * VOICE.micGain);
        level += (target - level) * (target > level ? 0.4 : 0.08);   // fast attack, slow release
        field('listen').level = level;
        if (DEBUG && current === 'listen') $('[data-engine]').textContent = `${dbgMsg} · mic ${level.toFixed(2)}`;
        requestAnimationFrame(tick);
      };
      tick();
      return true;
    })
    .catch(() => { toast(S().tMic); return false; })
    .finally(() => { micAsking = null; });
  return micAsking;
}

// ── Hold-to-talk + recognition (in the selected language) ──
// Two ways to talk (holding is hard for some hands):
//   hold  — press, speak, release to send
//   tap   — short press starts listening; it sends by itself after you pause (or tap the mic again)
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null, listening = false, mode = 'hold', heldAt = 0, heard = '', finished = true;
let settleTimer = 0, silenceTimer = 0, maxTimer = 0, lastError = '';
const DEBUG = /[?&]debug/.test(location.search);
const dbg = msg => { dbgMsg = msg; if (DEBUG) $('[data-engine]').textContent = msg; };

function startHold() {
  if (listening) return;
  if (!SR) { toast(S().tNoSR); return; }
  // mic not granted yet → ask now, but don't start a hold that the prompt would interrupt
  if (!analyser) { ensureMicLevel().then(ok => ok && toast(S().tMicReady)); return; }
  listening = true; mode = 'hold'; heldAt = performance.now(); heard = ''; finished = false; lastError = '';
  speechSynthesis.cancel();
  ensureMicLevel();
  $('[data-transcript]').textContent = '…';
  $('[data-listen-label]').textContent = S().release;
  show('listen');
  // the mic lands with a small spring — "you're on"
  if (!calm) gsap.fromTo('[data-screen="listen"] .mic', { scale: 0.8 }, { scale: 0.94, duration: 0.5, ease: 'back.out(2.2)' });
  rec = new SR();
  rec.lang = LANGS[L].code; rec.interimResults = true; rec.continuous = true; rec.maxAlternatives = 3;
  rec.onstart = () => dbg(`engine on · ${rec.lang}`);
  rec.onaudiostart = () => dbg(`mic open · ${rec.lang}`);
  rec.onspeechstart = () => dbg(`speech heard · ${rec.lang}`);
  rec.onresult = e => {
    const words = heard.split(' ').length;
    // all alternatives count for matching (the top guess often mangles crop names)
    heard = [...e.results].map(r => [...r].map(a => a.transcript).join(' | ')).join(' ').trim();
    const shown = [...e.results].map(r => r[0].transcript).join(' ').trim();
    const el = $('[data-transcript]');
    el.textContent = shown ? shown + '…' : '…';
    dbg(`result: ${shown}`);
    if (!calm && heard.split(' ').length > words) gsap.fromTo(el, { y: 8, autoAlpha: 0.55 }, { y: 0, autoAlpha: 1, duration: 0.28, overwrite: true });
    // tap mode: a pause after speech sends it
    if (mode === 'tap' && shown) { clearTimeout(silenceTimer); silenceTimer = setTimeout(stopListening, VOICE.pauseMs); }
  };
  rec.onerror = e => {
    lastError = e.error; dbg(`error: ${e.error}`);
    const msg = { 'not-allowed': S().tMic, 'service-not-allowed': S().tMic, 'audio-capture': S().tNoMic,
                  'network': S().tNet, 'language-not-supported': S().tLangSR }[e.error];
    if (msg) { toast(msg); abortListening(); }      // hard failures: stop, say why
  };
  // the engine stops itself on silence — keep it going while the user is still talking to us
  rec.onend = () => { if (listening && !lastError) { try { rec.start(); } catch {} } else if (!listening) finish(); };
  try { rec.start(); } catch {}
}

function endHold() {
  if (!listening || mode !== 'hold') return;
  if (performance.now() - heldAt < VOICE.minHoldMs) {
    // short press → switch to tap mode instead of cancelling
    mode = 'tap';
    $('[data-listen-label]').textContent = S().tapSend;
    clearTimeout(maxTimer); maxTimer = setTimeout(stopListening, VOICE.maxListenMs);
    return;
  }
  stopListening();
}

function stopListening() {
  if (!listening) return;
  listening = false;
  clearTimeout(silenceTimer); clearTimeout(maxTimer);
  try { rec.stop(); } catch {}
  settleTimer = setTimeout(finish, VOICE.settleMs);     // in case onend never fires
}

function finish() {
  if (finished) return;
  finished = true; clearTimeout(settleTimer);
  if (!heard && lastError === 'no-speech') toast(S().tNoSpeech);
  const m = match(heard);
  if (m.crop) { ctx.crop = m.crop; ctx.mandi = m.mandi || SETUP.mandi; echo(); }
  else retry();
}

function abortListening() {
  listening = false; finished = true;
  clearTimeout(silenceTimer); clearTimeout(maxTimer); clearTimeout(settleTimer);
  try { rec && rec.abort(); } catch {}
  show(ctx.from && ctx.from !== 'listen' ? ctx.from : 'home', { back: true });
}
const cancelListening = abortListening;

// find a crop + mandi anywhere in what was said
const norm = s => s.toLowerCase().replace(/[।.,!?"']/g, ' ').replace(/\s+/g, ' ');
function match(text) {
  const t = norm(text), find = table => Object.keys(table).find(k => table[k].say.some(w => t.includes(norm(w))));
  return { crop: find(CROPS), mandi: find(MANDIS) };
}

// ── Screens' content ──────────────────────────────────────
function echo() {
  const c = CROPS[ctx.crop];
  $('[data-echo-pill]').textContent = `${S().speaking} "${nm(ctx.crop)}, ${nm(ctx.mandi)}?"`;
  $('[data-echo-img]').src = c.img;
  $('[data-echo-crop]').textContent = nm(ctx.crop);
  $('[data-echo-mandi]').textContent = `${nm(ctx.mandi)} ${S().mandi}`;
  const ring = field('ring'); ring.color = c.accent; ring.reveal = 0;
  show('echo');
  // ring draws itself in (ease-in-out: it's moving on screen) while the question is read out
  gsap.to(ring, { reveal: 1, duration: calm ? 0 : DOTS.ringDraw, ease: 'ui.inOut', delay: 0.1 });
  if (!calm) gsap.timeline({ delay: 0.12 })
    .fromTo('.ring-photo', { scale: 0.82, autoAlpha: 0 }, { scale: 1, autoAlpha: 1, duration: 0.6, ease: 'back.out(1.6)' })
    .fromTo('.yesno .big-btn', { y: 24, autoAlpha: 0 },
            { y: 0, autoAlpha: 1, duration: 0.5, stagger: 0.07, ease: 'back.out(1.3)', clearProps: 'transform' }, '-=0.3');
  speak(LINES.echo(), ring);
}

function retry() {
  ctx.from = 'retry';
  show('retry');
  speak(LINES.retry());
}

function price() {
  const c = CROPS[ctx.crop], [p, d] = PRICES[ctx.crop][ctx.mandi];
  $('[data-price-img]').src = c.img;
  $('[data-price-chip]').textContent = `${nm(ctx.crop)} · ${nm(ctx.mandi)}`;
  const priceEl = $('[data-price]');
  priceEl.textContent = `₹${inr(p)}`;
  priceEl.style.fontSize = p >= 1000 ? '84px' : '';      // 4-digit prices still fit
  $('[data-crates]').textContent = S().yourCrates(SETUP.crates);
  $('[data-total]').textContent = '≈ ₹0';
  const trend = $('[data-trend]');
  trend.textContent = S().trend(d);
  trend.parentElement.classList.toggle('down', d < 0);
  show('price');
  // the answer settles into focus — the hero moment, so a touch slower (expo.out)
  gsap.fromTo(priceEl, { autoAlpha: 0, y: calm ? 0 : 18, scale: calm ? 1 : 0.94, filter: calm ? 'blur(0px)' : 'blur(8px)' },
                       { autoAlpha: 1, y: 0, scale: 1, filter: 'blur(0px)', duration: calm ? 0.3 : 0.8, ease: 'expo.out', delay: 0.12 });
  gsap.delayedCall(0.35, () => countUp($('[data-total]'), p * SETUP.crates, '≈ ₹'));
  // trend arrow nods in its direction
  if (!calm) gsap.fromTo('.trend svg', { y: d < 0 ? -6 : 6 }, { y: 0, duration: 0.6, ease: 'back.out(3)', delay: 0.5 });
  speak(LINES.price());
}

// ── Wiring ────────────────────────────────────────────────
document.addEventListener('pointerdown', e => {
  if (e.target.closest('[data-mic]')) { e.preventDefault(); ctx.from = current; startHold(); }
});
addEventListener('pointerup', endHold);
addEventListener('pointercancel', endHold);
addEventListener('keydown', e => { if (e.code === 'Space' && !e.repeat && ['home', 'retry'].includes(current)) { e.preventDefault(); ctx.from = current; startHold(); } });
addEventListener('keyup', e => { if (e.code === 'Space') endHold(); });

document.addEventListener('click', e => {
  // F0: hear a language's name in that language / pick it
  const sayLang = e.target.closest('[data-say-lang]');
  if (sayLang) { e.stopPropagation(); const l = sayLang.dataset.sayLang; speak(LANGS[l].name, null, l); return; }
  const lang = e.target.closest('.lang');
  if (lang) {
    const l = lang.dataset.l;
    const changed = l !== L;
    applyLang(l);
    if (!calm) gsap.fromTo($('.glyph', lang), { scale: 0.85 }, { scale: 1, duration: 0.45, ease: 'back.out(2.5)' });
    // the header, hint and button re-letter themselves in the new language
    if (changed && !calm) gsap.fromTo(['[data-screen="lang"] [data-t]', '[data-continue]'],
      { y: 8, autoAlpha: 0, filter: 'blur(3px)' },
      { y: 0, autoAlpha: 1, filter: 'blur(0px)', duration: 0.35, stagger: 0.04, ease: 'ui.out', clearProps: 'transform,filter' });
    speak(LANGS[l].name, null, l);
    return;
  }
  if (e.target.closest('[data-continue]')) { ensureMicLevel(); show('home'); speak(LINES.intro()); return; }   // ask for the mic now, calmly
  if (e.target.closest('[data-lang-open]')) { speechSynthesis.cancel(); return show('lang', { back: true }); }

  const sayCrop = e.target.closest('[data-say-crop]');
  if (sayCrop) { e.stopPropagation(); speak(nm(sayCrop.dataset.sayCrop)); return; }
  const card = e.target.closest('[data-crop]');
  if (card) { ctx.crop = card.dataset.crop; ctx.mandi = SETUP.mandi; price(); return; }   // tapping a photo is unambiguous → no echo
  const say = e.target.closest('[data-say]');
  if (say) { speak(LINES[say.dataset.say](), say.dataset.say === 'echo' ? field('ring') : null); return; }
  if (e.target.closest('[data-yes]')) return price();
  if (e.target.closest('[data-no]')) return retry();
  if (e.target.closest('[data-cancel]')) return cancelListening();
  if (e.target.closest('[data-send]')) return stopListening();
  if (e.target.closest('[data-home]')) { speechSynthesis.cancel(); return show('home', { back: true }); }
  if (e.target.closest('[data-next-step]')) return toast(S().tNext);
  if (e.target.closest('[data-share]')) {
    const text = LINES.price();
    if (navigator.share) navigator.share({ text }).catch(() => {});
    else navigator.clipboard.writeText(text).then(() => toast(S().tCopied));
  }
});

// tab hidden → stop talking and listening
document.addEventListener('visibilitychange', () => { if (document.hidden) { speechSynthesis.cancel(); if (listening) cancelListening(); } });

// ── Boot ──────────────────────────────────────────────────
renderLangs();
applyLang(L);

// idle mic breathes with its dot ripple — invites a press (skipped for reduced motion)
if (!calm) gsap.to('[data-screen="home"] .mic, [data-screen="retry"] .mic',
  { scale: 1.045, duration: 1.4, yoyo: true, repeat: -1, ease: 'sine.inOut' });

// first load: the language screen cascades in the same way every screen does
gsap.from($$('[data-screen="lang"] > :not(.grow)'), { autoAlpha: 0, y: calm ? 0 : MOTION.rise, duration: 0.6,
  stagger: calm ? 0 : MOTION.stagger * 1.5, delay: 0.1, clearProps: 'opacity,visibility,transform' });
