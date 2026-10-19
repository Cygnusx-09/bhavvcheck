// F6b Trend — 30 days of (mock) history + a cautious 7-day estimate band.
// Design rule: show the trend and a RANGE, say "estimate, not certain", warn about spoilage.
// It never tells the farmer to wait or to sell.

const TRENDCFG = {
  noise:    0.025,  // day-to-day wobble in the mock history (fraction of price)
  weekly:   0.015,  // weekly market rhythm in the mock history
  damp:     0.6,    // how much of the recent slope the estimate carries forward (<1 = cautious)
  band0:    0.02,   // estimate band half-width on day 1 (fraction of price) — keep it quieter than the real history
  bandGrow: 0.007,  // … widening per day — uncertainty grows with distance
};
const TT = () => TREND[L];
let trendRange = 7, trendSay = '';

// seeded so the same crop + mandi always shows the same history
function rng(seed) {
  let a = 0; for (const ch of seed) a = (a * 31 + ch.charCodeAt(0)) | 0;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const r5 = v => Math.round(v / 5) * 5, r10 = v => Math.round(v / 10) * 10;

function series(crop, mandi) {
  const [p, d] = PRICES[crop][mandi], R = rng(crop + mandi);
  const hist = new Array(30); hist[29] = p; hist[28] = p - d;
  const drift = p * 0.004 * (R() - 0.45);
  for (let i = 27; i >= 0; i--)
    hist[i] = r5(hist[i + 1] - drift + p * TRENDCFG.noise * (R() * 2 - 1) + Math.sin(i * 2 * Math.PI / 7) * p * TRENDCFG.weekly);
  // slope of the last 7 days (least squares), carried forward damped
  const last = hist.slice(-7), my = last.reduce((a, b) => a + b) / 7;
  const slope = last.reduce((s, y, x) => s + (x - 3) * (y - my), 0) / last.reduce((s, _, x) => s + (x - 3) ** 2, 0);
  const fc = Array.from({ length: 7 }, (_, k) => {
    const c = p + slope * TRENDCFG.damp * (k + 1), h = p * (TRENDCFG.band0 + TRENDCFG.bandGrow * k);
    return { c, lo: c - h, hi: c + h };
  });
  return { hist, fc, slope, lo: r10(fc[6].lo), hi: r10(fc[6].hi) };
}

// smooth path through points (Catmull-Rom → cubic Bézier)
function smoothPath(pts) {
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    d += ` C${p1[0] + (p2[0] - p0[0]) / 6},${p1[1] + (p2[1] - p0[1]) / 6} ${p2[0] - (p3[0] - p1[0]) / 6},${p2[1] - (p3[1] - p1[1]) / 6} ${p2[0]},${p2[1]}`;
  }
  return d;
}

