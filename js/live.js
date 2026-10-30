/* RaceLab F1 — Ao vivo e replay: pilotos se movendo na pista (posição, ordem, intervalos, mensagens da direção de prova) */
(function () {
  'use strict';
  const U = GW.util, { esc, $, $$, isNum } = U;
  const { O, J } = GW;
  const OB = 'https://api.openf1.org/v1';
  const CHUNK = 60000; // replay: janelas de 60 s de posições
  const ts = (d) => +new Date(d);
  /** índice do último elemento com t <= T (arrays ordenados por t) */
  const lastLE = (a, T) => { let lo = 0, hi = a.length - 1, r = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (a[m].t <= T) { r = m; lo = m + 1; } else hi = m - 1; } return r; };
  const fmtClock = (ms) => { const s = Math.max(0, Math.round(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s % 60).padStart(2, '0'); };

  /* ---------- armazenamento de amostras ---------- */
  function Feed() {
    this.loc = new Map(); this.dirty = new Set(); this.pos = []; this.int = new Map(); this.rc = []; this.wx = []; this.loaded = new Set();
  }
  Feed.prototype.addLoc = function (n, t, x, y) { if (!x && !y) return; let a = this.loc.get(n); if (!a) this.loc.set(n, (a = [])); if (a.length && t < a[a.length - 1].t) this.dirty.add(n); a.push({ t, x, y }); };
  Feed.prototype.fix = function () { this.dirty.forEach((n) => { const a = this.loc.get(n), seen = new Set(); a.sort((p, q) => p.t - q.t); this.loc.set(n, a.filter((s) => (seen.has(s.t) ? false : (seen.add(s.t), true)))); }); this.dirty.clear(); };
  Feed.prototype.addInt = function (n, t, gap, interval) { let a = this.int.get(n); if (!a) this.int.set(n, (a = [])); if (a.length && t < a[a.length - 1].t) a.sort((p, q) => p.t - q.t); a.push({ t, gap, interval }); };
  Feed.prototype.at = function (n, T) { // posição interpolada do piloto em T
    const a = this.loc.get(n); if (!a || !a.length) return null; const i = lastLE(a, T); if (i < 0) return null;
    const p = a[i], q = a[i + 1]; if (!q || q.t - p.t > 4000 || T - p.t > 4000) return T - p.t > 6000 ? null : { x: p.x, y: p.y };
    const f = (T - p.t) / (q.t - p.t); return { x: p.x + (q.x - p.x) * f, y: p.y + (q.y - p.y) * f };
  };
  Feed.prototype.order = function (T) { // posição mais recente de cada piloto até T
    const last = new Map(); for (const r of this.pos) { if (r.t > T) break; last.set(r.n, r.p); }
    return [...last.entries()].sort((a, b) => a[1] - b[1]).map((e) => e[0]);
  };
  Feed.prototype.gapOf = function (n, T) { const a = this.int.get(n); if (!a) return null; const i = lastLE(a, T); return i < 0 ? null : a[i]; };

  /* ---------- palco: pista + pilotos + classificação ---------- */
  function mountStage(root, feed, ctx) {
    const sel = new Set(); let follow = null, camOn = false, T = ctx.startT, playing = false, speed = 1, raf = 0, lastTs = 0, boardTimer = 0, alive = true, cam = null, buffering = false;
    root.innerHTML = `<div class="live-grid"><div class="card live-map"><div class="live-bar"><div id="lv-state"></div><div class="row"><button class="btn sm" id="lv-cam" title="A câmera acompanha o piloto selecionado">${GW.ic('map')} Seguir com zoom</button></div></div><div id="lv-track"></div><div class="live-ctl" id="lv-ctl"></div></div>
      <div class="live-side"><div class="card flush"><div class="card-h" style="padding:14px 16px 0"><h2>Classificação</h2><span class="meta" id="lv-lap"></span></div><div id="lv-board" class="lv-board"></div></div><div class="card"><div class="card-h"><h2>Direção de prova</h2></div><div id="lv-rc" class="lv-rc"></div><div id="lv-wx" class="lv-wx"></div></div></div></div>`;
    const tm = GW.trackMap($('#lv-track', root), { pts: ctx.outline, closed: true, rotation: ctx.rotation || 0, height: 560, title: 'Pista ao vivo', markers: [] });
    if (!tm || !tm.live) { $('#lv-track', root).innerHTML = GW.empty('Sem traçado', 'Ainda não há pontos suficientes para desenhar a pista.'); return { destroy() {}, setT() {}, play() {} }; }
    const svg = tm.svgEl, [vx, vy, vw, vh] = tm.vb, r = tm.sw * 1.9;
    tm.live.innerHTML = [...ctx.drivers.values()].map((d) => `<g class="dot" data-n="${d.n}" style="display:none;cursor:pointer"><circle r="${r}" fill="${d.color}" stroke="#07090f" stroke-width="${tm.sw * 0.45}"/><text y="${-r * 1.35}" text-anchor="middle" style="font:700 ${(tm.sw * 1.9).toFixed(1)}px var(--mono);fill:#fff;stroke:#07090f;stroke-width:${(tm.sw * 0.6).toFixed(1)}px;paint-order:stroke;stroke-linejoin:round">${esc(d.acr)}</text></g>`).join('');
    const dots = new Map($$('.dot', tm.live).map((g) => [+g.dataset.n, g])); dots.forEach((g, n) => g.addEventListener('click', () => toggle(n)));
    const toggle = (n) => { sel.has(n) ? sel.delete(n) : sel.add(n); follow = sel.has(n) ? n : [...sel].pop() || null; paintSel(); drawBoard(); };
    const paintSel = () => dots.forEach((g, n) => { const c = g.querySelector('circle'); c.setAttribute('r', sel.has(n) ? r * 1.45 : r); c.setAttribute('stroke', sel.has(n) ? '#fff' : '#07090f'); g.style.opacity = sel.size && !sel.has(n) ? 0.55 : 1; if (sel.has(n)) tm.live.appendChild(g); });
    $('#lv-cam', root).onclick = (e) => { camOn = !camOn; e.currentTarget.classList.toggle('pri', camOn); if (camOn && !follow) { const o = feed.order(T)[0]; if (o) toggle(o); } if (!camOn) { svg.setAttribute('viewBox', `${vx} ${vy} ${vw} ${vh}`); cam = null; } };
    const frame = () => {
      feed.fix();
      dots.forEach((g, n) => { const p = feed.at(n, T); if (!p) { g.style.display = 'none'; return; } const [px, py] = tm.project(p.x, p.y); g.style.display = ''; g.setAttribute('transform', `translate(${px.toFixed(1)} ${py.toFixed(1)}) scale(${camOn && follow ? 0.45 : 1})`); });
      if (camOn && follow) { const p = feed.at(follow, T); if (p) { const [px, py] = tm.project(p.x, p.y), w = vw / 2.6, h = vh / 2.6; cam = cam ? [cam[0] + (px - cam[0]) * 0.12, cam[1] + (py - cam[1]) * 0.12] : [px, py]; svg.setAttribute('viewBox', `${(cam[0] - w / 2).toFixed(1)} ${(cam[1] - h / 2).toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}`); } }
    };
    const drawBoard = () => {
      const ord = feed.order(T), shown = ord.length ? ord : [...ctx.drivers.keys()];
      $('#lv-board', root).innerHTML = `<table><tbody>${shown.map((n, i) => { const d = ctx.drivers.get(n); if (!d) return ''; const g = feed.gapOf(n, T); const gap = i === 0 ? '<span class="muted">líder</span>' : g ? esc(g.gap == null ? '—' : typeof g.gap === 'number' ? '+' + g.gap.toFixed(1) : g.gap) : '—'; const itv = i === 0 || !g || g.interval == null ? '' : typeof g.interval === 'number' ? '+' + g.interval.toFixed(1) : esc(g.interval); return `<tr data-n="${n}" class="${sel.has(n) ? 'sel' : ''}"><td class="pos">${ord.length ? i + 1 : ''}</td><td><span class="team-bar" style="background:${d.color}"></span><b>${esc(d.acr)}</b> <span class="muted">${esc(d.name)}</span></td><td class="num">${gap}</td><td class="num muted">${itv}</td></tr>`; }).join('')}</tbody></table>`;
      $$('#lv-board tr', root).forEach((tr) => (tr.onclick = (e) => { e.stopPropagation(); toggle(+tr.dataset.n); }));
      const rc = feed.rc.filter((m) => m.t <= T).slice(-7).reverse();
      $('#lv-rc', root).innerHTML = rc.length ? rc.map((m) => `<div class="rcm ${/RED|CHEQ/i.test(m.flag || '') ? 'red' : /YELLOW|SAFETY|VSC/i.test((m.flag || '') + (m.cat || '') + m.msg) ? 'yel' : ''}"><span>${new Date(m.t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>${esc(m.msg)}</div>`).join('') : '<span class="muted" style="font-size:12.5px">Sem mensagens até aqui.</span>';
      const wi = feed.wx.length ? lastLE(feed.wx, T) : -1, w = wi >= 0 ? feed.wx[wi] : null;
      $('#lv-wx', root).innerHTML = w ? `<span>Ar ${w.air != null ? w.air.toFixed(0) : '—'}°C</span><span>Pista ${w.track != null ? w.track.toFixed(0) : '—'}°C</span><span>Umid. ${w.hum != null ? w.hum.toFixed(0) : '—'}%</span><span>${w.rain ? 'Chovendo' : 'Sem chuva'}</span>` : '';
      $('#lv-lap', root).textContent = ord.length ? '' : 'sem ordem disponível';
    };
    const tick = (now) => {
      if (!alive) return; raf = requestAnimationFrame(tick); const dt = Math.min(250, now - (lastTs || now)); lastTs = now;
      if (ctx.live) T = Date.now() - ctx.delay;
      else if (playing) { if (ctx.ready && !ctx.ready(T + dt * speed)) { buffering = true; } else { buffering = false; T = Math.min(ctx.endT, T + dt * speed); if (T >= ctx.endT) { playing = false; ctx.onState && ctx.onState(); } } }
      frame(); ctx.onTime && ctx.onTime(T, buffering);
    };
    raf = requestAnimationFrame(tick); boardTimer = setInterval(drawBoard, 500); drawBoard(); paintSel();
    return {
      destroy() { alive = false; cancelAnimationFrame(raf); clearInterval(boardTimer); },
      get T() { return T; }, setT(t) { T = t; frame(); drawBoard(); }, get playing() { return playing; },
      play(v) { playing = v; ctx.onState && ctx.onState(); }, speed(s) { speed = s; }, ctl: $('#lv-ctl', root), state: $('#lv-state', root),
    };
  }

  /* ---------- pilotos (número -> sigla/cor) ---------- */
  async function driversFromJolpica(year) {
    const m = new Map();
    try { const st = await J.driverStandings(year); st.rows.forEach((r) => { const n = +r.Driver.permanentNumber; if (n) m.set(n, { n, acr: r.Driver.code || r.Driver.familyName.slice(0, 3).toUpperCase(), name: r.Driver.familyName, color: GW.teamColor(r.Constructors[0]?.constructorId, r.Constructors[0]?.name) }); }); } catch { /* sem tabela */ }
    return m;
  }
  const colorize = (c) => (c ? (c[0] === '#' ? c : '#' + c) : '#9aa4bd');

  /* ---------- página ---------- */
  GW.pages.live = async (p, el, tk) => {
    await J.init();
    const y = GW.currentYear, sched = await J.schedule(y).catch(() => []); if (!GW.alive(tk)) return;
    const cur = sched.map((r) => ({ r, w: GW.weekend(r) })).find((x) => x.w.some((s) => s.status === 'live'));
    const liveSess = cur && cur.w.find((s) => s.status === 'live');
    const mode = p[0] === 'replay' ? 'replay' : p[0] === 'live' ? 'live' : (liveSess ? 'live' : 'replay');
    let stage = null;
    el.innerHTML = `<div class="page-head"><div><span class="eyebrow">Acompanhe a corrida</span><h1>${mode === 'live' ? 'Ao vivo' : 'Replay na pista'}</h1><p class="sub">${mode === 'live' ? 'Acompanhe a sessão em andamento e abra o replay na pista assim que os dados forem liberados.' : 'Reveja qualquer sessão disputada: os carros se movem na pista com a classificação, os intervalos e a direção de prova.'}</p></div>
      <div class="seg"><button data-m="live" class="${mode === 'live' ? 'on' : ''}">${liveSess ? '<i class="livedot"></i> ' : ''}Ao vivo</button><button data-m="replay" class="${mode === 'replay' ? 'on' : ''}">Replay</button></div></div><div id="lv-root"></div>`;
    $$('.seg button', el).forEach((b) => (b.onclick = () => GW.go('live/' + b.dataset.m)));
    const root = $('#lv-root', el);
    const o2 = { y, cur, liveSess, sched, tk, set: (s) => (stage = s) };
    (mode === 'live' ? liveMode : replayMode)(root, o2);
        return () => { if (stage) stage.destroy(); if (o2.cleanup) o2.cleanup(); };
  };

  /* ---------- REPLAY (dados históricos gratuitos, 2023+) ---------- */
  async function replayMode(root, o) {
    const { y, tk } = o, years = []; for (let v = GW.currentYear; v >= 2023; v--) years.push(v);
    const saved = GW.store.get('replay', {}); let st = { year: saved.year || y, mk: saved.mk, sk: saved.sk };
    root.innerHTML = `<div class="card"><div class="grid tel-filters">${GW.ctl('rY', 'Temporada', GW.options(years.map((v) => [v, v]), st.year))}${GW.ctl('rM', 'Grande Prêmio', '<option>…</option>')}${GW.ctl('rS', 'Sessão', '<option>…</option>')}<div class="ctl"><label>&nbsp;</label><button class="btn pri" id="rGo">${GW.ic('play')} Carregar replay</button></div></div></div><div id="rStage" class="mt">${GW.empty('Escolha uma sessão e carregue o replay', 'As posições vêm da telemetria real da sessão (cerca de 4 por segundo por carro).')}</div>`;
    let meets = [], sess = [];
    const fill = (id, items, v) => { const s = $('#' + id, root); s.innerHTML = items.length ? GW.options(items, v) : '<option value="">—</option>'; s.disabled = !items.length; if (v != null && items.some((i) => String(i[0]) === String(v))) s.value = v; };
    const nameS = (s) => ({ Race: 'Corrida', Qualifying: 'Classificação', Sprint: 'Sprint', 'Sprint Qualifying': 'Sprint Qualifying', 'Sprint Shootout': 'Sprint Shootout', 'Practice 1': 'Treino Livre 1', 'Practice 2': 'Treino Livre 2', 'Practice 3': 'Treino Livre 3' }[s.session_name] || s.session_name);
    const loadMeets = async () => {
      try { meets = (await O.meetings(st.year)).filter((m) => !m.is_cancelled && new Date(m.date_start) < Date.now() && !/testing/i.test(m.meeting_name)); } catch (e) { $('#rStage', root).innerHTML = blocked(e); return; }
      if (!GW.alive(tk)) return; if (!meets.some((m) => m.meeting_key == st.mk)) st.mk = meets.at(-1)?.meeting_key;
      fill('rM', meets.map((m) => [m.meeting_key, m.meeting_name]), st.mk); await loadSess();
    };
    const loadSess = async () => {
      if (!st.mk) { fill('rS', []); return; }
      try { sess = (await O.sessions(st.mk)).filter((s) => new Date(s.date_end) < Date.now()); } catch (e) { $('#rStage', root).innerHTML = blocked(e); return; }
      if (!sess.some((s) => s.session_key == st.sk)) st.sk = (sess.find((s) => s.session_name === 'Race') || sess.at(-1))?.session_key;
      fill('rS', sess.map((s) => [s.session_key, nameS(s)]), st.sk);
    };
    $('#rY', root).onchange = async (e) => { st.year = +e.target.value; st.mk = st.sk = null; await loadMeets(); };
    $('#rM', root).onchange = async (e) => { st.mk = +e.target.value; st.sk = null; await loadSess(); };
    $('#rS', root).onchange = (e) => (st.sk = +e.target.value);
    $('#rGo', root).onclick = () => startReplay();
    await loadMeets();
    async function startReplay() {
      const box = $('#rStage', root); const sk = +$('#rS', root).value, s = sess.find((x) => x.session_key === sk), m = meets.find((x) => x.meeting_key == $('#rM', root).value);
      if (!s || !m) return; GW.store.set('replay', { year: st.year, mk: m.meeting_key, sk }); if (o.prevStage) o.prevStage.destroy();
      box.innerHTML = GW.loading('Preparando o replay…');
      try {
        const [drv, pos, rc, wx] = await Promise.all([O.drivers(sk), O.get('position', { session_key: sk }), O.raceControl(sk), O.weather(sk)]);
        if (!GW.alive(tk)) return;
        const drivers = new Map(drv.map((d) => [d.driver_number, { n: d.driver_number, acr: d.name_acronym, name: d.last_name || d.full_name, color: colorize(d.team_colour) }]));
        const feed = new Feed(); const t0 = ts(s.date_start), t1 = ts(s.date_end);
        feed.pos = pos.map((r) => ({ t: ts(r.date), n: r.driver_number, p: r.position })).sort((a, b) => a.t - b.t);
        feed.rc = rc.map((r) => ({ t: ts(r.date), msg: r.message, flag: r.flag, cat: r.category })).sort((a, b) => a.t - b.t);
        feed.wx = wx.map((r) => ({ t: ts(r.date), air: r.air_temperature, track: r.track_temperature, hum: r.humidity, rain: !!r.rainfall })).sort((a, b) => a.t - b.t);
        const isRace = /Race|Sprint$/.test(s.session_name) && !/Qualifying|Shootout/.test(s.session_name);
        const loading = new Map();
        const iso = (t) => new Date(t).toISOString().replace('Z', '').replace(/\.\d+$/, '');
        const loadChunk = (i) => {
          if (feed.loaded.has(i)) return Promise.resolve(); if (loading.has(i)) return loading.get(i);
          const a = t0 + i * CHUNK, b = a + CHUNK, q = `date%3E=${iso(a)}&date%3C=${iso(b)}`;
          const pr = (async () => {
            const loc = await O.getRaw(`location?session_key=${sk}&${q}`); loc.forEach((r) => feed.addLoc(r.driver_number, ts(r.date), r.x, r.y));
            if (isRace) { const it = await O.getRaw(`intervals?session_key=${sk}&${q}`).catch(() => []); it.forEach((r) => feed.addInt(r.driver_number, ts(r.date), r.gap_to_leader, r.interval)); }
            feed.loaded.add(i);
          })().finally(() => loading.delete(i)); loading.set(i, pr); return pr;
        };
        const idx = (T) => Math.max(0, Math.floor((T - t0) / CHUNK));
        const ensure = (T) => { const i = idx(T); [i, i + 1, i + 2].forEach((k) => { if (t0 + k * CHUNK < t1 && !feed.loaded.has(k) && !loading.has(k)) loadChunk(k).catch(() => {}); }); };
        await loadChunk(0); if (!GW.alive(tk)) return;
        // contorno da pista: geometria oficial se existir; senão o traço de um piloto
        let outline = null, rotation = 0;
        try { const mv = await GW.MV.circuit(m.circuit_key, st.year); if (mv) { outline = mv.x.map((x, i) => [x, mv.y[i]]); rotation = mv.rotation; } } catch { /* tenta o traço */ }
        if (!outline) { const n = [...feed.loc.entries()].sort((a, b) => b[1].length - a[1].length)[0]; outline = n ? n[1].filter((_, i) => i % 3 === 0).map((p) => [p.x, p.y]) : []; }
        const dur = t1 - t0; let startT = t0 + (isRace ? 0 : 0);
        const ctx = { drivers, outline, rotation, startT, endT: t1, ready: (T) => { ensure(T); return feed.loaded.has(idx(T)); } };
        box.innerHTML = ''; const holder = document.createElement('div'); box.appendChild(holder);
        const stage = mountStage(holder, feed, ctx); o.set(stage); o.prevStage = stage; if (!stage.ctl) return;
        // controles
        stage.ctl.innerHTML = `<button class="btn pri" id="pl" aria-label="Reproduzir">${GW.ic('play')}</button><input type="range" id="sl" min="0" max="${dur}" step="1000" value="0" aria-label="Linha do tempo"><span class="tclock" id="tc">0:00</span><select id="sp" aria-label="Velocidade">${[1, 2, 5, 10, 20].map((v) => `<option value="${v}">${v}x</option>`).join('')}</select>`;
        stage.state.innerHTML = `<span class="chip">${esc(nameS(s))} · ${esc(m.meeting_name)} ${st.year}</span> <span class="chip" id="bf" hidden>carregando…</span>`;
        let drag = false; const sl = $('#sl', stage.ctl);
        const paint = () => { $('#pl', stage.ctl).innerHTML = stage.playing ? '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>' : GW.ic('play'); };
        ctx.onState = paint;
        ctx.onTime = (T, buf) => { if (!drag) sl.value = T - t0; $('#tc', stage.ctl).textContent = `${fmtClock(T - t0)} / ${fmtClock(dur)}`; $('#bf', stage.state).hidden = !buf; };
        $('#pl', stage.ctl).onclick = () => { if (!stage.playing && stage.T >= t1 - 500) stage.setT(t0); stage.play(!stage.playing); ensure(stage.T); };
        sl.oninput = () => { drag = true; stage.setT(t0 + +sl.value); }; sl.onchange = () => { drag = false; ensure(stage.T); };
        $('#sp', stage.ctl).onchange = (e) => stage.speed(+e.target.value);
        ensure(t0); stage.play(true);
      } catch (e) { if (GW.alive(tk)) box.innerHTML = blocked(e); }
    }
  }
  const blocked = (e) => /restrict|401|fetch|Failed|Muitas|indispon/i.test(e && e.message ? e.message : '') ? `<div class="state err">${GW.ic('alert')}<h3>Dados indisponíveis agora</h3><p>Enquanto há uma sessão em andamento, os dados detalhados ficam indisponíveis até ela terminar. Tente de novo em alguns minutos.</p></div>` : GW.error(e);
  // consulta sem cache persistente (janelas grandes de posição)
  O.getRaw = async (path) => { const d = await GW.http(`${OB}/${path}`, { ttl: 30 * 60e3, persist: false }); return Array.isArray(d) ? d : []; };

  /* ---------- AO VIVO (somente fontes gratuitas) ----------
     Não existe fonte gratuita de posições em tempo real: a OpenF1 libera os dados assim que a sessão termina.
     Esta tela acompanha a sessão pelo calendário e abre o replay automaticamente quando os dados forem liberados. */
  async function liveMode(root, o) {
    const { cur, liveSess, tk } = o;
    if (!liveSess) {
      const next = o.sched.map((r) => ({ r, w: GW.weekend(r) })).flatMap((x) => x.w.map((s) => ({ ...s, race: x.r }))).find((s) => s.status === 'future');
      root.innerHTML = `<div class="card"><div class="state">${GW.ic('clock')}<h3>Nenhuma sessão em andamento agora</h3><p>${next ? `A próxima é <b>${esc(next.name)}</b> do ${esc(next.race.raceName)} — ${esc(U.fmtDT(next.start))} (${U.tzShort()}).` : 'A temporada não tem mais sessões no calendário.'}</p><div class="row" style="justify-content:center"><a class="btn pri" href="#/live/replay">${GW.ic('play')} Ver um replay</a></div></div></div>`;
      return;
    }
    const wk = cur.w;
    root.innerHTML = `<div class="card live-wait"><div class="live-head"><span class="chip live"><i class="livedot"></i> Sessão em andamento</span><b style="font:700 22px var(--disp)">${esc(liveSess.name)}</b><span class="muted">${esc(cur.r.raceName)}</span></div>
      <div class="lbar mt-s" aria-hidden="true"><i id="wprog"></i></div><div class="lmeta"><span>Começou às ${esc(liveSess.start.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }))}</span><span>Termina em <b id="wrem">—</b> (${esc(liveSess.end.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }))})</span></div>
      <div id="wnote" class="banner info mt-s">Os dados de posição dos carros só ficam disponíveis <b>depois que a sessão termina</b> (não há fonte gratuita em tempo real). Assim que forem liberados, o replay desta sessão abre aqui — pode deixar esta página aberta.</div>
      <div id="wgo" class="mt-s"></div></div>
      <div class="card mt"><div class="card-h"><h2>Fim de semana</h2><span class="meta">Horários em ${U.tz} (${U.tzShort()})</span></div><div class="sess-list">${wk.map((s) => `<div class="sess ${s.status}"><span class="n">${esc(s.name)}</span><span class="t">${esc(U.fmtDT(s.start))}</span><span class="chip ${s.status === 'live' ? 'live' : s.status === 'future' ? 'next' : ''}">${{ done: 'concluída', live: 'em andamento', future: 'futura' }[s.status]}</span></div>`).join('')}</div></div>`;
    const hms = (ms) => { const t = Math.max(0, Math.round(ms / 1000)), h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60); return `${h ? h + ':' + String(m).padStart(2, '0') : m}:${String(t % 60).padStart(2, '0')}`; };
    const iv = setInterval(() => { const r = $('#wrem', root), p = $('#wprog', root); if (!r) return clearInterval(iv); const now = Date.now(); r.textContent = hms(+liveSess.end - now); if (p) p.style.width = Math.min(100, Math.max(0, ((now - +liveSess.start) / (+liveSess.end - +liveSess.start)) * 100)) + '%'; }, 1000);
    // quando a sessão acaba, verifica de tempos em tempos se a API liberou os dados
    let polls = 0;
    const check = async () => {
      if (!GW.alive(tk)) return clearInterval(poll);
      if (Date.now() < +liveSess.end) return; polls++;
      try { const r = await fetch(`${OB}/sessions?session_key=latest`, { cache: 'no-store' }); if (!r.ok) throw new Error('bloqueada'); clearInterval(poll); clearInterval(iv); $('#wnote', root).innerHTML = '<b>Dados liberados!</b> O replay da sessão que acabou de terminar já pode ser aberto.'; $('#wgo', root).innerHTML = `<a class="btn pri" href="#/live/replay">${GW.ic('play')} Abrir o replay agora</a>`; }
      catch { const n = $('#wnote', root); if (n) n.innerHTML = `Sessão encerrada. Aguardando a liberação dos dados de posição${polls > 1 ? ` (verificação ${polls})` : ''}… costuma levar alguns minutos.`; }
    };
    const poll = setInterval(check, 45000); check();
    o.cleanup = () => { clearInterval(poll); clearInterval(iv); };
  }
})();
