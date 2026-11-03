/* RaceLab F1 — Pilotos, Equipes, Driver Wars */
(function () {
  'use strict';
  const U = GW.util, { esc, $, $$, NA, val, isNum, mean, median, stdev } = U;
  const { J } = GW;
  const tc = (id, name) => GW.teamColor(id, name);
  const teamCell = (c, y) => `<span class="team-bar" style="background:${tc(c.constructorId, c.name)}"></span><a href="#/teams/${c.constructorId}/${y || ''}">${esc(c.name)}</a>`;
  const favs = () => GW.store.get('favDrivers', []);
  const toggleFav = (id) => { const f = favs(), i = f.indexOf(id); if (i < 0) f.push(id); else f.splice(i, 1); GW.store.set('favDrivers', f); return i < 0; };

  /* carreira completa de um piloto (poucas requisições, cacheadas) */
  const CAR = {};
  GW.career = (id) => (CAR[id] = CAR[id] || (async () => {
    const driver = await J.driver(id); if (!driver) throw new Error('Piloto não encontrado');
    let off = 0, total = 1; const races = [];
    while (off < total) { const d = await J.raw(`drivers/${id}/results.json?limit=100&offset=${off}`); total = +d.total; races.push(...d.RaceTable.Races); off += 100; if (!d.RaceTable.Races.length) break; }
    const by = new Map(); let wins = 0, p2 = 0, p3 = 0, poles = 0, fl = 0;
    races.forEach((r) => {
      const x = r.Results[0], p = +x.position; if (p === 1) wins++; if (p === 2) p2++; if (p === 3) p3++; if (x.grid === '1') poles++; if (x.FastestLap && x.FastestLap.rank === '1') fl++;
      const e = by.get(r.season) || { year: +r.season, pts: 0, wins: 0, races: 0, teams: new Map(), pos: null };
      e.pts += +x.points; if (p === 1) e.wins++; e.races++; e.teams.set(x.Constructor.constructorId, x.Constructor); by.set(r.season, e);
    });
    const seasons = [...by.values()].sort((a, b) => a.year - b.year).map((s) => ({ ...s, teams: [...s.teams.values()] }));
    return { driver, seasons, starts: races.length, wins, podiums: wins + p2 + p3, poles, fl: seasons.length && seasons.at(-1).year >= 2004 ? fl : null, titles: null, points: null };
  })().catch((e) => { delete CAR[id]; throw e; }));
  const POS = {};
  /** posições/pontos oficiais por temporada (uma consulta por ano, em segundo plano e em cache) */
  GW.careerFull = (id) => (POS[id] = POS[id] || (async () => {
    const car = await GW.career(id);
    await Promise.all(car.seasons.map((s) => J.raw(`${s.year}/drivers/${id}/driverstandings.json`, s.year).then((d) => { const l = d.StandingsTable.StandingsLists[0]; if (l) { const r = l.DriverStandings[0]; s.pos = +r.position; s.pts = +r.points; s.wins = +r.wins; s.teams = r.Constructors; } }).catch(() => {})));
    const ok = car.seasons.every((s) => s.pos != null);
    car.titles = ok ? car.seasons.filter((s) => s.pos === 1 && s.year < GW.currentYear).length : null; car.points = ok ? car.seasons.reduce((n, s) => n + s.pts, 0) : null; car.full = ok;
    return car;
  })().catch((e) => { delete POS[id]; throw e; }));

  const stat = (k, v, d = '') => `<div class="card"><div class="stat"><span class="k">${k}</span><span class="v">${v !== null && v !== undefined && v !== '' ? v : NA}</span><span class="d">${d}</span></div></div>`;
  const ordinal = (n) => n + 'º';
  /** barra de duelo: quem venceu mais confrontos, com proporção visual */
  const duel = (label, a, b, ca, cb, hint) => { const t = a + b, pa = t ? (a / t) * 100 : 50; return `<div class="duel"><div class="duel-h"><span>${label}</span><span class="muted">${hint || (t ? t + (t === 1 ? ' confronto' : ' confrontos') : 'sem confrontos')}</span></div><div class="duel-bar" role="img" aria-label="${label}: ${a} a ${b}"><i style="width:${pa}%;background:${ca}"></i><i style="width:${100 - pa}%;background:${cb}"></i></div><div class="duel-n"><b style="color:${ca}">${a}</b><b style="color:${cb}">${b}</b></div></div>`; };
  GW.duel = duel;

  /* ---------- PILOTOS ---------- */
  GW.pages.drivers = async (p, el, tk) => {
    await J.init();
    if (p[1]) return profile(+p[0] || GW.currentYear, p[1], el, tk);
    const years = await J.seasons(); const y = +p[0] || GW.ctx.year || GW.currentYear; GW.setCtx({ year: y });
    const [ds, st] = await Promise.all([J.drivers(y), J.driverStandings(y).catch(() => ({ rows: [] }))]); if (!GW.alive(tk)) return;
    const tm = new Map(st.rows.map((r) => [r.Driver.driverId, r]));
    el.innerHTML = `<div class="page-head"><div><span class="eyebrow">Pilotos</span><h1>Grid ${y}</h1><p class="sub">${tm.size || ds.length} pilotos com participação registrada em ${y}.</p></div>
      <div class="row">${GW.ctl('dy', 'Temporada', GW.options(years.map((v) => [v, v]), y))}<div class="ctl"><label for="dq">Buscar</label><input id="dq" type="search" placeholder="Nome ou sigla"></div><div class="ctl"><label for="df">Mostrar</label><select id="df"><option value="all">Todos</option><option value="fav">Favoritos</option></select></div></div></div><div class="list-grid" id="dl"></div>`;
    $('#dy', el).onchange = (e) => GW.go(`drivers/${e.target.value}`);
    const draw = () => {
      const q = $('#dq', el).value.toLowerCase(), f = $('#df', el).value === 'fav' ? favs() : null;
      const rows = ds.filter((d) => (!tm.size || tm.has(d.driverId)) && (GW.fullName(d) + (d.code || '')).toLowerCase().includes(q) && (!f || f.includes(d.driverId))).map((d) => ({ d, s: tm.get(d.driverId) })).sort((a, b) => (b.s ? +b.s.points || 0 : -1) - (a.s ? +a.s.points || 0 : -1) || (b.s ? +b.s.wins || 0 : 0) - (a.s ? +a.s.wins || 0 : 0) || (a.s ? +a.s.position || 99 : 99) - (b.s ? +b.s.position || 99 : 99) || a.d.familyName.localeCompare(b.d.familyName));
      $('#dl', el).innerHTML = rows.length ? rows.map(({ d, s }) => { const c = s?.Constructors[0]; return `<a class="pcard" href="#/drivers/${y}/${d.driverId}" style="border-left-color:${c ? tc(c.constructorId, c.name) : '#444'}"><div class="avatar" data-id="${esc(d.driverId)}" data-given="${esc(d.givenName)}" data-family="${esc(d.familyName)}" data-dob="${esc(d.dateOfBirth || '')}" data-year="${y}" data-teams="${s ? s.Constructors.map((k) => k.constructorId).join(',') : ''}">${esc((d.code || d.familyName.slice(0, 3)).toUpperCase())}</div><div style="min-width:0"><h3>${GW.flag(d.nationality)} ${esc(GW.fullName(d))}</h3><p>${d.permanentNumber ? '#' + esc(d.permanentNumber) + ' · ' : ''}${esc(c?.name || 'equipe n/d')}</p><p>${s ? `${/^\d+$/.test(s.position) ? s.position + 'º' : 's/ pontos'} · ${GW.pts(s.points)} pts · ${s.wins} vit.` : ''}</p></div></a>`; }).join('') : GW.empty('Nenhum piloto', 'Ajuste a busca ou o filtro de favoritos.');
      GW.hydratePhotos($('#dl', el));
    };
    $('#dq', el).oninput = U.debounce(draw, 120); $('#df', el).onchange = draw; draw();
  };

  async function profile(y, id, el, tk) {
    const dd = await J.driver(id); if (!GW.alive(tk)) return;
    if (!dd) { el.innerHTML = GW.empty('Piloto não encontrado'); return; }
    el.innerHTML = `<div class="page-head"><div class="row" style="flex-wrap:nowrap"><div class="avatar" data-id="${esc(dd.driverId)}" data-given="${esc(dd.givenName)}" data-family="${esc(dd.familyName)}" data-dob="${esc(dd.dateOfBirth || '')}" data-year="${y}" style="width:84px;height:84px;font-size:20px">${esc(dd.code || dd.familyName.slice(0, 3).toUpperCase())}</div><div><span class="eyebrow">Piloto</span><h1>${esc(GW.fullName(dd))}</h1></div></div></div>${GW.loading('Carregando a carreira completa…')}`;
    GW.hydratePhotos(el);
    const car = await GW.career(id); if (!GW.alive(tk)) return;
    if (!car.seasons.length) { el.innerHTML = GW.empty('Sem temporadas registradas', 'Este piloto não tem classificação de campeonato registrada.'); return; }
    const d = car.driver; const yrs = car.seasons.map((s) => s.year); if (!yrs.includes(y)) y = yrs[yrs.length - 1];
    GW.setCtx({ year: y, drivers: [id] });
    const isFav = favs().includes(id);
    el.innerHTML = `<div class="page-head"><div class="row" style="flex-wrap:nowrap"><div class="avatar" data-id="${esc(d.driverId)}" data-given="${esc(d.givenName)}" data-family="${esc(d.familyName)}" data-dob="${esc(d.dateOfBirth || '')}" data-year="${y}" data-teams="${((car.seasons.find((s) => s.year === y) || {}).teams || []).map((k) => k.constructorId).join(',')}" style="width:84px;height:84px;font-size:20px;border-color:${tc(car.seasons.find((s) => s.year === y)?.teams[0]?.constructorId, car.seasons.find((s) => s.year === y)?.teams[0]?.name)}">${esc(d.code || d.familyName.slice(0, 3).toUpperCase())}</div><div><span class="eyebrow">Piloto${d.permanentNumber ? ' · #' + esc(d.permanentNumber) : ''}</span><h1>${esc(GW.fullName(d))}</h1><p class="sub">${GW.flag(d.nationality)} ${esc(d.nationality)} · nascido em ${esc(new Date(d.dateOfBirth + 'T12:00:00Z').toLocaleDateString('pt-BR', { dateStyle: 'long' }))} </p></div></div>
      <div class="row"><button class="fav ${isFav ? 'on' : ''}" id="fav" title="Favoritar" aria-label="Favoritar piloto" aria-pressed="${isFav}">${GW.ic('star')}</button>${GW.ctl('py', 'Temporada', GW.options([...yrs].reverse().map((v) => [v, v]), y))}<a class="btn" href="#/wars">${GW.ic('swords')} Driver Wars</a></div></div>
    <p class="note" style="margin-bottom:12px">${GW.ic('info')}<span>"—" significa <b>dado indisponível</b>, nunca zero presumido. Voltas mais rápidas e poles dependem do registro histórico de cada época.</span></p>
    <div class="grid g4">${stat('GPs disputados', car.starts, `${yrs.length} temporadas`)}${stat('Vitórias', car.wins, car.starts ? `${(car.wins / car.starts * 100).toFixed(1)}% das largadas` : '')}${stat('Pódios', car.podiums)}${stat('Poles', car.poles, 'largadas em 1º')}${stat('Voltas mais rápidas', car.fl, car.fl == null ? 'registro desde 2004' : '')}<div class="card" id="s-tit"><div class="stat"><span class="k">Títulos</span><span class="v">…</span><span class="d">calculando</span></div></div><div class="card" id="s-pts"><div class="stat"><span class="k">Pontos na carreira</span><span class="v">…</span><span class="d">calculando</span></div></div><div class="card" id="s-sea"><div class="stat"><span class="k">Temporada ${y}</span><span class="v">…</span><span class="d">calculando</span></div></div></div>
    <div class="tabs mt" id="ptabs"><button class="on" data-t="s">Temporada ${y}</button><button data-t="c">Carreira</button><button data-t="k">Por circuito</button></div><div id="pb"></div>`;
    $('#py', el).onchange = (e) => GW.go(`drivers/${e.target.value}/${id}`);
    $('#fav', el).onclick = (e) => { const on = toggleFav(id); e.currentTarget.classList.toggle('on', on); e.currentTarget.setAttribute('aria-pressed', on); GW.toast(on ? 'Adicionado aos favoritos' : 'Removido dos favoritos'); }; GW.hydratePhotos(el);
    const pb = $('#pb', el);
    const tabs = { s: () => tabSeason(pb, y, id, car, tk), c: async () => tabCareer(pb, await GW.careerFull(id)), k: () => tabCircuit(pb, id, tk) };
    const go = async (t) => { $$('#ptabs button', el).forEach((b) => b.classList.toggle('on', b.dataset.t === t)); pb.innerHTML = GW.loading(); try { await tabs[t](); } catch (e) { pb.innerHTML = GW.error(e); } };
    $$('#ptabs button', el).forEach((b) => (b.onclick = () => go(b.dataset.t))); go('s');
    GW.careerFull(id).then((c) => {
      if (!GW.alive(tk)) return; const se = c.seasons.find((x) => x.year === y), fill = (sel, k, v, d) => { const n = $(sel, el); if (n) n.innerHTML = `<div class="stat"><span class="k">${k}</span><span class="v">${v ?? NA}</span><span class="d">${d || ''}</span></div>`; };
      fill('#s-tit', 'Títulos', c.titles, 'temporadas encerradas'); fill('#s-pts', 'Pontos na carreira', c.points != null ? GW.pts(c.points) : null, 'soma das temporadas');
      fill('#s-sea', 'Temporada ' + y, se && se.pos ? ordinal(se.pos) : null, se ? `${GW.pts(se.pts)} pts · ${se.wins} vit.` : '');
    }).catch(() => { ['#s-tit', '#s-pts', '#s-sea'].forEach((q) => { const n = $(q + ' .v', el); if (n) n.innerHTML = NA; const d = $(q + ' .d', el); if (d) d.textContent = ''; }); });
  }

  async function tabSeason(pb, y, id, car, tk) {
    const sd = await GW.seasonQual(y); if (!GW.alive(tk)) return;
    const e = sd.drivers.get(id); if (!e) { pb.innerHTML = GW.empty('Sem resultados', `${y}: sem corridas registradas para este piloto.`); return; }
    const rows = sd.res.map((r) => ({ r, c: e.rounds[r.round] })).filter((x) => x.c && x.c.pos != null);
    const fin = rows.map((x) => x.c.pos), qs = rows.map((x) => x.c.q).filter(isNum);
    const teamIds = [...e.teams.keys()]; const col = tc(teamIds[0], e.teams.get(teamIds[0])?.name);
    // companheiros
    const mates = [...sd.drivers.values()].filter((o) => o !== e && [...o.teams.keys()].some((t) => teamIds.includes(t)));
    const h2h = mates.map((m) => { let qw = 0, ql = 0, rw = 0, rl = 0; sd.res.forEach((r) => { const a = e.rounds[r.round], b = m.rounds[r.round]; if (!a || !b) return; if (isNum(a.q) && isNum(b.q)) a.q < b.q ? qw++ : a.q > b.q ? ql++ : 0; if (a.pos != null && b.pos != null && GW.finished({ status: a.status }) && GW.finished({ status: b.status })) a.pos < b.pos ? rw++ : rl++; }); return { m, qw, ql, rw, rl, pts: m.points }; });
    pb.innerHTML = `<div class="grid g4">${stat('Pontos no ano', GW.pts(e.points), `${e.sprintPts ? 'inclui ' + e.sprintPts + ' de sprint' : ''}`)}${stat('Posição média (corrida)', fin.length ? mean(fin).toFixed(1) : null, `${fin.length} corridas`)}${stat('Consistência (desvio)', fin.length > 1 ? stdev(fin).toFixed(2) : null, 'menor = mais regular')}${stat('Abandonos', e.dnf, 'sem classificação final')}</div>
    <div class="grid g2 mt"><div class="card"><div class="card-h"><h2>Classificação × corrida</h2></div><div id="c1"></div></div><div class="card"><div class="card-h"><h2>Distribuição das posições finais</h2></div><div id="c2"></div></div></div>
    <div class="card mt"><div class="card-h"><h2>Evolução dos pontos</h2></div><div id="c3"></div></div>
    <div class="card mt"><div class="card-h"><h2>Comparação com companheiros de equipe</h2></div>${h2h.length ? `<div id="mt"></div><p class="note mt-s">${GW.ic('info')}<span>Cada barra mostra em quantos GPs cada um ficou à frente — classificação: quem largou melhor; corrida: só quando ambos terminaram. Companheiros que dividiram o carro por parte da temporada têm poucas corridas em comum.</span></p>` : GW.empty('Sem companheiros', 'Nenhum outro piloto registrado na mesma equipe.')}</div>
    <div class="card flush mt"><div class="card-h" style="padding:14px 18px 0"><h2>Resultados por etapa</h2></div><div id="rt"></div></div>`;
    GW.lineChart($('#c1', pb), { series: [{ name: 'Largada (classificação)', color: '#9aa4bd', pts: rows.map((x) => [+x.r.round, x.c.q ?? null]), dots: true, dash: '4 3' }, { name: 'Chegada (corrida)', color: col, pts: rows.map((x) => [+x.r.round, GW.finished({ status: x.c.status }) || x.c.pos ? x.c.pos : null]), dots: true }], legend: true, height: 240, yDomain: [20.5, 0.5], yFmt: (v) => 'P' + Math.round(v), xFmt: (v) => 'R' + v, tipHead: (x) => 'Etapa ' + Math.round(x), tipRow: (s, v) => 'P' + v, title: 'Posição de largada e chegada por etapa' });
    const dist = Array.from({ length: 20 }, (_, i) => fin.filter((v) => v === i + 1).length);
    GW.barChart($('#c2', pb), { cats: dist.map((_, i) => 'P' + (i + 1)), series: [{ name: 'Corridas', color: col, vals: dist }], height: 240, title: 'Distribuição de posições finais' });
    let acc = 0; GW.lineChart($('#c3', pb), { series: [{ name: GW.fullName(e.driver), color: col, area: true, pts: sd.res.map((r) => { const c = e.rounds[r.round]; acc += (c?.pts || 0) + (c?.spr || 0); return [r.round, acc]; }) }], height: 220, xFmt: (v) => 'R' + v, unit: 'pts', yMin0: true, tipHead: (x) => 'Após etapa ' + Math.round(x) });
    if (h2h.length) {
      const ptsDuel = (x) => duel('Pontos na temporada', Math.round(e.points), Math.round(x.pts), col, '#9aa4bd', 'total de pontos');
      $('#mt', pb).innerHTML = `<div class="duel-grid">${h2h.map((x) => `<div class="duel-card"><div class="duel-who"><div class="who"><div class="avatar sm" data-id="${esc(e.driver.driverId)}" data-given="${esc(e.driver.givenName)}" data-family="${esc(e.driver.familyName)}" data-dob="${esc(e.driver.dateOfBirth || '')}" data-year="${y}" data-teams="${teamIds.join(',')}">${esc(e.driver.code || '')}</div><span style="color:${col}">${esc(e.driver.familyName)}</span></div><span class="vs">VS</span><a class="who right" href="#/drivers/${y}/${x.m.driver.driverId}"><span>${esc(x.m.driver.familyName)}</span><div class="avatar sm" data-id="${esc(x.m.driver.driverId)}" data-given="${esc(x.m.driver.givenName)}" data-family="${esc(x.m.driver.familyName)}" data-dob="${esc(x.m.driver.dateOfBirth || '')}" data-year="${y}" data-teams="${[...x.m.teams.keys()].join(',')}">${esc(x.m.driver.code || '')}</div></a></div>${duel('Classificação', x.qw, x.ql, col, '#9aa4bd')}${duel('Corrida', x.rw, x.rl, col, '#9aa4bd')}${ptsDuel(x)}</div>`).join('')}</div>`;
      GW.hydratePhotos($('#mt', pb));
    }
    GW.table($('#rt', pb), [{ k: 'r', label: 'Etapa', render: (x) => `<a href="#/results/${y}/${x.r.round}/race">R${x.r.round} ${esc(x.r.raceName.replace(' Grand Prix', ''))}</a>`, sort: (x) => x.r.round }, { k: 'q', label: 'Quali', num: true, render: (x) => val(x.c.q), sort: (x) => x.c.q }, { k: 'g', label: 'Grid', num: true, render: (x) => (x.c.grid === 0 ? 'PL' : val(x.c.grid)), sort: (x) => x.c.grid }, { k: 'p', label: 'Chegada', num: true, render: (x) => (/^\d+$/.test(x.c.text) ? x.c.pos : `<span class="down">${esc(x.c.text)}</span>`), sort: (x) => x.c.pos }, { k: 'sp', label: 'Sprint', num: true, render: (x) => (x.c.spr != null ? x.c.spr + ' pts' : NA) }, { k: 'pts', label: 'Pts', num: true, render: (x) => GW.pts(x.c.pts), sort: (x) => x.c.pts }, { k: 'st', label: 'Status', render: (x) => esc(x.c.status) }, { k: 'fl', label: 'VR', render: (x) => (x.c.fl ? '<span class="best">●</span>' : '') }], rows, { sortKey: 'r' });
  }

  function tabCareer(pb, car) {
    const S = car.seasons.filter((x) => x.pos != null);
    if (!S.length) { pb.innerHTML = GW.empty('Sem classificação final', 'Não há classificação de campeonato registrada.'); return; }
    pb.innerHTML = `<div class="grid g2"><div class="card"><div class="card-h"><h2>Pontos por temporada</h2></div><div id="k1"></div></div><div class="card"><div class="card-h"><h2>Posição final no campeonato</h2></div><div id="k2"></div></div></div><div class="card flush mt"><div id="kt"></div></div>
      <p class="note mt-s">${GW.ic('info')}<span>Pontos de eras diferentes não são comparáveis diretamente: o sistema de pontuação e o número de corridas mudaram várias vezes. Temporada ${GW.currentYear} pode estar em andamento.</span></p>`;
    GW.barChart($('#k1', pb), { cats: S.map((s) => String(s.year).slice(-2)), series: [{ name: 'Pontos', color: '#e10600', vals: S.map((s) => s.pts) }], title: 'Pontos por temporada' });
    GW.lineChart($('#k2', pb), { series: [{ name: 'Posição', color: '#4aa3ff', dots: true, pts: S.map((s) => [s.year, s.pos]) }], yDomain: [Math.max(...S.map((s) => s.pos)) + 1, 0], xFmt: (v) => String(Math.round(v)), yFmt: (v) => Math.round(v) + 'º', tipRow: (s, v) => v + 'º', height: 240, xDomain: [S[0].year - 0.5, S.at(-1).year + 0.5] });
    GW.table($('#kt', pb), [{ k: 'year', label: 'Ano', render: (s) => `<a href="#/drivers/${s.year}/${car.driver.driverId}">${s.year}</a>`, sort: (s) => s.year }, { k: 'teams', label: 'Equipe(s)', render: (s) => s.teams.map((t) => teamCell(t, s.year)).join(' / ') }, { k: 'pos', label: 'Pos', num: true, render: (s) => `<b>${s.pos}</b>${s.pos === 1 && s.year < GW.currentYear ? ' 🏆' : ''}`, sort: (s) => s.pos }, { k: 'pts', label: 'Pontos', num: true, render: (s) => GW.pts(s.pts), sort: (s) => s.pts }, { k: 'wins', label: 'Vitórias', num: true, render: (s) => s.wins, sort: (s) => s.wins }], S, { sortKey: 'year', desc: true });
  }

  async function tabCircuit(pb, id, tk) {
    pb.innerHTML = `<div class="banner info">O histórico por circuito exige baixar todos os resultados do piloto (várias requisições). Fica em cache depois do primeiro carregamento.</div><div class="mt-s"><button class="btn pri" id="lc">${GW.ic('db')} Carregar resultados por circuito</button></div><div id="kc"></div>`;
    $('#lc', pb).onclick = async (ev) => {
      ev.currentTarget.disabled = true; const out = $('#kc', pb); out.innerHTML = GW.loading('Baixando resultados da carreira…');
      try {
        let off = 0, total = 1; const races = [];
        while (off < total) { const d = await J.raw(`drivers/${id}/results.json?limit=100&offset=${off}`); total = +d.total; races.push(...d.RaceTable.Races); off += 100; }
        if (!GW.alive(tk)) return;
        const by = new Map(); races.forEach((r) => { const x = r.Results[0]; const e = by.get(r.Circuit.circuitId) || { c: r.Circuit, n: 0, w: 0, pod: 0, pos: [], best: 99, pts: 0 }; e.n++; const p = +x.position; if (p === 1) e.w++; if (p <= 3) e.pod++; if (GW.finished(x)) e.pos.push(p); e.best = Math.min(e.best, p); e.pts += +x.points; by.set(r.Circuit.circuitId, e); });
        out.innerHTML = `<div class="card flush mt"><div id="kc2"></div></div>`;
        GW.table($('#kc2', out), [{ k: 'c', label: 'Circuito', render: (e) => `<a href="#/circuits/${e.c.circuitId}">${esc(e.c.circuitName)}</a>`, sort: (e) => e.c.circuitName }, { k: 'n', label: 'GPs', num: true, render: (e) => e.n, sort: (e) => e.n }, { k: 'w', label: 'Vitórias', num: true, render: (e) => e.w, sort: (e) => e.w }, { k: 'pod', label: 'Pódios', num: true, render: (e) => e.pod, sort: (e) => e.pod }, { k: 'b', label: 'Melhor', num: true, render: (e) => 'P' + e.best, sort: (e) => e.best }, { k: 'avg', label: 'Chegada média*', num: true, render: (e) => (e.pos.length ? mean(e.pos).toFixed(1) : NA), sort: (e) => (e.pos.length ? mean(e.pos) : null) }, { k: 'pts', label: 'Pontos', num: true, render: (e) => GW.pts(e.pts), sort: (e) => e.pts }], [...by.values()], { sortKey: 'n', desc: true });
        out.insertAdjacentHTML('beforeend', `<p class="note mt-s">${GW.ic('info')}<span>*Média só das corridas concluídas. Pontos: sistema vigente em cada época.</span></p>`);
      } catch (e) { out.innerHTML = GW.error(e); }
    };
  }

  /* ---------- EQUIPES ---------- */
  GW.pages.teams = async (p, el, tk) => {
    await J.init();
    if (p[0] && !/^\d{4}$/.test(p[0])) return teamProfile(p[0], +p[1] || null, el, tk);
    const years = await J.seasons(); const y = +p[0] || GW.ctx.year || GW.currentYear; GW.setCtx({ year: y });
    const [cs, ds] = await Promise.all([J.constructorStandings(y), J.driverStandings(y).catch(() => ({ rows: [] }))]); if (!GW.alive(tk)) return;
    el.innerHTML = `<div class="page-head"><div><span class="eyebrow">Equipes</span><h1>Equipes ${y}</h1><p class="sub">Identidade e formação exibidas conforme a temporada selecionada.</p></div><div class="row">${GW.ctl('ty', 'Temporada', GW.options(years.map((v) => [v, v]), y))}</div></div>
      <div class="list-grid">${cs.rows.length ? cs.rows.map((r) => `<a class="pcard" href="#/teams/${r.Constructor.constructorId}/${y}" style="border-left-color:${tc(r.Constructor.constructorId, r.Constructor.name)}"><div class="avatar" style="border-radius:12px;font-size:14px">${/^\d+$/.test(r.position) ? r.position + 'º' : '—'}</div><div><h3>${esc(r.Constructor.name)}</h3><p>${esc(r.Constructor.nationality)}</p><p>${GW.pts(r.points)} pts · ${r.wins} vit.</p><p class="muted">${ds.rows.filter((d) => d.Constructors.some((c) => c.constructorId === r.Constructor.constructorId)).map((d) => esc(d.Driver.code || d.Driver.familyName)).join(' · ')}</p></div></a>`).join('') : GW.empty('Sem classificação de construtores', y < 1958 ? 'O campeonato de construtores começou em 1958.' : 'Não há dados de construtores para esta temporada.')}</div>`;
    $('#ty', el).onchange = (e) => GW.go(`teams/${e.target.value}`);
  };
  async function teamProfile(id, y, el, tk) {
    const cys = await J.raw(`constructors/${id}/seasons.json?limit=100`).catch(() => null);
    const yearsAll = (cys?.SeasonTable.Seasons || []).map((x) => +x.season).sort((p, q) => q - p);
    if (!yearsAll.length) { el.innerHTML = GW.empty('Equipe não encontrada', 'Não há temporadas registradas para esta equipe.'); return; }
    if (!y || !yearsAll.includes(y)) y = yearsAll[0];
    const [std, wins, starts] = await Promise.all([J.raw(`${y}/constructors/${id}/constructorstandings.json`, y).then((d) => d.StandingsTable.StandingsLists[0]).catch(() => null), J.total(`constructors/${id}/results/1.json`), J.total(`constructors/${id}/results.json`)]); if (!GW.alive(tk)) return;
    const s0 = std && std.ConstructorStandings[0], info = s0 && s0.Constructor;
    if (!info) { el.innerHTML = GW.empty('Equipe sem classificação neste ano', 'O campeonato de construtores começou em 1958; escolha outra temporada.'); return; }
    const ssObj = { pos: +s0.position, pts: +s0.points };
    GW.setCtx({ year: y });
    const sd = await GW.seasonData(y); if (!GW.alive(tk)) return;
    const t = sd.teams.get(id), col = tc(id, info.name), ss = ssObj;
    const drvs = [...sd.drivers.values()].filter((e) => e.teams.has(id));
    el.innerHTML = `<div class="page-head"><div><span class="eyebrow" style="color:${col}">Equipe · ${y}</span><h1>${esc(info.name)}</h1><p class="sub">${esc(info.nationality)} · nome e formação válidos para ${y}</p></div><div class="row">${GW.ctl('ty', 'Temporada', GW.options(yearsAll.map((v) => [v, v]), y))}</div></div>
      <div class="grid g4">${stat('Posição ' + y, ss ? ordinal(ss.pos) : null, `${ss ? GW.pts(ss.pts) : '—'} pontos`)}${stat('Vitórias ' + y, t?.wins ?? null, 'corridas')}${stat('Pódios ' + y, t?.podiums ?? null, 'somando pilotos')}${stat('Poles ' + y, t?.poles ?? 0)}${stat('Vitórias na história', wins, 'no nome "constructorId" atual')}${stat('GPs (largadas)', starts, 'soma de pilotos')}<div class="card" id="ttl"><div class="stat"><span class="k">Títulos de construtores</span><span class="v">…</span><span class="d">calculando</span></div></div>${stat('Temporadas na F1', yearsAll.length)}</div>
      <p class="note mt-s">${GW.ic('info')}<span>Totais históricos referem-se a esta identidade de equipe; equipes que mudaram de nome (ex.: Racing Point → Aston Martin) aparecem separadas e não são somadas.</span></p>
      <div class="grid g2 mt"><div class="card"><div class="card-h"><h2>Pilotos em ${y}</h2></div><div id="dv"></div></div><div class="card"><div class="card-h"><h2>Comparação entre pilotos</h2></div><div id="cmp"></div></div></div>
      <div class="grid g2 mt"><div class="card"><div class="card-h"><h2>Posição no campeonato ao longo de ${y}</h2></div><div id="ev"></div></div><div class="card"><div class="card-h"><h2>Histórico de posições finais</h2></div><div id="hs">${GW.loading('Carregando histórico…')}</div></div></div>
      <div class="card flush mt"><div class="card-h" style="padding:14px 18px 0"><h2>Desempenho por circuito em ${y}</h2></div><div id="cc"></div></div>`;
    $('#ty', el).onchange = (e) => GW.go(`teams/${id}/${e.target.value}`);
    $('#dv', el).innerHTML = drvs.length ? drvs.map((e) => `<div class="bar-row" style="grid-template-columns:1fr auto"><span>${GW.flag(e.driver.nationality)} <a href="#/drivers/${y}/${e.driver.driverId}">${esc(GW.fullName(e.driver))}</a> <span class="muted">${e.rounds && Object.values(e.rounds).filter((r) => r.pos != null && r.team === id).length} GPs</span></span><span class="v">${GW.pts(e.points)} pts</span></div>`).join('') : GW.empty('Sem pilotos');
    const cols = ['#e10600', '#4aa3ff', '#ffb020', '#2fd48a'];
    GW.table($('#cmp', el), [{ k: 'd', label: 'Piloto', render: (e) => esc(GW.fullName(e.driver)) }, { k: 'p', label: 'Pts', num: true, render: (e) => GW.pts(e.points), sort: (e) => e.points }, { k: 'w', label: 'Vit.', num: true, render: (e) => e.wins, sort: (e) => e.wins }, { k: 'po', label: 'Pód.', num: true, render: (e) => e.podiums, sort: (e) => e.podiums }, { k: 'pl', label: 'Poles', num: true, render: (e) => e.poles, sort: (e) => e.poles }, { k: 'dn', label: 'Aband.', num: true, render: (e) => e.dnf, sort: (e) => e.dnf }], drvs, { sortKey: 'p', desc: true });
    const cum = {}; sd.teams.forEach((tt, k) => (cum[k] = 0)); const rank = [];
    sd.res.forEach((r) => { sd.teams.forEach((tt, k) => (cum[k] += tt.rounds[r.round] || 0)); const ord = Object.entries(cum).sort((a, b) => b[1] - a[1]).map((x) => x[0]); rank.push([+r.round, ord.indexOf(id) + 1]); });
    GW.lineChart($('#ev', el), { series: [{ name: info.name, color: col, pts: rank, dots: true }], yDomain: [sd.teams.size + 0.5, 0.5], yFmt: (v) => Math.round(v) + 'º', xFmt: (v) => 'R' + v, tipRow: (s, v) => v + 'º', height: 230, tipHead: (x) => 'Após etapa ' + Math.round(x) });
    (async () => {
      const hl = []; for (const yy of yearsAll.slice(0, 12)) { if (!GW.alive(tk)) return; hl.push(await J.raw(`${yy}/constructors/${id}/constructorstandings.json`, yy).then((d) => d.StandingsTable.StandingsLists[0]).catch(() => null)); }
      if (!GW.alive(tk) || !$('#hs', el)) return;
      const seasons = hl.filter(Boolean).map((l) => ({ year: +l.season, pos: +l.ConstructorStandings[0].position })).sort((p, q) => p.year - q.year);
      const titles = seasons.filter((x) => x.pos === 1 && x.year < GW.currentYear).length;
      $('#ttl', el).innerHTML = `<div class="stat"><span class="k">Títulos (últimas ${seasons.length} temp.)</span><span class="v">${titles}</span><span class="d">campeonato de construtores</span></div>`;
      if (seasons.length) GW.lineChart($('#hs', el), { series: [{ name: 'Posição final', color: col, pts: seasons.map((x) => [x.year, x.pos]), dots: true }], yDomain: [Math.max(...seasons.map((x) => x.pos)) + 1, 0], yFmt: (v) => Math.round(v) + 'º', xFmt: (v) => String(Math.round(v)), tipRow: (q, v) => v + 'º', height: 230, xDomain: [seasons[0].year - 1, seasons.at(-1).year + 1] });
      else $('#hs', el).innerHTML = GW.empty('Sem histórico');
    })();
    const rows = sd.res.map((r) => ({ r, pts: t?.rounds[r.round], best: Math.min(...r.rows.filter((x) => x.Constructor.constructorId === id).map((x) => +x.position)) })).filter((x) => isNum(x.pts));
    GW.table($('#cc', el), [{ k: 'r', label: 'GP', render: (x) => `<a href="#/results/${y}/${x.r.round}/race">R${x.r.round} ${esc(x.r.raceName.replace(' Grand Prix', ''))}</a>`, sort: (x) => x.r.round }, { k: 'c', label: 'Circuito', render: (x) => `<a href="#/circuits/${x.r.Circuit.circuitId}/${y}">${esc(x.r.Circuit.circuitName)}</a>` }, { k: 'b', label: 'Melhor chegada', num: true, render: (x) => 'P' + x.best, sort: (x) => x.best }, { k: 'p', label: 'Pontos (corrida+sprint)', num: true, render: (x) => GW.pts(x.pts), sort: (x) => x.pts }], rows, { sortKey: 'r', empty: 'Sem corridas disputadas nesta temporada.' });
  }

  /* ---------- DRIVER WARS ---------- */
  GW.pages.wars = async (p, el, tk) => {
    await J.init();
    const years = await J.seasons(); const mode = GW.store.get('warsMode', 'season'), season = mode === 'season';
    const y = +p[0] || GW.store.get('warsYear', GW.currentYear);
    const sd = season ? await GW.seasonQual(y).catch(() => null) : null; if (!GW.alive(tk)) return;
    const MAX = 4, WC = ['#ff3b3b', '#4aa3ff', '#ffb020', '#2fd48a'];
    /* candidatos: temporada = quem correu no ano; carreira = todos os pilotos da história (carregados aos poucos) */
    let cands = season && sd ? [...sd.drivers.values()].sort((a, b) => b.points - a.points).map((e) => ({ d: e.driver, teams: [...e.teams.values()], pts: e.points })) : [];
    let picks = season ? GW.store.get('warsPicks', []).filter((id) => cands.some((c) => c.d.driverId === id)) : GW.store.get('warsCareer', ['hamilton', 'max_verstappen']);
    if (season && picks.length < 2) picks = cands.slice(0, 2).map((c) => c.d.driverId);
    const find = (id) => cands.find((c) => c.d.driverId === id);
    const RIV = [['Hamilton × Verstappen', ['hamilton', 'max_verstappen']], ['Senna × Prost', ['senna', 'prost']], ['Schumacher × Hamilton', ['michael_schumacher', 'hamilton']], ['Vettel × Alonso', ['vettel', 'alonso']], ['Lauda × Hunt', ['lauda', 'hunt']], ['Fangio × Moss', ['fangio', 'moss']]];
    el.innerHTML = `<div class="page-head"><div><span class="eyebrow">Comparador</span><h1>Driver Wars</h1><p class="sub">Escolha até ${MAX} pilotos e compare lado a lado. Sem veredito: números isolados raramente contam a história inteira.</p></div>
      <div class="seg"><button data-m="season" class="${season ? 'on' : ''}">Mesma temporada</button><button data-m="career" class="${!season ? 'on' : ''}">Carreira</button></div></div>
      <div class="card picker"><div class="pk-top">${season ? GW.ctl('wy', 'Temporada', GW.options(years.map((v) => [v, v]), y)) : ''}<div class="ctl pk-search"><label for="wq">Adicionar piloto</label><input id="wq" type="search" autocomplete="off" placeholder="Digite o nome… ex.: Alonso" aria-controls="wres"><div id="wres" class="wres" role="listbox" hidden></div></div></div>
        <div class="pk-chips" id="chips" aria-live="polite"></div>
        <div class="pk-presets" id="pre"></div></div><div id="wb" class="mt"></div>`;
    $$('.seg button', el).forEach((b) => (b.onclick = () => { GW.store.set('warsMode', b.dataset.m); GW.reload(); }));
    const wy = $('#wy', el); if (wy) wy.onchange = (e) => { GW.store.set('warsYear', +e.target.value); GW.store.set('warsPicks', []); GW.go(`wars/${e.target.value}`); };
    const av = (c) => `<div class="avatar sm" data-id="${esc(c.d.driverId)}" data-given="${esc(c.d.givenName)}" data-family="${esc(c.d.familyName)}" data-dob="${esc(c.d.dateOfBirth || '')}" data-year="${season ? y : 0}" data-teams="${(c.teams || []).map((t) => t.constructorId).join(',')}">${esc(c.d.code || c.d.familyName.slice(0, 3).toUpperCase())}</div>`;
    const stub = (id) => ({ d: { driverId: id, givenName: id.replace(/_/g, ' '), familyName: id.replace(/_/g, ' ') }, teams: [] });
    const save = () => { GW.store.set(season ? 'warsPicks' : 'warsCareer', picks); GW.setCtx({ drivers: picks }); };
    const run = () => { save(); drawChips(); drawPresets(); (season ? seasonWar : careerWar)($('#wb', el), picks, sd, y, tk); };
    const set = (ids) => { picks = ids.filter((id, i, a) => a.indexOf(id) === i).slice(0, MAX); run(); };
    const closeRes = () => { res.hidden = true; act = -1; };
    const add = (id) => { if (picks.includes(id)) return GW.toast('Esse piloto já está na comparação'); if (picks.length >= MAX) return GW.toast(`Máximo de ${MAX} pilotos: remova um para adicionar outro`); picks = [...picks, id]; q.value = ''; closeRes(); run(); };
    const drawChips = () => {
      $('#chips', el).innerHTML = picks.length ? picks.map((id, i) => { const c = find(id) || stub(id); return `<span class="pk-chip" style="--c:${WC[i]}">${av(c)}<b>${esc(GW.fullName(c.d))}</b>${c.teams && c.teams[0] ? `<small>${esc(c.teams[0].name)}</small>` : ''}<button data-rm="${esc(id)}" aria-label="Remover ${esc(GW.fullName(c.d))}">${GW.ic('x')}</button></span>`; }).join('') + (picks.length < MAX ? `<span class="pk-hint">+ ${MAX - picks.length} vaga${MAX - picks.length > 1 ? 's' : ''}</span>` : '') : '<span class="pk-hint">Nenhum piloto escolhido — use a busca acima.</span>';
      $$('[data-rm]', el).forEach((b) => (b.onclick = () => { picks = picks.filter((x) => x !== b.dataset.rm); run(); }));
      GW.hydratePhotos($('#chips', el));
    };
    const drawPresets = () => {
      const teams = new Map(); if (season) cands.forEach((c) => c.teams.forEach((t) => { const e = teams.get(t.constructorId) || { t, ids: [] }; e.ids.push(c.d.driverId); teams.set(t.constructorId, e); }));
      const mk = (n, ids, extra = '') => `<button class="chip" data-set="${ids.join(',')}" ${extra}>${n}</button>`;
      $('#pre', el).innerHTML = '<span class="pk-lbl">Atalhos</span>' + (season ? mk('Líder × vice', cands.slice(0, 2).map((c) => c.d.driverId)) + mk('Top 4', cands.slice(0, 4).map((c) => c.d.driverId)) + [...teams.values()].filter((e) => e.ids.length >= 2).slice(0, 12).map((e) => mk(esc(e.t.name), e.ids.slice(0, 2), `style="border-color:${GW.teamColor(e.t.constructorId, e.t.name)}88"`)).join('') : RIV.map(([n, ids]) => mk(n, ids)).join('')) + (picks.length ? mk('Limpar', []) : '');
      $$('[data-set]', $('#pre', el)).forEach((b) => (b.onclick = () => set(b.dataset.set ? b.dataset.set.split(',') : [])));
    };
    /* busca com lista suspensa */
    const res = $('#wres', el), q = $('#wq', el); let act = -1, shown = [], allLoaded = season;
    const norm = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const drawRes = () => {
      const t = norm(q.value.trim());
      shown = (t ? cands.filter((c) => norm(GW.fullName(c.d) + ' ' + (c.d.code || '') + ' ' + (c.teams[0] ? c.teams[0].name : '')).includes(t)) : cands).filter((c) => !picks.includes(c.d.driverId)).slice(0, 8);
      res.innerHTML = shown.length ? shown.map((c, i) => `<div class="wopt ${i === act ? 'on' : ''}" role="option" data-i="${i}">${av(c)}<span class="wn"><b>${GW.flag(c.d.nationality)}${esc(GW.fullName(c.d))}</b><small>${season ? esc(c.teams.map((x) => x.name).join(' / ')) + ' · ' + GW.pts(c.pts) + ' pts' : esc(c.d.nationality || '')}</small></span><span class="wadd">+</span></div>`).join('') : `<div class="wopt none">${!allLoaded ? 'Carregando pilotos…' : 'Nenhum piloto encontrado'}</div>`;
      res.hidden = false; GW.hydratePhotos(res);
      $$('.wopt[data-i]', res).forEach((o) => (o.onmousedown = (e) => { e.preventDefault(); add(shown[+o.dataset.i].d.driverId); }));
    };
    q.addEventListener('focus', drawRes); q.addEventListener('input', () => { act = -1; drawRes(); });
    q.addEventListener('blur', () => setTimeout(closeRes, 120));
    q.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (res.hidden) drawRes(); act = (act + (e.key === 'ArrowDown' ? 1 : -1) + shown.length) % (shown.length || 1); drawRes(); }
      else if (e.key === 'Enter' && shown.length) { e.preventDefault(); add(shown[Math.max(0, act)].d.driverId); }
      else if (e.key === 'Escape') { closeRes(); q.blur(); }
    });
    if (!season) { // todos os pilotos da história, páginas de 100 em segundo plano
      (async () => {
        const seen = new Map(); let off = 0, total = 1;
        while (off < total && GW.alive(tk)) {
          try { const d = await J.raw(`drivers.json?limit=100&offset=${off}`); total = +d.total; d.DriverTable.Drivers.forEach((x) => seen.set(x.driverId, { d: x, teams: [], pts: 0 })); } catch { break; }
          off += 100; cands = [...seen.values()].sort((a, b) => a.d.familyName.localeCompare(b.d.familyName)); drawChips(); if (!res.hidden) drawRes();
        }
        allLoaded = true; if (GW.alive(tk)) { drawChips(); if (!res.hidden) drawRes(); }
      })();
    }
    drawChips(); drawPresets(); run();
  };
  const WCOL = ['#ff3b3b', '#4aa3ff', '#ffb020', '#2fd48a'];
  function seasonWar(wb, picks, sd, y, tk) {
    if (picks.length < 2) { wb.innerHTML = GW.empty('Escolha ao menos dois pilotos'); return; }
    const E = picks.map((id) => sd.drivers.get(id)); const names = E.map((e) => e.driver.code || e.driver.familyName);
    const fin = (e) => Object.values(e.rounds).filter((r) => r.pos != null && GW.finished({ status: r.status })).map((r) => r.pos);
    const qg = (e) => Object.values(e.rounds).map((r) => r.qgap).filter(isNum), qp = (e) => Object.values(e.rounds).map((r) => r.q).filter(isNum);
    const gp = (e) => Object.values(e.rounds).filter((r) => r.pos != null).length;
    const best = (vals, low) => { const v = vals.filter(isNum); if (v.length < 2) return -1; const t = low ? Math.min(...v) : Math.max(...v); return vals.indexOf(t) === vals.lastIndexOf(t) || true ? vals.findIndex((x) => x === t) : -1; };
    const metrics = [['GPs disputados', E.map(gp), 0, 0], ['Pontos', E.map((e) => e.points), 0, 0], ['Vitórias', E.map((e) => e.wins), 0, 0], ['Pódios', E.map((e) => e.podiums), 0, 0], ['Poles', E.map((e) => e.poles), 0, 0], ['Voltas mais rápidas', E.map((e) => e.fl), 0, 0], ['Abandonos', E.map((e) => e.dnf), 1, 0],
      ['Posição média (corrida)', E.map((e) => (fin(e).length ? mean(fin(e)) : null)), 1, 2], ['Mediana de chegada', E.map((e) => (fin(e).length ? median(fin(e)) : null)), 1, 1], ['Posição média no grid (quali)', E.map((e) => (qp(e).length ? mean(qp(e)) : null)), 1, 2], ['Consistência (desvio da chegada)', E.map((e) => (fin(e).length > 1 ? stdev(fin(e)) : null)), 1, 2], ['Gap médio p/ pole (s)*', E.map((e) => (qg(e).length ? mean(qg(e)) : null)), 1, 3]];
    wb.innerHTML = `<div class="banner info" style="margin-bottom:14px">Todos os pilotos na temporada <b>${y}</b>: mesmas regras e calendário, mas carros diferentes — o carro pesa tanto quanto o piloto. Destaque verde = melhor valor da linha, não "melhor piloto".</div>
      <div class="card flush"><div class="tbl-wrap scroll-x"><table><thead><tr><th>Indicador</th>${E.map((e, i) => `<th class="num" style="color:${WCOL[i]}">${esc(GW.fullName(e.driver))}</th>`).join('')}</tr></thead><tbody>${metrics.map(([n, vs, low, dec]) => { const b = best(vs, low); return `<tr><td class="tx2">${n}</td>${vs.map((v, i) => `<td class="num ${i === b ? 'up' : ''}">${isNum(v) ? (dec ? (+v).toFixed(dec) : GW.pts(v)) : NA}</td>`).join('')}</tr>`; }).join('')}
      <tr><td class="tx2">Equipe(s)</td>${E.map((e) => `<td class="num">${[...e.teams.values()].map((t) => esc(t.name)).join(' / ')}</td>`).join('')}</tr></tbody></table></div></div>
      <p class="note mt-s">${GW.ic('info')}<span>*Gap médio para a pole apenas em sessões com Q3 (calculado dos tempos Q1–Q3). Chegada considera só corridas concluídas.</span></p>
      <div class="grid g2 mt"><div class="card"><div class="card-h"><h2>Evolução dos pontos</h2></div><div id="w1"></div></div><div class="card"><div class="card-h"><h2>Posição de chegada por etapa</h2></div><div id="w2"></div></div></div>
      <div class="grid g2 mt"><div class="card"><div class="card-h"><h2>Distribuição de posições finais</h2></div><div id="w3"></div></div><div class="card"><div class="card-h"><h2>Gap para a pole na classificação (s)</h2></div><div id="w4"></div></div></div>
      <div class="card mt"><div class="card-h"><h2>Confronto direto</h2></div><div id="w5"></div></div>
      <div class="card flush mt"><div class="card-h" style="padding:14px 18px 0"><h2>Por circuito</h2><div class="ctl" style="min-width:220px"><select id="wc" aria-label="Filtrar circuito"><option value="">Todos os circuitos</option>${sd.res.map((r) => `<option value="${r.round}">R${r.round} ${esc(r.raceName.replace(' Grand Prix', ''))}</option>`).join('')}</select></div></div><div id="w6"></div></div>`;
    const dc = (e, i) => (picks.length && E.length ? WCOL[i] : '#fff');
    const cum = (e) => { let a = 0; return sd.res.map((r) => { const c = e.rounds[r.round]; a += (c?.pts || 0) + (c?.spr || 0); return [+r.round, a]; }); };
    GW.lineChart($('#w1', wb), { series: E.map((e, i) => ({ name: names[i], color: dc(e, i), pts: cum(e) })), legend: true, height: 240, xFmt: (v) => 'R' + v, unit: 'pts', yMin0: true, tipHead: (x) => 'Após etapa ' + Math.round(x) });
    GW.lineChart($('#w2', wb), { series: E.map((e, i) => ({ name: names[i], color: dc(e, i), dots: true, pts: sd.res.map((r) => { const c = e.rounds[r.round]; return [+r.round, c?.pos != null && /^\d+$/.test(c.text) ? c.pos : null]; }) })), legend: true, height: 240, yDomain: [20.5, 0.5], yFmt: (v) => 'P' + Math.round(v), xFmt: (v) => 'R' + v, tipRow: (s, v) => 'P' + v, tipHead: (x) => 'Etapa ' + Math.round(x) });
    GW.barChart($('#w3', wb), { cats: Array.from({ length: 20 }, (_, i) => 'P' + (i + 1)), series: E.map((e, i) => ({ name: names[i], color: dc(e, i), vals: Array.from({ length: 20 }, (_, k) => fin(e).filter((v) => v === k + 1).length) })), height: 240 });
    GW.lineChart($('#w4', wb), { series: E.map((e, i) => ({ name: names[i], color: dc(e, i), dots: true, pts: sd.res.map((r) => [+r.round, e.rounds[r.round]?.qgap ?? null]) })), legend: true, height: 240, yFmt: (v) => v.toFixed(1), unit: 's', xFmt: (v) => 'R' + v, yMin0: true, emptyMsg: 'Sem tempos Q3 nesta temporada.' });
    const pairs = []; for (let a = 0; a < E.length; a++) for (let b = a + 1; b < E.length; b++) { let qa = 0, qb = 0, ra = 0, rb = 0, common = 0; sd.res.forEach((r) => { const A = E[a].rounds[r.round], B = E[b].rounds[r.round]; if (!A || !B) return; if (isNum(A.q) && isNum(B.q) && A.q !== B.q) A.q < B.q ? qa++ : qb++; if (A.pos != null && B.pos != null && GW.finished({ status: A.status }) && GW.finished({ status: B.status })) { common++; A.pos < B.pos ? ra++ : rb++; } }); pairs.push({ ia: a, ib: b, a: names[a], b: names[b], qa, qb, ra, rb, common }); }
    $('#w5', wb).innerHTML = `<div class="duel-grid">${pairs.map((x) => `<div class="duel-card"><div class="duel-who"><div class="who"><i class="dot" style="background:${WCOL[x.ia]}"></i><span style="color:${WCOL[x.ia]}">${esc(x.a)}</span></div><span class="vs">VS</span><div class="who right"><span style="color:${WCOL[x.ib]}">${esc(x.b)}</span><i class="dot" style="background:${WCOL[x.ib]}"></i></div></div>${duel('Classificação', x.qa, x.qb, WCOL[x.ia], WCOL[x.ib])}${duel('Corrida (ambos terminaram)', x.ra, x.rb, WCOL[x.ia], WCOL[x.ib])}</div>`).join('')}</div>`;
    const draw6 = () => { const rn = $('#wc', wb).value; const rows = sd.res.filter((r) => !rn || r.round === +rn).map((r) => ({ r, cells: E.map((e) => e.rounds[r.round]) })); GW.table($('#w6', wb), [{ k: 'r', label: 'GP', render: (x) => `<a href="#/results/${y}/${x.r.round}/race">R${x.r.round} ${esc(x.r.raceName.replace(' Grand Prix', ''))}</a>`, sort: (x) => x.r.round }, ...E.map((e, i) => ({ k: 'd' + i, label: names[i], num: true, render: (x) => { const c = x.cells[i]; return c && c.pos != null ? `<span title="largada P${c.q ?? '?'}">${/^\d+$/.test(c.text) ? 'P' + c.pos : `<span class="down">${esc(c.text)}</span>`}${isNum(c.q) ? ` <span class="muted">(q${c.q})</span>` : ''}</span>` : NA; }, sort: (x) => x.cells[i]?.pos }))], rows, { sortKey: 'r' }); };
    $('#wc', wb).onchange = draw6; draw6();
  }
  async function careerWar(wb, picks, sd, y, tk) {
    if (picks.length < 2) { wb.innerHTML = GW.empty('Escolha ao menos dois pilotos'); return; }
    wb.innerHTML = GW.loading('Carregando carreiras…');
    let C; try { C = await Promise.all(picks.map((id) => GW.careerFull(id))); } catch (e) { wb.innerHTML = GW.error(e); return; }
    if (!GW.alive(tk)) return;
    const rate = (c, k) => (isNum(c[k]) && c.starts ? (c[k] / c.starts) * 100 : null);
    const m = [['Temporadas', C.map((c) => c.seasons.length)], ['GPs disputados', C.map((c) => c.starts)], ['Vitórias', C.map((c) => c.wins)], ['Pódios', C.map((c) => c.podiums)], ['Poles', C.map((c) => c.poles)], ['Voltas mais rápidas', C.map((c) => c.fl)], ['Títulos', C.map((c) => c.titles)], ['Pontos totais*', C.map((c) => c.points)], ['% vitórias / largada', C.map((c) => rate(c, 'wins')), 1], ['% pódios / largada', C.map((c) => rate(c, 'podiums')), 1], ['% poles / largada', C.map((c) => rate(c, 'poles')), 1]];
    wb.innerHTML = `<div class="banner">Comparação de <b>épocas diferentes</b>: número de corridas por ano, sistema de pontos, confiabilidade, carros e regras mudaram. Totais absolutos favorecem carreiras longas; as taxas ajudam, mas não resolvem a diferença de contexto.</div>
      <div class="card flush mt-s"><div class="tbl-wrap scroll-x"><table><thead><tr><th>Indicador</th>${C.map((c, i) => `<th class="num" style="color:${WCOL[i]}">${esc(GW.fullName(c.driver))}</th>`).join('')}</tr></thead><tbody>${m.map(([n, vs, dec]) => { const mx = Math.max(...vs.filter(isNum)); return `<tr><td class="tx2">${n}</td>${vs.map((v) => `<td class="num ${isNum(v) && v === mx && vs.filter(isNum).length > 1 ? 'up' : ''}">${isNum(v) ? (dec ? (+v).toFixed(dec) + '%' : GW.pts(v)) : NA}</td>`).join('')}</tr>`; }).join('')}<tr><td class="tx2">Período</td>${C.map((c) => `<td class="num">${c.seasons[0].year}–${c.seasons.at(-1).year}</td>`).join('')}</tr></tbody></table></div></div>
      <p class="note mt-s">${GW.ic('info')}<span>*Soma dos pontos finais de cada temporada pelo sistema vigente na época.</span></p>
      <div class="grid g2 mt"><div class="card"><div class="card-h"><h2>Posição final por ano de carreira</h2></div><div id="cw1"></div></div><div class="card"><div class="card-h"><h2>Pontos acumulados na carreira</h2></div><div id="cw2"></div></div></div>`;
    GW.lineChart($('#cw1', wb), { series: C.map((c, i) => ({ name: GW.fullName(c.driver), color: WCOL[i], dots: true, pts: c.seasons.map((s, k) => [k + 1, s.pos]) })), legend: true, height: 260, yDomain: [Math.max(...C.flatMap((c) => c.seasons.map((s) => s.pos))) + 1, 0], yFmt: (v) => Math.round(v) + 'º', xFmt: (v) => 'Ano ' + Math.round(v), tipRow: (s, v) => v + 'º', tipHead: (x) => `${Math.round(x)}º ano de carreira` });
    GW.lineChart($('#cw2', wb), { series: C.map((c, i) => { let a = 0; return { name: GW.fullName(c.driver), color: WCOL[i], pts: c.seasons.map((s, k) => [k + 1, (a += s.pts)]) }; }), legend: true, height: 260, xFmt: (v) => 'Ano ' + Math.round(v), unit: 'pts', yMin0: true, tipHead: (x) => `${Math.round(x)}º ano de carreira` });
  }
})();
