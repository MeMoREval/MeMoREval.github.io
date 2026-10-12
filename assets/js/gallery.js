// Benchmark section: environment cards, category cards and the task gallery player.
(() => {
  const sec = document.getElementById('benchmark');
  if (!sec) return;
  const $ = (s, el = sec) => el.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const g = (k) => sec.querySelector(`[data-g="${k}"]`);

  fetch('data/tasks.json').then((r) => r.json()).then(build).catch((e) => console.error(e));

  function build(D) {
    // environments
    g('envs').innerHTML = D.envs.map((e) => `<figure class="env"><img src="${esc(e.img)}" alt="Top-down view of the ${esc(e.name)} environment" loading="lazy">
      <figcaption>${esc(e.name)}<span>${esc(e.tasks)} tasks</span></figcaption></figure>`).join('');
    // categories, as a table
    g('cats').innerHTML = `<table class="dtable cat-table"><thead><tr><th scope="col">Category</th><th scope="col">Tasks</th><th scope="col">Remembered information</th><th scope="col">Example request</th></tr></thead><tbody>${
      D.categories.map((c) => `<tr><th scope="row">${esc(c.name)}</th><td class="num">${esc(c.count)}</td><td>${esc(c.remembered.charAt(0).toUpperCase() + c.remembered.slice(1))}</td><td class="ex">${esc(c.example || '')}</td></tr>`).join('')}</tbody></table>`;

    // gallery
    const envName = Object.fromEntries(D.envs.map((e) => [e.scene, e.name]));
    const catName = Object.fromEntries(D.categories.map((c) => [c.key, c.name]));
    const list = g('list'), player = g('player');
    const video = $('video', player), chip = $('.gp-chip', player), track = $('.gp-track', player);
    let cur = null, evEls = [], frEls = [], nowEl = null, userPaused = false;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

    list.innerHTML = D.tasks.map((t, i) => `<button class="g-item" role="tab" aria-selected="${i === 0}" aria-controls="g-player" tabindex="${i === 0 ? 0 : -1}" data-i="${i}">
      <img src="${esc(t.video.poster)}" alt="" loading="lazy"><span><b>${esc(t.title)}</b><span>${esc(catName[t.category] || t.category)} · ${esc(envName[t.scene] || t.env)}</span></span></button>`).join('');
    const items = [...list.querySelectorAll('.g-item')];
    items.forEach((b) => b.addEventListener('click', () => select(+b.dataset.i, true)));
    list.addEventListener('keydown', (e) => {
      if (!['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key)) return;
      e.preventDefault();
      const i = items.findIndex((b) => b.getAttribute('aria-selected') === 'true');
      const n = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : (i + (e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length;
      select(n, true); items[n].focus();
    });

    function select(i, play) {
      const t = D.tasks[i];
      cur = t;
      items.forEach((b, k) => { b.setAttribute('aria-selected', String(k === i)); b.tabIndex = k === i ? 0 : -1; });
      video.src = t.video.src; video.poster = t.video.poster;
      $('.gp-meta', player).innerHTML = `<span>${esc(catName[t.category] || t.category)}</span><span>${esc(envName[t.scene] || t.env)}</span>`;
      $('.gp-title', player).textContent = t.title;
      const ex = t.experience || {};
      $('.gp-exp', player).innerHTML = `<div class="gp-h">Experience</div>${ex.instruction ? `<p>Instruction: <q>${esc(ex.instruction)}</q></p>` : ''}${ex.user_text ? `<p>User: <q>${esc(ex.user_text)}</q></p>` : ''}${t.note ? `<p>${esc(t.note)}</p>` : ''}${!ex.instruction && !ex.user_text && !t.note ? '<p>A scripted sequence of actions while memory is written.</p>' : ''}`;
      $('.gp-frames', player).innerHTML = (t.memory || []).map((m) => (m.src
        ? `<figure><div class="fr"><img src="${esc(m.src)}" alt="${esc(m.caption)}" loading="lazy">${(m.boxes || []).map((b) => `<span class="bx" style="left:${b.bbox_norm[0] * 100}%;top:${b.bbox_norm[1] * 100}%;width:${(b.bbox_norm[2] - b.bbox_norm[0]) * 100}%;height:${(b.bbox_norm[3] - b.bbox_norm[1]) * 100}%"></span>`).join('')}</div><figcaption>${esc(m.caption)}</figcaption></figure>`
        : `<figure class="txt"><div class="fr">${esc(m.caption)}</div></figure>`)).join('');
      frEls = [...player.querySelectorAll('.gp-frames figure')];
      $('.gp-reqs', player).innerHTML = `<div class="gp-h">Later, from memory alone</div>${(t.requests || []).map((r) => r.type === 'info'
        ? `<p><q>${esc(r.q)}</q><span class="ans-w"><span class="ans-l">Expected answer</span> <span class="ans">${esc(r.a)}</span></span></p>` : `<p><q>${esc(r.text)}</q> <span class="gp-sub">(one open-loop plan)</span></p>`).join('')}`;
      // Slim timeline: the experience and the request as two bands, one segment per skill.
      const dur = t.video.duration || 1;
      const instr = (t.events || []).filter((e) => e.kind === 'instruction');
      const reqStart = instr.length > 1 ? instr[1].t0 : dur;
      const skills = (t.events || []).filter((e) => e.kind === 'skill');
      const seg = (e) => `<span class="sg${e.ok === false ? ' bad' : ''}" style="left:${(e.t0 / dur) * 100}%;width:${(Math.max(0.15, e.t1 - e.t0) / dur) * 100}%" title="${esc(e.label)}"></span>`;
      track.innerHTML = `<div class="tl"><span class="ph exp" style="width:${(reqStart / dur) * 100}%"><b>Experience</b></span><span class="ph req" style="left:${(reqStart / dur) * 100}%;width:${((dur - reqStart) / dur) * 100}%"><b>Request</b></span>
        ${skills.map(seg).join('')}${(t.memory || []).filter((m) => m.src).map((m) => `<span class="mm" style="left:${(m.t / dur) * 100}%" title="Saved to memory"></span>`).join('')}<span class="ph-now"></span></div>`;
      evEls = [...track.querySelectorAll('.sg')].map((el, k) => ({ el, e: skills[k] }));
      nowEl = track.querySelector('.ph-now');
      if (play && !reduce && !userPaused) video.play().catch(() => {});
      syncBtn();
    }

    video.addEventListener('timeupdate', () => {
      if (!cur) return;
      const t = video.currentTime;
      const active = [];
      for (const { el, e } of evEls) {
        const on = t >= e.t0 && t < Math.max(e.t1, e.t0 + 0.6);
        el.classList.toggle('on', on); el.classList.toggle('done', t >= e.t1 && !on);
        if (on) active.push(e);
      }
      if (nowEl) nowEl.style.left = `${(t / (cur.video.duration || 1)) * 100}%`;
      // Events can start together (e.g. a scripted failed placement and the retry); show both.
      const label = active.map((e) => e.label).join('  →  ');
      if (chip.textContent !== label) chip.textContent = label;
      chip.classList.toggle('on', active.length > 0);
      (cur.memory || []).forEach((m, k) => frEls[k] && frEls[k].classList.toggle('on', t >= m.t));
    });

    // pause control; no autoplay under reduced motion
    const vbtn = $('.vbtn', player);
    const syncBtn = () => { vbtn.classList.toggle('paused', video.paused); vbtn.setAttribute('aria-label', video.paused ? 'Play' : 'Pause'); };
    vbtn.addEventListener('click', () => { if (video.paused) { userPaused = false; video.play().catch(() => {}); } else { userPaused = true; video.pause(); } });
    video.addEventListener('play', syncBtn); video.addEventListener('pause', syncBtn);
    select(0, false);
    // play only while visible
    if (!reduce) new IntersectionObserver((ents) => {
      for (const en of ents) { if (en.isIntersecting && !userPaused) video.play().catch(() => {}); else if (!en.isIntersecting) video.pause(); }
    }, { threshold: 0.5 }).observe($('.gp-video', player));
  }
})();
