/* RaceLab F1 — Telemetry Lab */
(function () {
  'use strict';
  const U = GW.util, { esc, $, $$, isNum, lapTime, deltaStr } = U;
  const { O, J } = GW;
  const CA = '#ff3b3b', CB = '#4aa3ff';
  const METRICS = [['speed', 'Velocidade'], ['throttle', 'Acelerador'], ['brake', 'Freio'], ['gear', 'Marcha'], ['rpm', 'RPM'], ['time', 'Tempo de volta'], ['delta', 'Delta de tempo']];
  const interp = (xs, ys, x) => { // xs crescente
    let lo = 0, hi = xs.length - 1; if (x <= xs[0]) return ys[0]; if (x >= xs[hi]) return ys[hi];
    while (hi - lo > 1) { const m = (lo + hi) >> 1; xs[m] <= x ? (lo = m) : (hi = m); }
    const f = (x - xs[lo]) / (xs[hi] - xs[lo] || 1); return ys[lo] + (ys[hi] - ys[lo]) * f;
  };

  /** transforma amostras de car_data em série por distância (derivada por integração da velocidade) */
  function build(rows, lap) {
    const t0 = +new Date(lap.date_start);
    const s = rows.map((r) => ({ t: (+new Date(r.date) - t0) / 1000, v: r.speed, th: r.throttle, br: r.brake, g: r.n_gear, rpm: r.rpm })).filter((r) => r.t >= -0.3 && r.t <= lap.lap_duration + 0.3).sort((a, b) => a.t - b.t);
    if (s.length < 20) return null;
    let d = 0; s[0].d = 0;
    for (let i = 1; i < s.length; i++) { d += (((s[i].v + s[i - 1].v) / 2) / 3.6) * (s[i].t - s[i - 1].t); s[i].d = d; }
    return { s, len: d, lap };
  }

  GW.pages.telemetry = async (p, el, tk) => {
    await J.init();
    const saved = GW.store.get('tel', {});
    const st = { year: +p[0] || saved.year || GW.currentYear, round: p[1], sk: p[2] ? +p[2] : saved.sk, a: p[3] ? +p[3] : saved.a, lapA: p[4] ? +p[4] : saved.lapA, b: saved.b, lapB: saved.lapB, mk: saved.mk, sector: 0, m: saved.m || { speed: 1, throttle: 1, brake: 1, gear: 0, rpm: 0, time: 0, delta: 1 } };
    if (p[0] && (p[0] !== String(saved.year) || p[1])) { st.mk = null; if (!p[2]) { st.sk = null; st.a = null; st.b = null; st.lapA = null; st.lapB = null; } }
    const years = []; for (let y = GW.currentYear; y >= 2023; y--) years.push(y);
    const hist = GW.store.get('telHist', []);
    el.innerHTML = `<div class="page-head"><div><span class="eyebrow">Telemetry Lab</span><h1>Compare voltas, metro a metro</h1><p class="sub">Telemetria real do carro (~4 amostras por segundo). Distância, delta e ganhos por trecho são calculados por integração e interpolação.</p></div></div>
    <div class="card"><div class="grid g4" style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr))">
      ${GW.ctl('tY', 'Temporada', GW.options(years.map((y) => [y, y]), st.year))}${GW.ctl('tM', 'Grande Prêmio', '<option>Carregando…</option>')}${GW.ctl('tS', 'Sessão', '<option>—</option>', 'disabled')}
      ${GW.ctl('tA', 'Piloto principal', '<option>—</option>', 'disabled')}${GW.ctl('tLA', 'Volta do piloto principal', '<option>—</option>', 'disabled')}
      ${GW.ctl('tB', 'Piloto para comparar', '<option>—</option>', 'disabled')}${GW.ctl('tLB', 'Volta do comparado', '<option>—</option>', 'disabled')}
      ${GW.ctl('tSec', 'Trecho', '<option value="0">Volta inteira</option><option value="1">Setor 1</option><option value="2">Setor 2</option><option value="3">Setor 3</option>')}</div>
      <div class="row mt-s" id="tMet"><span class="muted" style="font:600 10.5px var(--mono);letter-spacing:.1em">MÉTRICAS</span>${METRICS.map(([k, n]) => `<label class="chip" style="cursor:pointer"><input type="checkbox" data-m="${k}" ${st.m[k] ? 'checked' : ''}> ${n}</label>`).join('')}<span class="sp"></span><button class="btn sm" id="tBest">Melhor volta de cada</button><button class="btn pri sm" id="tGo">${GW.ic('play')} Analisar</button></div></div>
    ${hist.length ? `<div class="row mt-s"><span class="muted" style="font:600 10.5px var(--mono);letter-spacing:.1em">HISTÓRICO</span>${hist.map((h, i) => `<button class="chip" data-h="${i}" title="${esc(h.label)}">${esc(h.label)}</button>`).join('')}</div>` : ''}
    <div id="tOut" class="mt">${GW.empty('Escolha as voltas e clique em Analisar', 'Os seletores são interdependentes: pilotos e voltas dependem da sessão.')}</div>`;

    const sel = (id) => $('#' + id, el); const fill = (id, items, v, dis) => { const s = sel(id); s.innerHTML = items.length ? GW.options(items, v) : '<option value="">—</option>'; s.disabled = dis ?? !items.length; if (v != null && items.some((i) => String(i[0]) === String(v))) s.value = v; };
    let meetings = [], sessions = [], drivers = [], lapsA = [], lapsB = [], busy = 0;
    const lapItems = (laps) => laps.filter((l) => isNum(l.lap_duration)).map((l) => [l.lap_number, `V${l.lap_number} · ${lapTime(l.lap_duration)}${l.is_pit_out_lap ? ' (saída dos boxes)' : ''}${l === laps.best ? ' ★ melhor' : ''}`]);
    const withBest = (laps) => { const v = laps.filter((l) => isNum(l.lap_duration) && !l.is_pit_out_lap); laps.best = v.sort((a, b) => a.lap_duration - b.lap_duration)[0]; return laps; };

    async function loadMeetings() {
      fill('tM', [], null, true); sel('tM').innerHTML = '<option>Carregando…</option>';
      meetings = (await O.meetings(st.year)).filter((m) => !m.is_cancelled && new Date(m.date_start) < Date.now()); if (!GW.alive(tk)) return;
      if (st.round && !st.mk) { const sch = await J.schedule(st.year).catch(() => []); const r = sch.find((x) => x.round === st.round); const m = r && (await O.meetingForRace(r)); if (m) st.mk = m.meeting_key; }
      if (!meetings.some((m) => m.meeting_key == st.mk)) { const done = meetings.filter((m) => !/testing/i.test(m.meeting_name)); st.mk = (done.at(-1) || meetings[0])?.meeting_key; }
      fill('tM', meetings.map((m) => [m.meeting_key, m.meeting_name]), st.mk); await loadSessions();
    }
    async function loadSessions() {
      if (!st.mk) { fill('tS', []); return; }
      sessions = (await O.sessions(st.mk)).filter((s) => new Date(s.date_start) < Date.now()); if (!GW.alive(tk)) return;
      if (!sessions.some((s) => s.session_key == st.sk)) st.sk = (sessions.find((s) => s.session_name === 'Qualifying') || sessions.at(-1))?.session_key;
      fill('tS', sessions.map((s) => [s.session_key, s.session_name]), st.sk); await loadDrivers();
    }
    async function loadDrivers() {
      if (!st.sk) { fill('tA', []); fill('tB', []); return; }
      drivers = (await O.drivers(st.sk)).sort((a, b) => (a.team_name || '').localeCompare(b.team_name || '') || a.driver_number - b.driver_number); if (!GW.alive(tk)) return;
      const items = drivers.map((d) => [d.driver_number, `${d.name_acronym} · ${d.full_name} (${d.team_name || '—'})`]);
      if (!drivers.some((d) => d.driver_number == st.a)) st.a = drivers[0]?.driver_number;
      if (!drivers.some((d) => d.driver_number == st.b) || st.b == st.a) st.b = (drivers.find((d) => d.driver_number != st.a) || {}).driver_number;
      fill('tA', items, st.a); fill('tB', items, st.b); await Promise.all([loadLaps('A'), loadLaps('B')]);
    }
    async function loadLaps(w) {
      const dn = w === 'A' ? st.a : st.b; if (!dn) return;
      const laps = withBest(await O.laps(st.sk, dn)); if (!GW.alive(tk)) return;
      if (w === 'A') lapsA = laps; else lapsB = laps;
      const key = w === 'A' ? 'lapA' : 'lapB'; const items = lapItems(laps);
      if (!items.some((i) => i[0] == st[key])) st[key] = laps.best?.lap_number;
      fill(w === 'A' ? 'tLA' : 'tLB', items, st[key]);
      if (!items.length) sel(w === 'A' ? 'tLA' : 'tLB').innerHTML = '<option value="">Sem voltas cronometradas</option>';
    }
    const guard = (fn) => async (...a) => { try { await fn(...a); } catch (e) { if (GW.alive(tk)) $('#tOut', el).innerHTML = GW.error(e); } };
    sel('tY').onchange = guard(async (e) => { st.year = +e.target.value; st.mk = st.round = null; await loadMeetings(); });
    sel('tM').onchange = guard(async (e) => { st.mk = +e.target.value; st.sk = null; await loadSessions(); });
    sel('tS').onchange = guard(async (e) => { st.sk = +e.target.value; await loadDrivers(); });
    sel('tA').onchange = guard(async (e) => { st.a = +e.target.value; if (st.a === st.b) { st.b = drivers.find((d) => d.driver_number !== st.a)?.driver_number; sel('tB').value = st.b; await loadLaps('B'); } await loadLaps('A'); });
    sel('tB').onchange = guard(async (e) => { st.b = +e.target.value; await loadLaps('B'); });
    sel('tLA').onchange = (e) => (st.lapA = +e.target.value); sel('tLB').onchange = (e) => (st.lapB = +e.target.value);
    sel('tSec').onchange = (e) => { st.sector = +e.target.value; if (last) render(last); };
    $$('#tMet input', el).forEach((c) => (c.onchange = () => { st.m[c.dataset.m] = c.checked ? 1 : 0; save(); if (last) render(last); }));
    $('#tBest', el).onclick = () => { st.lapA = lapsA.best?.lap_number; st.lapB = lapsB.best?.lap_number; fill('tLA', lapItems(lapsA), st.lapA); fill('tLB', lapItems(lapsB), st.lapB); };
    $$('[data-h]', el).forEach((b) => (b.onclick = guard(async () => { const h = hist[+b.dataset.h]; Object.assign(st, h.st); sel('tY').value = st.year; await loadMeetings(); fill('tLA', lapItems(lapsA), st.lapA); fill('tLB', lapItems(lapsB), st.lapB); analyze(); })));
    const save = () => GW.store.set('tel', { year: st.year, mk: st.mk, sk: st.sk, a: st.a, b: st.b, lapA: st.lapA, lapB: st.lapB, m: st.m });

    let last = null;
    async function analyze() {
      const out = $('#tOut', el); const la = lapsA.find((l) => l.lap_number == st.lapA), lb = lapsB.find((l) => l.lap_number == st.lapB);
      if (!la || !isNum(la.lap_duration)) { out.innerHTML = GW.empty('Selecione uma volta válida para o piloto principal'); return; }
      save(); out.innerHTML = GW.loading('Baixando telemetria (car_data + location)… pode levar alguns segundos');
      const win = (l) => [l.date_start, +new Date(l.date_start) + l.lap_duration * 1000];
      const get = async (dn, l) => l && isNum(l.lap_duration) ? Promise.all([O.window('car_data', st.sk, dn, ...win(l)), O.window('location', st.sk, dn, ...win(l))]) : [[], []];
      const [[cdA, locA], [cdB, locB]] = await Promise.all([get(st.a, la), st.b ? get(st.b, lb) : [[], []]]);
      if (!GW.alive(tk)) return;
      const A = build(cdA, la), B = lb && st.b != null && st.b !== st.a || (lb && lb !== la) ? build(cdB, lb) : null;
      if (!A) { out.innerHTML = GW.empty('Sem telemetria para esta volta', 'Não há amostras suficientes de telemetria para este piloto/volta. Tente outra volta ou sessão.'); return; }
      const m = sessions.find((s) => s.session_key == st.sk), mt = meetings.find((x) => x.meeting_key == st.mk);
      const da = drivers.find((d) => d.driver_number == st.a), db = drivers.find((d) => d.driver_number == st.b);
      last = { A, B, la, lb, locA, locB, da, db, m, mt };
      const lab = `${da?.name_acronym}${B ? ' × ' + db?.name_acronym : ''} · ${mt?.meeting_name?.replace(' Grand Prix', '')} ${st.year} · ${m?.session_name}`;
      const h = GW.store.get('telHist', []).filter((x) => x.label !== lab); h.unshift({ label: lab, st: { year: st.year, mk: st.mk, sk: st.sk, a: st.a, b: st.b, lapA: st.lapA, lapB: st.lapB } }); GW.store.set('telHist', h.slice(0, 8));
      GW.setCtx({ year: st.year, drivers: [da?.name_acronym, db?.name_acronym].filter(Boolean) });
      render(last);
    }
    $('#tGo', el).onclick = guard(analyze);

    function render(L) {
      const out = $('#tOut', el); const { A, B, la, lb, da, db } = L;
      GW.clearGroup('tel');
      const hasB = !!B, nameA = da?.name_acronym || '#' + st.a, nameB = db?.name_acronym || '#' + st.b;
      let colA = da?.team_colour ? '#' + da.team_colour : CA, colB = db?.team_colour ? '#' + db.team_colour : CB; if (colB.toLowerCase() === colA.toLowerCase() || (da?.team_name && da.team_name === db?.team_name)) { colA = CA; colB = CB; }
      const Ls = hasB ? (A.len + B.len) / 2 : A.len, kA = Ls / A.len, kB = hasB ? Ls / B.len : 1;
      const dA = A.s.map((r) => r.d * kA), dB = hasB ? B.s.map((r) => r.d * kB) : [], tA = A.s.map((r) => r.t), tB = hasB ? B.s.map((r) => r.t) : [];
      const ser = (S, key, dd, name, color, extra = {}) => ({ name, color, pts: S.s.map((r, i) => [dd[i], r[key]]), ...extra });
      // setores (distância onde o tempo cumulativo atinge S1, S1+S2) — da volta A
      const bnd = (lap, ts, dd) => { const s1 = lap.duration_sector_1, s2 = lap.duration_sector_2; return [0, isNum(s1) ? interp(ts, dd, s1) : null, isNum(s1) && isNum(s2) ? interp(ts, dd, s1 + s2) : null, Ls]; };
      const bd = bnd(la, tA, dA); const secOK = bd[1] != null && bd[2] != null;
      let x0 = 0, x1 = Ls; if (st.sector && secOK) { x0 = bd[st.sector - 1]; x1 = bd[st.sector]; }
      const bands = secOK ? [1, 2, 3].map((i) => ({ x0: bd[i - 1], x1: bd[i], color: ['#ff3b3b', '#ffd23a', '#4aa3ff'][i - 1], label: 'S' + i })) : [];
      // delta (B − A) na grade de distância
      const N = 300, grid = Array.from({ length: N + 1 }, (_, i) => (i / N) * Ls); let delta = null, tgA = null;
      tgA = grid.map((g) => interp(dA, tA, g));
      if (hasB) { const tgB = grid.map((g) => interp(dB, tB, g)); delta = grid.map((g, i) => tgB[i] - tgA[i]); }
      const off = delta && st.sector ? interp(grid, delta, x0) : 0; // delta relativo ao início do trecho
      const dser = delta ? grid.map((g, i) => [g, delta[i] - off]) : [];
      const dom = [x0, x1], xF = (v) => Math.round(v) + ' m';
      const common = { xDomain: dom, xFmt: xF, bands, group: 'tel', noX: true, ml: 54, tipHead: (x) => `${Math.round(x)} m da volta (aprox.)`, onHover: (x) => { if (map && x != null) map.setIdx(mapIdx(x)); else map && map.setIdx(null); } };
      const mk = (key, name, unit, o = {}) => ({ [key]: { name, unit, series: [ser(A, o.k, dA, nameA, colA, o.s), ...(hasB ? [ser(B, o.k, dB, nameB, colB, o.s)] : [])], o } });
      const defs = { ...mk('speed', 'Velocidade', 'km/h', { k: 'v' }), ...mk('throttle', 'Acelerador', '%', { k: 'th', s: {} }), ...mk('brake', 'Freio', '(on/off)', { k: 'br', s: { step: true, area: true } }), ...mk('gear', 'Marcha', '', { k: 'g', s: { step: true } }), ...mk('rpm', 'RPM', 'rpm', { k: 'rpm' }) };
      const tvA = ser(A, 't', dA, nameA, colA); const tvB = hasB ? ser(B, 't', dB, nameB, colB) : null;
      const kind = { speed: 'meas', throttle: 'meas', brake: 'meas', gear: 'meas', rpm: 'meas', time: 'deriv', delta: 'deriv' };
      const active = METRICS.filter(([k]) => st.m[k] && (k !== 'delta' || hasB));
      const lastKey = active.at(-1)?.[0];
      out.innerHTML = `
      <div class="grid g4">
        ${[[nameA, la, colA, A], ...(hasB ? [[nameB, lb, colB, B]] : [])].map(([n, l, c, S]) => `<div class="card" style="border-top:3px solid ${c}"><div class="stat"><span class="k">${esc(n)} · volta ${l.lap_number}</span><span class="v">${lapTime(l.lap_duration)}</span><span class="d">S1 ${lapTime(l.duration_sector_1) ?? '—'} · S2 ${lapTime(l.duration_sector_2) ?? '—'} · S3 ${lapTime(l.duration_sector_3) ?? '—'}</span></div></div>`).join('')}
        ${hasB ? `<div class="card"><div class="stat"><span class="k">Diferença (B − A)</span><span class="v ${lb.lap_duration - la.lap_duration > 0 ? 'up' : 'down'}">${deltaStr(lb.lap_duration - la.lap_duration)} s</span><span class="d">${lb.lap_duration > la.lap_duration ? esc(nameA) + ' mais rápido' : lb.lap_duration < la.lap_duration ? esc(nameB) + ' mais rápido' : 'iguais'} · ${GW.chipKind('meas')}</span></div></div>` : ''}
        <div class="card"><div class="stat"><span class="k">Amostras</span><span class="v">${A.s.length}${hasB ? ' / ' + B.s.length : ''}</span><span class="d">car_data na volta · ~${(A.s.length / la.lap_duration).toFixed(1)} Hz</span></div></div></div>
      ${!hasB ? '<div class="banner info mt-s">Modo de volta única: escolha um segundo piloto (ou outra volta) para ver delta e ganhos por trecho.</div>' : ''}
      <div class="grid g-main mt">
        <div class="card"><div class="card-h"><h2>Telemetria sincronizada</h2><span class="meta">Passe o cursor: todos os gráficos e o mapa acompanham</span></div>
          <div class="legend"><span><i class="dot" style="background:${colA}"></i>${esc(nameA)} — ${esc(da?.full_name || '')} · V${la.lap_number}</span>${hasB ? `<span><i class="dot" style="background:${colB}"></i>${esc(nameB)} — ${esc(db?.full_name || '')} · V${lb.lap_number}</span>` : ''}</div>
          <div class="tel-stack">${active.map(([k, n]) => `<div class="ch-label"><span>${n}${defs[k]?.unit ? ' (' + defs[k].unit + ')' : k === 'time' ? ' (s)' : k === 'delta' ? ' (s)' : ''}</span><span>${GW.chipKind(kind[k])}</span></div><div id="ch-${k}"></div>`).join('')}</div>
          <div class="ch-label" style="margin-top:2px"><span>Distância percorrida (m) — derivada da integração da velocidade</span><span></span></div><div id="ch-axis"></div>
          <p class="note mt-s">${GW.ic('info')}<span>Distância = ∫velocidade·dt, normalizada ao comprimento médio das duas voltas (${(Ls / 1000).toFixed(3)} km) para alinhar pontos equivalentes; erro típico de poucos metros. Delta = tempo de B − tempo de A no mesmo ponto: acima de zero, B está atrás. Setores marcados pelos tempos oficiais de setor, mapeados à distância (aproximação). O freio é registrado apenas como ligado/desligado.</span></p></div>
        <div style="display:flex;flex-direction:column;gap:16px;min-width:0">
          <div class="card"><div class="card-h"><h2>Mapa da volta</h2><span class="chip meas">location</span></div><div id="tmap"></div><div class="legend mt-s"><span><i class="dot" style="background:${colA}"></i>${esc(nameA)} mais rápido no trecho</span>${hasB ? `<span><i class="dot" style="background:${colB}"></i>${esc(nameB)} mais rápido</span>` : ''}</div></div>
          <div class="card"><div class="card-h"><h2>Indicadores</h2></div><div id="tsum"></div></div></div></div>
      <div class="grid g2 mt"><div class="card"><div class="card-h"><h2>Diferença por setor</h2>${GW.chipKind('meas')}</div><div id="tsec"></div></div><div class="card"><div class="card-h"><h2>Onde se ganha e se perde tempo</h2>${GW.chipKind('deriv')}</div><div id="tgain"></div></div></div>`;
      active.forEach(([k]) => {
        const h = k === 'speed' ? 190 : k === 'delta' ? 170 : 110, c = $('#ch-' + k, out), last_ = k === lastKey;
        if (k === 'time') GW.lineChart(c, { ...common, series: [tvA, ...(tvB ? [tvB] : [])], height: h, yFmt: (v) => v.toFixed(0), unit: 's', yMin0: true, tipRow: (s, v) => v.toFixed(3) + ' s', noX: true, title: 'Tempo decorrido' });
        else if (k === 'delta') GW.lineChart(c, { ...common, series: [{ name: `Δ ${nameB} − ${nameA}`, color: '#fff', pts: dser, area: false, w: 2 }], zero: true, height: h, yFmt: (v) => deltaStr(v, 2), tipRow: (s, v) => deltaStr(v, 3) + ' s', title: 'Delta de tempo' });
        else GW.lineChart(c, { ...common, series: defs[k].series, height: h, yFmt: (v) => v, yDomain: k === 'throttle' ? [-3, 103] : k === 'brake' ? [-5, 105] : k === 'gear' ? [0.5, 8.5] : undefined, unit: defs[k].unit, title: defs[k].name, yMin0: k === 'speed' || k === 'rpm' });
      });
      // eixo de distância compartilhado
      GW.lineChart($('#ch-axis', out), { series: [{ name: '', color: 'transparent', pts: [[x0, 0], [x1, 0]] }], xDomain: dom, xFmt: xF, height: 34, yDomain: [-1, 1], yFmt: () => '', ml: 54, group: 'tel', bands, onHover: common.onHover, title: 'Eixo de distância' });
      // mapa
      let map = null, mapIdx = () => null;
      const loc = L.locA.map((r) => ({ t: (+new Date(r.date) - +new Date(la.date_start)) / 1000, x: r.x, y: r.y })).filter((r) => r.t >= -0.3 && r.t <= la.lap_duration + 0.3 && !(r.x === 0 && r.y === 0));
      if (loc.length > 20) {
        const ld = loc.map((r) => interp(tA, dA, r.t)); mapIdx = (x) => { let b = 0, bd2 = 1e9; ld.forEach((d, i) => { const e = Math.abs(d - x); if (e < bd2) { bd2 = e; b = i; } }); return b; };
        let colors = null;
        if (delta) { // cor por trecho: quem ganha tempo (derivada do delta)
          const slope = (d) => { const i = Math.max(1, Math.min(N - 1, Math.round((d / Ls) * N))); return delta[Math.min(N, i + 6)] - delta[Math.max(0, i - 6)]; };
          colors = loc.slice(0, -1).map((_, i) => (slope(ld[i]) < 0 ? colB : colA));
          colors = colors.map((c, i) => (slope(ld[i]) <= 0 ? colB : colA));
        }
        const mid = [...bd.slice(1, 3)].filter((v) => v != null).map((d, i) => { const k = mapIdx(d); return { x: loc[k].x, y: loc[k].y, color: '#fff', label: 'S' + (i + 1) + '|' + (i + 2) }; });
        const sectorColored = colors || null;
        map = GW.trackMap($('#tmap', out), { pts: loc.map((r) => [r.x, r.y]), colors: sectorColored, markers: [{ x: loc[0].x, y: loc[0].y, color: '#2fd48a', label: 'L' }, ...mid], height: 360, title: 'Trajetória da volta', rotation: 0 });
      } else $('#tmap', out).innerHTML = GW.empty('Sem posição', 'Não há dados de posição para esta volta.');
      // indicadores
      const stats = (S, lap) => { const v = S.s.map((r) => r.v), th = S.s.map((r) => r.th); return { vmax: Math.max(...v), vmin: Math.min(...v), vavg: (S.len / lap.lap_duration) * 3.6, full: (th.filter((x) => x >= 98).length / th.length) * 100, brk: (S.s.filter((r) => r.br > 0).length / S.s.length) * 100, gmax: Math.max(...S.s.map((r) => r.g)), nbrk: S.s.reduce((n, r, i, a) => n + (r.br > 0 && (i === 0 || !(a[i - 1].br > 0)) ? 1 : 0), 0) }; };
      const sa = stats(A, la), sb = hasB ? stats(B, lb) : null;
      const rowsS = [['Vel. máxima (km/h)', sa.vmax, sb?.vmax, 0], ['Vel. mínima (km/h)', sa.vmin, sb?.vmin, 0], ['Vel. média (km/h)', sa.vavg, sb?.vavg, 1], ['Acelerador a fundo (%)', sa.full, sb?.full, 1], ['Tempo freando (%)', sa.brk, sb?.brk, 1], ['Zonas de frenagem', sa.nbrk, sb?.nbrk, 0], ['Marcha máx.', sa.gmax, sb?.gmax, 0], ['Speed trap (km/h)', la.st_speed, lb?.st_speed, 0]];
      $('#tsum', out).innerHTML = `<div class="tbl-wrap"><table><thead><tr><th></th><th class="num" style="color:${colA}">${esc(nameA)}</th>${hasB ? `<th class="num" style="color:${colB}">${esc(nameB)}</th>` : ''}</tr></thead><tbody>${rowsS.map(([n, a, b, d]) => `<tr><td class="tx2">${n}</td><td class="num">${isNum(a) ? (+a).toFixed(d) : U.NA}</td>${hasB ? `<td class="num">${isNum(b) ? (+b).toFixed(d) : U.NA}</td>` : ''}</tr>`).join('')}</tbody></table></div><p class="note mt-s">${GW.ic('info')}<span>Derivados das amostras car_data (exceto speed trap, medido).</span></p>`;
      // setores (medido)
      const secs = [1, 2, 3].map((i) => ({ i, a: la['duration_sector_' + i], b: lb?.['duration_sector_' + i] }));
      GW.barChart($('#tsec', out), { cats: secs.map((s) => 'S' + s.i), series: [{ name: nameA, color: colA, vals: secs.map((s) => s.a) }, ...(hasB ? [{ name: nameB, color: colB, vals: secs.map((s) => s.b) }] : [])], height: 200, yFmt: (v) => v.toFixed(1), unit: 's', legend: true, title: 'Tempo por setor' });
      if (hasB) $('#tsec', out).insertAdjacentHTML('beforeend', `<div class="tbl-wrap mt-s"><table><thead><tr><th>Setor</th><th class="num">${esc(nameA)}</th><th class="num">${esc(nameB)}</th><th class="num">B − A</th></tr></thead><tbody>${secs.map((s) => `<tr><td>S${s.i}</td><td class="num">${isNum(s.a) ? s.a.toFixed(3) : U.NA}</td><td class="num">${isNum(s.b) ? s.b.toFixed(3) : U.NA}</td><td class="num ${isNum(s.a) && isNum(s.b) ? (s.b - s.a > 0 ? 'up' : 'down') : ''}">${isNum(s.a) && isNum(s.b) ? deltaStr(s.b - s.a) : U.NA}</td></tr>`).join('')}</tbody></table></div>`);
      // ganhos por trecho (20 fatias)
      if (delta) {
        const K = 20, seg = []; for (let i = 0; i < K; i++) { const a = Math.round((i / K) * N), b = Math.round(((i + 1) / K) * N); seg.push({ i, d0: grid[a], d1: grid[b], g: delta[b] - delta[a] }); }
        const top = seg.slice().sort((x, y) => Math.abs(y.g) - Math.abs(x.g)).slice(0, 5);
        $('#tgain', out).innerHTML = `<div class="tbl-wrap"><table><thead><tr><th>Trecho (m)</th><th class="num">Δ (s)</th><th>Quem ganha</th></tr></thead><tbody>${top.map((s) => `<tr><td>${Math.round(s.d0)}–${Math.round(s.d1)}</td><td class="num">${deltaStr(s.g, 3)}</td><td>${s.g < 0 ? `<span style="color:${colB}">${esc(nameB)}</span>` : `<span style="color:${colA}">${esc(nameA)}</span>`} ganha ${Math.abs(s.g).toFixed(3)} s</td></tr>`).join('')}</tbody></table></div><p class="note mt-s">${GW.ic('info')}<span>Volta dividida em ${K} trechos iguais de distância; mostra os 5 de maior diferença. Δ negativo = B ganha tempo. Soma total ≈ ${deltaStr(delta[N])} s (medido pelos tempos de volta: ${deltaStr(lb.lap_duration - la.lap_duration)} s — a diferença é o erro da sincronização).</span></p>`;
      } else $('#tgain', out).innerHTML = GW.empty('Requer duas voltas', 'Selecione um segundo piloto/volta para calcular ganhos por trecho.');
    }
    guard(async () => { await loadMeetings(); if (st.sk && st.a && p[3]) analyze(); })();
    return () => GW.clearGroup('tel');
  };
})();