function drawTrend(animate = true) {
  const s = series(ctx.crop, ctx.mandi), T = TT();
  const hist = s.hist.slice(-trendRange), n = hist.length, all = n + s.fc.length, ti = n - 1;
  const W = 345, H = 220, L0 = 42, R0 = 10, T0 = 28, B0 = 30;
  const vals = [...hist, ...s.fc.map(f => f.lo), ...s.fc.map(f => f.hi)];
  const vMin = Math.min(...vals), vMax = Math.max(...vals), pad = (vMax - vMin) * 0.14 || 10;
  const X = i => L0 + (i / (all - 1)) * (W - L0 - R0);
  const Y = v => T0 + (1 - (v - (vMin - pad)) / ((vMax + pad) - (vMin - pad))) * (H - T0 - B0);
  const hp = hist.map((v, i) => [X(i), Y(v)]);
  const fcPts = [[X(ti), Y(hist[ti])], ...s.fc.map((f, k) => [X(ti + k + 1), Y(f.c)])];
  const band = [[X(ti), Y(hist[ti])], ...s.fc.map((f, k) => [X(ti + k + 1), Y(f.hi)]),
                ...s.fc.map((f, k) => [X(ti + k + 1), Y(f.lo)]).reverse()];
  const hiV = Math.max(...hist), loV = Math.min(...hist), hiI = hist.lastIndexOf(hiV), loI = hist.lastIndexOf(loV);
  const day = i => T.days[(new Date().getDay() - (n - 1 - i) + 70) % 7];
  const ticks = [...new Set([vMin, (vMin + vMax) / 2, vMax].map(r10))];
  const clampX = x => Math.min(Math.max(x, 92), 250);   // keep marker labels inside the card
  // x labels: 7-day = every other day + Today (≈45px apart, fits every script); 30-day = "30 days ago … Today"
  const xl = trendRange === 7
    ? hist.map((_, i) => i === ti ? `<text x="${X(i)}" y="${H - 10}" text-anchor="middle" class="lbl">${T.today}</text>`
                       : (ti - i) % 2 === 0 ? `<text x="${X(i)}" y="${H - 10}" text-anchor="middle">${day(i)}</text>` : '').join('')
    : `<text x="${X(0)}" y="${H - 10}" class="lbl">${T.ago30}</text><text x="${X(ti)}" y="${H - 10}" text-anchor="middle" class="lbl">${T.today}</text>`;

  const svg = $('[data-chart]');
  svg.innerHTML = `
    <defs><linearGradient id="g-area" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#0f6a50" stop-opacity=".18"/><stop offset="1" stop-color="#0f6a50" stop-opacity="0"/></linearGradient></defs>
    ${ticks.map(v => `<line x1="${L0}" x2="${W - R0}" y1="${Y(v)}" y2="${Y(v)}" stroke="#e6ebe9"/><text x="${L0 - 6}" y="${Y(v) + 4}" text-anchor="end">₹${inr(v)}</text>`).join('')}
    <path class="t-area" d="${smoothPath(hp)} L${X(ti)},${H - B0} L${X(0)},${H - B0} Z" fill="url(#g-area)"/>
    <g class="t-fc">
      <path d="M${band.map(p => p.join(',')).join(' L')} Z" fill="#d9ece5" opacity=".8"/>
      <path d="${smoothPath(fcPts)}" fill="none" stroke="#0f6a50" stroke-width="2" stroke-dasharray="4 5" stroke-linecap="round"/>
      <text x="${X(all - 1)}" y="${Y(s.fc[6].hi) - 8}" text-anchor="end" class="lbl" style="fill:#0f6a50">${T.estimate}</text>
      ${trendRange === 7 ? `<text x="${(X(ti) + X(all - 1)) / 2 + 8}" y="${H - 10}" text-anchor="middle">${T.next7}</text>` : ''}
    </g>
    <line x1="${X(ti)}" x2="${X(ti)}" y1="${T0 - 6}" y2="${H - B0}" stroke="#13201b" stroke-opacity=".22" stroke-dasharray="3 4"/>
    <path class="t-line" d="${smoothPath(hp)}" fill="none" stroke="#0f6a50" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    <g class="t-mark"><circle cx="${X(hiI)}" cy="${Y(hiV)}" r="5" fill="#fff" stroke="#0f6a50" stroke-width="2.5"/>
      <text x="${clampX(X(hiI))}" y="${Y(hiV) - 11}" text-anchor="middle" class="lbl hi-lbl">▲ ${T.high} ₹${inr(hiV)}</text></g>
    <g class="t-mark"><circle cx="${X(loI)}" cy="${Y(loV)}" r="5" fill="#fff" stroke="#d93326" stroke-width="2.5"/>
      <text x="${clampX(X(loI))}" y="${Y(loV) + 20}" text-anchor="middle" class="lbl lo-lbl">▼ ${T.low} ₹${inr(loV)}</text></g>
    <g class="t-now"><circle cx="${X(ti)}" cy="${Y(hist[ti])}" r="11" fill="#0f6a50" opacity=".15"/><circle cx="${X(ti)}" cy="${Y(hist[ti])}" r="6" fill="#0f6a50"/></g>
    ${xl}`;

  // copy: direction, range, storage note (+ the same as one spoken paragraph)
  const sign = trendRange === 7
    ? (Math.abs(s.slope) < hist[ti] * 0.004 ? 0 : Math.sign(s.slope))
    : (Math.abs(hist[ti] - hist[0]) < hist[ti] * 0.03 ? 0 : Math.sign(hist[ti] - hist[0]));
  $('[data-trend-dir]').textContent = (sign > 0 ? '↗ ' : sign < 0 ? '↘ ' : '→ ') + T.dir(trendRange, sign);
  $('[data-outlook]').textContent = T.outlook(inr(s.lo), inr(s.hi));
  const keeps = ctx.crop === 'garlic', shelf = $('[data-shelf]');
  shelf.textContent = (keeps ? '✓ ' : '⚠ ') + T.shelf[ctx.crop];
  shelf.classList.toggle('risk', !keeps);
  trendSay = `${T.dir(trendRange, sign)}. ${T.sayNumbers(hiV, loV)} ${T.sayRange(s.lo, s.hi)} ${T.shelf[ctx.crop]}.`;

  if (!animate || calm) return;
  // draw-in: history traces left → right, markers pop, then the estimate fades in as a softer, separate layer
  const line = $('.t-line', svg), len = line.getTotalLength();
  gsap.timeline({ defaults: { ease: 'ui.out' } })
    .fromTo(line, { strokeDasharray: len, strokeDashoffset: len }, { strokeDashoffset: 0, duration: 0.9, ease: 'ui.inOut' })
    .from('.t-area', { opacity: 0, duration: 0.6 }, '<0.3')
    .from('.t-mark', { scale: 0.4, transformOrigin: '50% 50%', opacity: 0, duration: 0.45, stagger: 0.08, ease: 'back.out(2)' }, '-=0.25')
    .from('.t-now', { scale: 0.4, svgOrigin: `${X(ti)} ${Y(hist[ti])}`, opacity: 0, duration: 0.5, ease: 'back.out(2.5)' }, '<')
    .from('.t-fc', { opacity: 0, x: -8, duration: 0.6 }, '-=0.1');
}
LINES.trend = () => trendSay;

