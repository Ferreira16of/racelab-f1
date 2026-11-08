/* RaceLab — Ao vivo: cronometragem em tempo real, grid de largada e próxima sessão */
(function () {
  'use strict';
  const U = GW.util, { esc, $, $$ } = U;
  const { J } = GW;
  const two = (n) => String(n).padStart(2, '0');
  const dur = (ms) => { const t = Math.max(0, Math.round(ms / 1000)), d = Math.floor(t / 86400), h = Math.floor((t % 86400) / 3600), m = Math.floor((t % 3600) / 60), s = t % 60; return d ? `${d}d ${h}h ${two(m)}min` : h ? `${h}:${two(m)}:${two(s)}` : `${m}:${two(s)}`; };
  const hm = (d) => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  GW.pages.live = async (p, el, tk) => {
    await J.init();
    const y = GW.currentYear, sched = await J.schedule(y).catch(() => []); if (!GW.alive(tk)) return;
    const all = sched.map((r) => ({ r, w: GW.weekend(r) }));
    const curW = all.find((x) => x.w.some((s) => s.status === 'live'));
    const liveSess = curW && curW.w.find((s) => s.status === 'live');
    const nextS = all.flatMap((x) => x.w.map((s) => ({ ...s, race: x.r }))).find((s) => s.status === 'future');
    const focus = curW || (nextS && all.find((x) => x.r === nextS.race)) || all.filter((x) => x.w.length).at(-1);
    const wk = focus ? focus.w : [], race = focus && focus.r;
    const raceS = wk.find((s) => s.key === 'RACE'), qualiS = wk.find((s) => s.key === 'Q');
    const showGrid = !!(race && raceS && raceS.status === 'future' && qualiS && qualiS.status === 'done');

    const hero = liveSess
      ? `<div class="card live-wait"><div class="live-head"><span class="chip live"><i class="livedot"></i> Sessão em andamento</span><b style="font:700 22px var(--disp)">${esc(liveSess.name)}</b><span class="muted">${esc(race.raceName)}</span></div>
        <div class="lbar mt-s" aria-hidden="true"><i id="wprog"></i></div><div class="lmeta"><span>Começou às ${esc(hm(liveSess.start))}</span><span>Termina em <b id="wrem">—</b> (${esc(hm(liveSess.end))})</span></div></div>`
      : nextS
        ? `<div class="card live-wait"><div class="live-head"><span class="chip">${GW.ic('clock')} Próxima sessão</span><b style="font:700 22px var(--disp)">${esc(nextS.name)}</b><span class="muted">${esc(nextS.race.raceName)}</span></div>
          <div class="lmeta mt-s"><span>${esc(U.fmtDT(nextS.start))} (${U.tzNice()})</span><span>Começa em <b id="wrem">—</b></span></div><p class="muted" style="margin:10px 0 0">Esta página abre a cronometragem sozinha quando a sessão começar. Pode deixá-la aberta.</p></div>`
        : `<div class="card"><div class="state">${GW.ic('flag')}<h3>Temporada encerrada</h3><p>Não há mais sessões no calendário. A cronometragem da última sessão continua disponível abaixo.</p></div></div>`;

    el.innerHTML = `<div class="page-head"><div><span class="eyebrow">Acompanhe a corrida</span><h1>Ao vivo</h1><p class="sub">Tempos, posições e intervalos em tempo real durante as sessões. Antes da corrida, veja o grid de largada.</p></div></div>
      <div id="lv-hero">${hero}</div>
      ${showGrid ? '<div id="lv-grid" class="mt"></div>' : ''}
      <div id="lv-board" class="mt"></div>
      ${wk.length ? `<div class="card mt"><div class="card-h"><h2>Fim de semana · ${esc(race.raceName)}</h2><span class="meta">Horários em ${U.tzNice()} (${U.tzShort()})</span></div><div class="sess-list">${wk.map((s) => { const R = { FP1: 'fp1', FP2: 'fp2', FP3: 'fp3', SQ: 'sq', SPRINT: 'sprint', Q: 'qualifying', RACE: 'race' }[s.key], h = s.status !== 'future' && R ? `#/results/${race.season}/${race.round}/${R}` : null; return `<${h ? `a href="${h}"` : 'div'} class="sess ${s.status}${h ? ' go' : ''}"><span class="n">${esc(s.name)}</span><span class="t">${esc(U.fmtDT(s.start))}</span>${s.status === 'future' ? '' : `<span class="chip ${s.status === 'live' ? 'live' : ''}">${s.status === 'live' ? 'Ao vivo' : 'Concluída'}</span>`}${h ? GW.ic('chev') : ''}</${h ? 'a' : 'div'}>`; }).join('')}</div></div>` : ''}`;

    let stopBoard = () => {};
    liveBoard($('#lv-board', el), tk).then((f) => { if (!GW.alive(tk)) f(); else stopBoard = f; });
    if (showGrid) gridCard($('#lv-grid', el), race, tk);

    // contagem e barra de progresso; recarrega a tela quando a situação muda (sessão começa ou termina)
    const tick = () => {
      const now = Date.now(), r = $('#wrem', el), pr = $('#wprog', el);
      if (liveSess) { if (r) r.textContent = dur(+liveSess.end - now); if (pr) pr.style.width = Math.min(100, Math.max(0, ((now - +liveSess.start) / (+liveSess.end - +liveSess.start)) * 100)) + '%'; if (now > +liveSess.end + 60e3) return GW.reload(); }
      else if (nextS) { if (r) r.textContent = dur(+nextS.start - now); if (now >= +nextS.start) return GW.reload(); }
    };
    tick(); const iv = setInterval(tick, 1000);
    return () => { clearInterval(iv); stopBoard(); };
  };

  /* ---------- GRID DE LARGADA ---------- */
  GW.liveGrid = gridCard;
  async function gridCard(box, race, tk) {
    box.innerHTML = `<div class="card"><div class="card-h"><h2>Grid de largada</h2><span class="meta">${esc(race.raceName)}</span></div>${GW.loading('Montando o grid…')}</div>`;
    let rows = [];
    try { rows = (await J.session(+race.season, race.round, 'qualifying')).rows.map((x) => ({ pos: +x.position, name: `${x.Driver.givenName} ${x.Driver.familyName}`, id: x.Constructor.constructorId, team: x.Constructor.name, color: GW.teamColor(x.Constructor.constructorId, x.Constructor.name), time: [x.Q3, x.Q2, x.Q1].find(Boolean) || '' })); } catch { /* usa a transmissão */ }
    if (!rows.length) {
      const f = await GW.liveFind(race, 'Q');
      if (f) rows = (f.j.rows || []).filter((r) => r.position).sort((a, b) => a.position - b.position).map((r) => ({ pos: +r.position, name: r.driver_full_name || r.driver || '', team: r.team || '', color: r.team_colour || '#888', time: r.best_lap || '' }));
    }
    if (!GW.alive(tk)) return;
    if (!rows.length) { box.innerHTML = `<div class="card"><div class="card-h"><h2>Grid de largada</h2></div>${GW.empty('Grid em preparação', 'O grid aparece aqui assim que o resultado da classificação for publicado.')}</div>`; return; }
    const cell = (x) => `<div class="gr-c" style="--tc:${esc(x.color)}"><span class="gr-p">${esc(x.pos)}</span><span class="gr-i"></span><div class="gr-n"><b>${esc(x.name)}</b><small>${x.id ? `<span class="tl">${GW.teamLogo(x.id, 14, +race.season)}</span>` : ''}${esc(x.team)}</small></div><span class="gr-t">${esc(x.time)}</span></div>`;
    box.innerHTML = `<div class="card"><div class="card-h"><h2>Grid de largada</h2><span class="meta">${esc(race.raceName)}</span></div>
      <div class="gr-pole"><span>Pole position</span><b>${esc(rows[0].name)}</b><em>${esc(rows[0].team)}${rows[0].time ? ' · ' + esc(rows[0].time) : ''}</em></div>
      <div class="gr-grid">${rows.map(cell).join('')}</div>
      <p class="note mt-s">${GW.ic('info')}<span>Posições conforme a classificação. Punições e largadas dos boxes podem alterar a ordem final do grid.</span></p></div>`;
  }

  /* ---------- PAINEL AO VIVO (cronometragem em tempo real, grátis) ---------- */
  async function liveBoard(box, tk) {
    const links = { year: GW.currentYear, fn: await GW.liveDriverLinks(GW.currentYear) };
    let sel = null, auto = true, list = [], timer = 0, busy = false, stopped = false, lastScan = 0;
    box.innerHTML = `<div class="card lb"><div class="card-h"><h2 id="lbTitle">Cronometragem</h2><span class="meta" id="lbSt">conectando…</span></div><div id="lbPick" class="lb-pick"></div><div id="lbBody" class="mt-s"><div class="lb-load"><i class="livedot"></i> Carregando a sessão…</div></div></div>`;
    const api = (q) => fetch('/api/f1m?' + q, { cache: 'no-store' }).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); });
    const short = (x) => String(x.event || '').replace(/ ?\d{4}$/, '').replace(/^GP (d[aeo]s? )?/i, '');
    const best = () => { const act = list.filter((x) => !x.final && x.n && !x.stale).pop(); return (act || list.filter((x) => x.n).pop() || list.at(-1) || {}).id || null; };
    const pick = () => {
      const cur = list.find((x) => x.id === sel) || {}, tabs = list.filter((x) => x.event === cur.event && (x.n || x.id === sel)).sort((a, b) => a.id - b.id), P = $('#lbPick', box);
      P.hidden = tabs.length < 2;
      P.innerHTML = tabs.map((x) => `<button class="lb-tab ${x.id === sel ? 'on' : ''}" data-id="${x.id}">${!x.final && x.n && !x.stale ? '<i class="livedot"></i>' : ''}<b>${esc(x.name)}</b><span>${!x.final && x.n && !x.stale ? 'Ao vivo' : 'Encerrada'}</span></button>`).join('');
      $$('#lbPick button', box).forEach((b) => (b.onclick = () => { sel = +b.dataset.id; auto = false; pick(); tick(); }));
      const on = $('#lbPick .on', box); if (on) P.scrollLeft = on.offsetLeft - (P.clientWidth - on.offsetWidth) / 2;
    };
    const scan = async () => { const from = GW.store.get('f1mFrom', 100); list = await api('scan=1&from=' + from); lastScan = Date.now(); if (list.length) { GW.store.set('f1mFrom', Math.max(100, list[0].id - 3)); if (auto || !list.some((x) => x.id === sel)) sel = best(); pick(); } };
    const cls = (v) => { v = String(v || '').toLowerCase(); return /purple|overall|roxo/.test(v) ? ' pu' : /green|verde|personal|pb/.test(v) ? ' gr' : ''; };
    const tick = async () => {
      if (busy || stopped || !GW.alive(tk)) return; busy = true;
      const body = $('#lbBody', box), st = $('#lbSt', box);
      try {
        if (!list.length || Date.now() - lastScan > 60000) await scan();
        if (!sel) { st.textContent = 'sem sessões'; body.innerHTML = '<div class="lb-load">Ainda não há cronometragem publicada. Ela aparece aqui assim que uma sessão começar.</div>'; busy = false; return; }
        const j = await api('id=' + sel), S = j.session || {}, age = Date.now() - (j.generated_at_ms || 0), stale = !j.final && (j.critical_data_stale || age > 120000);
        const rows = (j.rows || []).filter((r) => r.position).sort((a, b) => a.position - b.position), ok = (v) => (v == null || v === '' || v === '-' ? '<i class="mu">—</i>' : esc(v));
        st.textContent = `atualizado ${new Date(j.generated_at_ms || Date.now()).toLocaleTimeString('pt-BR')}`;
        const flag = (S.status && S.status.key) || '';
        const T = $('#lbTitle', box); if (T) T.innerHTML = j.final ? 'Última sessão' : stale ? 'Cronometragem' : '<i class="livedot"></i> Cronometragem ao vivo';
        body.innerHTML = `<div class="lb-head"><div><div class="lb-ev">${esc(S.event_name || '')}</div><div class="lb-ses">${esc(S.name || '')}${S.qualifying_phase_label ? ' · ' + esc(S.qualifying_phase_label) : ''}</div></div><div class="lb-chips">${S.status ? `<span class="lb-flag ${esc(flag)}">${esc(S.status.label || '')}</span>` : ''}${S.progress ? `<span class="chip">${esc(S.progress)}</span>` : ''}${S.total_laps ? `<span class="chip">Volta ${esc(S.current_lap)}/${esc(S.total_laps)}</span>` : ''}${j.final ? '<span class="chip">Encerrada</span>' : ''}${stale ? '<span class="chip warn">Dados atrasados</span>' : ''}</div></div>
          ${!j.final && (j.api_degraded || !rows.some((r) => r.best_lap_seconds || (r.last_lap && !/BOX/i.test(r.last_lap) && r.last_lap !== '-'))) ? `<div class="banner info" style="margin-bottom:10px">${j.api_degraded ? 'A transmissão de tempos está instável agora' : 'Ainda não há voltas cronometradas'} — os tempos aparecem aqui assim que chegarem. ${esc(j.notice || '')}</div>` : ''}
          ${rows.length ? GW.liveTable(j, links) : `<div class="lb-load">${j.final ? 'Sessão sem tempos registrados.' : 'Aguardando os primeiros tempos desta sessão…'}</div>`}
          ${(j.updates || []).length ? `<div class="lb-feed">${j.updates.slice(0, 6).map((u) => `<div><span>${esc(String(u.time || '').slice(11, 16))}</span>${esc(u.text)}</div>`).join('')}</div>` : ''}`;
      } catch (e) { st.textContent = 'sem conexão'; if (!$('.lbt', body)) body.innerHTML = '<div class="lb-load">Reconectando à cronometragem…</div>'; lastScan = 0; }
      busy = false;
    };
    await tick(); timer = setInterval(tick, 5000);
    return () => { stopped = true; clearInterval(timer); };
  }
})();
