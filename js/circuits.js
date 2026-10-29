/* RaceLab F1 — Circuit Explorer */
(function () {
  'use strict';
  const U = GW.util, { esc, $, $$, isNum, parseLap, lapTime } = U;
  const { J, O } = GW;
  const favs = () => GW.store.get('favCircuits', []);

  GW.pages.circuits = async (p, el, tk) => {
    await J.init();
    if (p[0]) return detail(p[0], +p[1] || null, el, tk);
    const years = await J.seasons(); const y = GW.store.get('circYear', 0);
    el.innerHTML = `<div class="page-head"><div><span class="eyebrow">Circuit Explorer</span><h1>Circuitos</h1><p class="sub">Traçados reais com curvas numeradas, histórico de vencedores e melhores voltas documentadas.</p></div>
      <div class="row">${GW.ctl('cy', 'Temporada', '<option value="0">Todos (histórico)</option>' + GW.options(years.map((v) => [v, v]), y))}<div class="ctl"><label for="cq">Buscar</label><input id="cq" type="search" placeholder="Circuito, cidade ou país"></div><div class="ctl"><label for="cf">Mostrar</label><select id="cf"><option value="all">Todos</option><option value="fav">Favoritos</option></select></div></div></div><div class="list-grid" id="cl">${GW.loading()}</div>`;
    let list = [];
    const load = async () => { const yy = +$('#cy', el).value; GW.store.set('circYear', yy); $('#cl', el).innerHTML = GW.loading(); try { list = await J.circuits(yy || null); } catch (e) { $('#cl', el).innerHTML = GW.error(e); return; } if (GW.alive(tk)) draw(); };
    const draw = () => {
      const q = $('#cq', el).value.toLowerCase(), f = $('#cf', el).value === 'fav' ? favs() : null, yy = +$('#cy', el).value;
      const rows = list.filter((c) => (c.circuitName + c.Location.locality + c.Location.country).toLowerCase().includes(q) && (!f || f.includes(c.circuitId)));
      $('#cl', el).innerHTML = rows.length ? rows.map((c) => `<a class="pcard" href="#/circuits/${c.circuitId}${yy ? '/' + yy : ''}" style="border-left-color:var(--red)"><div class="avatar" style="border-radius:12px">${GW.ic('map')}</div><div style="min-width:0"><h3>${esc(c.circuitName)}</h3><p>${esc(c.Location.locality)}, ${esc(c.Location.country)}</p></div>${favs().includes(c.circuitId) ? `<span class="fav on" style="margin-left:auto">${GW.ic('star')}</span>` : ''}</a>`).join('') : GW.empty('Nenhum circuito', 'Ajuste a busca ou os filtros.');
    };
    $('#cy', el).onchange = load; $('#cq', el).oninput = U.debounce(draw, 120); $('#cf', el).onchange = draw; load();
  };

  async function detail(id, year, el, tk) {
    const [all, races0] = await Promise.all([J.circuits(), J.circuitRaces(id)]); if (!GW.alive(tk)) return;
    const races = races0.filter((r) => U.toDate(r.date, r.time) < Date.now());
    const c = all.find((x) => x.circuitId === id) || races[0]?.Circuit;
    if (!c) { el.innerHTML = GW.empty('Circuito não encontrado', 'Este circuito não existe.'); return; }
    const modern = races.filter((r) => +r.season >= 2023); // OpenF1 / geometria
    const yr = year && modern.some((r) => +r.season === year) ? year : modern.at(-1) ? +modern.at(-1).season : null;
    const isFav = favs().includes(id);
    el.innerHTML = `<div class="page-head"><div><span class="eyebrow">Circuito</span><h1>${esc(c.circuitName)}</h1><p class="sub">${esc(c.Location.locality)}, ${esc(c.Location.country)} · ${races.length} Grandes Prêmios na história da categoria</p></div>
      <div class="row"><button class="fav ${isFav ? 'on' : ''}" id="cfav" aria-label="Favoritar circuito" aria-pressed="${isFav}">${GW.ic('star')}</button>${modern.length ? GW.ctl('gy', 'Traçado/dados de', GW.options([...modern].reverse().map((r) => [r.season, r.season]), yr)) : ''}<a class="btn" href="#/circuits">← Todos</a></div></div>
    <div id="wk" style="margin-bottom:16px"></div><div class="grid g-main"><div class="card"><div class="card-h"><h2>Traçado</h2><span id="mapchip"></span></div><div id="map">${GW.loading('Carregando geometria do traçado…')}</div><div id="mapx" class="mt-s"></div></div>
      <div style="display:flex;flex-direction:column;gap:16px;min-width:0"><div class="card"><div class="card-h"><h2>Ficha técnica</h2></div><dl class="kv" id="spec"><dt>Nome oficial</dt><dd>${esc(c.circuitName)}</dd><dt>Localização</dt><dd>${esc(c.Location.locality)}</dd><dt>País</dt><dd>${esc(c.Location.country)}</dd><dt>Coordenadas</dt><dd>${(+c.Location.lat).toFixed(3)}, ${(+c.Location.long).toFixed(3)}</dd><dt>GPs disputados</dt><dd>${races.length}</dd><dt>Primeiro / último GP</dt><dd>${races[0].season} / ${races.at(-1).season}</dd></dl></div>
      <div class="card"><div class="card-h"><h2>Recordes documentados</h2></div><div id="rec">${GW.loading()}</div></div></div></div>
    <div class="grid g2 mt"><div class="card"><div class="card-h"><h2>Evolução da volta mais rápida da corrida</h2></div><div id="fl"></div></div><div class="card"><div class="card-h"><h2>Maiores vencedores aqui</h2></div><div id="top"></div></div></div>
    <div class="card flush mt"><div class="card-h" style="padding:14px 18px 0"><h2>Histórico de Grandes Prêmios</h2></div><div id="hist">${GW.loading()}</div></div>`;
    $('#cfav', el).onclick = (e) => { const f = favs(), i = f.indexOf(id); if (i < 0) f.push(id); else f.splice(i, 1); GW.store.set('favCircuits', f); e.currentTarget.classList.toggle('on', i < 0); e.currentTarget.setAttribute('aria-pressed', i < 0); GW.toast(i < 0 ? 'Circuito favoritado' : 'Removido dos favoritos'); };
    GW.wikiInto($('#wk', el), c.url, 'Sobre o circuito');
    const gy = $('#gy', el); if (gy) gy.onchange = (e) => GW.go(`circuits/${id}/${e.target.value}`);
    GW.setCtx({ year: yr || GW.ctx.year });

    // histórico, vencedores, voltas rápidas
    Promise.all([J.circuitWinners(id).catch(() => []), J.circuitFastest(id).catch(() => [])]).then(([win, fast]) => {
      if (!GW.alive(tk)) return;
      const fm = new Map(fast.map((r) => [r.season, r.Results?.[0]])), rows = win.map((r) => ({ r, w: r.Results[0], f: fm.get(r.season) })).reverse();
      GW.table($('#hist', el), [{ k: 'y', label: 'Ano', render: (x) => `<a href="#/results/${x.r.season}/${x.r.round}/race">${x.r.season}</a>`, sort: (x) => +x.r.season }, { k: 'n', label: 'Grande Prêmio', render: (x) => esc(x.r.raceName) }, { k: 'w', label: 'Vencedor', render: (x) => `<a href="#/drivers/${x.r.season}/${x.w.Driver.driverId}">${esc(GW.fullName(x.w.Driver))}</a>`, sort: (x) => x.w.Driver.familyName }, { k: 't', label: 'Equipe', render: (x) => `<span class="team-bar" style="background:${GW.teamColor(x.w.Constructor.constructorId, x.w.Constructor.name)}"></span>${esc(x.w.Constructor.name)}` }, { k: 'tm', label: 'Tempo', num: true, render: (x) => (x.w.Time ? esc(x.w.Time.time) : U.NA) }, { k: 'f', label: 'Volta rápida', num: true, render: (x) => (x.f?.FastestLap ? esc(x.f.FastestLap.Time.time) + ` <span class="muted">${esc(x.f.Driver.code || x.f.Driver.familyName)}</span>` : U.NA), sort: (x) => parseLap(x.f?.FastestLap?.Time.time) }], rows, { sortKey: 'y', desc: true, empty: 'Sem vencedores registrados.' });
      const flr = fast.filter((r) => r.Results?.[0]?.FastestLap).map((r) => ({ y: +r.season, t: parseLap(r.Results[0].FastestLap.Time.time), d: r.Results[0].Driver })).filter((x) => isNum(x.t));
      if (flr.length) {
        const best = flr.reduce((b, x) => (x.t < b.t ? x : b));
        $('#rec', el).innerHTML = `<div class="stat"><span class="k">Volta mais rápida de corrida (registros desde 2004)</span><span class="v">${lapTime(best.t)}</span><span class="d">${esc(GW.fullName(best.d))} · ${best.y}</span></div><p class="note mt-s">${GW.ic('info')}<span>Melhor entre as voltas rápidas de corrida registradas. Pode diferir do "recorde oficial" se o traçado mudou ou se a melhor volta histórica ocorreu em classificação.</span></p>`;
        GW.lineChart($('#fl', el), { series: [{ name: 'Volta mais rápida', color: '#e10600', dots: true, pts: flr.map((x) => [x.y, x.t]) }], height: 230, xFmt: (v) => String(Math.round(v)), yFmt: (v) => lapTime(v, 1), tipRow: (s, v, pt) => lapTime(v), xDomain: [flr[0].y - 0.5, flr.at(-1).y + 0.5], title: 'Voltas mais rápidas por ano' });
      } else { $('#rec', el).innerHTML = GW.empty('Sem recorde documentado', 'Não há voltas rápidas de corrida registradas para este circuito.'); $('#fl', el).innerHTML = GW.empty('Sem dados de volta rápida'); }
      const cnt = {}; win.forEach((r) => { const d = r.Results[0].Driver; cnt[d.driverId] = cnt[d.driverId] || { d, n: 0 }; cnt[d.driverId].n++; });
      const top = Object.values(cnt).sort((a, b) => b.n - a.n).slice(0, 6), mx = top[0]?.n || 1;
      $('#top', el).innerHTML = top.length ? top.map((x) => `<div class="bar-row" style="grid-template-columns:130px 1fr 30px"><a href="#/drivers/${GW.currentYear}/${x.d.driverId}">${esc(GW.fullName(x.d))}</a><div class="tr"><i style="width:${(x.n / mx) * 100}%;background:var(--red)"></i></div><span class="v">${x.n}</span></div>`).join('') : GW.empty('Sem vencedores');
    }).catch((e) => { if (GW.alive(tk)) $('#hist', el).innerHTML = GW.error(e); });

    // geometria
    if (!yr) { $('#map', el).innerHTML = GW.empty('Sem geometria disponível', 'O traçado interativo está disponível para circuitos usados a partir de 2023. Este circuito não foi usado desde então — nenhum desenho genérico é exibido no lugar.'); return; }
    const race = modern.find((r) => +r.season === yr);
    let meeting, mv;
    try { meeting = await O.meetingForRace(race); mv = meeting && (await GW.MV.circuit(meeting.circuit_key, yr)); } catch (e) { $('#map', el).innerHTML = GW.error(e); return; }
    if (!GW.alive(tk)) return;
    if (!mv) { $('#map', el).innerHTML = GW.empty('Geometria indisponível', 'O traçado deste circuito ainda não está disponível.'); return; }
    const pts = mv.x.map((x, i) => [x, mv.y[i]]);
    // sentido: área assinada (y para cima) -> anti-horário se > 0
    let area = 0; for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; area += a[0] * b[1] - b[0] * a[1]; }
    const km = GW.trackLengthKm(mv);
    $('#spec', el).insertAdjacentHTML('beforeend', `<dt>Extensão (estimada)</dt><dd>${km.toFixed(3)} km</dd><dt>Curvas numeradas</dt><dd>${mv.corners.length}</dd><dt>Sentido</dt><dd>${area > 0 ? 'anti-horário' : 'horário'} </dd>${mv.pitLoss ? `<dt>Perda no pit (normal / SC / VSC)</dt><dd>${mv.pitLoss.normal} / ${mv.pitLoss.sc} / ${mv.pitLoss.vsc} s</dd>` : ''}`);
    $('#spec', el).insertAdjacentHTML('afterend', `<p class="note mt-s">${GW.ic('info')}<span>Extensão estimada pela geometria do traçado de ${mv._year}; para fins formais, consulte o valor homologado.</span></p>`);
    $('#mapchip', el).innerHTML = ``;
    const corners = mv.corners.map((k) => ({ n: k.number + (k.letter || ''), x: k.trackPosition.x, y: k.trackPosition.y }));
    const base = { pts, corners, closed: true, rotation: mv.rotation, markers: [{ x: pts[0][0], y: pts[0][1], color: '#2fd48a', label: 'Largada / chegada' }], title: 'Traçado de ' + c.circuitName };
    GW.trackMap($('#map', el), base);
    $('#mapx', el).innerHTML = `<div class="row"><button class="btn sm" id="tbtn">${GW.ic('pulse')} Sobrepor volta mais rápida da classificação (setores e velocidade)</button><a class="btn sm" href="#/telemetry/${yr}/${race.round}">${GW.ic('pulse')} Abrir no Telemetry Lab</a></div><div id="tov" class="mt-s"></div>`;
    $('#tbtn', el).onclick = async (e) => {
      e.currentTarget.disabled = true; const out = $('#tov', el); out.innerHTML = GW.loading('Carregando volta da classificação…');
      try {
        const ss = await O.sessions(meeting.meeting_key), q = ss.find((s) => s.session_name === 'Qualifying'); if (!q) throw new Error('Sessão de classificação não encontrada');
        const laps = (await O.get('laps', { session_key: q.session_key })).filter((l) => isNum(l.lap_duration) && !l.is_pit_out_lap); if (!laps.length) throw new Error('Sem voltas cronometradas');
        const bl = laps.reduce((b, l) => (l.lap_duration < b.lap_duration ? l : b)), t0 = +new Date(bl.date_start), t1 = t0 + bl.lap_duration * 1000;
        const [cd, loc, drv] = await Promise.all([O.window('car_data', q.session_key, bl.driver_number, t0, t1), O.window('location', q.session_key, bl.driver_number, t0, t1), O.drivers(q.session_key)]);
        const d = drv.find((x) => x.driver_number === bl.driver_number);
        const L = loc.map((r) => ({ t: (+new Date(r.date) - t0) / 1000, x: r.x, y: r.y })).filter((r) => r.t >= 0 && r.t <= bl.lap_duration && (r.x || r.y)), C = cd.map((r) => ({ t: (+new Date(r.date) - t0) / 1000, v: r.speed, th: r.throttle, br: r.brake, g: r.n_gear })).sort((a, b) => a.t - b.t);
        if (L.length < 20 || C.length < 20) throw new Error('Telemetria insuficiente nesta volta');
        const spd = (t) => { let lo = 0, hi = C.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; C[m].t <= t ? (lo = m) : (hi = m); } return C[lo]; };
        const vmin = Math.min(...C.map((r) => r.v)), vmax = Math.max(...C.map((r) => r.v));
        const col = (v) => { const f = (v - vmin) / (vmax - vmin || 1); const h = 240 - f * 240; return `hsl(${h} 90% 55%)`; };
        const colors = L.slice(0, -1).map((r) => col(spd(r.t).v));
        // alinhamento de quadros: bbox da geometria × bbox da telemetria
        const bb = (a) => [Math.min(...a.map((p) => p[0])), Math.max(...a.map((p) => p[0])), Math.min(...a.map((p) => p[1])), Math.max(...a.map((p) => p[1]))];
        const g = bb(pts), l = bb(L.map((r) => [r.x, r.y])), aligned = Math.abs((g[0] + g[1]) / 2 - (l[0] + l[1]) / 2) < (g[1] - g[0]) * 0.1 && Math.abs((g[2] + g[3]) / 2 - (l[2] + l[3]) / 2) < (g[3] - g[2]) * 0.1;
        const idxAt = (sec) => L.reduce((b, r, i) => (Math.abs(r.t - sec) < Math.abs(L[b].t - sec) ? i : b), 0);
        const s1 = bl.duration_sector_1, s2 = bl.duration_sector_2, mk = [{ x: L[0].x, y: L[0].y, color: '#2fd48a', label: 'S/F' }];
        if (isNum(s1)) { const k = idxAt(s1); mk.push({ x: L[k].x, y: L[k].y, color: '#fff', label: 'S1|S2' }); }
        if (isNum(s1) && isNum(s2)) { const k = idxAt(s1 + s2); mk.push({ x: L[k].x, y: L[k].y, color: '#fff', label: 'S2|S3' }); }
        out.innerHTML = `<div class="legend"><span>Volta mais rápida da classificação ${yr}: <b>${esc(d?.full_name || '#' + bl.driver_number)}</b> — ${lapTime(bl.lap_duration)} (V${bl.lap_number}) · S1 ${lapTime(s1)} · S2 ${lapTime(s2)} · S3 ${lapTime(bl.duration_sector_3)}</span></div><div class="legend"><span><i class="dot" style="background:hsl(240 90% 55%)"></i>${vmin} km/h</span><span><i class="dot" style="background:hsl(0 90% 55%)"></i>${vmax} km/h</span><span></span></div><div id="tmap2"></div><div id="tinfo" class="tx2" style="min-height:22px;font:12px var(--mono)">Passe o cursor sobre o traçado.</div>
          <div class="row mt-s"><a class="btn sm" id="tl2" href="#/telemetry/${yr}/${race.round}/${q.session_key}/${bl.driver_number}/${bl.lap_number}">${GW.ic('pulse')} Analisar esta volta no Telemetry Lab</a></div>
          <p class="note mt-s">${GW.ic('info')}<span>Trajetória medida (location, ~4 Hz) colorida pela velocidade (car_data). ${aligned ? 'Curvas numeradas sobrepostas (sistemas de coordenadas compatíveis).' : 'As curvas numeradas não puderam ser sobrepostas a esta trajetória.'}</span></p>`;
        GW.trackMap($('#tmap2', out), { pts: L.map((r) => [r.x, r.y]), colors, markers: mk, corners: aligned ? corners : [], rotation: aligned ? mv.rotation : 0, height: 420, title: 'Volta mais rápida colorida por velocidade', onMove: (i) => { const s = i == null ? null : spd(L[i].t); $('#tinfo', out).textContent = s ? `t=${L[i].t.toFixed(1)} s · ${s.v} km/h · acelerador ${s.th}% · freio ${s.br ? 'ON' : 'off'} · marcha ${s.g}` : 'Passe o cursor sobre o traçado.'; } });
      } catch (err) { out.innerHTML = GW.error(err); e.currentTarget.disabled = false; }
    };
  }
})();