function openTrend() {
  trendRange = 7;
  $$('[data-range]').forEach(b => b.classList.toggle('on', b.dataset.range === '7'));
  gsap.set('.seg-pill', { xPercent: 0 });
  $('[data-trend-img]').src = CROPS[ctx.crop].img;
  $('[data-trend-chip]').textContent = `${nm(ctx.crop)} · ${nm(ctx.mandi)}`;
  speechSynthesis.cancel();
  drawTrend(false);                          // content in place for the screen's cascade…
  show('trend');
  gsap.delayedCall(calm ? 0 : 0.3, () => { drawTrend(); speak(trendSay); });   // …then the chart draws itself
}

function setRange(r) {
  if (r === trendRange) return;
  trendRange = r;
  $$('[data-range]').forEach(b => b.classList.toggle('on', +b.dataset.range === r));
  gsap.to('.seg-pill', { xPercent: r === 30 ? 100 : 0, duration: calm ? 0 : 0.35, ease: 'ui.inOut' });   // on-screen move → ease-in-out
  gsap.to('[data-chart]', { opacity: 0, duration: calm ? 0 : 0.12,
    onComplete: () => { drawTrend(); gsap.to('[data-chart]', { opacity: 1, duration: 0.2 }); } });
}

// trend-screen strings follow the language too
const applyLangBase = applyLang;
applyLang = l => {
  applyLangBase(l);
  for (const el of $$('[data-tt]')) el.textContent = TREND[l][el.dataset.tt];
  if (current === 'trend') drawTrend(false);
};
applyLang(L);

document.addEventListener('click', e => {
  if (e.target.closest('[data-open-trend]')) return openTrend();
  if (e.target.closest('[data-back-price]')) { speechSynthesis.cancel(); return show('price', { back: true }); }
  const rb = e.target.closest('[data-range]');
  if (rb) setRange(+rb.dataset.range);
});

// dev: #trend opens straight on the trend screen; ?shot turns motion off so headless screenshots show the final frame
if (/[?&]shot/.test(location.search)) { calm = true; gsap.globalTimeline.timeScale(100); }
if (location.hash === '#trend') { current = 'lang'; ctx.crop = 'tomato'; openTrend(); }
if (/[?&]r30/.test(location.search)) setTimeout(() => setRange(30), 600);
