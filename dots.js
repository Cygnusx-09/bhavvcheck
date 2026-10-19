// Dot fields — the "seed / grain" motion language. One class, four jobs:
//   breath  (F2/F4b mic)  slow outward ripple        → "I'm ready, hold me"
//   listen  (F3)          pushed outward by your voice → "I hear you"
//   ring    (F4)          ring draws in while app speaks → "this is what I heard"
//   gather  (F5)          dots fly in to form the price  → "here's the answer"

const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ── Tunables (eyeball these) ──────────────────────────────
const DOTS = {
  breathSpeed: 1.6,   // ripple speed on the idle mic
  wobble:      18,    // px a loud voice bends the rings
  wobbleIdle:  0.12,  // wobble while quiet (0 = rings sit still until you speak)
  lobes:       5,     // waves around each ring — more = busier edge
  wobbleSpeed: 2.2,   // how fast the waves travel around
  ringSpinListen: 0.25, // rad/s rings rotate (alternating directions)
  listenGrow:  0.9,   // how much dots swell with your voice
  ringSpin:    0.18,  // rad/s the echo ring turns
  ringDraw:    1.4,   // s for the ring to draw itself in
  gatherTime:  1.1,   // s for dots to form the number
  gatherStep:  5,     // px between dots in the number (smaller = denser)
};
// ─────────────────────────────────────────────────────────

class DotField {
  constructor(canvas, mode) {
    this.c = canvas; this.mode = mode; this.ctx = canvas.getContext('2d');
    this.w = canvas.width; this.h = canvas.height;
    const dpr = Math.min(2, devicePixelRatio || 1);
    canvas.style.width = this.w + 'px'; canvas.style.height = this.h + 'px';
    canvas.width = this.w * dpr; canvas.height = this.h * dpr;
    this.ctx.scale(dpr, dpr);
    this.color = '#0f6a50';
    this.level = 0;          // listen: smoothed mic level 0–1
    this.speaking = false;   // ring: pulses while the app talks
    this.reveal = 1;         // ring: 0–1 drawn
    this.t0 = performance.now();
    this.build();
  }

  // dots on concentric rings, spaced evenly along each ring
  rings(radii, spacing) {
    const out = [];
    radii.forEach((r, ri) => {
      const n = Math.max(1, Math.round((Math.PI * 2 * r) / spacing));
      for (let i = 0; i < n; i++) out.push({ a: (i / n) * Math.PI * 2 + ri * 0.37, r, ri, k: ri / Math.max(1, radii.length - 1) });
    });
    return out;
  }

  build() {
    const R = (a, b, s) => { const o = []; for (let r = a; r <= b; r += s) o.push(r); return o; };
    if (this.mode === 'breath') this.pts = this.rings(R(62, 94, 8), 10.5);
    if (this.mode === 'listen') this.pts = [{ a: 0, r: 0, ri: 0, k: 0 }, ...this.rings(R(10, 146, 9.5), 10)];
    if (this.mode === 'ring')   this.pts = this.rings(R(116, 146, 7.5), 9);
    if (this.mode === 'gather') this.pts = [];
  }

  // F5: sample the price text into dot targets, then fly dots in
  gatherTo(text, font, onDone) {
    const off = document.createElement('canvas'); off.width = this.w; off.height = this.h;
    const o = off.getContext('2d');
    o.font = font; o.textAlign = 'center'; o.textBaseline = 'middle';
    o.fillText(text, this.w / 2, this.h / 2 + 6);
    const d = o.getImageData(0, 0, this.w, this.h).data, s = DOTS.gatherStep, pts = [];
    for (let y = 0; y < this.h; y += s) for (let x = 0; x < this.w; x += s) {
      if (d[(y * this.w + x) * 4 + 3] > 140) {
        const ang = Math.random() * Math.PI * 2, dist = 120 + Math.random() * 160;
        pts.push({ tx: x, ty: y, sx: this.w / 2 + Math.cos(ang) * dist, sy: this.h / 2 + Math.sin(ang) * dist * 0.6, delay: Math.random() * 0.35 });
      }
    }
    this.pts = pts; this.gStart = performance.now(); this.fade = 0; this.onDone = onDone; this.done = false;
    if (REDUCED) { this.done = true; onDone && onDone(); }
  }

