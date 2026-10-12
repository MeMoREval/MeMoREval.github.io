// Results section: small hand-rolled SVG charts driven by data/results.json.
// Every chart has hover/focus tooltips.
(() => {
  const sec = document.getElementById('results');
  if (!sec) return;
  const NS = 'http://www.w3.org/2000/svg';
  const COND = [
    { k: 'text', label: 'text', v: '--c-text' },
    { k: 'd64', label: 'desc@64', v: '--c-d64' },
    { k: 'd256', label: 'desc@256', v: '--c-d256' },
    { k: 'd1024', label: 'desc@1024', v: '--c-d1024' },
    { k: 'frames', label: 'frames', v: '--c-frames' },
    { k: 'frames+graph', label: 'frames+graph', v: '--c-fg' },
  ];
  const C = Object.fromEntries(COND.map((c) => [c.k, c]));
  const col = (k) => `var(${C[k].v})`;
  const f0 = (x) => Math.round(x).toString();
  const f1 = (x) => (Math.round(x * 10) / 10).toFixed(1);
  const f2 = (x) => (Math.round(x * 100) / 100).toFixed(2);
  const sgn = (x) => (x > 0 ? '+' : x < 0 ? '−' : '±') + f1(Math.abs(x));
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---------- tiny SVG toolkit ----------
  const S = (tag, attrs = {}, parent) => {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) if (v != null) e.setAttribute(k, v);
    if (parent) parent.appendChild(e);
    return e;
  };
  const T = (parent, x, y, text, cls, attrs = {}) => { const t = S('text', { x, y, class: cls, ...attrs }, parent); t.textContent = text; return t; };
  const lin = (d0, d1, r0, r1) => { const f = (v) => r0 + ((v - d0) / (d1 - d0)) * (r1 - r0); f.inv = (p) => d0 + ((p - r0) / (r1 - r0)) * (d1 - d0); return f; };
  const ticks = (a, b, step) => { const out = []; for (let v = Math.ceil(a / step) * step; v <= b + 1e-9; v += step) out.push(+v.toFixed(6)); return out; };
  // a round tick step for a range, and how many decimals its labels need
  const niceStep = (range, target = 5) => { const raw = range / target, mag = 10 ** Math.floor(Math.log10(raw)), n = raw / mag; return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * mag; };
  const decs = (step) => Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
  const newSvg = (body, w, h, label) => { body.innerHTML = ''; const s = S('svg', { viewBox: `0 0 ${w} ${h}`, role: 'img', 'aria-label': label }); body.appendChild(s); return s; };
  // A bar with a 4px rounded data-end, square at the baseline.
  const barPath = (x, y0, w, y1) => {
    const top = Math.min(y0, y1), h = Math.abs(y1 - y0), r = Math.min(4, h, w / 2);
    return `M${x},${y0} V${top + r} Q${x},${top} ${x + r},${top} H${x + w - r} Q${x + w},${top} ${x + w},${top + r} V${y0} Z`;
  };

  // ---------- tooltip plumbing ----------
  function tip(card) {
    const body = card.querySelector('.cc-body');
    let el = body.querySelector('.tip');
    if (!el) { el = document.createElement('div'); el.className = 'tip'; el.setAttribute('aria-hidden', 'true'); body.appendChild(el); }
    return {
      show(evt, html, anchor) {
        el.innerHTML = html;
        const br = body.getBoundingClientRect();
        let x, y;
        if (evt && evt.clientX != null && evt.type !== 'focus') { x = evt.clientX - br.left; y = evt.clientY - br.top; }
        else { const r = anchor.getBoundingClientRect(); x = r.left + r.width / 2 - br.left; y = r.top - br.top; }
        el.classList.add('on');
        const w = el.offsetWidth, h = el.offsetHeight;
        el.style.left = Math.max(0, Math.min(br.width - w, x + 14)) + 'px';
        el.style.top = Math.max(0, y - h - 10) + 'px';
      },
      hide() { el.classList.remove('on'); },
    };
  }
  function bindTip(g, tp, html) {
    g.classList.add('mk');
    const on = (e) => tp.show(e, html(), g);
    g.addEventListener('pointerenter', on); g.addEventListener('pointermove', on);
    g.addEventListener('focus', on);
    g.addEventListener('pointerleave', () => tp.hide()); g.addEventListener('blur', () => tp.hide());
  }
  // Reveal animation: marks wait hidden until the figure first scrolls into view, then pop in
  // one group at a time (group = data-seq); lines and point labels fade in after the last group.
  const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const STEP = 110;
  function seq(g, n, kind) { g.dataset.seq = n; if (kind) g.dataset.anim = kind; }
  function reveal(el) {
    if (REDUCE || el.dataset.revealed) return;
    el.classList.add('anim-wait');
    if (el._io) return;
    el._io = new IntersectionObserver((ents) => {
      if (!ents.some((e) => e.isIntersecting)) return;
      el._io.disconnect();
      el.dataset.revealed = '1';
      const mks = [...el.querySelectorAll('.cc-body .mk')];
      const last = Math.max(0, ...mks.map((g) => +g.dataset.seq || 0));
      mks.forEach((g) => { g.style.animationDelay = `${(+g.dataset.seq || 0) * STEP}ms`; g.classList.add('pop'); });
      el.querySelectorAll('.cc-body .fade-in, .cc-body .plab').forEach((t) => { t.style.animationDelay = `${(last + 1) * STEP}ms`; t.classList.add('pop-fade'); });
      el.classList.remove('anim-wait');
    }, { threshold: 0.3 });
    el._io.observe(el.querySelector('.cc-body'));
  }

  // Wires a chart card: segmented tabs, re-render on resize.
  function card(id, render) {
    const el = document.getElementById(id);
    const body = el.querySelector('.cc-body');
    const tabs = [...el.querySelectorAll('.cc-ctrl .seg button[data-v]')];
    const units = [...el.querySelectorAll('.cc-ctrl .seg button[data-u]')];
    const st = { v: tabs[0] ? tabs[0].dataset.v : null, u: units[0] ? units[0].dataset.u : null, sub: null };
    const draw = () => render(el, body, st);
    tabs.forEach((b) => b.addEventListener('click', () => {
      tabs.forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      st.v = b.dataset.v; st.sub = null; draw();
    }));
    units.forEach((b) => b.addEventListener('click', () => {
      units.forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      st.u = b.dataset.u; draw();
    }));
    let w = 0;
    new ResizeObserver(() => { const nw = Math.round(body.clientWidth); if (Math.abs(nw - w) > 24) { w = nw; draw(); } }).observe(body);
    draw();
    return { el, st, draw };
  }
  const legend = (el, items) => {
    el.innerHTML = items.map((i) => `<span><i class="${i.shape || ''}" style="background:${i.color};${i.shape === 'ring' ? `border-color:${i.color}` : ''}"></i>${esc(i.label)}</span>`).join('');
  };
  const fill = (key, html) => document.querySelectorAll(`[data-fill="${key}"]`).forEach((e) => { e.innerHTML = html; });

  // Point labels: try a few spots around each point (in priority order) and keep the first that
  // stays inside the plot and clear of other labels and points; skip the label if none does.
  const LAB_ORDER = ['frames+graph', 'frames', 'text', 'd1024', 'd64', 'd256'];
  function placePointLabels(svg, items, W, Hh, prefer) {
    const boxes = [], pts = items.map((i) => [i.x, i.y]);
    const gap = 4;
    const dist = (b, px, py) => Math.hypot(Math.max(b.x0 - px, 0, px - b.x1), Math.max(b.y0 - py, 0, py - b.y1));
    const hit = (b, it) => boxes.some((o) => b.x0 < o.x1 + gap && b.x1 > o.x0 - gap && b.y0 < o.y1 + gap && b.y1 > o.y0 - gap)
      || pts.some(([px, py]) => px > b.x0 - 7 && px < b.x1 + 7 && py > b.y0 - 7 && py < b.y1 + 7)
      // a label must sit nearer its own point than any other point
      || items.some((o) => o !== it && dist(b, o.x, o.y) < dist(b, it.x, it.y) + 8);
    const order = [...items].sort((a, b) => LAB_ORDER.indexOf(a.k) - LAB_ORDER.indexOf(b.k));
    for (const it of order) {
      const w = it.text.length * 7.4, h = 12;
      const cands = {
        right: { x: it.x + 10, y: it.y + 4, a: 'start' }, left: { x: it.x - 10, y: it.y + 4, a: 'end' },
        up: { x: it.x + 8, y: it.y - 9, a: 'start' }, down: { x: it.x + 8, y: it.y + 18, a: 'start' },
        upl: { x: it.x - 8, y: it.y - 9, a: 'end' }, downl: { x: it.x - 8, y: it.y + 18, a: 'end' },
      };
      for (const key of prefer) {
        const c = cands[key], x0 = c.a === 'end' ? c.x - w : c.x;
        const b = { x0, x1: x0 + w, y0: c.y - h + 2, y1: c.y + 2 };
        if (b.x0 < 2 || b.x1 > W - 2 || b.y0 < 0 || b.y1 > Hh) continue;
        if (hit(b, it)) continue;
        boxes.push(b); T(svg, c.x, c.y, it.text, 'ch-lab plab', c.a === 'end' ? { 'text-anchor': 'end' } : {});
        break;
      }
    }
    return boxes;
  }

  fetch('data/results.json').then((r) => r.json()).then(build).catch((e) => { console.error(e); });

  function build(R) {
    const H = Object.fromEntries(R.headline.rows.map((r) => [r.key, r]));
    const D = R.headline.derived;
    const fr = H.frames, d1 = H.d1024, fg = H['frames+graph'];
    const condLegend = COND.map((c) => ({ label: c.label, color: col(c.k), shape: 'dot' }));
    sec.querySelectorAll('[data-legend="conds"]').forEach((el) => legend(el, condLegend));

    const ctl = Object.fromEntries((R.controls || []).map((c) => [c.key, c]));
    // Gemini 3.7 Flash prices: weighted tokens x output price = dollars
    const P_OUT = 3.75 / 1e6;
    const ledgerCap = (u) => `Gemini 3.7 Flash, 53 tasks &times; 5 backends &times; 3 seeds per condition (write-time cost: the four backends with a writer); whiskers show the range across seeds. ${u === 'usd' ? 'Dollars at $0.75 / $3.75 per million input / output tokens.' : 'Weighted tokens = T<sub>in</sub>&middot;P<sub>in</sub>/P<sub>out</sub> + T<sub>out</sub>, proportional to dollar cost.'} The dashed line marks the full-information control; without memory the agent scores below the axis. Costs cover model inference only.`;

    // ---------- Fig 2: success vs cost (tokens or dollars) ----------
    const MODES = {
      write: { x: (r) => r.write_k_per_step, y: (r) => r.task_pct, ctl: 'task_pct', usd: 1000 * 1000 * P_OUT,
        xl: { tok: 'Write-time cost (k weighted tokens per experience step)', usd: 'Write-time cost ($ per 1,000 experience steps)' },
        xs: { tok: 'Write cost (k tokens / step)', usd: 'Write cost ($ / 1,000 steps)' },
        yl: 'Task success (%)', sub: 'Writing memory: the writer’s input is identical across conditions; descriptions add one model call per step', iso: null },
      info: { x: (r) => r.read_k_per_info_request, y: (r) => r.info_pct, ctl: 'info_pct', usd: 1000 * P_OUT, succ: (r) => r.read_k_per_info_success,
        xl: { tok: 'Read-time cost (k weighted tokens per information request)', usd: 'Read-time cost ($ per information request)' },
        xs: { tok: 'Read cost (k tokens / request)', usd: 'Read cost ($ / request)' },
        yl: 'Information requests answered correctly (%)', sub: 'Answering information requests from memory; diagonals mark equal cost per successful request',
        iso: { tok: R.headline.figure_guides.info, usd: [0.025, 0.03, 0.035] } },
      action: { x: (r) => r.read_k_per_action_request, y: (r) => r.action_pct, ctl: 'action_pct', usd: 1000 * P_OUT, succ: (r) => r.read_k_per_action_success,
        xl: { tok: 'Read-time cost (k weighted tokens per action request)', usd: 'Read-time cost ($ per action request)' },
        xs: { tok: 'Read cost (k tokens / request)', usd: 'Read cost ($ / request)' },
        yl: 'Action requests completed (%)', sub: 'Planning action requests from memory; diagonals mark equal cost per successful request',
        iso: { tok: R.headline.figure_guides.action, usd: [0.045, 0.05, 0.055] } },
    };
    const money = (v, d = 2) => `$${v.toFixed(d)}`;
    // three panels side by side: writing memory, information requests, action requests
    const PANEL = { write: '(a) Writing memory', info: '(b) Information requests', action: '(c) Action requests' };
    const YS = { write: 'Task success (%)', info: 'Information success (%)', action: 'Action success (%)' };
    function ledgerPanel(host, k, st, tp, el) {
      const M = MODES[k], usd = st.u === 'usd', f = usd ? M.usd : 1;
      const xv = (r) => { const o = M.x(r); return { mean: o.mean * f, lo: o.lo * f, hi: o.hi * f }; };
      const xfmt = (v) => (usd ? money(v, k === 'write' ? 2 : 3) : `${f2(v)}k`);
      const rows = COND.map((c) => H[c.k]);
      const W = Math.max(260, host.clientWidth), Hh = Math.round(Math.min(360, Math.max(290, W * 0.95)));
      const m = { l: 46, r: k === 'write' ? 64 : 14, t: 30, b: 44 };
      const svg = newSvg(host, W, Hh, `${YS[k]} against ${M.xl[st.u]}`);
      T(svg, 0, 13, PANEL[k], 'ch-lab');
      const xs = rows.map((r) => xv(r).mean), ys = rows.map((r) => M.y(r).mean);
      const xpad = (Math.max(...xs) - Math.min(...xs)) * 0.16 || 0.5;
      const x0 = Math.min(...xs) - xpad, x1 = Math.max(...xs) + xpad;
      // the top of the scale reaches 100% so the full-information control shows
      const y0 = Math.floor((Math.min(...ys) - 6) / 10) * 10, y1 = 100;
      const X = lin(x0, x1, m.l, W - m.r), Y = lin(y0, y1, Hh - m.b, m.t);
      const grid = S('g', { class: 'ch-grid' }, svg), ax = S('g', { class: 'ch-axis' }, svg);
      const xstep = niceStep(x1 - x0, 4), xd = decs(xstep);
      for (const v of ticks(y0, y1, 10)) { S('line', { x1: m.l, x2: W - m.r, y1: Y(v), y2: Y(v) }, grid); T(svg, m.l - 7, Y(v) + 4, f0(v), 'ch-tick', { 'text-anchor': 'end' }); }
      for (const v of ticks(x0, x1, xstep)) T(svg, X(v), Hh - m.b + 16, (usd ? '$' : '') + v.toFixed(xd), 'ch-tick', { 'text-anchor': 'middle' });
      S('line', { x1: m.l, x2: W - m.r, y1: Hh - m.b, y2: Hh - m.b }, ax);
      T(svg, (m.l + W - m.r) / 2, Hh - 8, M.xs[st.u], 'ch-alabel', { 'text-anchor': 'middle' });
      T(svg, 12, (m.t + Hh - m.b) / 2, YS[k], 'ch-alabel', { 'text-anchor': 'middle', transform: `rotate(-90 12 ${(m.t + Hh - m.b) / 2})` });
      // controls: full information at the top; no memory falls below the axis
      const refBoxes = [];
      const refLabel = (x, y, text) => { T(svg, x, y, text, 'ch-ref-l'); refBoxes.push({ x0: x, x1: x + text.length * 5.6, y0: y - 11, y1: y + 3 }); };
      if (ctl.oracle) {
        S('line', { x1: m.l, x2: W - m.r, y1: Y(ctl.oracle[M.ctl]), y2: Y(ctl.oracle[M.ctl]), class: 'ch-ref' }, svg);
        refLabel(m.l + 5, Y(ctl.oracle[M.ctl]) + 13, `full information: ${f0(ctl.oracle[M.ctl])}%`);
      }
      if (ctl['no-memory']) refLabel(m.l + 5, Hh - m.b - 6, `no memory: ${f0(ctl['no-memory'][M.ctl])}% (off scale)`);
      // iso-cost guides: success% = 100 * x / c
      const iso = M.iso && M.iso[st.u];
      if (iso) {
        const cid = `ledger-clip-${k}`;
        const clip = S('clipPath', { id: cid }, S('defs', {}, svg));
        S('rect', { x: m.l, y: m.t, width: W - m.r - m.l, height: Hh - m.b - m.t }, clip);
        const gi = S('g', { 'clip-path': `url(#${cid})`, class: 'fade-in' }, svg);
        for (const c of iso) S('line', { x1: X(x0), y1: Y((100 * x0) / c), x2: X(x1), y2: Y((100 * x1) / c), class: 'ch-iso' }, gi);
      }
      // descriptions connected in budget order
      S('polyline', { points: ['d64', 'd256', 'd1024'].map((kk) => [X(xv(H[kk]).mean), Y(M.y(H[kk]).mean)].join(',')).join(' '), fill: 'none', stroke: col('d256'), 'stroke-width': 2, opacity: 0.45, 'stroke-linejoin': 'round', class: 'fade-in' }, svg);
      const labs = [];
      rows.forEach((r, i) => {
        const xr = xv(r), yr = M.y(r);
        const cx = X(xr.mean), cy = Y(yr.mean);
        const g = S('g', {}, svg);
        if (yr.lo != null) S('line', { x1: cx, x2: cx, y1: Y(yr.lo), y2: Y(yr.hi), stroke: col(r.key), 'stroke-width': 2, 'stroke-linecap': 'round' }, g);
        if (xr.lo != null && k !== 'write') S('line', { x1: X(xr.lo), x2: X(xr.hi), y1: cy, y2: cy, stroke: col(r.key), 'stroke-width': 2, 'stroke-linecap': 'round' }, g);
        S('circle', { cx, cy, r: 6, fill: col(r.key), stroke: 'var(--surface)', 'stroke-width': 2, class: 'vis' }, g);
        S('circle', { cx, cy, r: 15, class: 'hit' }, g);
        const per = k === 'write' ? (usd ? 'per 1k steps' : 'k per step') : (usd ? 'per request' : 'k per request');
        bindTip(g, tp, () => `<div class="tv">${f1(yr.mean)}%</div><div class="tl"><span class="tk" style="background:${col(r.key)}"></span>${esc(C[r.key].label)} · ${esc(PANEL[k].slice(4))}</div>
          <div class="tr">${k === 'write' ? 'write' : 'read'} ${per} <b>${usd ? xfmt(xr.mean) : f2(xr.mean)}</b></div>
          ${k === 'write' ? `<div class="tr">seed range <b>${f1(yr.lo)}&ndash;${f1(yr.hi)}%</b></div>` : `<div class="tr">per success <b>${usd ? money(M.succ(r) * M.usd, 3) : f2(M.succ(r)) + 'k'}</b></div>`}`);
        seq(g, i);
        labs.push({ k: r.key, x: cx, y: cy, text: C[r.key].label });
      });
      const taken = [...placePointLabels(svg, labs, W, Hh - m.b, k === 'write' ? ['right', 'down', 'up', 'left', 'downl', 'upl'] : ['up', 'right', 'down', 'upl', 'left', 'downl']), ...refBoxes];
      // guide labels go in last: near where each guide leaves the plot, slid back along it
      // until clear of the points and their labels
      for (const c of iso || []) {
        if ((100 * x0) / c >= y1) continue;
        const xa = Math.max(x0, (y0 * c) / 100), xb = Math.min(x1, (y1 * c) / 100);
        const lt = usd ? money(c, 3) : c + 'k', lw = (lt.length + 10) * 5.8;
        for (const t of [1, 0.82, 0.64, 0.46]) {
          const xx = xa + (xb - xa) * t;
          const lx = Math.min(W - m.r - 4, X(xx) - 2), ly = Math.max(m.t + 10, Y((100 * xx) / c) + 12);
          const bx = { x0: lx - lw, x1: lx, y0: ly - 11, y1: ly + 3 };
          if (labs.some((d) => d.x > bx.x0 - 9 && d.x < bx.x1 + 9 && d.y > bx.y0 - 9 && d.y < bx.y1 + 9)) continue;
          if (taken.some((o) => bx.x0 < o.x1 + 8 && bx.x1 > o.x0 - 8 && bx.y0 < o.y1 + 8 && bx.y1 > o.y0 - 8)) continue;
          taken.push(bx); T(svg, lx, ly, lt + ' / success', 'ch-iso-l fade-in', { 'text-anchor': 'end' });
          break;
        }
      }
    }
    card('fig-ledger', (el, body, st) => {
      fill('ledger-cap', ledgerCap(st.u));
      body.innerHTML = '<div class="tri"><div></div><div></div><div></div></div>';
      const tp = tip(el);
      const holders = body.querySelectorAll('.tri > div');
      ['write', 'info', 'action'].forEach((k, i) => ledgerPanel(holders[i], k, st, tp, el));
      reveal(el);
    });

    // ---------- Fig 3: categories, both comparisons side by side ----------
    const CATS = R.categories.rows;
    const PAIRS = [
      { key: 'frames - d1024', left: 'desc@1024', right: 'frames', lk: 'd1024', ck: 'frames', title: 'frames vs. desc@1024' },
      { key: 'frames+graph - frames', left: 'frames', right: 'frames+graph', lk: 'frames', ck: 'frames+graph', title: 'frames+graph vs. frames' },
    ];
    card('fig-cats', (el, body, st) => {
      const all = CATS.find((c) => c.key === 'all' || /all/i.test(c.label)) || null;
      const rows = all ? [all, ...CATS.filter((c) => c !== all)] : CATS;
      body.innerHTML = '<div class="duo"><div></div><div></div></div>';
      const tp = tip(el);
      const holders = body.querySelectorAll('.duo > div');
      const stacked = body.clientWidth < 760;
      // one shared scale so the two comparisons read against each other
      const lo = Math.min(-15, ...rows.flatMap((r) => PAIRS.map((p) => r.diffs[p.key].ci95_lo)));
      const hi = Math.max(30, ...rows.flatMap((r) => PAIRS.map((p) => r.diffs[p.key].ci95_hi)));
      const d0 = Math.floor(lo / 10) * 10, d1 = Math.ceil(hi / 10) * 10;
      PAIRS.forEach((p, pi) => {
        const host = holders[pi];
        const labels = stacked || pi === 0;
        const W = Math.max(280, host.clientWidth), rowH = 34, m = { l: labels ? Math.min(176, W * 0.38) : 10, r: 14, t: 52, b: 44 };
        const Hh = m.t + m.b + rows.length * rowH;
        const svg = newSvg(host, W, Hh, `Paired differences: ${p.right} minus ${p.left}`);
        T(svg, m.l, 13, p.title, 'ch-lab');
        const X = lin(d0, d1, m.l, W - m.r);
        const grid = S('g', { class: 'ch-grid' }, svg);
        for (const v of ticks(d0, d1, 10)) { S('line', { x1: X(v), x2: X(v), y1: m.t, y2: Hh - m.b }, grid); T(svg, X(v), Hh - m.b + 16, (v > 0 ? '+' : '') + v, 'ch-tick', { 'text-anchor': 'middle' }); }
        S('line', { x1: X(0), x2: X(0), y1: m.t - 6, y2: Hh - m.b, class: 'ch-zero' }, svg);
        S('circle', { cx: X(0) - 12, cy: m.t - 16, r: 4, fill: col(p.lk) }, svg);
        S('circle', { cx: X(0) + 12, cy: m.t - 16, r: 4, fill: col(p.ck) }, svg);
        T(svg, X(0) - 21, m.t - 12, `← ${p.left}`, 'ch-note', { 'text-anchor': 'end' });
        T(svg, X(0) + 21, m.t - 12, `${p.right} →`, 'ch-note');
        T(svg, (m.l + W - m.r) / 2, Hh - 6, 'Difference (percentage points)', 'ch-alabel', { 'text-anchor': 'middle' });
        // each row takes the color of the condition it favors; an exact tie stays neutral
        const favCol = (x) => (x > 0 ? col(p.ck) : x < 0 ? col(p.lk) : 'var(--muted)');
        rows.forEach((r, i) => {
          const y = m.t + i * rowH + rowH / 2, d = r.diffs[p.key];
          if (labels) {
            T(svg, m.l - 12, y + 4, r.label, i === 0 && all ? 'ch-lab' : 'ch-lab sub', { 'text-anchor': 'end' });
            T(svg, m.l - 12, y + 17, `${r.tasks} tasks`, 'ch-tick', { 'text-anchor': 'end' });
          }
          const g = S('g', {}, svg);
          const c = favCol(d.diff_pp);
          S('line', { x1: X(d.ci95_lo), x2: X(d.ci95_hi), y1: y, y2: y, stroke: c, 'stroke-width': 2, 'stroke-linecap': 'round' }, g);
          S('circle', { cx: X(d.diff_pp), cy: y, r: i === 0 && all ? 7 : 6, fill: c, stroke: 'var(--surface)', 'stroke-width': 2, class: 'vis' }, g);
          S('rect', { x: X(d.ci95_lo) - 8, y: y - 12, width: Math.max(24, X(d.ci95_hi) - X(d.ci95_lo) + 16), height: 24, class: 'hit' }, g);
          bindTip(g, tp, () => `<div class="tv">${sgn(d.diff_pp)} pts</div><div class="tl">${esc(r.label)} · ${esc(p.title)}</div><div class="tr">95% interval <b>[${f1(d.ci95_lo)}, ${f1(d.ci95_hi)}]</b></div>
            <div class="tr">${esc(p.left)} <b>${f0(r.success_pct[p.lk])}%</b></div><div class="tr">${esc(p.right)} <b>${f0(r.success_pct[p.ck])}%</b></div>`);
          seq(g, i, 'growx');
        });
      });
      reveal(el);
    });

    // ---------- cost and read-time usage (paper Table 2): five bar panels in a row ----------
    const USD = {
      write: (r) => r.write_k_per_step.mean * 1000 * 1000 * P_OUT,
      info: (r) => r.read_k_per_info_success * 1000 * P_OUT,
      action: (r) => r.read_k_per_action_success * 1000 * P_OUT,
    };
    const EFFORT = [
      { h: 'Write cost', s: '$ per 1,000 steps', v: USD.write, fmt: (x) => money(x), max: 14, end: '$14' },
      { h: 'Read cost, information', s: '$ per successful request', v: USD.info, fmt: (x) => money(x, 3), max: 0.04, end: '$0.04' },
      { h: 'Read cost, action', s: '$ per successful request', v: USD.action, fmt: (x) => money(x, 3), max: 0.07, end: '$0.07' },
      { h: 'Tool calls', s: 'per request', v: (r) => r.calls_per_request, fmt: (x) => f1(x), max: 3, end: '3' },
      { h: 'Reasoning tokens', s: 'per request', v: (r) => r.reasoning_k_per_request, fmt: (x) => f1(x) + 'k', max: 5, end: '5k' },
    ];
    card('fig-effort', (el, body, st) => {
      const rows = COND.map((c) => H[c.k]);
      body.innerHTML = `<div class="penta">${EFFORT.map(() => '<div></div>').join('')}</div>`;
      const tp = tip(el);
      const holders = body.querySelectorAll('.penta > div');
      // condition names sit only beside the first panel when the five share a row
      const oneRow = holders[1].offsetTop === holders[0].offsetTop;
      EFFORT.forEach((pn, pi) => {
        const host = holders[pi];
        const labW = !oneRow || pi === 0 ? 92 : 4;
        const W = Math.max(150, host.clientWidth), rowH = 26, m = { l: labW, r: 46, t: 40, b: 24 };
        const Hh = m.t + m.b + rows.length * rowH;
        const svg = newSvg(host, W, Hh, `${pn.h}, ${pn.s}`);
        T(svg, labW, 13, pn.h, 'ch-lab');
        T(svg, labW, 28, pn.s, 'ch-tick');
        const X = lin(0, pn.max, m.l, W - m.r);
        const grid = S('g', { class: 'ch-grid' }, svg);
        for (const v of [0, pn.max / 2, pn.max]) S('line', { x1: X(v), x2: X(v), y1: m.t - 4, y2: Hh - m.b }, grid);
        T(svg, X(0), Hh - m.b + 15, pn.end.startsWith('$') ? '$0' : '0', 'ch-tick', { 'text-anchor': 'start' });
        T(svg, X(pn.max), Hh - m.b + 15, pn.end, 'ch-tick', { 'text-anchor': 'end' });
        rows.forEach((r, i) => {
          const y = m.t + i * rowH + 4, bh = rowH - 8, val = pn.v(r);
          if (labW > 8) T(svg, labW - 8, y + bh / 2 + 4, C[r.key].label, 'ch-lab sub', { 'text-anchor': 'end' });
          const g = S('g', {}, svg);
          const w = Math.max(1, X(val) - X(0)), rr = Math.min(4, w / 2, bh / 2);
          S('path', { d: `M${X(0)},${y} H${X(0) + w - rr} Q${X(0) + w},${y} ${X(0) + w},${y + rr} V${y + bh - rr} Q${X(0) + w},${y + bh} ${X(0) + w - rr},${y + bh} H${X(0)} Z`, fill: col(r.key), class: 'vis' }, g);
          T(svg, X(0) + w + 5, y + bh / 2 + 4, pn.fmt(val), 'ch-tick fade-in');
          S('rect', { x: X(0), y: y - 3, width: W - m.r - X(0) + 40, height: rowH, class: 'hit' }, g);
          bindTip(g, tp, () => `<div class="tv">${pn.fmt(val)}</div><div class="tl"><span class="tk" style="background:${col(r.key)}"></span>${esc(C[r.key].label)}</div><div class="tr">${esc(pn.h)}, ${esc(pn.s)}</div>`);
          seq(g, i, 'growx-left');
        });
      });
      reveal(el);
    });

    // ---------- Fig 4: models ----------
    const MOD = R.models.rows;
    card('fig-models', (el, body, st) => {
      body.innerHTML = '<div class="tri"><div></div><div></div><div></div></div>';
      const tp = tip(el);
      const holders = body.querySelectorAll('.tri > div');
      MOD.forEach((mo, i) => {
        const host = holders[i];
        const W = Math.max(240, host.clientWidth), Hh = 250, m = { l: 40, r: 14, t: 26, b: 40 };
        const svg = newSvg(host, W, Hh, `Task success against read cost, ${mo.label}`);
        T(svg, m.l, 14, mo.label, 'ch-lab');
        const xs = COND.map((c) => mo.read_k_per_task[c.k]);
        const pad = (Math.max(...xs) - Math.min(...xs)) * 0.15 || 1;
        const x0 = Math.max(0, Math.min(...xs) - pad), x1 = Math.max(...xs) + pad;
        const X = lin(x0, x1, m.l, W - m.r), Y = lin(30, 80, Hh - m.b, m.t);
        const grid = S('g', { class: 'ch-grid' }, svg), ax = S('g', { class: 'ch-axis' }, svg);
        for (const v of ticks(30, 80, 10)) { S('line', { x1: m.l, x2: W - m.r, y1: Y(v), y2: Y(v) }, grid); T(svg, m.l - 6, Y(v) + 4, f0(v), 'ch-tick', { 'text-anchor': 'end' }); }
        const xstep = niceStep(x1 - x0, 4), xd = decs(xstep);
        for (const v of ticks(x0, x1, xstep)) T(svg, X(v), Hh - m.b + 16, v.toFixed(xd), 'ch-tick', { 'text-anchor': 'middle' });
        S('line', { x1: m.l, x2: W - m.r, y1: Hh - m.b, y2: Hh - m.b }, ax);
        T(svg, (m.l + W - m.r) / 2, Hh - 6, 'Read cost (k tokens per task)', 'ch-alabel', { 'text-anchor': 'middle' });
        if (i === 0) T(svg, 10, (m.t + Hh - m.b) / 2, 'Task success (%)', 'ch-alabel', { 'text-anchor': 'middle', transform: `rotate(-90 10 ${(m.t + Hh - m.b) / 2})` });
        S('polyline', { points: ['d64', 'd256', 'd1024'].map((k) => `${X(mo.read_k_per_task[k])},${Y(mo.task_pct[k])}`).join(' '), fill: 'none', stroke: col('d256'), 'stroke-width': 2, opacity: 0.45, 'stroke-linejoin': 'round', class: 'fade-in' }, svg);
        COND.forEach((c) => {
          const cx = X(mo.read_k_per_task[c.k]), cy = Y(mo.task_pct[c.k]);
          const g = S('g', {}, svg);
          S('circle', { cx, cy, r: 6, fill: col(c.k), stroke: 'var(--surface)', 'stroke-width': 2, class: 'vis' }, g);
          S('circle', { cx, cy, r: 13, class: 'hit' }, g);
          bindTip(g, tp, () => `<div class="tv">${f1(mo.task_pct[c.k])}%</div><div class="tl"><span class="tk" style="background:${col(c.k)}"></span>${esc(C[c.k].label)} · ${esc(mo.label)}</div><div class="tr">read k/task <b>${f1(mo.read_k_per_task[c.k])}</b></div>`);
          seq(g, COND.indexOf(c));
        });
        const best = mo.task_pct['frames+graph'], bx = X(mo.read_k_per_task['frames+graph']);
        const bl = `frames+graph ${f0(best)}%`, bw = bl.length * 6.2;
        T(svg, Math.max(m.l + bw / 2, Math.min(W - m.r - bw / 2, bx)), Y(best) - 12, bl, 'ch-tick fade-in', { 'text-anchor': 'middle' });
      });
      reveal(el);
    });

    // ---------- Fig 5: deployment-oriented variants ----------
    const SINGLE = R.backends_single.rows, STACK = R.backends_stacked.rows;
    const SEES = R.writer_sees_images.rows;
    const deploy = card('fig-deploy', (el, body, st) => {
      const ctrl = el.querySelector('[data-fill="deploy-ctrl"]');
      const leg = el.querySelector('[data-legend="deploy"]');
      if (st.v === 'stack') {
        st.sub = st.sub || 'stack';
        fill('deploy-title', st.sub === 'single' ? 'Single tasks, by memory backend' : 'Stacked histories, by memory backend');
        fill('deploy-sub', st.sub === 'single' ? 'Task success (%) on the 41 component tasks of the stacked histories, run one at a time; three seeds' : 'Component tasks passed (%) after one long history per environment; three seeds');
        fill('deploy-cap', 'The same 41 tasks, run one at a time (single tasks) or within one stacked history per environment (stacked histories); whiskers show the range across three seeds.');
        const fk = ctrl.contains(document.activeElement) ? document.activeElement.dataset.s : null;
        ctrl.innerHTML = `<div class="seg" role="group" aria-label="History length"><button type="button" data-s="single" aria-pressed="${st.sub === 'single'}">Single tasks</button><button type="button" data-s="stack" aria-pressed="${st.sub === 'stack'}">Stacked histories</button></div>`;
        ctrl.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { st.sub = b.dataset.s; deploy.draw(); }));
        if (fk) ctrl.querySelector(`[data-s="${fk}"]`)?.focus();
        legend(leg, condLegend);
        const src = st.sub === 'single' ? SINGLE.map((r) => ({ label: r.label, v: r.success_pct })) : STACK.map((r) => ({ label: r.label, v: r.components_passed_pct }));
        groupedBars(el, body, src.map((r) => ({ label: r.label, bars: COND.map((c) => ({ k: c.k, label: c.label, color: col(c.k), ...r.v[c.k] })) })), st.sub === 'single' ? 'Task success (%)' : 'Component tasks passed (%)', st.sub === 'stack' ? 'transcript' : null);
      } else if (st.v === 'select') {
        ctrl.innerHTML = '';
        const rows = SINGLE.filter((r) => r.writer_selects_images);
        const kept = rows.map((r) => r.writer_selects_images.frames_kept_pct);
        fill('deploy-title', 'frames, writer selects images');
        fill('deploy-sub', 'The memory writer decides which frames to archive; only those can be retrieved later. Task success (%) on the 41 component tasks');
        fill('deploy-cap', 'Archiving every frame (filled) against letting the writer choose which frames to archive (outline); the label under each backend gives the share of frames kept. Whiskers show the range across three seeds.');
        legend(leg, [{ label: 'frames, all kept', color: col('frames') }, { label: 'frames, writer selects images', color: col('frames'), shape: 'ring' }]);
        groupedBars(el, body, rows.map((r) => ({
          label: r.label, note: `${f0(r.writer_selects_images.frames_kept_pct)}% kept`,
          bars: [{ k: 'frames', label: 'frames, all kept', color: col('frames'), ...r.success_pct.frames }, { k: 'sel', label: 'frames, writer selects images', color: col('frames'), outline: true, ...r.writer_selects_images.success_pct, extra: `${f0(r.writer_selects_images.frames_kept_pct)}% of frames kept` }],
        })), 'Task success (%)');
      } else {
        st.sub = st.sub || 'frames';
        fill('deploy-title', `${C[st.sub || 'frames'].label}, writer sees images`);
        fill('deploy-sub', 'The writer also receives the camera frames while building memory. All 53 tasks, three seeds');
        fill('deploy-cap', 'Task success and write-time cost per experience step, with the default writer (filled) and a writer that also sees the camera images (outline). The transcript has no writer and is omitted.');
        const fk = ctrl.contains(document.activeElement) ? document.activeElement.dataset.s : null;
        ctrl.innerHTML = `<div class="seg" role="group" aria-label="Condition"><button type="button" data-s="frames" aria-pressed="${st.sub === 'frames'}">frames</button><button type="button" data-s="frames+graph" aria-pressed="${st.sub === 'frames+graph'}">frames+graph</button></div>`;
        ctrl.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { st.sub = b.dataset.s; deploy.draw(); }));
        if (fk) ctrl.querySelector(`[data-s="${fk}"]`)?.focus();
        const ck = st.sub;
        legend(leg, [{ label: `${C[ck].label}, default writer`, color: col(ck) }, { label: `${C[ck].label}, writer sees images`, color: col(ck), shape: 'ring' }]);
        const rows = SEES.filter((r) => r.condition === ck);
        body.innerHTML = '<div class="twin"><div class="tw-a"></div><div class="tw-b"></div></div>';
        const mk = (r, key, fmt) => [
          { k: 'def', label: `${C[ck].label}, default writer`, color: col(ck), mean: r[key].default, fmt },
          { k: 'sees', label: `${C[ck].label}, writer sees images`, color: col(ck), outline: true, mean: r[key].writer_sees_images, fmt },
        ];
        groupedBars(el, body.querySelector('.tw-a'), rows.map((r) => ({ label: r.backend_label, bars: mk(r, 'task_pct', f0) })), 'Task success (%)', null, { max: 100, unit: '%' });
        groupedBars(el, body.querySelector('.tw-b'), rows.map((r) => ({ label: r.backend_label, bars: mk(r, 'write_k_per_step', f2) })), 'Write cost (k tokens / step)', null, { max: 4, step: 1, unit: 'k' });
      }
      reveal(el);
    });

    function groupedBars(cardEl, body, groups, ylabel, highlight, opt = {}) {
      const W = Math.max(280, body.clientWidth), Hh = Math.round(Math.min(340, Math.max(240, W * 0.34)));
      const m = { l: 44, r: 8, t: 14, b: groups.some((g) => g.note) ? 48 : 40 };
      const svg = newSvg(body, W, Hh, ylabel + ' by backend');
      const max = opt.max || 100, step = opt.step || 20;
      const Y = lin(0, max, Hh - m.b, m.t);
      const grid = S('g', { class: 'ch-grid' }, svg);
      for (const v of ticks(0, max, step)) { S('line', { x1: m.l, x2: W - m.r, y1: Y(v), y2: Y(v) }, grid); T(svg, m.l - 8, Y(v) + 4, f0(v), 'ch-tick', { 'text-anchor': 'end' }); }
      T(svg, 12, (m.t + Hh - m.b) / 2, ylabel, 'ch-alabel', { 'text-anchor': 'middle', transform: `rotate(-90 12 ${(m.t + Hh - m.b) / 2})` });
      const gw = (W - m.l - m.r) / groups.length;
      const tp = tip(cardEl);
      groups.forEach((g, gi) => {
        const n = g.bars.length, bw = Math.min(24, (gw * 0.8 - (n - 1) * 2) / n), span = n * bw + (n - 1) * 2;
        const gx = m.l + gi * gw + (gw - span) / 2;
        if (highlight && g.label === highlight) S('rect', { x: m.l + gi * gw + 4, y: m.t - 4, width: gw - 8, height: Hh - m.b - m.t + 8, rx: 8, fill: 'var(--lime)', opacity: 0.22 }, svg);
        const stag = gw < 72 && !g.note && gi % 2 ? 12 : 0;
        T(svg, m.l + gi * gw + gw / 2, Hh - m.b + 16 + stag, g.label, gw < 72 ? 'ch-tick' : 'ch-lab sub', { 'text-anchor': 'middle' });
        if (g.note) T(svg, m.l + gi * gw + gw / 2, Hh - m.b + 32, g.note, 'ch-tick', { 'text-anchor': 'middle' });
        g.bars.forEach((b, i) => {
          const x = gx + i * (bw + 2);
          const gg = S('g', {}, svg);
          S('path', { d: barPath(x, Y(0), bw, Y(Math.max(0, b.mean))), fill: b.outline ? 'var(--surface)' : b.color, stroke: b.outline ? b.color : 'none', 'stroke-width': b.outline ? 2 : 0, class: 'vis bar' }, gg);
          if (b.lo != null && b.hi != null && b.hi > b.lo) S('line', { x1: x + bw / 2, x2: x + bw / 2, y1: Y(b.lo), y2: Y(b.hi), stroke: 'var(--ink-2)', 'stroke-width': 1.2, opacity: 0.6 }, gg);
          S('rect', { x: x - 1, y: m.t, width: bw + 2, height: Hh - m.b - m.t, class: 'hit' }, gg);
          const fmt = b.fmt || f1;
          seq(gg, i, 'growy');
          bindTip(gg, tp, () => `<div class="tv">${fmt(b.mean)}${opt.unit || (b.fmt ? '' : '%')}</div><div class="tl"><span class="tk" style="background:${b.color}"></span>${esc(b.label)} · ${esc(g.label)}</div>${b.lo != null && b.hi > b.lo ? `<div class="tr">seed range <b>${f0(b.lo)}&ndash;${f0(b.hi)}%</b></div>` : ''}${b.extra ? `<div class="tr">${esc(b.extra)}</div>` : ''}`);
        });
      });
    }

    // ---------- what you can vary (design space) ----------
    const AX = [
      ['Memory modality', 'text, desc@64, desc@256, desc@1024, frames, frames+graph', 'your modality'],
      ['Memory backend', 'transcript, wiki, A-MEM, Mem0, ObsMem', 'your backend'],
      ['Model (writer, describer and agent)', 'Gemini 3.7 Flash, GPT 5.6 Sol, GLM 5.3 Flash', 'any model'],
      ['History length', 'single tasks; stacked histories, one per environment', ''],
      ['Writer input', 'text only; text and camera images', ''],
      ['Frame retention', 'archive every frame; writer selects', ''],
      ['Request type', 'information; action, as one open-loop plan', ''],
      ['Environment', 'office, photography studio, home, clinic', ''],
      ['Metrics', 'success by category and request type; write-time cost per step; read-time cost per request and per success', ''],
    ];
    fill('space', `<table class="dtable space-table"><caption>Settings of the same protocol and tasks. Reference evaluations cover these settings, though not every combination was run.</caption><thead><tr><th scope="col">Axis</th><th scope="col">In the reference evaluations</th><th scope="col">Plug in</th></tr></thead><tbody>${
      AX.map(([h, lv, you]) => `<tr><th scope="row">${esc(h)}</th><td>${esc(lv)}</td><td class="you">${you ? '+ ' + esc(you) : ''}</td></tr>`).join('')}</tbody></table>`);

    // citation copy
    const cbtn = document.querySelector('.cite .copy');
    if (cbtn) cbtn.addEventListener('click', () => { navigator.clipboard?.writeText(document.querySelector('.cite code').textContent).then(() => { cbtn.textContent = 'Copied'; setTimeout(() => { cbtn.textContent = 'Copy'; }, 1500); }); });
  }
})();
