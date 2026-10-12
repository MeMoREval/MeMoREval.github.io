// Real-robot walkthrough: one master clock drives two condensed clips, the
// memory table, the agent strip and the memory-inspection sequence.
(() => {
  const root = document.querySelector('[data-walkthrough]');
  if (!root || !window.WT_DATA) return;
  const D = window.WT_DATA;
  const $ = (s, el = root) => el.querySelector(s);
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const ICON = {
    text: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M3 3.5h10M8 3.5v9.5"/></svg>',
    desc: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="M2.5 3h11v7.5H7l-3 2.5v-2.5H2.5z"/><path d="M5 6h6M5 8h4" stroke-linecap="round"/></svg>',
    image: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><rect x="2" y="3" width="12" height="10" rx="1.5"/><path d="M2.5 11.5l3.5-3.5 3 3 2-2 2.5 2.5"/><circle cx="10.5" cy="6" r="1"/></svg>',
    graph: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="4" cy="4" r="1.8"/><circle cx="12" cy="4" r="1.8"/><circle cx="8" cy="12" r="1.8"/><path d="M5 5.5l2.2 4.8M11 5.5l-2.2 4.8"/></svg>',
    write: '<svg viewBox="0 0 14 12"><path d="M1 6h9" stroke="currentColor" stroke-width="1.8"/><path d="M8 1.5L13 6l-5 4.5z" fill="currentColor"/></svg>',
  };
  const COLS = [
    { key: 'text', label: 'Text record', note: 'writer output' },
    { key: 'desc', label: 'Description', note: '+1 model call each', call: true },
    { key: 'image', label: 'Frame', note: 'no model call' },
    { key: 'graph', label: 'Scene graph', note: 'no model call' },
  ];
  const TAG = { exp: 'Experience · writing memory', req: 'Request · later', text: 'Inspecting memory', desc: 'Inspecting memory', image: 'Inspecting memory', out: 'Executing the plan' };

  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const markTerms = (s, terms) => {
    let h = esc(s);
    for (const term of terms || []) h = h.split(esc(term)).join(`<mark>${esc(term)}</mark>`);
    return h;
  };
  const call = (s) => `${s.skill}(${s.args || ''})`;
  const callHTML = (s) => `${esc(s.skill)}<wbr>(${esc(s.args || '')})`;
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

  const getJSON = (u) => fetch(u).then((r) => { if (!r.ok) throw new Error(u); return r.json(); });
  (async () => {
    const [seg, boxes] = await Promise.all([getJSON(D.segments).catch(() => null), getJSON('data/real_boxes.json').catch(() => ({}))]);
    if (!seg) { root.classList.add('failed'); return; }
    init(Array.isArray(seg) ? seg : seg.clips, boxes, D.clips);
  })();

  function init(clips, boxes, CL) {
    // ---------- time model ----------
    const clip = (n) => clips.find((c) => c.name === n);
    const A = clip(CL.experience.name), B = clip(CL.execution.name);
    // Source time -> clip time. Times inside a cut snap to the start of the next kept segment.
    const mapper = (c) => (src) => {
      for (const s of c.segments) {
        if (src < s.src_start) return s.out_start;
        if (src <= s.src_end) return s.out_start + (src - s.src_start) / s.speed;
      }
      return c.duration_out;
    };
    const mA = mapper(A), mB = mapper(B);
    const rStart = mB(D.requestSrc[0]), rEnd = mB(D.requestSrc[1]);

    const P = [];
    let acc = 0;
    const add = (id, label, dur, extra) => { P.push({ id, label, t0: acc, t1: acc + dur, ...extra }); acc += dur; };
    add('exp', 'Experience', A.duration_out, { video: 'A', v0: 0 });
    add('req', 'Request', rEnd - rStart, { video: 'B', v0: rStart });
    D.inspect.forEach((s) => add(s.mod, s.label, s.dur, { hold: 'B', vAt: rEnd, insp: s }));
    add('out', 'Outcome', B.duration_out - rEnd - 0.05, { video: 'B', v0: rEnd });
    const T = acc;
    const ph = (id) => P.find((p) => p.id === id);
    const phaseAt = (x) => P.find((p) => x < p.t1) || P[P.length - 1];

    const steps = D.steps.map((s, i) => ({ ...s, i, a: mA(s.src[0]), b: mA(s.src[1]), cap: mA(s.capture) }));
    const out0 = ph('out').t0;
    const plan = D.plan.map((s, i) => ({ ...s, i, a: out0 + mB(s.src[0]) - rEnd, b: Math.min(out0 + mB(s.src[1]) - rEnd, T - 0.05) }));
    const instrOff = Math.max(mA(D.steps[0].src[1]) + 1.2, 2.5);
    const imgInsp = D.inspect.find((s) => s.mod === 'image');

    // ---------- DOM ----------
    const video = $('.wt-video');
    const vids = { A: $('.vA'), B: $('.vB') };
    vids.A.poster = CL.experience.poster;
    vids.B.preload = 'metadata';
    vids.B.poster = CL.execution.poster;
    // Under reduced motion nothing downloads until the viewer presses Play (posters stand in).
    let srcSet = false;
    const ensureSrc = () => { if (!srcSet) { srcSet = true; vids.A.src = CL.experience.src; vids.B.src = CL.execution.src; } };
    if (!reduceMotion) ensureSrc();
    // The first clip loads fully once the walkthrough is near the viewport (or on Play); the second a few seconds in.
    const loadA = () => { if (vids.A.preload !== 'auto') vids.A.preload = 'auto'; };
    if (!reduceMotion) new IntersectionObserver((ents) => { if (ents.some((e) => e.isIntersecting)) loadA(); }, { rootMargin: '20% 0px' }).observe(root);
    let bLoaded = false;
    const loadB = () => { if (!bLoaded) { bLoaded = true; vids.B.preload = 'auto'; } };
    const tag = $('.wt-tag'), speedEl = $('.wt-speed'), playBtn = $('.play');
    const bInstr = $('.b-instr'), bReq = $('.b-req');
    $('.b-instr .say').textContent = `“${D.instruction}”`;
    $('.b-req .say').textContent = `“${D.request}”`;
    const agent = $('.agent');
    $('.ag-q').textContent = D.request;

    // chapters
    const chWrap = $('.chapters'), chNow = $('.ch-now');
    const chBtns = P.map((p) => {
      const b = el('button', '', `<span class="bar"><i></i></span><span class="nm">${p.label}</span>`);
      b.type = 'button'; b.dataset.ph = p.id; b.setAttribute('aria-label', `Jump to ${p.label}`);
      chWrap.appendChild(b);
      return b;
    });
    chBtns.forEach((b, k) => { b.style.flexGrow = String(Math.max(0.6, Math.sqrt(P[k].t1 - P[k].t0))); });
    const chBars = chBtns.map((b) => b.querySelector('.bar i'));

    // agent strip: one check per modality, then the plan
    const checks = D.inspect.map((s) => {
      const li = el('li', 'check', `<span class="ic">${ICON[s.mod]}</span><span class="lbl"><b>${s.label}</b><span>Not yet read</span></span><span class="st"></span>`);
      $('.checks').appendChild(li);
      return li;
    });
    const planChips = plan.map((s) => {
      const c = el('div', 'chip future', `<span class="n">${s.i + 1}</span><span class="t">${callHTML(s)}</span><span class="prog"></span>`);
      c.title = call(s);
      $('.plan-list').appendChild(c);
      return c;
    });

    // evidence cards (shown over the screen while the agent reads)
    const ev = $('.evidence');
    const evCards = {};
    {
      const tx = D.inspect.find((s) => s.mod === 'text');
      evCards.text = ev.appendChild(el('div', 'ev-card text', `
        <div class="ev-h">${ICON.text}Text records<span class="src">steps 0–4</span></div>
        <div class="ev-body"><ul class="ev-lines">${steps.map((s) => `<li><span class="st">step ${s.i}</span><span>${markTerms(s.text, tx.highlight)}</span></li>`).join('')}</ul></div>
        <div class="ev-verdict no"><span class="mk">✗</span><span>${esc(tx.verdict)}</span></div>`));

      const ds = D.inspect.find((s) => s.mod === 'desc');
      const shown = ds.show.map((i) => steps[i]);
      evCards.desc = ev.appendChild(el('div', 'ev-card desc', `
        <div class="ev-h">${ICON.desc}Descriptions<span class="src">steps 0–4</span></div>
        <div class="ev-body">${shown.map((s) => `<p class="ev-desc"><span class="st">step ${s.i} · ${esc(call(s))}</span>${markTerms(s.desc, ds.highlight)}</p>`).join('')}
          <div class="ev-more">+ ${steps.length - shown.length} more descriptions, none placing the can relative to the fruit</div></div>
        <div class="ev-verdict no"><span class="mk">✗</span><span>${esc(ds.verdict)}</span></div>`));

      // The pulled frame is shown zoomed onto the tabletop (the full frame stays in the table).
      const s = steps[imgInsp.step];
      const bx = (boxes && boxes['F' + imgInsp.step]) || {};
      const box = (k, cls, label, above) => {
        const b = bx[k]; if (!b) return '';
        const [x0, y0, x1, y1] = b;
        const w = label.length * 8.6 + 14, ly = above ? y0 - 34 : y1 + 10;
        return `<g class="${cls}"><rect x="${x0 - 5}" y="${y0 - 5}" width="${x1 - x0 + 10}" height="${y1 - y0 + 10}" rx="5"/>
          <rect class="lb" x="${x0 - 5}" y="${ly}" width="${w}" height="24" rx="4"/><text x="${x0 + 2}" y="${ly + 17}">${label}</text></g>`;
      };
      const crop = imgInsp.crop || [330, 250, 600, 360];
      evCards.image = ev.appendChild(el('div', 'ev-card image', `
        <div class="ev-h">${ICON.image}Frame<span class="src">step ${s.i} · ${esc(call(s))} · zoomed</span></div>
        <div class="ev-img" style="aspect-ratio:${crop[2]} / ${crop[3]}">
          <svg viewBox="${crop.join(' ')}" role="img" aria-label="Stored head-camera frame: the soda can with grapes right beside it">
            <style>
              .bx-can rect:first-child{fill:none;stroke:#fff;stroke-width:3;stroke-dasharray:8 6}
              .bx-can .lb{fill:#fff}.bx-can text{fill:#0a0a0a}
              .bx-ans rect:first-child{fill:none;stroke:#c7f466;stroke-width:4}
              .bx-ans .lb{fill:#c7f466}.bx-ans text{fill:#0a0a0a}
              text{font:700 15px Inter,system-ui,sans-serif}
            </style>
            <image href="${s.frame}" x="0" y="0" width="960" height="600"/>
            ${box('soda_can', 'bx-can', 'soda can [14]', true)}${box('grapes', 'bx-ans', 'grapes [11]', false)}
          </svg></div>
        <div class="ev-verdict ok"><span class="mk">✓</span><span>${esc(imgInsp.verdict)}</span></div>`));
    }

    // memory table: steps run left to right; one row per modality
    const mem = $('.mem');
    const place = (node, col, row) => { node.style.gridColumn = String(col); node.style.gridRow = String(row); return mem.appendChild(node); };
    place(el('div', 'mh act', 'Action<small>taken</small>'), 1, 1);
    const cells = { text: [], desc: [], image: [], graph: [] };
    const rowLabels = {};
    const chips = [], wrs = [];
    let descCountEl = null;
    COLS.forEach((c, r) => {
      const h = place(el('div', 'mh rl' + (c.call ? ' call' : ''), `<span class="ic">${ICON[c.key]}</span><span class="nm">${c.label}</span><small>${c.note}</small>`), 1, r + 3);
      rowLabels[c.key] = h;
      if (c.call) descCountEl = h.querySelector('small');
    });
    steps.forEach((s) => {
      const col = s.i + 2;
      const chip = place(el('div', 'chip future', `<span class="n">${s.i}</span><span class="t">${callHTML(s)}</span><span class="prog"></span>`), col, 1);
      chip.title = call(s);
      chips.push(chip);
      const wr = place(el('div', 'wr', ICON.write), col, 2); wr.title = 'saved to memory';
      wrs.push(wr);
      const tc = place(el('div', 'cell text', `<div class="in c-text">${esc(s.text)}</div>`), col, 3); tc.title = s.text; cells.text.push(tc);
      const dc = place(el('div', 'cell desc', `<div class="in c-desc">${esc(s.desc)}</div>`), col, 4); dc.title = s.desc; cells.desc.push(dc);
      const ic = place(el('div', 'cell img', `<div class="in"><img src="${s.frame.replace('.jpg', '_t.jpg')}" alt="Head-camera frame saved at step ${s.i}"></div><span class="use">used</span>`), col, 5); cells.image.push(ic);
      const gc = place(el('div', 'cell graph', `<div class="in">${graphSVG(s.graph)}</div>`), col, 6); cells.graph.push(gc);
    });

    // Fit text clamps to the row height so clipped lines end in an ellipsis.
    const fitLines = () => {
      for (const k of ['text', 'desc']) for (const c of cells[k]) {
        const inner = c.firstElementChild;
        const lh = parseFloat(getComputedStyle(inner).lineHeight) || 14;
        const avail = c.clientHeight - 10;
        inner.style.setProperty('--lines', String(Math.max(2, Math.floor(avail / lh))));
      }
    };

    function graphSVG(groups) {
      const W = 104, H = 62, gap = 3, cw = 5.15, nh = 14;
      const wOf = (t) => t.length * cw + 7;
      const lab = (g) => (g.parent.length > 1 ? `${g.parent[0]} [${g.parent[1]}]` : g.parent[0]);
      const kidsW = (g) => g.kids.reduce((a, k) => a + wOf(k[0]) + gap, -gap);
      const spans = groups.map((g) => Math.max(wOf(lab(g)), kidsW(g)));
      const total = spans.reduce((a, b) => a + b, 0) + 6 * (groups.length - 1);
      const VW = Math.max(W, total + 4);
      let x = (VW - total) / 2, out = '';
      groups.forEach((g, gi) => {
        const span = spans[gi], pl = lab(g);
        const pw = wOf(pl), px = x + span / 2 - pw / 2, py = H - nh - 2;
        let kx = x + (span - kidsW(g)) / 2;
        g.kids.forEach((k, ki) => {
          const kw = wOf(k[0]), ky = 3, cx = kx + kw / 2;
          const pos = g.rel === 'on' ? D.positions[k[0]] : null;
          const tip = k[1] != null ? `${k[0]} [${k[1]}] — ${g.rel} ${pl}${pos ? ` — at (${pos.join(', ')}) m` : ''}` : 'also on the table: banana, peach, apple, plate, lemon';
          out += `<path class="g-edge" d="M${cx},${ky + nh} L${x + span / 2},${py}"/>`;
          if (ki === 0) out += `<text class="g-rel" x="${(cx + x + span / 2) / 2 - 9}" y="${(ky + nh + py) / 2 + 3}">${g.rel}</text>`;
          out += `<g class="g-node"><title>${esc(tip)}</title><rect x="${kx}" y="${ky}" width="${kw}" height="${nh}" rx="4"/><text x="${kx + 3.5}" y="${ky + 10.2}">${esc(k[0])}</text></g>`;
          kx += kw + gap;
        });
        out += `<g class="g-node parent"><rect x="${px}" y="${py}" width="${pw}" height="${nh}" rx="4"/><text x="${px + 3.5}" y="${py + 10.2}">${esc(pl)}</text></g>`;
        x += span + 6;
      });
      return `<svg viewBox="0 0 ${VW} ${H}" role="img" aria-label="Scene graph snapshot">${out}</svg>`;
    }

    // ---------- clock ----------
    let t = 0, playing = false, userPaused = false, lastNow = null, endHold = null, curPhase = null;

    function syncVideo(seek) {
      const p = phaseAt(t);
      const key = p.video || p.hold, v = vids[key], other = key === 'A' ? vids.B : vids.A;
      if (p !== curPhase) {
        vids.A.classList.toggle('off', key !== 'A');
        vids.B.classList.toggle('off', key !== 'B');
        if (!other.paused) other.pause();
        curPhase = p; seek = true;
      }
      const want = p.video ? p.v0 + (t - p.t0) : p.vAt;
      if (seek && srcSet && Math.abs(v.currentTime - want) > 0.08) {
        if (v.readyState >= 1) v.currentTime = want;
        else v.addEventListener('loadedmetadata', () => syncVideo(true), { once: true });
      }
      const run = playing && !!p.video && t < T && srcSet;
      if (run && v.paused) v.play().catch(() => { if (playing) { playing = false; render(); } });
      if (!run && !v.paused) v.pause();
    }

    function frame(now) {
      const dt = lastNow == null ? 0 : Math.min(0.1, (now - lastNow) / 1000);
      lastNow = now;
      if (playing) {
        if (t >= T) {
          if (endHold == null) endHold = now;
          if (now - endHold > 3500) { endHold = null; t = 0; syncVideo(true); }
        } else {
          const p = phaseAt(t);
          if (p.video) {
            // The clock follows the video while it plays; if the video is somewhere
            // else (e.g. a seek issued before it loaded), move the video instead.
            const v = vids[p.video];
            if (v.ended) t = p.t1;
            else if (!v.seeking && v.readyState >= 2 && !v.paused) {
              const fromVideo = p.t0 + (v.currentTime - p.v0);
              if (Math.abs(fromVideo - t) > 0.75) v.currentTime = p.v0 + (t - p.t0);
              else t = fromVideo;
            }
          } else {
            t += dt;
          }
          t = Math.min(t, T);
          syncVideo(false);
        }
      }
      render();
      requestAnimationFrame(frame);
    }

    function seekTo(x) { t = Math.max(0, Math.min(T - 0.001, x)); endHold = null; if (t >= ph('exp').t1 - 2 && !reduceMotion) loadB(); syncVideo(true); render(); }
    function setPlaying(on) { playing = on; if (on && t >= T - 0.06) { t = 0; endHold = null; } syncVideo(true); }

    // ---------- render ----------
    const toggle = (n, c, on) => { if (n.classList.contains(c) !== on) n.classList.toggle(c, on); };
    const setProg = (c, f) => { const w = f > 0 ? `${(f * 100).toFixed(1)}%` : '0'; if (c.lastChild.style.width !== w) c.lastChild.style.width = w; };
    let lastPh = null, lastCount = -1, arcKey = '';

    function render() {
      const p = phaseAt(t), pi = P.indexOf(p);
      toggle(root, 'playing', playing);
      if (playBtn.getAttribute('aria-label') !== (playing ? 'Pause' : 'Play')) playBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
      if (t > 8) loadB();
      // footage speed (the clips are condensed)
      let sp = '';
      if (p.video) {
        const c = p.video === 'A' ? A : B, vt = p.v0 + (t - p.t0);
        const sg = c.segments.find((x) => vt >= x.out_start && vt < x.out_end);
        if (sg) sp = `${+sg.speed.toFixed(1)}\u00D7 speed`;
      }
      if (speedEl.textContent !== sp) { speedEl.textContent = sp; toggle(speedEl, 'on', !!sp); }
      P.forEach((q, k) => {
        const f = t >= q.t1 ? 1 : t <= q.t0 ? 0 : (t - q.t0) / (q.t1 - q.t0);
        chBars[k].style.width = (f * 100).toFixed(2) + '%';
        toggle(chBtns[k], 'cur', k === pi);
      });
      if (p.id !== lastPh) {
        tag.dataset.phase = p.id; tag.textContent = TAG[p.id];
        chNow.textContent = p.label;
        toggle(video, 'dim', !!p.insp);
        lastPh = p.id;
      }
      toggle(bInstr, 'on', t < instrOff);
      toggle(bReq, 'on', p.id === 'req');

      // experience steps: actions taken and memory written
      let n = 0;
      steps.forEach((s) => {
        const st = t >= s.b ? 'done' : t >= s.a ? 'active' : 'future';
        const c = chips[s.i];
        toggle(c, 'future', st === 'future'); toggle(c, 'active', st === 'active');
        setProg(c, st === 'active' ? (t - s.a) / Math.max(0.01, s.b - s.a) : 0);
        const stored = t >= s.cap;
        if (stored) n++;
        const fresh = stored && t - s.cap < 1.4 && p.id === 'exp';
        for (const k of ['text', 'desc', 'image', 'graph']) { toggle(cells[k][s.i], 'stored', stored); toggle(cells[k][s.i], 'fresh', fresh); }
        toggle(wrs[s.i], 'on', stored);
      });
      if (n !== lastCount) {
        descCountEl.textContent = n ? `+1 call each · ${n} so far` : '+1 call each';
        lastCount = n;
      }

      // request and inspection
      toggle(agent, 'asked', t >= ph('req').t0);
      const ord = D.inspect.map((s) => s.mod);
      const inspIdx = p.insp ? ord.indexOf(p.id) : t >= out0 ? ord.length : -1;
      D.inspect.forEach((s, k) => {
        const q = ph(s.mod);
        const verdictIn = t >= q.t0 + q.insp.dur * 0.5;
        const done = k < inspIdx || (k === inspIdx && verdictIn);
        const li = checks[k];
        toggle(li, 'active', k === inspIdx && !done);
        toggle(li, 'done', done); toggle(li, 'ok', done && s.ok); toggle(li, 'no', done && !s.ok);
        const lbl = li.querySelector('.lbl span'), stEl = li.querySelector('.st');
        const want = done ? s.short : k === inspIdx ? 'Reading…' : 'Not yet read';
        if (lbl.textContent !== want) lbl.textContent = want;
        const mk = done ? (s.ok ? '✓' : '✗') : '';
        if (stEl.textContent !== mk) stEl.textContent = mk;
        toggle(evCards[s.mod], 'on', p.id === s.mod);
        toggle(evCards[s.mod].querySelector('.ev-verdict'), 'on', p.id === s.mod && verdictIn);
      });
      toggle(ev, 'has-on', !!p.insp);
      cells.text.forEach((c) => toggle(c, 'read', p.id === 'text'));
      cells.desc.forEach((c) => toggle(c, 'read', p.id === 'desc'));
      for (const k of ['text', 'desc', 'image']) toggle(rowLabels[k], 'read', p.id === k);
      cells.image.forEach((c, i) => {
        toggle(c, 'read', p.id === 'image' && i === imgInsp.step);
        toggle(c, 'used', i === imgInsp.step && t >= ph('image').t0 + imgInsp.dur * 0.5);
      });
      toggle(agent, 'planned', t >= ph('image').t0 + imgInsp.dur * 0.75);
      plan.forEach((s) => {
        const st = t >= s.b ? 'done' : t >= s.a ? 'active' : 'future';
        const c = planChips[s.i];
        toggle(c, 'future', st === 'future'); toggle(c, 'active', st === 'active');
        setProg(c, st === 'active' ? (t - s.a) / Math.max(0.01, s.b - s.a) : 0);
      });

      const key = p.insp ? p.id : '';
      if (key !== arcKey) { arcKey = key; drawArcs(); }
    }

    // ---------- read arcs from memory cells to the screen ----------
    const arcs = $('.wt-arcs');
    function drawArcs() {
      if (!arcKey || getComputedStyle(arcs).display === 'none') { arcs.innerHTML = ''; return; }
      const R = root.getBoundingClientRect(), sr = $('.wt-screen').getBoundingClientRect();
      const src = rowLabels[arcKey];
      arcs.setAttribute('viewBox', `0 0 ${R.width} ${R.height}`);
      const r = src.getBoundingClientRect();
      const sx = r.left - R.left - 6, sy = r.top + r.height / 2 - R.top;
      const card = evCards[arcKey].getBoundingClientRect();
      const tx = Math.min(card.right, sr.right) - R.left - 2, ty = card.top + Math.min(card.height, sr.height * 0.6) / 2 - R.top;
      const d = `M${sx},${sy} C${sx - 40},${sy} ${tx + 50},${ty} ${tx},${ty}`;
      arcs.innerHTML = `<path class="halo" d="${d}"/><path class="line" d="${d}"/><circle cx="${sx}" cy="${sy}" r="3.5"/><circle cx="${tx}" cy="${ty}" r="3.5"/>`;
    }
    new ResizeObserver(() => { fitLines(); drawArcs(); }).observe(root);
    mem.addEventListener('scroll', () => toggle(mem, 'end', mem.scrollLeft >= mem.scrollWidth - mem.clientWidth - 2), { passive: true });
    fitLines();

    // ---------- interaction ----------
    playBtn.addEventListener('click', () => { userPaused = playing; if (!playing) { ensureSrc(); loadA(); loadB(); } setPlaying(!playing); });

    let dragging = false;
    const scrubAt = (e) => {
      const b = [...chBtns].reverse().find((x) => x.getBoundingClientRect().left <= e.clientX) || chBtns[0];
      const r = b.getBoundingClientRect(), q = P[chBtns.indexOf(b)];
      const f = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
      seekTo(q.t0 + f * (q.t1 - q.t0));
    };
    chWrap.addEventListener('pointerdown', (e) => { dragging = true; chWrap.setPointerCapture(e.pointerId); scrubAt(e); });
    chWrap.addEventListener('pointermove', (e) => { if (dragging) scrubAt(e); });
    chWrap.addEventListener('pointerup', () => { dragging = false; });
    chBtns.forEach((b, k) => b.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); seekTo(P[k].t0 + 0.01); } }));

    root.addEventListener('keydown', (e) => {
      if (e.target.closest('.chapters button') && (e.key === 'Enter' || e.key === ' ')) return;
      const pi = P.indexOf(phaseAt(t));
      if (e.key === ' ' || e.key === 'k') { e.preventDefault(); userPaused = playing; setPlaying(!playing); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); if (pi < P.length - 1) seekTo(P[pi + 1].t0 + 0.01); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); const q = P[pi]; seekTo((t - q.t0 < 1.5 && pi > 0 ? P[pi - 1] : q).t0 + 0.01); }
    });

    // #t=<seconds> opens the walkthrough at that moment (paused unless &play; &still disables transitions)
    const hashT = /(?:^#|&)t=([\d.]+)/.exec(location.hash);
    if (/(?:^#|&)still\b/.test(location.hash)) root.classList.add('still');
    if (hashT) {
      userPaused = !/(?:^#|&)play\b/.test(location.hash);
      if (!userPaused) ensureSrc();
      seekTo(parseFloat(hashT[1]));
      if (root.getBoundingClientRect().bottom > innerHeight) root.scrollIntoView({ block: 'start' });
    }

    // play while on screen (unless the viewer paused it)
    if (!reduceMotion) {
      let inView = false;
      new IntersectionObserver((ents) => {
        for (const en of ents) {
          inView = en.intersectionRatio >= 0.35;
          if (inView && !userPaused && !playing) setPlaying(true);
          else if (en.intersectionRatio <= 0.1 && playing) setPlaying(false);
        }
      }, { threshold: [0, 0.1, 0.35, 0.6] }).observe(root);
      document.addEventListener('visibilitychange', () => {
        if (document.hidden && playing) setPlaying(false);
        else if (!document.hidden && inView && !userPaused && !playing) setPlaying(true);
      });
    } else if (!hashT) {
      seekTo(ph('image').t1 - 0.05);
    }

    // handle for debugging from the console
    root.wt = { seek: seekTo, play: setPlaying, phases: P, get t() { return t; } };

    syncVideo(true);
    requestAnimationFrame(frame);
  }
})();
