/* RaceLab F1 — Home, Temporadas, Resultados, Campeonatos */
(function () {
  'use strict';
  const U = GW.util, { esc, $, $$, NA, val, lapTime, totalTime, deltaStr, fmtDT, fmtDay, fmtFull, toDate, ago, isNum } = U;
  const { J, O } = GW;
  const tc = (id, name) => GW.teamColor(id, name);
  const drvLink = (y, d, txt) => `<a href="#/drivers/${y}/${d.driverId}">${esc(txt ?? GW.fullName(d))}</a>`;
  const teamCell = (c) => c ? `<span class="team-bar" style="background:${tc(c.constructorId, c.name)}"></span>${GW.teamLogo(c.constructorId, 16)}<a href="#/teams/${c.constructorId}">${esc(c.name)}</a>` : NA;
  const posTxt = (r) => (/^\d+$/.test(r.positionText || r.position) ? r.position : esc(r.positionText || r.position || '—'));

  /* ---------- dados agregados de uma temporada (cache em memória) ---------- */
  const SD = {};
  GW.seasonData = (y) => (SD[y] = SD[y] || (async () => {
    const sched = await J.schedule(y);
    const [res, spr] = await Promise.all([J.seasonAll(y, 'results'), J.seasonAll(y, 'sprint').catch(() => [])]); const qual = [];
    const drivers = new Map(), teams = new Map();
    const D = (d, c) => { let e = drivers.get(d.driverId); if (!e) drivers.set(d.driverId, (e = { driver: d, teams: new Map(), rounds: {}, wins: 0, podiums: 0, poles: 0, fl: 0, points: 0, sprintPts: 0, dnf: 0 })); if (c) e.teams.set(c.constructorId, c); return e; };
    res.forEach((race) => race.rows.forEach((r) => {
      const e = D(r.Driver, r.Constructor), p = +r.position, pts = +r.points;
      e.rounds[race.round] = { pos: p, text: r.positionText, grid: +r.grid, pts, status: r.status, team: r.Constructor.constructorId, laps: +r.laps, fl: r.FastestLap?.rank === '1' };
      e.points += pts; if (p === 1) e.wins++; if (p <= 3) e.podiums++; if (r.FastestLap?.rank === '1') e.fl++; if (!GW.finished(r)) e.dnf++; if (r.grid === '1') e.poles++;
      const t = teams.get(r.Constructor.constructorId) || { c: r.Constructor, points: 0, wins: 0, podiums: 0, poles: 0, rounds: {}, drivers: new Map() };
      t.points += pts; if (p === 1) t.wins++; if (p <= 3) t.podiums++; if (r.grid === '1') t.poles++; t.rounds[race.round] = (t.rounds[race.round] || 0) + pts; t.drivers.set(r.Driver.driverId, r.Driver); teams.set(r.Constructor.constructorId, t);
    }));
    spr.forEach((race) => race.rows.forEach((r) => {
      const e = D(r.Driver, r.Constructor); e.sprintPts += +r.points; e.points += +r.points; e.rounds[race.round] = e.rounds[race.round] || {}; e.rounds[race.round].spr = +r.points; e.rounds[race.round].sprPos = +r.position;
      const t = teams.get(r.Constructor.constructorId); if (t) { t.points += +r.points; t.rounds[race.round] = (t.rounds[race.round] || 0) + +r.points; }
    }));
    const done = res.map((r) => r.round);
    return { year: +y, sched, res, qual, spr, drivers, teams, done, hasQual: false, hasSprint: spr.length > 0, D };
  })().catch((e) => { delete SD[y]; throw e; }));

  /** carrega também a classificação (tempos de quali, gaps e poles oficiais) — mais pesado, só quando necessário */
  GW.seasonQual = async (y) => {
    const sd = await GW.seasonData(y); if (sd._qp) return sd._qp;
    return (sd._qp = (async () => {
      const qual = await J.seasonAll(y, 'qualifying').catch(() => []); if (!qual.length) return sd;
      const { drivers, teams, D } = sd; drivers.forEach((e) => (e.poles = 0)); teams.forEach((t) => (t.poles = 0));
      qual.forEach((race) => race.rows.forEach((r) => {
        const e = D(r.Driver, r.Constructor); e.rounds[race.round] = e.rounds[race.round] || {}; e.rounds[race.round].q = +r.position;
        const bt = [r.Q3, r.Q2, r.Q1].find(Boolean); e.rounds[race.round].qt = U.parseLap(bt);
        if (+r.position === 1) { e.poles++; const t = teams.get(r.Constructor.constructorId); if (t) t.poles++; }
      }));
      // gap de classificação para a pole (s) por piloto/rodada
      qual.forEach((race) => { const poleT = Math.min(...race.rows.map((r) => U.parseLap([r.Q3, r.Q2, r.Q1].find(Boolean))).filter(isNum)); race.rows.forEach((r) => { const e = drivers.get(r.Driver.driverId), t = U.parseLap([r.Q3, r.Q2, r.Q1].find(Boolean)); if (isNum(t) && isFinite(poleT) && r.Q3 && race.rows.some((x) => x.Q3)) e.rounds[race.round].qgap = t - poleT; }); });
      sd.qual = qual; sd.hasQual = true; return sd;
    })());
  };

  const SES_ROUTE = { FP1: 'fp1', FP2: 'fp2', FP3: 'fp3', SQ: 'sq', SPRINT: 'sprint', Q: 'qualifying', RACE: 'race' };
  /** link de resultados da sessão, só se ela já aconteceu e há resultado disponível */
  const sessHref = (y, round, s) => (s.status !== 'future' && (s.kind || (+y >= 2023 && (s.key.startsWith('FP') || s.key === 'SQ'))) ? `#/results/${y}/${round}/${SES_ROUTE[s.key]}` : null);
  /* ---------- HOME ---------- */
  GW.pages.home = async (p, el, tk) => {
    await J.init();
    const y = GW.currentYear;
    const [sched, ds, cs] = await Promise.all([J.schedule(y), J.driverStandings(y).catch(() => null), J.constructorStandings(y).catch(() => null)]);
    if (!GW.alive(tk)) return;
    const st = sched.map((r) => ({ r, s: GW.raceStatus(r) }));
    const next = st.find((x) => x.s !== 'done'), lastDone = [...st].reverse().find((x) => x.s === 'done');
    const nextR = next?.r, hero = nextR || lastDone?.r;
    const wk = nextR ? GW.weekend(nextR) : [];
    GW.setCtx({ year: y, round: (nextR || lastDone?.r)?.round ? +(nextR || lastDone.r).round : null });
    let lastRes = null;
    if (lastDone) lastRes = await J.session(y, lastDone.r.round, 'results').catch(() => null);
    if (!GW.alive(tk)) return;
    const leader = ds?.rows[0], second = ds?.rows[1];
    const maxPts = +ds?.rows[0]?.points || 1, maxC = +cs?.rows[0]?.points || 1;
    const liveS = wk.find((s) => s.status === 'live'), nextSess = wk.find((s) => s.status === 'future');
    el.innerHTML = `
    <section class="hero">
      <span class="eyebrow">Temporada ${y} · ${ds ? `após ${ds.round} de ${sched.length} etapas` : ''}</span>
      ${nextR ? `<h1>${esc(nextR.raceName)}</h1>
        <div class="meta-row"><span class="chip ${next.s === 'live' ? 'live' : 'next'}">${next.s === 'live' ? 'Fim de semana em andamento' : 'Próximo GP'}</span><span class="chip">R${nextR.round}</span><span class="chip">${esc(nextR.Circuit.circuitName)}</span><span class="chip">${esc(nextR.Circuit.Location.locality)}, ${esc(nextR.Circuit.Location.country)}</span></div>
        ${liveS ? `<div class="live-now"><div class="row"><span class="chip live"><i class="livedot"></i> AO VIVO</span><b>${esc(liveS.name)}</b></div><div class="lbar" aria-hidden="true"><i id="lprog"></i></div><div class="lmeta"><span>Começou às ${esc(liveS.start.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }))}</span><span>Termina em <b id="lrem">—</b></span></div>${nextSess ? `<div class="tx2">A seguir: ${esc(nextSess.name)} · ${esc(fmtDT(nextSess.start))} (${U.tz})</div>` : ''}</div>` : nextSess ? `<div class="tx2">${esc(nextSess.name)} · ${esc(fmtDT(nextSess.start))} (${U.tz})</div><div class="countdown" id="cd" aria-live="off"></div>` : ''}
        <div class="row">${liveS ? `<a class="btn pri" href="#/live">${GW.ic('play')} Acompanhar sessão</a>` : ''}<a class="btn ${liveS ? '' : 'pri'}" href="#/seasons/${y}/${nextR.round}">${GW.ic('cal')} Ver fim de semana</a><a class="btn" href="#/circuits/${nextR.Circuit.circuitId}">${GW.ic('map')} Circuito</a></div>`
      : `<h1>Temporada ${y} encerrada</h1><p class="sub">Todas as etapas do calendário já foram disputadas. Última etapa: ${esc(lastDone?.r.raceName || '')}.</p>`}
      ${nextR ? '<div class="hero-track" id="htrack" aria-hidden="true"></div>' : ''}
    </section>
    <div class="grid g-main mt">
      <div class="card"><div class="card-h"><h2>${nextR ? 'Sessões do fim de semana' : 'Última etapa'}</h2><span class="meta">Horários em ${U.tz} (${U.tzShort()})</span></div>
        ${wk.length ? `<div class="sess-list">${wk.map((s) => { const h = nextR ? sessHref(y, nextR.round, s) : null; return `<${h ? `a href="${h}"` : 'div'} class="sess ${s.status}${h ? ' go' : ''}"><span class="n">${esc(s.name)}</span><span class="t">${esc(fmtDT(s.start))}${s.hasTime ? '' : ' (hora não divulgada)'}</span>${s.status === 'future' ? '' : `<span class="chip ${s.status === 'live' ? 'live' : ''}">${s.status === 'live' ? 'Ao vivo' : 'Concluída'}</span>`}${h ? GW.ic('chev') : ''}</${h ? 'a' : 'div'}>`; }).join('')}</div>` : GW.empty('Sem sessões futuras', 'Não há sessões pendentes na temporada.')}
      </div>
      <div class="card"><div class="card-h"><h2>Último GP</h2>${GW.src('Jolpica-F1', GW.cachedAt(`https://api.jolpi.ca/ergast/f1/${y}/${lastDone?.r.round}/results.json?limit=100`))}</div>
        ${lastRes?.rows.length ? `<h3 style="margin-bottom:4px">${esc(lastDone.r.raceName)}</h3><p class="tx2" style="margin-bottom:10px">${esc(fmtDay(toDate(lastDone.r.date)))} · ${esc(lastDone.r.Circuit.circuitName)}</p>
        ${lastRes.rows.slice(0, 10).map((r) => `<div class="bar-row" style="grid-template-columns:26px 1fr auto"><b class="na" style="color:inherit">${r.position}</b><span><span class="team-bar" style="background:${tc(r.Constructor.constructorId, r.Constructor.name)}"></span>${drvLink(y, r.Driver, r.Driver.code || r.Driver.familyName)} <span class="muted">${esc(r.Constructor.name)}</span></span><span class="v">${r.position === '1' ? esc(r.Time?.time || '') : esc(r.Time?.time || r.status)}</span></div>`).join('')}
        <a class="btn sm mt-s" href="#/results/${y}/${lastDone.r.round}/race">Resultado completo</a>` : GW.empty('Sem resultados ainda', 'Nenhuma corrida concluída nesta temporada.')}
      </div>
    </div>
    <div class="grid g2 mt">
      <div class="card"><div class="card-h"><h2>Pilotos</h2><a class="btn sm" href="#/championships/${y}/drivers">Classificação completa</a></div>
        ${ds?.rows.length ? ds.rows.slice(0, 8).map((r) => `<div class="bar-row"><span><span class="na" style="color:inherit">${r.position}</span> ${drvLink(y, r.Driver, r.Driver.code || r.Driver.familyName)}</span><div class="tr"><i style="width:${(+r.points / maxPts) * 100}%;background:${tc(r.Constructors[0]?.constructorId, r.Constructors[0]?.name)}"></i></div><span class="v">${GW.pts(r.points)}</span></div>`).join('') : GW.empty('Classificação indisponível')}
        <p class="note mt-s">${GW.ic('clock')}<span>Referência: após a etapa ${ds?.round ?? '—'}</span></p></div>
      <div class="card"><div class="card-h"><h2>Construtores</h2><a class="btn sm" href="#/championships/${y}/constructors">Classificação completa</a></div>
        ${cs?.rows.length ? cs.rows.map((r) => `<div class="bar-row bar-team"><span><span class="na" style="color:inherit">${r.position}</span> ${GW.teamLogo(r.Constructor.constructorId, 16, y)}<a href="#/teams/${r.Constructor.constructorId}/${y}">${esc(r.Constructor.name)}</a></span><div class="tr"><i style="width:${(+r.points / maxC) * 100}%;background:${tc(r.Constructor.constructorId, r.Constructor.name)}"></i></div><span class="v">${GW.pts(r.points)}</span></div>`).join('') : GW.empty('Classificação indisponível')}</div>
    </div>
    <div class="card mt"><div class="card-h"><h2>Destaques da temporada</h2></div><div class="grid g4" id="hl">${GW.loading('Calculando destaques…')}</div></div>
    <h2 class="mt" style="margin-bottom:12px">Análises</h2>
    <div class="quick">
      <a href="#/telemetry"><span>${GW.ic('pulse')}</span><b>Telemetry Lab</b><span>Compare voltas: velocidade, freio, acelerador e delta.</span></a>
      <a href="#/circuits"><span>${GW.ic('map')}</span><b>Circuit Explorer</b><span>Traçados reais, curvas e histórico por pista.</span></a>
      <a href="#/strategy"><span>${GW.ic('timer')}</span><b>Strategy Lab</b><span>Simule paradas, pneus e Safety Car.</span></a>
      <a href="#/wars"><span>${GW.ic('swords')}</span><b>Driver Wars</b><span>Compare pilotos por indicadores.</span></a>
    </div>
    <div class="card-h mt"><h2>Calendário ${y}</h2><a class="btn sm" href="#/seasons/${y}">Ver completo</a></div>
    <div class="cal">${st.map(({ r, s }) => `<a class="race-card ${s} ${r === nextR ? 'next' : ''}" href="#/seasons/${y}/${r.round}"><div class="rd"><span>R${r.round}</span><span>${esc(fmtDay(toDate(r.date)))}</span></div><h3>${esc(r.raceName.replace(' Grand Prix', ' GP'))}</h3><div class="loc">${esc(r.Circuit.Location.locality)}, ${esc(r.Circuit.Location.country)}</div><div>${s === 'done' ? '<span class="chip">concluída</span>' : r === nextR ? '<span class="chip next">próxima</span>' : '<span class="chip">futura</span>'}${r.Sprint ? ' <span class="chip red">sprint</span>' : ''}</div></a>`).join('')}</div>`;
    if (nextR) (async () => { try { const keys = await fetch('data/circuit-keys.json').then((r) => r.json()); const key = keys[nextR.Circuit.circuitId]; if (!key) return; const mv = await GW.MV.circuit(key, y).catch(() => null) || await GW.MV.circuit(key, y - 1).catch(() => null); const h = $('#htrack'); if (!mv || !h || !GW.alive(tk)) return; const r = ((mv.rotation || 0) * Math.PI) / 180, cs = Math.cos(r), sn = Math.sin(r), P = mv.x.map((x, i) => [x * cs - mv.y[i] * sn, -(x * sn + mv.y[i] * cs)]), xs = P.map((q) => q[0]), ys = P.map((q) => q[1]), x0 = Math.min(...xs), y0 = Math.min(...ys), w = Math.max(...xs) - x0, hh = Math.max(...ys) - y0, m = Math.max(w, hh) || 1, pad = m * 0.08; h.innerHTML = `<svg viewBox="0 0 ${(w + pad * 2).toFixed(0)} ${(hh + pad * 2).toFixed(0)}"><path d="M${P.map((q) => `${(q[0] - x0 + pad).toFixed(0)} ${(q[1] - y0 + pad).toFixed(0)}`).join('L')}Z" fill="none" stroke="#e10600" stroke-opacity=".28" stroke-width="${(m / 12).toFixed(0)}" stroke-linejoin="round"/><path d="M${P.map((q) => `${(q[0] - x0 + pad).toFixed(0)} ${(q[1] - y0 + pad).toFixed(0)}`).join('L')}Z" fill="none" stroke="#f1f3fa" stroke-width="${(m / 50).toFixed(0)}" stroke-linejoin="round" stroke-linecap="round"/></svg>`; } catch { /* sem traçado */ } })();
    let stop;
    if (liveS || nextSess) {
      const hms = (ms) => { const t = Math.max(0, Math.round(ms / 1000)), h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60); return `${h ? h + ':' + String(m).padStart(2, '0') : m}:${String(t % 60).padStart(2, '0')}`; };
      const tick = () => {
        if (liveS) { const r = $('#lrem'), p = $('#lprog'); if (!r) return; const now = Date.now(); r.textContent = hms(+liveS.end - now); if (p) p.style.width = Math.min(100, Math.max(0, ((now - +liveS.start) / (+liveS.end - +liveS.start)) * 100)) + '%'; if (now > +liveS.end) { clearInterval(iv); GW.reload(); } return; }
        const c = $('#cd'); if (!c) return; let t = Math.max(0, (+nextSess.start - Date.now()) / 1000); if (t <= 0) { clearInterval(iv); GW.reload(); return; } const d = Math.floor(t / 86400); t -= d * 86400; const h = Math.floor(t / 3600); t -= h * 3600; const m = Math.floor(t / 60); c.innerHTML = [['dias', d], ['horas', h], ['min', m], ['seg', Math.floor(t - m * 60)]].map(([k, v]) => `<div><b>${String(v).padStart(2, '0')}</b><span>${k}</span></div>`).join('');
      };
      tick(); const iv = setInterval(tick, 1000); stop = () => clearInterval(iv);
    }
    // destaques (carregamento progressivo)
    GW.seasonData(y).then((sd) => {
      if (!GW.alive(tk)) return; const h = $('#hl', el); if (!h) return;
      const arr = [...sd.drivers.values()], by = (k) => arr.slice().sort((a, b) => b[k] - a[k]);
      const w = by('wins')[0], po = by('podiums')[0], pl = by('poles')[0], fl = by('fl')[0], dn = by('dnf')[0];
      const card = (k, e, v, d) => `<div class="stat"><span class="k">${k}</span><span class="v">${v}</span><span class="d">${d}</span></div>`;
      h.innerHTML = [
        leader && second ? card('Vantagem do líder', 0, `${GW.pts(+leader.points - +second.points)} pts`, `${esc(leader.Driver.familyName)} sobre ${esc(second.Driver.familyName)}`) : '',
        w ? card('Mais vitórias', 0, w.wins, esc(GW.fullName(w.driver))) : '', pl ? card('Mais poles', 0, pl.poles, esc(GW.fullName(pl.driver))) : '',
        po ? card('Mais pódios', 0, po.podiums, esc(GW.fullName(po.driver))) : '', fl ? card('Mais voltas rápidas', 0, fl.fl, esc(GW.fullName(fl.driver))) : '',
        card('Vencedores diferentes', 0, arr.filter((a) => a.wins > 0).length, `em ${sd.done.length} corridas`), dn ? card('Mais abandonos', 0, dn.dnf, esc(GW.fullName(dn.driver))) : '',
        card('Pontos ainda em jogo', 0, `${sched.length - sd.done.length} GPs`, 'restantes no calendário')].join('');
    }).catch((e) => { const h = $('#hl', el); if (h) h.innerHTML = GW.error(e); });
    return stop;
  };

  /* ---------- TEMPORADAS ---------- */
  GW.pages.seasons = async (p, el, tk) => {
    await J.init();
    const years = await J.seasons(); const y = +p[0] || GW.ctx.year || GW.currentYear, round = p[1];
    const sched = await J.schedule(y); if (!GW.alive(tk)) return;
    GW.setCtx({ year: y });
    const st = sched.map((r) => ({ r, s: GW.raceStatus(r) }));
    const sel = round && sched.find((r) => r.round === round);
    el.innerHTML = `<div class="page-head"><div><span class="eyebrow">Temporadas</span><h1>Calendário ${y}</h1><p class="sub">${sched.length} Grandes Prêmios · ${y === GW.currentYear ? 'temporada em curso' : 'temporada concluída (dados históricos)'} · nomenclatura de sprint conforme ${y}.</p></div>
      <div class="row">${GW.ctl('sy', 'Temporada', GW.options(years.map((v) => [v, v]), y))}</div></div>
      ${sel ? '<div id="detail"></div>' : ''}
      <div class="cal">${st.length ? st.map(({ r, s }) => `<a class="race-card ${s} ${r.round === round ? 'next' : ''}" href="#/seasons/${y}/${r.round}"><div class="rd"><span>R${r.round}</span><span>${esc(fmtDay(toDate(r.date)))}</span></div><h3>${esc(r.raceName)}</h3><div class="loc">${esc(r.Circuit.circuitName)}</div><div class="loc">${esc(r.Circuit.Location.locality)}, ${esc(r.Circuit.Location.country)}</div><div>${s === 'done' ? '<span class="chip">concluída</span>' : s === 'live' ? '<span class="chip live">em andamento</span>' : '<span class="chip next">futura</span>'}${r.Sprint ? ' <span class="chip red">sprint</span>' : ''}</div></a>`).join('') : GW.empty('Calendário indisponível', 'Não há etapas cadastradas para esta temporada.')}</div>`;
    $('#sy', el).onchange = (e) => GW.go(`seasons/${e.target.value}`);
    if (sel) {
      const w = GW.weekend(sel), i = sched.indexOf(sel), rc = sel.Circuit, started = w.some((s) => s.status !== 'future');
      $('#detail', el).innerHTML = `<div class="card" style="margin-bottom:20px"><div class="card-h"><div><span class="eyebrow">Etapa ${sel.round} de ${sched.length}</span><h2 style="font-size:24px">${esc(sel.raceName)}</h2><p class="tx2">${esc(rc.circuitName)} · ${esc(rc.Location.locality)}, ${esc(rc.Location.country)}</p></div>
        <div class="row">${i > 0 ? `<a class="btn sm" href="#/seasons/${y}/${sched[i - 1].round}">← ${esc(sched[i - 1].raceName.replace(' Grand Prix', ''))}</a>` : ''}${i < sched.length - 1 ? `<a class="btn sm" href="#/seasons/${y}/${sched[i + 1].round}">${esc(sched[i + 1].raceName.replace(' Grand Prix', ''))} →</a>` : ''}</div></div>
        <div class="sess-list">${w.map((s) => { const h = sessHref(y, sel.round, s); return `<${h ? `a href="${h}"` : 'div'} class="sess ${s.status}${h ? ' go' : ''}"><span class="n">${esc(s.name)}</span><span class="t">${esc(fmtDT(s.start))} ${U.tzShort()}</span>${h ? `<span class="chip">ver resultado</span>${GW.ic('chev')}` : `<span class="chip ${s.status === 'future' ? 'next' : 'live'}">${s.status === 'future' ? 'futura' : 'em andamento'}</span>`}</${h ? 'a' : 'div'}>`; }).join('')}</div>
        <div class="row mt-s">${started ? `<a class="btn" href="#/results/${y}/${sel.round}">${GW.ic('flag')} Resultados</a>${y >= 2023 ? `<a class="btn" href="#/telemetry/${y}/${sel.round}">${GW.ic('pulse')} Telemetry Lab</a>` : ''}` : '<span class="chip next">Resultados e telemetria são liberados quando o fim de semana começa</span>'}<a class="btn" href="#/circuits/${rc.circuitId}/${y}">${GW.ic('map')} Circuito</a></div></div>`;
      $('#detail', el).scrollIntoView({ block: 'nearest' });
    }
  };

  /* ---------- RESULTADOS ---------- */
  const OF_NAMES = { fp1: ['Practice 1'], fp2: ['Practice 2'], fp3: ['Practice 3'], sq: ['Sprint Qualifying', 'Sprint Shootout'] };
  GW.pages.results = async (p, el, tk) => {
    await J.init();
    const years = await J.seasons(); const y = +p[0] || GW.ctx.year || GW.currentYear;
    const sched = await J.schedule(y); if (!GW.alive(tk)) return;
    const started = (r) => GW.raceStatus(r) !== 'future', open = sched.filter(started);
    if (!open.length) { el.innerHTML = `<div class="page-head"><div><span class="eyebrow">Resultados</span><h1>Temporada ${y}</h1></div></div>` + GW.empty('Nenhuma etapa disputada ainda', 'Os resultados aparecem aqui assim que o primeiro fim de semana começar.'); return; }
    const ok = (r) => r && open.includes(r);
    const round = ok(sched.find((r) => r.round === p[1])) ? p[1] : (ok(sched.find((r) => +r.round === GW.ctx.round)) && GW.ctx.year === y ? String(GW.ctx.round) : ([...open].reverse().find((r) => GW.raceStatus(r) === 'done') || open.at(-1)).round);
    const race = sched.find((r) => r.round === round); const wk = GW.weekend(race), modern = y >= 2023;
    const has = (k) => wk.some((s) => s.key === k && s.status !== 'future');
    const avail = [...(has('RACE') ? [['race', 'Corrida']] : []), ...(has('Q') ? [['qualifying', 'Classificação']] : []), ...(has('SPRINT') ? [['sprint', 'Sprint']] : []), ...(modern && has('SQ') ? [['sq', wk.find((s) => s.key === 'SQ').name]] : []), ...(modern ? ['FP1', 'FP2', 'FP3'].filter(has).map((k) => [k.toLowerCase(), 'Treino Livre ' + k[2]]) : [])];
    if (!avail.length) avail.push(['race', 'Corrida']);
    const ses = avail.find((a) => a[0] === p[2]) ? p[2] : avail[0][0];
    GW.setCtx({ year: y, round: +round, session: ses });
    el.innerHTML = `<div class="page-head"><div><span class="eyebrow">Resultados</span><h1>${esc(race?.raceName || 'Resultados')}</h1><p class="sub">${race ? `${esc(race.Circuit.circuitName)} · ${esc(fmtDay(toDate(race.date)))} ${y}` : ''}</p></div>
      <div class="row">${GW.ctl('ry', 'Temporada', GW.options(years.map((v) => [v, v]), y))}${GW.ctl('rr', 'Grande Prêmio', GW.options(open.map((r) => [r.round, `R${r.round} · ${r.raceName.replace(' Grand Prix', '')}`]), round))}${GW.ctl('rs', 'Sessão', GW.options(avail, ses))}</div></div>
      <div class="tabs" id="rtabs">${[['res', 'Resultado', jkind(ses)], ['pit', 'Pit stops', ses === 'race' && y >= 2011], ['tyre', 'Pneus (stints)', ses === 'race' && modern], ['laps', 'Melhores voltas e setores', modern]].filter((t) => t[2]).map((t) => `<button data-t="${t[0]}">${t[1]}</button>`).join('')}</div>
      <div id="rbody">${GW.loading()}</div>`;
    const nav = (yy, rr, ss) => GW.go(`results/${yy}/${rr}/${ss}`);
    $('#ry', el).onchange = (e) => nav(e.target.value, 1, 'race'); $('#rr', el).onchange = (e) => nav(y, e.target.value, ses); $('#rs', el).onchange = (e) => nav(y, round, e.target.value);
    const body = $('#rbody', el); let tab = jkind(ses) ? 'res' : 'laps'; $$('#rtabs button', el).forEach((b) => b.classList.toggle('on', b.dataset.t === tab));
    const setTab = async (t) => {
      tab = t; $$('#rtabs button', el).forEach((b) => b.classList.toggle('on', b.dataset.t === t)); body.innerHTML = GW.loading();
      clearTimeout(el._rt); try { await ({ res: tabRes, pit: tabPit, tyre: tabTyre, laps: tabLaps }[t])(body, y, round, ses, race, tk); } catch (e) { if (GW.alive(tk)) { body.innerHTML = GW.error(e, true); const b = $('[data-retry]', body); if (b) b.onclick = () => setTab(t); if (/ainda não estão disponíveis/.test(e.message || '')) el._rt = setTimeout(() => { if (GW.alive(tk) && tab === t) setTab(t); }, 30000); } }
    };
    $$('#rtabs button', el).forEach((b) => (b.onclick = () => setTab(b.dataset.t))); setTab(tab);
  };
  const jkind = (s) => ({ race: 'results', qualifying: 'qualifying', sprint: 'sprint' }[s]);
  async function tabRes(body, y, r, ses, race, tk) {
    if (!jkind(ses)) { body.innerHTML = `<div class="banner info">Treinos livres não têm classificação final. Veja a aba <b>Melhores voltas e setores</b> </div>`; return; }
    const { rows, race: rc } = await J.session(y, r, jkind(ses)); if (!GW.alive(tk)) return;
    if (!rows.length) { body.innerHTML = GW.empty('Sem resultados', GW.raceStatus(race) === 'future' ? 'Esta sessão ainda não aconteceu.' : 'O resultado ainda não foi publicado.'); return; }
    const isQ = ses === 'qualifying'; const leadLaps = Math.max(...rows.map((x) => +x.laps || 0));
    const cols = isQ ? [
      { k: 'p', label: 'Pos', render: (x) => posTxt(x), sort: (x) => +x.position, cls: 'pos' }, { k: 'n', label: '#', render: (x) => esc(x.number) },
      { k: 'd', label: 'Piloto', render: (x) => drvLink(y, x.Driver), sort: (x) => x.Driver.familyName }, { k: 't', label: 'Equipe', render: (x) => teamCell(x.Constructor), sort: (x) => x.Constructor.name },
      ...['Q1', 'Q2', 'Q3'].map((q) => ({ k: q, label: q, num: true, render: (x) => x[q] ? esc(x[q]) : NA, sort: (x) => U.parseLap(x[q]) })),
      { k: 'g', label: 'Gap pole', num: true, render: (x) => { const t = U.parseLap([x.Q3, x.Q2, x.Q1].find(Boolean)), pt = U.parseLap([rows[0].Q3, rows[0].Q2, rows[0].Q1].find(Boolean)); return isNum(t) && +x.position > 1 && ([x.Q3, x.Q2, x.Q1].find(Boolean) && (x.Q3 ? rows[0].Q3 : x.Q2 ? rows[0].Q2 : rows[0].Q1)) && (x.Q3 || x.Q2 || x.Q1) ? deltaStr(t - U.parseLap(x.Q3 ? rows[0].Q3 : x.Q2 ? rows[0].Q2 : rows[0].Q1)) : NA; }, sort: () => null }]
      : [{ k: 'p', label: 'Pos', render: posTxt, sort: (x) => +x.position, cls: 'pos' }, { k: 'n', label: '#', render: (x) => esc(x.number) }, { k: 'd', label: 'Piloto', render: (x) => drvLink(y, x.Driver), sort: (x) => x.Driver.familyName }, { k: 't', label: 'Equipe', render: (x) => teamCell(x.Constructor), sort: (x) => x.Constructor.name },
        { k: 'g', label: 'Grid', num: true, render: (x) => (x.grid === '0' ? 'PL' : esc(x.grid)), sort: (x) => +x.grid }, { k: 'l', label: 'Voltas', num: true, render: (x) => esc(x.laps), sort: (x) => +x.laps },
        { k: 'ti', label: 'Tempo / Gap', num: true, render: (x) => (x.Time ? esc(x.Time.time) : esc(x.status)), sort: (x) => +x.position }, { k: 's', label: 'Status', render: (x) => (GW.finished(x) ? `<span class="muted">${esc(x.status)}</span>` : `<span class="down">${esc(x.status)}</span>`), sort: (x) => x.status },
        { k: 'fl', label: 'Melhor volta', num: true, render: (x) => (x.FastestLap ? `<span class="${x.FastestLap.rank === '1' ? 'best' : ''}" title="Rank ${x.FastestLap.rank} · volta ${x.FastestLap.lap}">${esc(x.FastestLap.Time.time)}</span>` : NA), sort: (x) => U.parseLap(x.FastestLap?.Time.time) },
        { k: 'pt', label: 'Pts', num: true, render: (x) => GW.pts(x.points), sort: (x) => +x.points }];
    body.innerHTML = `<div class="card flush"><div class="card-h" style="padding:14px 18px 0"><h2>${esc(rc.raceName)} — ${ses === 'race' ? 'Corrida' : ses === 'qualifying' ? 'Classificação' : 'Sprint'}</h2>${GW.src('Jolpica-F1', GW.cachedAt(`https://api.jolpi.ca/ergast/f1/${y}/${r}/${jkind(ses)}.json?limit=100`))}</div><div id="tb"></div></div>
      ${ses !== 'qualifying' ? `<p class="note mt-s">${GW.ic('info')}<span>PL = largada dos boxes. Roxo = volta mais rápida da corrida. Sistema de pontuação conforme regulamento de ${y}. Clique nos cabeçalhos para ordenar.</span></p>` : ''}`;
    GW.table($('#tb', body), cols, rows, { sortKey: 'p', rowClass: (x) => (+x.position <= 3 ? 'p' + x.position : '') });
  }
  async function tabPit(body, y, r, ses, race, tk) {
    const ps = await J.pitstops(y, r); if (!GW.alive(tk)) return;
    if (!ps.length) { body.innerHTML = GW.empty('Sem pit stops', 'Não há registro de pit stops para esta corrida (disponível a partir de 2011).'); return; }
    const { rows } = await J.session(y, r, 'results'); const dm = new Map(rows.map((x) => [x.Driver.driverId, x]));
    const laps = Math.max(...rows.map((x) => +x.laps)); const dur = ps.map((s) => +s.duration).filter(isNum);
    body.innerHTML = `<div class="grid g-main"><div class="card"><div class="card-h"><h2>Cronologia de paradas</h2></div><div class="legend"><span>Cada marca = uma parada, na volta indicada</span></div><div id="gantt"></div></div>
      <div class="card"><div class="card-h"><h2>Resumo</h2></div><dl class="kv"><dt>Paradas</dt><dd>${ps.length}</dd><dt>Mais rápida</dt><dd>${Math.min(...dur).toFixed(3)} s</dd><dt>Mediana</dt><dd>${U.median(dur).toFixed(3)} s</dd><dt>Mais lenta</dt><dd>${Math.max(...dur).toFixed(3)} s</dd></dl><p class="note mt-s">${GW.ic('info')}<span>Duração = tempo total no pit lane, não apenas o tempo parado.</span></p></div></div>
      <div class="card flush mt"><div id="pt"></div></div>`;
    const order = rows.map((x) => x.Driver.driverId);
    $('#gantt', body).innerHTML = order.map((id) => { const x = dm.get(id); const mine = ps.filter((s) => s.driverId === id); return `<div class="stint-row"><span>${esc(x.Driver.code || x.Driver.familyName)}</span><div class="stint-track" style="background:#121827">${mine.map((s) => `<i title="Volta ${s.lap}: ${s.duration}s" style="position:absolute;left:${(s.lap / laps) * 100}%;width:6px;height:100%;background:${tc(x.Constructor.constructorId, x.Constructor.name)};border:0;"></i>`).join('')}</div></div>`; }).join('');
    GW.table($('#pt', body), [{ k: 'd', label: 'Piloto', render: (s) => { const x = dm.get(s.driverId); return x ? `<span class="team-bar" style="background:${tc(x.Constructor.constructorId, x.Constructor.name)}"></span>${drvLink(y, x.Driver)}` : esc(s.driverId); }, sort: (s) => s.driverId }, { k: 'stop', label: 'Parada', num: true, render: (s) => s.stop, sort: (s) => +s.stop }, { k: 'lap', label: 'Volta', num: true, render: (s) => s.lap, sort: (s) => +s.lap }, { k: 'time', label: 'Hora local da pista', num: true, render: (s) => esc(s.time) }, { k: 'dur', label: 'Duração (s)', num: true, render: (s) => esc(s.duration), sort: (s) => +s.duration }], ps, { sortKey: 'dur' });
  }
  /** sigla / sobrenome da telemetria -> driverId (para linkar ao perfil) */
  async function driverLinks(y) {
    const m = new Map(); (await J.drivers(y).catch(() => [])).forEach((d) => { if (d.code) m.set(d.code, d.driverId); m.set(d.familyName.toUpperCase(), d.driverId); });
    return (d, name) => m.get(d?.name_acronym) || m.get((d?.last_name || '').toUpperCase()) || null;
  }
  async function openf1Session(y, race, names) {
    if (y < 2023) return { err: 'Este recurso está disponível para temporadas a partir de 2023.' };
    const m = await O.meetingForRace(race); if (!m) return { err: 'Dados detalhados deste GP ainda não estão disponíveis.' };
    const ss = await O.sessions(m.meeting_key); const s = ss.find((x) => names.includes(x.session_name));
    return s ? { m, s } : { err: 'Dados detalhados desta sessão ainda não estão disponíveis.' };
  }
  /** resultado pré-gerado (melhores voltas e stints): abre na hora e funciona mesmo com sessão ao vivo em andamento */
  const snapshot = (y, r, ses) => fetch(`data/snap/${y}-${r}-${ses}.json`).then((x) => (x.ok ? x.json() : null)).catch(() => null);
  async function tabTyre(body, y, r, ses, race, tk) {
    const snap = await snapshot(y, r, 'race');
    let o, st, dr;
    if (snap && snap.stints) { o = { m: { meeting_name: snap.meeting } }; st = snap.stints; dr = snap.drivers; }
    else { o = await openf1Session(y, race, ['Race']); if (o.err) { body.innerHTML = GW.empty('Stints indisponíveis', o.err); return; }
      [st, dr] = await Promise.all([O.stints(o.s.session_key), O.drivers(o.s.session_key)]); }
    if (!GW.alive(tk)) return;
    if (!st.length) { body.innerHTML = GW.empty('Sem dados de pneus', 'Não há registro de stints para esta corrida.'); return; }
    const dmap = new Map(dr.map((d) => [d.driver_number, d])); const total = Math.max(...st.map((s) => s.lap_end || 0)); const idOf = await driverLinks(y);
    const by = {}; st.forEach((s) => (by[s.driver_number] = by[s.driver_number] || []).push(s));
    body.innerHTML = `<div class="card"><div class="card-h"><h2>Estratégia de pneus — ${esc(o.m.meeting_name)}</h2><div>${GW.src('OpenF1')}</div></div>
      <div class="legend">${Object.entries({ SOFT: 'Macio', MEDIUM: 'Médio', HARD: 'Duro', INTERMEDIATE: 'Intermediário', WET: 'Chuva' }).map(([k, v]) => `<span><i class="dot" style="background:${GW.COMPOUND[k]}"></i>${v}</span>`).join('')}</div>
      ${Object.entries(by).sort((a, b) => (a[1][0].driver_number) - (b[1][0].driver_number)).map(([n, ss]) => { const d = dmap.get(+n); return `<div class="stint-row">${idOf(d) ? `<a href="#/drivers/${y}/${idOf(d)}" title="${esc(d?.full_name || '')}">${esc(d.name_acronym)}</a>` : `<span title="${esc(d?.full_name || '')}">${esc(d?.name_acronym || '#' + n)}</span>`}<div class="stint-track">${ss.sort((a, b) => a.stint_number - b.stint_number).map((s) => { const w = (((s.lap_end || total) - s.lap_start + 1) / total) * 100; return `<i title="Volta ${s.lap_start}–${s.lap_end ?? '?'} · ${s.compound || 'desconhecido'} · pneu com ${s.tyre_age_at_start ?? '?'} voltas no início" style="width:${w}%;background:${GW.COMPOUND[s.compound] || '#555'}">${w > 7 ? (s.lap_end || total) - s.lap_start + 1 : ''}</i>`; }).join('')}</div></div>`; }).join('')}
      <p class="note mt-s">${GW.ic('info')}<span>Números = voltas no stint. Pilotos sem registro completo podem ter stints truncados.</span></p></div>`;
  }
  async function tabLaps(body, y, r, ses, race, tk) {
    const snap = await snapshot(y, r, ses); let o, rows, bs, idOf = await driverLinks(y);
    if (snap && snap.rows) { o = { s: { session_name: snap.name, session_key: snap.sk } }; rows = snap.rows.map((x) => ({ ...x })); bs = snap.bs; }
    else {
      const names = OF_NAMES[ses] || { race: ['Race'], qualifying: ['Qualifying'], sprint: ['Sprint'] }[ses];
      o = await openf1Session(y, race, names); if (o.err) { body.innerHTML = GW.empty('Voltas indisponíveis', o.err); return; }
      const [laps, dr] = await Promise.all([O.get('laps', { session_key: o.s.session_key }), O.drivers(o.s.session_key)]); if (!GW.alive(tk)) return;
      const dmap = new Map(dr.map((d) => [d.driver_number, d])); const best = new Map();
      laps.forEach((l) => { if (isNum(l.lap_duration) && !l.is_pit_out_lap) { const b = best.get(l.driver_number); if (!b || l.lap_duration < b.lap_duration) best.set(l.driver_number, l); } });
      rows = [...best.values()].map((l) => ({ l, d: dmap.get(l.driver_number), n: laps.filter((x) => x.driver_number === l.driver_number).length }));
      bs = [1, 2, 3].map((i) => Math.min(...laps.filter((l) => isNum(l['duration_sector_' + i])).map((l) => l['duration_sector_' + i])));
    }
    if (!GW.alive(tk)) return;
    if (!rows.length) { body.innerHTML = GW.empty('Sem voltas cronometradas', 'Não há voltas cronometradas registradas para esta sessão.'); return; }
    const fastest = Math.min(...rows.map((x) => x.l.lap_duration));
    rows.sort((a, b) => a.l.lap_duration - b.l.lap_duration); rows.forEach((x, i) => (x.pos = i + 1));
    const sc = (i) => ({ k: 's' + i, label: 'S' + i, num: true, render: (x) => { const v = x.l['duration_sector_' + i]; return isNum(v) ? `<span class="${v === bs[i - 1] ? 'best' : ''}">${v.toFixed(3)}</span>` : NA; }, sort: (x) => x.l['duration_sector_' + i] });
    body.innerHTML = `<div class="card flush"><div class="card-h" style="padding:14px 18px 0"><h2>Melhor volta por piloto — ${esc(o.s.session_name)}</h2><div>${GW.src('OpenF1')}</div></div><div id="lt"></div></div>
      <p class="note mt-s">${GW.ic('info')}<span>Melhor volta válida exceto voltas de saída dos boxes. Roxo = melhor setor da sessão. Voltas apagadas pela direção de prova podem não estar sinalizadas.</span></p>`;
    GW.table($('#lt', body), [{ k: 'pos', label: 'Pos', render: (x) => x.pos, cls: 'pos', sort: (x) => x.pos }, { k: 'n', label: '#', render: (x) => x.l.driver_number }, { k: 'd', label: 'Piloto', render: (x) => `<span class="team-bar" style="background:#${x.d?.team_colour || '888'}"></span>${idOf(x.d) ? `<a href="#/drivers/${y}/${idOf(x.d)}">${esc(x.d.full_name)}</a>` : esc(x.d?.full_name || '#' + x.l.driver_number)}`, sort: (x) => x.d?.full_name || '' }, { k: 'tm', label: 'Equipe', render: (x) => esc(x.d?.team_name || '—') },
      { k: 'lt', label: 'Melhor volta', num: true, render: (x) => `<span class="${x.l.lap_duration === fastest ? 'best' : ''}">${lapTime(x.l.lap_duration)}</span>`, sort: (x) => x.l.lap_duration }, { k: 'gp', label: 'Gap', num: true, render: (x) => (x.pos === 1 ? '—' : deltaStr(x.l.lap_duration - fastest)), sort: (x) => x.l.lap_duration }, sc(1), sc(2), sc(3),
      { k: 'ln', label: 'Volta nº', num: true, render: (x) => x.l.lap_number, sort: (x) => x.l.lap_number }, { k: 'st', label: 'Vel. máx. (trap)', num: true, render: (x) => val(x.l.st_speed, (v) => v + ' km/h'), sort: (x) => x.l.st_speed }, { k: 'tt', label: 'Voltas', num: true, render: (x) => x.n, sort: (x) => x.n },
      { k: 'tl', label: '', nosort: true, render: (x) => `<a class="btn sm" href="#/telemetry/${y}/${r}/${o.s.session_key}/${x.l.driver_number}/${x.l.lap_number}">Telemetria</a>` }], rows, { sortKey: 'pos' });
  }

  /* ---------- CAMPEONATOS ---------- */
  GW.pages.championships = async (p, el, tk) => {
    await J.init();
    const years = await J.seasons(); const y = +p[0] || GW.ctx.year || GW.currentYear; const type = ['drivers', 'constructors', 'champions'].includes(p[1]) ? p[1] : 'drivers';
    GW.setCtx({ year: y });
    el.innerHTML = `<div class="page-head"><div><span class="eyebrow">Campeonatos</span><h1>${type === 'champions' ? 'Campeões mundiais' : 'Campeonato de ' + (type === 'drivers' ? 'Pilotos' : 'Construtores')} ${type === 'champions' ? '' : y}</h1><p class="sub">${type === 'champions' ? 'Campeões por temporada, pela classificação final de cada temporada.' : 'Pontuação oficial por etapa conforme o regulamento de ' + y + (y < 1958 ? ' (construtores não disputado)' : '') + '.'}</p></div>
      <div class="row">${type !== 'champions' ? GW.ctl('cy', 'Temporada', GW.options(years.map((v) => [v, v]), y)) : ''}<div class="seg" role="tablist"><button data-t="drivers" class="${type === 'drivers' ? 'on' : ''}">Pilotos</button><button data-t="constructors" class="${type === 'constructors' ? 'on' : ''}">Construtores</button><button data-t="champions" class="${type === 'champions' ? 'on' : ''}">Campeões</button></div></div></div><div id="cb">${GW.loading()}</div>`;
    $$('.seg button', el).forEach((b) => (b.onclick = () => GW.go(`championships/${y}/${b.dataset.t}`)));
    const cy = $('#cy', el); if (cy) cy.onchange = (e) => GW.go(`championships/${e.target.value}/${type}`);
    const cb = $('#cb', el);
    if (type === 'champions') {
      const yrs = (await J.seasons()).filter((v) => v < GW.currentYear); const rows = [], count = {};
      cb.innerHTML = `<div class="grid g-main"><div class="card flush"><div class="card-h" style="padding:14px 18px 0"><h2>Campeões</h2><span class="meta" id="cprog"></span></div><div id="ct"></div></div><div class="card"><div class="card-h"><h2>Mais títulos</h2></div><div id="cn"></div><p class="note mt-s">${GW.ic('info')}<span>Épocas diferentes têm regras e números de corridas distintos.</span></p></div></div>`;
      const cols = [{ k: 'y', label: 'Ano', render: (x) => `<a href="#/championships/${x.y}/drivers">${x.y}</a>`, sort: (x) => x.y }, { k: 'd', label: 'Piloto campeão', render: (x) => drvLink(x.y, x.s.Driver), sort: (x) => x.s.Driver.familyName }, { k: 't', label: 'Equipe', render: (x) => teamCell(x.s.Constructors[0]) }, { k: 'pt', label: 'Pts', num: true, render: (x) => GW.pts(x.s.points), sort: (x) => +x.s.points }, { k: 'w', label: 'Vitórias', num: true, render: (x) => x.s.wins, sort: (x) => +x.s.wins }];
      const paint = () => { if (!GW.alive(tk)) return; GW.table($('#ct', cb), cols, rows, { sortKey: 'y', desc: true }); $('#cprog', cb).textContent = `${rows.length}/${yrs.length} temporadas`; $('#cn', cb).innerHTML = Object.entries(count).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([id, n]) => { const x = rows.find((r) => r.s.Driver.driverId === id).s.Driver; return `<div class="bar-row"><span>${esc(GW.fullName(x))}</span><div class="tr"><i style="width:${(n / 7) * 100}%;background:var(--red)"></i></div><span class="v">${n}</span></div>`; }).join(''); };
      for (let i = 0; i < yrs.length; i += 6) {
        const chunk = await Promise.all(yrs.slice(i, i + 6).map((yy) => J.raw(`${yy}/driverstandings/1.json`, yy).then((d) => d.StandingsTable.StandingsLists[0]).catch(() => null)));
        chunk.filter(Boolean).forEach((l) => { rows.push({ y: +l.season, s: l.DriverStandings[0] }); const id = l.DriverStandings[0].Driver.driverId; count[id] = (count[id] || 0) + 1; });
        paint(); if (!GW.alive(tk)) return;
      }
      return;
    }
    let sd, std, prev;
    try {
      sd = await GW.seasonData(y); const st = type === 'drivers' ? await J.driverStandings(y) : await J.constructorStandings(y);
      std = st; prev = st.round > 1 && y === GW.currentYear ? await (type === 'drivers' ? J.driverStandings(y, st.round - 1) : J.constructorStandings(y, st.round - 1)).catch(() => null) : null;
    } catch (e) { cb.innerHTML = GW.error(e); return; }
    if (!GW.alive(tk)) return;
    if (!std.rows.length) { cb.innerHTML = GW.empty('Sem classificação', `Não há classificação de ${type === 'drivers' ? 'pilotos' : 'construtores'} para ${y}.`); return; }
    const prevPos = new Map((prev?.rows || []).map((r) => [(r.Driver || r.Constructor)[type === 'drivers' ? 'driverId' : 'constructorId'], +r.position]));
    const doneR = sd.done; let rows;
    if (type === 'drivers') rows = std.rows.map((r) => { const e = sd.drivers.get(r.Driver.driverId); return { id: r.Driver.driverId, pos: +r.position, pt: +r.points, w: +r.wins, d: r.Driver, c: r.Constructors, e, pod: e?.podiums, pl: e?.poles, fl: e?.fl, dp: prevPos.has(r.Driver.driverId) ? prevPos.get(r.Driver.driverId) - +r.position : null }; });
    else rows = std.rows.map((r) => { const t = sd.teams.get(r.Constructor.constructorId); return { id: r.Constructor.constructorId, pos: +r.position, pt: +r.points, w: +r.wins, cc: r.Constructor, t, pod: t?.podiums, pl: t?.poles, dp: prevPos.has(r.Constructor.constructorId) ? prevPos.get(r.Constructor.constructorId) - +r.position : null }; });
    const dp = (x) => (x.dp == null ? '' : x.dp > 0 ? `<span class="up" title="subiu ${x.dp}">▲${x.dp}</span>` : x.dp < 0 ? `<span class="down" title="caiu ${-x.dp}">▼${-x.dp}</span>` : '<span class="muted">•</span>');
    const cols = [{ k: 'pos', label: 'Pos', cls: 'pos', render: (x) => x.pos + ' ' + dp(x), sort: (x) => x.pos },
      type === 'drivers' ? { k: 'n', label: 'Piloto', render: (x) => `${GW.flag(x.d.nationality)} ${drvLink(y, x.d)}`, sort: (x) => x.d.familyName } : { k: 'n', label: 'Equipe', render: (x) => teamCell(x.cc), sort: (x) => x.cc.name },
      ...(type === 'drivers' ? [{ k: 'c', label: 'Equipe', render: (x) => x.c.map(teamCell).join(' / '), sort: (x) => x.c[0]?.name }] : []),
      { k: 'pt', label: 'Pontos', num: true, render: (x) => `<b>${GW.pts(x.pt)}</b>`, sort: (x) => x.pt }, { k: 'w', label: 'Vitórias', num: true, render: (x) => x.w, sort: (x) => x.w }, { k: 'pod', label: 'Pódios', num: true, render: (x) => val(x.pod), sort: (x) => x.pod },
      { k: 'pl', label: 'Poles', num: true, render: (x) => val(x.pl), sort: (x) => x.pl }, ...(type === 'drivers' ? [{ k: 'fl', label: 'V. rápidas', num: true, render: (x) => val(x.fl), sort: (x) => x.fl }] : []),
      ...doneR.map((rn) => ({ k: 'r' + rn, label: 'R' + rn, num: true, nosort: false, render: (x) => { if (type === 'drivers') { const c = x.e?.rounds[rn]; if (!c || c.pos == null) return c?.spr != null ? `<span class="muted" title="Só sprint">s${c.spr}</span>` : NA; const cls = c.pos === 1 ? 'up' : c.pos <= 3 ? '' : /^\d+$/.test(c.text) ? 'muted' : 'down'; return `<span class="${cls}" title="${esc(sd.res[rn - 1]?.raceName || '')}: P${c.text}${c.spr != null ? ' · sprint ' + c.spr + ' pts' : ''}">${/^\d+$/.test(c.text) ? c.pos : c.text}</span>`; } const v = x.t?.rounds[rn]; return isNum(v) ? GW.pts(v) : NA; }, sort: (x) => (type === 'drivers' ? x.e?.rounds[rn]?.pos : x.t?.rounds[rn]) }))];
    cb.innerHTML = `<div class="card flush"><div class="card-h" style="padding:14px 18px 0"><h2>Classificação após a etapa ${std.round}</h2>${GW.src('Jolpica-F1', GW.cachedAt(`https://api.jolpi.ca/ergast/f1/${y}/${type === 'drivers' ? 'driverstandings' : 'constructorstandings'}.json?limit=100`))}</div><div id="st"></div></div>
      <p class="note mt-s">${GW.ic('info')}<span>${type === 'drivers' ? 'Colunas R# = posição final na corrida (R = abandono, D = desclassificado). ' : 'Colunas R# = pontos da equipe na etapa (corrida + sprint). '}▲▼ = variação de posição desde a etapa anterior. Pódios, poles e voltas rápidas são calculados a partir dos resultados por etapa (derivado).</span></p>
      <div class="card mt"><div class="card-h"><h2>Evolução de pontos</h2></div><div id="pc"></div></div>`;
    GW.table($('#st', cb), cols, rows, { sortKey: 'pos', rowClass: (x) => (x.pos <= 3 ? 'p' + x.pos : '') });
    // evolução
    const palette = []; const top = rows.slice(0, 8);
    const series = top.map((x) => { let acc = 0; const col = type === 'drivers' ? tc(x.c[0]?.constructorId, x.c[0]?.name) : tc(x.id, x.cc.name); const pts = doneR.map((rn) => { acc += type === 'drivers' ? (x.e?.rounds[rn]?.pts || 0) + (x.e?.rounds[rn]?.spr || 0) : x.t?.rounds[rn] || 0; return [rn, acc]; }); return { name: type === 'drivers' ? x.d.code || x.d.familyName : x.cc.name, color: col, pts, dash: palette.includes(col) ? '5 3' : '', }; });
    series.forEach((s) => palette.push(s.color));
    GW.lineChart($('#pc', cb), { series, height: 300, legend: true, xLabel: 'Etapa', unit: 'pts', xFmt: (v) => 'R' + v, tipHead: (x) => `Após etapa ${Math.round(x)}`, xDomain: [Math.min(...doneR), Math.max(...doneR, Math.min(...doneR) + 1)], yMin0: true, title: 'Evolução de pontos' });
  };

})();