  draw(now) {
    const { ctx, w, h } = this, t = (now - this.t0) / 1000, cx = w / 2, cy = h / 2;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = this.color;
    const dot = (x, y, r, a) => { if (a <= 0.01 || r <= 0.1) return; ctx.globalAlpha = Math.min(1, a); ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill(); };

    if (this.mode === 'breath') {
      for (const p of this.pts) {
        const wave = REDUCED ? 0.5 : 0.5 + 0.5 * Math.sin(t * DOTS.breathSpeed * 2 - p.ri * 0.9);
        const r = (2.6 - p.k * 1.1) * (0.8 + 0.45 * wave);
        dot(cx + Math.cos(p.a) * p.r, cy + Math.sin(p.a) * p.r, r, (0.85 - p.k * 0.45) * (0.35 + 0.65 * wave));
      }
    }

    if (this.mode === 'listen') {
      // wobbling rings: each ring bends into a wavy circle (two overlapping waves so it never looks mechanical),
      // alternate rings spin opposite ways; your voice deepens the waves
      const amp = REDUCED ? 0 : (DOTS.wobbleIdle + this.level) * DOTS.wobble;
      for (const p of this.pts) {
        const k = p.r / 146;
        const dir = p.ri % 2 ? 1 : -1;
        const a = p.a + (REDUCED ? 0 : t * DOTS.ringSpinListen * dir * (0.6 + k * 0.4));
        const wave = Math.sin(a * DOTS.lobes + t * DOTS.wobbleSpeed + p.ri * 0.55) * 0.65
                   + Math.sin(a * (DOTS.lobes + 2) - t * DOTS.wobbleSpeed * 0.7 + p.ri * 0.3) * 0.35;
        const r = p.r === 0 ? 0 : p.r + wave * amp * (0.35 + k * 0.65);   // outer rings swing wider
        const crest = 0.5 + 0.5 * wave;                                   // dots on a wave crest swell a little
        const size = (3.4 - k * 2.1) * (1 + this.level * DOTS.listenGrow * (1 - k) * (0.6 + 0.4 * crest));
        dot(cx + Math.cos(a) * r, cy + Math.sin(a) * r, size, (1 - k * 0.75) * (0.75 + 0.25 * crest));
      }
    }

    if (this.mode === 'ring') {
      const spin = REDUCED ? 0 : t * DOTS.ringSpin;
      const pulse = this.speaking && !REDUCED ? 0.75 + 0.25 * Math.sin(t * 9) : 1;
      for (const p of this.pts) {
        const frac = ((p.a % 6.2832) + 6.2832) % 6.2832 / 6.2832;   // where on the ring this dot sits
        const vis = Math.max(0, Math.min(1, (this.reveal - frac) * 12));  // soft drawing edge
        const a = p.a + spin - Math.PI / 2;
        dot(cx + Math.cos(a) * p.r, cy + Math.sin(a) * p.r, 2.4 - p.k * 1.2, vis * (1 - p.k * 0.55) * pulse);
      }
    }

    if (this.mode === 'gather' && this.pts.length) {
      const g = REDUCED ? 1 : (now - this.gStart) / 1000 / DOTS.gatherTime;
      if (g >= 1.15 && !this.done) { this.done = true; this.onDone && this.onDone(); }
      if (this.done) this.fade = Math.min(1, this.fade + 0.04);   // hand over to the crisp number
      for (const p of this.pts) {
        let q = Math.max(0, Math.min(1, (g - p.delay) / (1 - 0.35)));
        q = 1 - Math.pow(1 - q, 3);                                 // ease-out cubic
        dot(p.sx + (p.tx - p.sx) * q, p.sy + (p.ty - p.sy) * q, 2.1, (0.25 + 0.75 * q) * (1 - this.fade));
      }
    }
    ctx.globalAlpha = 1;
  }
}

// one shared loop; only fields on the active screen draw
const Fields = [];
function dotLoop(now) {
  for (const f of Fields) if (f.c.closest('.screen').classList.contains('active')) f.draw(now);
  requestAnimationFrame(dotLoop);
}
document.querySelectorAll('canvas[data-dots]').forEach(c => Fields.push(new DotField(c, c.dataset.dots)));
requestAnimationFrame(dotLoop);
const field = mode => Fields.find(f => f.mode === mode);
