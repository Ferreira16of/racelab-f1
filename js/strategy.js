/* RaceLab F1 — Strategy Lab: simulador de estratégia (modelo analítico + Monte Carlo) */
(function () {
  'use strict';
  const U = GW.util, { esc, $, $$, isNum, lapTime, median, quantile, deltaStr } = U;
  const { O } = GW;
  const NAMES = { SOFT: 'Macio', MEDIUM: 'Médio', HARD: 'Duro', INTERMEDIATE: 'Intermediário' };
  const SL = { SOFT: 'S', MEDIUM: 'M', HARD: 'H', INTERMEDIATE: 'I' };
  const COL = ['#ff3b3b', '#4aa3ff', '#ffb020', '#2fd48a'];
  const defaults = () => ({
    laps: 57, base: 93.0, fuel: 0.035, outlap: 0.9,
    pit: { normal: 22.0, sc: 14.7, vsc: 15.6 },
    comp: { SOFT: { off: -0.55, deg: 0.085, cliff: 16, cliffPen: 0.30, src: 'assumido' }, MEDIUM: { off: 0, deg: 0.055, cliff: 26, cliffPen: 0.25, src: 'assumido' }, HARD: { off: 0.45, deg: 0.035, cliff: 38, cliffPen: 0.2, src: 'assumido' }, INTERMEDIATE: { off: 0, deg: 0.05, cliff: 30, cliffPen: 0.2, src: 'assumido' } },
    sc: [], traffic: { pen: 0, laps: 3 }, rain: { lap: 0, slick: 7, interDry: 6 }, adj: 0,
    noise: { lap: 0.25, stint: 0.15, pit: 0.5 }, scFactor: 1.45, vscFactor: 1.3, runs: 400,
    strategies: [
      { name: 'Uma parada', start: 'MEDIUM', stops: [{ lap: 28, c: 'HARD' }] },
      { name: 'Duas paradas', start: 'SOFT', stops: [{ lap: 17, c: 'MEDIUM' }, { lap: 38, c: 'MEDIUM' }] },
    ],
  });

  /* ---------- modelo ---------- */
  function mulberry(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const gauss = (r) => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
  const scAt = (cfg, L) => cfg.sc.find((s) => L >= s.start && L < s.start + s.len);

  /** simula uma estratégia. noise: {lap:Float64Array, stint:[], pit:[]} ou null (determinístico) */
  function simulate(st, cfg, noise, ov = {}) {
    const stops = st.stops.slice().sort((a, b) => a.lap - b.lap), N = cfg.laps, pit = { ...cfg.pit, ...(ov.pit || {}) }, degK = ov.degK ?? 1;
    let comp = st.start, stint = 0, stintStart = 1, wear = 0, si = 0, sinceStop = 99; const times = [], stints = [{ c: comp, from: 1, to: N, startLap: 1 }];
    const adjBase = cfg.base + cfg.adj;
    for (let L = 1; L <= N; L++) {
      const cp = cfg.comp[comp], sc = scAt(cfg, L), raining = cfg.rain.lap > 0 && L >= cfg.rain.lap;
      const age = wear, over = Math.max(0, age - cp.cliff);
      let t = adjBase + cp.off + cp.deg * degK * age + cp.cliffPen * over - cfg.fuel * (L - 1);
      if (comp === 'INTERMEDIATE') t += raining ? 0 : cfg.rain.interDry; else if (raining) t += cfg.rain.slick;
      if (L > 1 && L === stintStart) t += cfg.outlap;
      if (sinceStop < cfg.traffic.laps) t += cfg.traffic.pen;
      if (noise) t += noise.lap[L - 1] + (noise.stint[stint] || 0);
      if (sc) t = (t - cp.deg * degK * age * 0) * (sc.type === 'SC' ? cfg.scFactor : cfg.vscFactor), wear += 0.4; else wear += 1;
      sinceStop++;
      const stop = stops[si];
      if (stop && stop.lap === L && L < N) {
        t += (sc ? (sc.type === 'SC' ? pit.sc : pit.vsc) : pit.normal) + (noise ? noise.pit[si] || 0 : 0);
        stints[stints.length - 1].to = L; comp = stop.c; stint++; stintStart = L + 1; wear = 0; sinceStop = 0; si++;
        stints.push({ c: comp, from: L + 1, to: N, startLap: L + 1 });
      }
      times.push(t);
    }
    return { times, total: times.reduce((a, b) => a + b, 0), stints, pitLaps: stops.map((s) => s.lap) };
  }
  function makeNoise(seed, cfg) {
    const r = mulberry(seed), lap = new Float64Array(cfg.laps).map(() => gauss(r) * cfg.noise.lap);
    return { lap, stint: Array.from({ length: 6 }, () => gauss(r) * cfg.noise.stint), pit: Array.from({ length: 6 }, () => gauss(r) * cfg.noise.pit) };
  }
  function monteCarlo(cfg) {
    const S = cfg.strategies, tot = S.map(() => []), wins = S.map(() => 0);
    for (let i = 0; i < cfg.runs; i++) { const nz = makeNoise(1000 + i, cfg); const r = S.map((s, k) => { const x = simulate(s, cfg, nz).total; tot[k].push(x); return x; }); wins[r.indexOf(Math.min(...r))]++; }
    return S.map((_, k) => { const a = tot[k].slice().sort((x, y) => x - y); return { mean: U.mean(a), p10: quantile(a, 0.1), p90: quantile(a, 0.9), sd: U.stdev(a), win: wins[k] / cfg.runs }; });
  }
  function validate(st, cfg) {
    const w = [], s = st.stops.slice().sort((a, b) => a.lap - b.lap);
    if (s.some((x) => x.lap < 1 || x.lap >= cfg.laps)) w.push('Parada fora do intervalo 1…' + (cfg.laps - 1));
    if (new Set(s.map((x) => x.lap)).size !== s.length) w.push('Duas paradas na mesma volta');
    const used = new Set([st.start, ...s.map((x) => x.c)]);
    const dry = cfg.rain.lap === 0;
    if (dry && ![...used].filter((c) => c !== 'INTERMEDIATE').length) w.push('Pista seca com apenas pneus de chuva');
    if (dry && used.size < 2 && [...used].every((c) => c !== 'INTERMEDIATE')) w.push('Regulamento (pista seca): usar ao menos dois compostos diferentes');
    return w;
  }

  /* ---------- calibração por regressão (dados reais da OpenF1) ---------- */
  function solve(A, b) { const n = A.length, M = A.map((r, i) => [...r, b[i]]); for (let i = 0; i < n; i++) { let p = i; for (let k = i + 1; k < n; k++) if (Math.abs(M[k][i]) > Math.abs(M[p][i])) p = k;[M[i], M[p]] = [M[p], M[i]]; if (Math.abs(M[i][i]) < 1e-12) return null; for (let k = 0; k < n; k++) if (k !== i) { const f = M[k][i] / M[i][i]; for (let j = i; j <= n; j++) M[k][j] -= f * M[i][j]; } } return M.map((r, i) => r[n] / r[i]); }
  function inverse(A) { const n = A.length, M = A.map((r, i) => [...r, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]); for (let i = 0; i < n; i++) { let p = i; for (let k = i + 1; k < n; k++) if (Math.abs(M[k][i]) > Math.abs(M[p][i])) p = k;[M[i], M[p]] = [M[p], M[i]]; const d = M[i][i]; if (Math.abs(d) < 1e-12) return null; for (let j = 0; j < 2 * n; j++) M[i][j] /= d; for (let k = 0; k < n; k++) if (k !== i) { const f = M[k][i]; for (let j = 0; j < 2 * n; j++) M[k][j] -= f * M[i][j]; } } return M.map((r) => r.slice(n)); }
  function calibrate(laps, stints) {
    const all = laps.filter((l) => isNum(l.lap_duration) && !l.is_pit_out_lap && l.lap_number > 1).map((l) => l.lap_duration), ref = median(all);
    const sm = new Map(); stints.forEach((s) => { (sm.get(s.driver_number) || sm.set(s.driver_number, []).get(s.driver_number)).push(s); });
    const rows = [];
    laps.forEach((l) => {
      if (!isNum(l.lap_duration) || l.is_pit_out_lap || l.lap_number <= 1 || l.lap_duration > ref * 1.04 || l.lap_duration < ref * 0.9) return;
      const s = (sm.get(l.driver_number) || []).find((x) => l.lap_number >= x.lap_start && l.lap_number <= (x.lap_end ?? 999)); if (!s || !SL[s.compound]) return;
      if (l.lap_number === s.lap_start) return; // possível volta de saída
      rows.push({ c: s.compound, age: l.lap_number - s.lap_start + (s.tyre_age_at_start || 0), lap: l.lap_number, y: l.lap_duration, d: l.driver_number });
    });
    const cnt = {}; rows.forEach((r) => (cnt[r.c] = (cnt[r.c] || 0) + 1));
    const cs = Object.keys(cnt).filter((c) => cnt[c] >= 40), use = rows.filter((r) => cs.includes(r.c));
    if (cs.length < 1 || use.length < 80) return { err: 'Amostra limpa insuficiente para ajustar o modelo (menos de 80 voltas válidas).' };
    const P = cs.length * 2 + 1, X = use.map((r) => { const v = new Array(P).fill(0), k = cs.indexOf(r.c); v[2 * k] = 1; v[2 * k + 1] = r.age; v[P - 1] = r.lap; return v; });
    const XtX = Array.from({ length: P }, (_, i) => Array.from({ length: P }, (_, j) => X.reduce((s, v) => s + v[i] * v[j], 0))), Xty = Array.from({ length: P }, (_, i) => X.reduce((s, v, k) => s + v[i] * use[k].y, 0));
    const beta = solve(XtX, Xty); if (!beta) return { err: 'Regressão degenerada (variáveis colineares nesta corrida).' };
    const res = use.map((r, k) => r.y - X[k].reduce((s, v, i) => s + v * beta[i], 0)), sse = res.reduce((a, b) => a + b * b, 0), ym = U.mean(use.map((r) => r.y)), sst = use.reduce((a, r) => a + (r.y - ym) ** 2, 0), s2 = sse / (use.length - P), inv = inverse(XtX);
    const out = { n: use.length, r2: 1 - sse / sst, fuel: -beta[P - 1], comps: {}, sigma: Math.sqrt(s2), ref };
    cs.forEach((c, k) => { out.comps[c] = { a: beta[2 * k], deg: beta[2 * k + 1], se: inv ? Math.sqrt(Math.max(0, s2 * inv[2 * k + 1][2 * k + 1])) : null, n: cnt[c] }; });
    const dres = {}; use.forEach((r, k) => (dres[r.d] = dres[r.d] || []).push(res[k])); out.driverAdj = Object.fromEntries(Object.entries(dres).filter(([, v]) => v.length >= 15).map(([d, v]) => [d, median(v)]));
    return out;
  }

  /* ---------- página ---------- */
  GW.pages.strategy = async (p, el, tk) => {
    await GW.J.init();
    const saved = GW.store.get('stratSaved', []);
    let cfg = GW.store.get('stratCfg', null) || defaults(); cfg = Object.assign(defaults(), cfg); cfg.comp = Object.assign(defaults().comp, cfg.comp);
    let cal = null, calCtx = null;
    el.innerHTML = `<div class="page-head"><div><span class="eyebrow">Strategy Lab</span><h1>Simulador de estratégia de corrida</h1><p class="sub">Modelo analítico de tempo de volta (pneu, combustível, Safety Car, tráfego) com Monte Carlo para incerteza. Tudo aqui é <span class="chip sim">simulado</span>: estimativas condicionadas às hipóteses, não previsões nem resultados reais.</p></div></div>
    <div class="grid g-strat" style="align-items:start"><div style="display:flex;flex-direction:column;gap:16px;min-width:0">
      <div class="card"><div class="card-h"><h2>1 · Calibrar com dados reais</h2><span class="chip">dados reais</span></div>
        <div class="grid g2" style="gap:10px">${GW.ctl('cY', 'Temporada', GW.options(Array.from({ length: GW.currentYear - 2022 }, (_, i) => [GW.currentYear - i, GW.currentYear - i]), GW.ctx.year >= 2023 ? GW.ctx.year : GW.currentYear))}${GW.ctl('cM', 'Grande Prêmio', '<option>…</option>')}</div>
        <div class="row mt-s"><button class="btn pri sm" id="calGo">${GW.ic('db')} Ajustar modelo à corrida</button><span class="muted" style="font-size:12px">Regressão de volta × idade do pneu × volta (voltas limpas)</span></div><div id="calOut" class="mt-s"></div></div>
      <div class="card"><div class="card-h"><h2>2 · Corrida e modelo</h2><button class="btn sm" id="reset">Restaurar padrões</button></div><div id="cfgBase"></div></div>
      <div class="card"><div class="card-h"><h2>3 · Estratégias</h2><button class="btn sm" id="addS" ${cfg.strategies.length >= 4 ? 'disabled' : ''}>+ Estratégia</button></div><div id="cfgStrat"></div></div>
      <div class="card"><div class="card-h"><h2>4 · Cenário</h2></div><div id="cfgScen"></div></div>
      <div class="card"><div class="card-h"><h2>Cenários salvos</h2></div><div class="row"><input type="text" id="svName" placeholder="Nome do cenário" style="flex:1;min-width:140px"><button class="btn sm" id="svBtn">${GW.ic('save')} Salvar</button></div><div id="svList" class="mt-s"></div></div>
    </div><div id="res" style="min-width:0"></div></div>`;
    const num = (id, label, v, step = 0.1, min = 0, extra = '') => `<div class="ctl"><label for="${id}">${label}</label><input type="number" id="${id}" value="${v}" step="${step}" min="${min}" ${extra}></div>`;

    function drawBase() {
      $('#cfgBase', el).innerHTML = `<div class="grid g2" style="gap:10px">${num('f-laps', 'Voltas da corrida', cfg.laps, 1, 5)}${num('f-base', 'Ritmo base (s) — médio, tanque cheio', cfg.base, 0.1, 40)}
        ${num('f-pn', 'Perda no pit — normal (s)', cfg.pit.normal, 0.1)}${num('f-ps', 'Perda no pit — Safety Car (s)', cfg.pit.sc, 0.1)}${num('f-pv', 'Perda no pit — VSC (s)', cfg.pit.vsc, 0.1)}${num('f-fuel', 'Ganho por volta (combustível, s)', cfg.fuel, 0.005)}${num('f-out', 'Penalidade volta de saída (s)', cfg.outlap, 0.1)}${num('f-adj', 'Ajuste de ritmo do piloto (s)', cfg.adj.toFixed(3), 0.05, -5)}</div>
        <div class="tbl-wrap scroll-x mt-s"><table style="font-size:12.5px"><thead><tr><th>Composto</th><th class="num">Offset (s)</th><th class="num">Degr. (s/volta)</th><th class="num">Cliff (voltas)</th><th>Origem</th></tr></thead><tbody>${Object.keys(NAMES).map((c) => `<tr><td><i class="dot" style="background:${GW.COMPOUND[c]}"></i> ${NAMES[c]}</td>${['off', 'deg', 'cliff'].map((k) => `<td class="num"><input type="number" data-comp="${c}" data-k="${k}" value="${cfg.comp[c][k]}" step="${k === 'cliff' ? 1 : 0.005}" style="width:84px;padding:5px 7px"></td>`).join('')}<td><span class="chip ${cfg.comp[c].src === 'assumido' ? 'sim' : 'meas'}">${esc(cfg.comp[c].src)}</span></td></tr>`).join('')}</tbody></table></div>
        <p class="note mt-s">${GW.ic('info')}<span>Valores "assumido" são hipóteses genéricas do modelo — não representam um carro ou pista específicos até serem calibrados.</span></p>`;
    }
    const stratSel = (id, v) => `<select ${id}>${Object.keys(NAMES).map((c) => `<option value="${c}"${c === v ? ' selected' : ''}>${NAMES[c]}</option>`).join('')}</select>`;
    function drawStrat() {
      $('#addS', el).disabled = cfg.strategies.length >= 4;
      $('#cfgStrat', el).innerHTML = cfg.strategies.map((s, i) => `<div class="card" style="margin-bottom:10px;border-left:3px solid ${COL[i]};padding:12px"><div class="row"><input type="text" data-s="${i}" data-k="name" value="${esc(s.name)}" style="flex:1;min-width:100px">
        <select data-s="${i}" data-k="preset" aria-label="Modelo"><option value="">Modelos…</option><option value="one">1 parada</option><option value="two">2 paradas</option><option value="under">Undercut (parada cedo)</option><option value="over">Overcut (parada tarde)</option></select>
        ${cfg.strategies.length > 1 ? `<button class="btn sm" data-del="${i}" aria-label="Remover estratégia">${GW.ic('trash')}</button>` : ''}</div>
        <div class="row mt-s"><span class="muted" style="font-size:12px">Largada</span><select data-s="${i}" data-k="start">${Object.keys(NAMES).map((c) => `<option value="${c}"${c === s.start ? ' selected' : ''}>${NAMES[c]}</option>`).join('')}</select></div>
        ${s.stops.map((x, j) => `<div class="row mt-s"><span class="muted" style="font-size:12px;width:60px">Parada ${j + 1}</span><span class="muted" style="font-size:12px">volta</span><input type="number" data-s="${i}" data-j="${j}" data-k="lap" value="${x.lap}" min="1" step="1" style="width:78px"><span class="muted" style="font-size:12px">→</span><select data-s="${i}" data-j="${j}" data-k="c">${Object.keys(NAMES).map((c) => `<option value="${c}"${c === x.c ? ' selected' : ''}>${NAMES[c]}</option>`).join('')}</select><button class="btn sm" data-rs="${i}:${j}" aria-label="Remover parada">${GW.ic('x')}</button></div>`).join('')}
        <button class="btn sm mt-s" data-as="${i}" ${s.stops.length >= 5 ? 'disabled' : ''}>+ Parada</button></div>`).join('');
    }
    function drawScen() {
      $('#cfgScen', el).innerHTML = `<div class="ctl"><label>Safety Car / VSC</label>${cfg.sc.map((s, i) => `<div class="row" style="margin-bottom:6px"><select data-sc="${i}" data-k="type"><option value="SC"${s.type === 'SC' ? ' selected' : ''}>Safety Car</option><option value="VSC"${s.type === 'VSC' ? ' selected' : ''}>VSC</option></select><span class="muted">volta</span><input type="number" data-sc="${i}" data-k="start" value="${s.start}" min="1" style="width:70px"><span class="muted">por</span><input type="number" data-sc="${i}" data-k="len" value="${s.len}" min="1" style="width:60px"><span class="muted">voltas</span><button class="btn sm" data-dsc="${i}" aria-label="Remover">${GW.ic('x')}</button></div>`).join('') || '<span class="muted" style="font-size:12px">Nenhum período neutralizado.</span>'}<button class="btn sm" id="addSC" style="align-self:flex-start;margin-top:4px">+ Neutralização</button></div>
        <div class="grid g2 mt-s" style="gap:10px">${num('f-tp', 'Tráfego após parada (+s/volta)', cfg.traffic.pen, 0.1)}${num('f-tl', 'Voltas afetadas pelo tráfego', cfg.traffic.laps, 1)}${num('f-rl', 'Chuva começa na volta (0 = seca)', cfg.rain.lap, 1)}${num('f-rs', 'Penalidade de slick na chuva (s)', cfg.rain.slick, 0.5)}${num('f-ri', 'Penalidade de intermediário no seco (s)', cfg.rain.interDry, 0.5)}
        ${num('f-nl', 'Ruído de volta σ (s)', cfg.noise.lap, 0.05)}${num('f-ns', 'Variação entre stints σ (s)', cfg.noise.stint, 0.05)}${num('f-np', 'Variação do pit σ (s)', cfg.noise.pit, 0.1)}${num('f-runs', 'Simulações Monte Carlo', cfg.runs, 50, 50, 'max="2000"')}</div>`;
    }
    const drawSaved = () => { const L = GW.store.get('stratSaved', []); $('#svList', el).innerHTML = L.length ? L.map((s, i) => `<div class="sess" style="margin-bottom:4px"><span class="n">${esc(s.name)}</span><span class="t">${esc(new Date(s.ts).toLocaleDateString('pt-BR'))}</span><button class="btn sm" data-ld="${i}">Abrir</button><button class="btn sm" data-dl="${i}" aria-label="Excluir">${GW.ic('trash')}</button></div>`).join('') : '<span class="muted" style="font-size:12px">Nada salvo ainda.</span>'; };
    const persist = () => GW.store.set('stratCfg', cfg);

    /* ---------- resultados ---------- */
    function results() {
      persist(); const N = cfg.laps, S = cfg.strategies, out = $('#res', el);
      if (!(N >= 5)) { out.innerHTML = GW.empty('Defina o número de voltas'); return; }
      const sims = S.map((s) => simulate(s, cfg, null)), mc = monteCarlo(cfg), warns = S.map((s) => validate(s, cfg));
      const best = sims.reduce((b, s, i) => (s.total < sims[b].total ? i : b), 0);
      const cum = sims.map((s) => { let a = 0; return s.times.map((t) => (a += t)); });
      const ref = cum[0];
      out.innerHTML = `<div class="banner" style="margin-bottom:14px"><b>Simulação.</b> Resultados derivados do modelo e das hipóteses ao lado${cal ? ` (parâmetros ajustados à corrida ${esc(calCtx)})` : ' — parâmetros ainda <b>assumidos</b>; calibre com uma corrida real para ancorá-los em dados'}. Não são previsões.</div>
      <div class="card"><div class="card-h"><h2>Comparação</h2>${GW.chipKind('sim')}</div><div class="tbl-wrap scroll-x"><table><thead><tr><th>Estratégia</th><th class="num">Tempo total</th><th class="num">vs melhor</th><th class="num">P10 – P90</th><th class="num">Prob. de ser a mais rápida</th><th>Paradas</th></tr></thead><tbody>${S.map((s, i) => `<tr><td><span class="team-bar" style="background:${COL[i]}"></span>${esc(s.name)}${warns[i].length ? ` <span class="chip red" title="${esc(warns[i].join('; '))}">!</span>` : ''}</td><td class="num">${U.totalTime(sims[i].total)}</td><td class="num ${i === best ? 'up' : ''}">${i === best ? 'melhor' : deltaStr(sims[i].total - sims[best].total, 1) + ' s'}</td><td class="num">${U.totalTime(mc[i].p10)} – ${U.totalTime(mc[i].p90)}</td><td class="num">${(mc[i].win * 100).toFixed(0)}%</td><td>${sims[i].pitLaps.length ? sims[i].pitLaps.map((l) => 'V' + l).join(', ') : 'sem paradas'}</td></tr>`).join('')}</tbody></table></div>
        ${warns.flat().length ? `<div class="banner red mt-s">${warns.map((w, i) => w.map((m) => `${esc(S[i].name)}: ${esc(m)}`).join('<br>')).filter(Boolean).join('<br>')}</div>` : ''}
        <p class="note mt-s">${GW.ic('info')}<span>Total determinístico (sem ruído); P10–P90 e probabilidade vêm de ${cfg.runs} simulações com ruído de volta/stint/pit (σ configurado) e mesmas voltas "aleatórias" para todas as estratégias. Intervalo reflete só a incerteza modelada, não erros do modelo.</span></p></div>
      <div class="card mt"><div class="card-h"><h2>Plano de stints</h2></div>${S.map((s, i) => `<div class="stint-row" style="grid-template-columns:90px 1fr"><span style="color:${COL[i]}">${esc(s.name).slice(0, 12)}</span><div class="stint-track" style="height:28px">${sims[i].stints.map((x) => { const len = x.to - x.from + 1; return `<i style="width:${(len / N) * 100}%;background:${GW.COMPOUND[x.c]}" title="${NAMES[x.c]} · voltas ${x.from}–${x.to} (${len})">${len > 3 ? SL[x.c] + ' ' + len : ''}</i>`; }).join('')}</div></div>`).join('')}
        <div class="tbl-wrap mt-s"><table><thead><tr><th>Estratégia</th><th>Stint</th><th>Composto</th><th class="num">Voltas</th><th class="num">Duração</th><th class="num">Ritmo médio</th></tr></thead><tbody>${S.map((s, i) => sims[i].stints.map((x, k) => { const ts = sims[i].times.slice(x.from - 1, x.to); return `<tr><td>${k === 0 ? esc(s.name) : ''}</td><td>${k + 1}</td><td><i class="dot" style="background:${GW.COMPOUND[x.c]}"></i> ${NAMES[x.c]}</td><td class="num">${x.from}–${x.to}</td><td class="num">${x.to - x.from + 1} v · ${U.totalTime(ts.reduce((a, b) => a + b, 0)).replace(/^0:/, '')}</td><td class="num">${lapTime(U.mean(ts))}</td></tr>`; }).join('')).join('')}</tbody></table></div></div>
      <div class="grid g2 mt"><div class="card"><div class="card-h"><h2>Diferença acumulada vs "${esc(S[0].name)}"</h2>${GW.chipKind('sim')}</div><div id="ch1"></div></div><div class="card"><div class="card-h"><h2>Tempo de volta por estratégia</h2>${GW.chipKind('sim')}</div><div id="ch2"></div></div></div>
      <div class="grid g2 mt"><div class="card"><div class="card-h"><h2>Distribuição do tempo total (Monte Carlo)</h2></div><div id="ch3"></div></div><div class="card"><div class="card-h"><h2>Sensibilidade</h2>${GW.chipKind('sim')}</div><div id="sens"></div></div></div>
      <div class="card mt"><div class="card-h"><h2>Undercut × Overcut</h2>${GW.chipKind('sim')}</div><div id="uc"></div></div>`;
      GW.lineChart($('#ch1', out), { series: S.map((s, i) => ({ name: s.name, color: COL[i], pts: cum[i].map((v, k) => [k + 1, v - ref[k]]) })), legend: true, height: 240, zero: true, xFmt: (v) => 'V' + Math.round(v), yFmt: (v) => deltaStr(v, 0), unit: 's', tipHead: (x) => 'Volta ' + Math.round(x), tipRow: (s, v) => deltaStr(v, 2) + ' s' });
      GW.lineChart($('#ch2', out), { series: S.map((s, i) => ({ name: s.name, color: COL[i], pts: sims[i].times.map((v, k) => [k + 1, v]), w: 1.5 })), legend: true, height: 240, xFmt: (v) => 'V' + Math.round(v), yFmt: (v) => lapTime(v, 0), tipHead: (x) => 'Volta ' + Math.round(x), tipRow: (s, v) => lapTime(v), yDomain: [cfg.base + cfg.adj - 3 - cfg.fuel * N, cfg.base + cfg.adj + 12] });
      // distribuição: histograma de totais relativos
      const nz = S.map((s) => Array.from({ length: Math.min(cfg.runs, 400) }, (_, i) => simulate(s, cfg, makeNoise(1000 + i, cfg)).total));
      const lo = Math.min(...nz.flat()), hi = Math.max(...nz.flat()), B = 24, bw = (hi - lo) / B || 1;
      GW.barChart($('#ch3', out), { cats: Array.from({ length: B }, (_, b) => (b % 4 === 0 ? '+' + (lo + b * bw - sims[best].total + 0).toFixed(0) : '')), series: S.map((s, i) => ({ name: s.name, color: COL[i] + 'bb', vals: Array.from({ length: B }, (_, b) => nz[i].filter((v) => v >= lo + b * bw && (v < lo + (b + 1) * bw || b === B - 1)).length) })), height: 220, legend: true, title: 'Histograma' });
      $('#ch3', out).insertAdjacentHTML('beforeend', '<p class="note">Eixo X: segundos acima do melhor total determinístico; Y: nº de simulações.</p>');
      // sensibilidade: efeito na diferença entre as duas primeiras estratégias
      if (S.length >= 2) {
        const gap = (ov, c2) => { const c = c2 || cfg; return simulate(S[1], c, null, ov).total - simulate(S[0], c, null, ov).total; }, g0 = gap({});
        const rows = [['Perda no pit +2 s', gap({ pit: { normal: cfg.pit.normal + 2 } })], ['Perda no pit −2 s', gap({ pit: { normal: cfg.pit.normal - 2 } })], ['Degradação +30%', gap({ degK: 1.3 })], ['Degradação −30%', gap({ degK: 0.7 })], ['Tráfego +1 s/volta (3 voltas)', gap({}, { ...cfg, traffic: { pen: cfg.traffic.pen + 1, laps: Math.max(3, cfg.traffic.laps) } })], ['Safety Car na volta ' + Math.round(N / 2) + ' (3 voltas)', gap({}, { ...cfg, sc: [...cfg.sc, { type: 'SC', start: Math.round(N / 2), len: 3 }] })]];
        const mx = Math.max(...rows.map((r) => Math.abs(r[1] - g0)), 0.01);
        $('#sens', out).innerHTML = `<p class="tx2" style="font-size:12.5px;margin-bottom:8px">Vantagem de <b>${esc(S[0].name)}</b> sobre <b>${esc(S[1].name)}</b> (tempo B − A): base <b>${deltaStr(g0, 1)} s</b>. Positivo = A mais rápida.</p>${rows.map(([n, g]) => `<div class="bar-row" style="grid-template-columns:150px 1fr 70px"><span style="font-size:12px">${n}</span><div class="tr"><i style="width:${Math.max(3, (Math.abs(g - g0) / mx) * 100)}%;background:${g - g0 >= 0 ? '#2fd48a' : '#ff4d5e'}"></i></div><span class="v">${deltaStr(g, 1)}</span></div>`).join('')}<p class="note mt-s">${GW.ic('info')}<span>Cada linha altera uma hipótese isolada e recalcula o gap; indica quão frágil é a conclusão, não a probabilidade do evento.</span></p>`;
      } else $('#sens', out).innerHTML = GW.empty('Adicione uma segunda estratégia', 'A sensibilidade compara as duas primeiras.');
      drawUC($('#uc', out));
    }
    function drawUC(box) {
      const u = GW.store.get('stratUC', { gap: 2.0, age: 14, comp: 'MEDIUM', newc: 'HARD', traffic: 0 });
      const calc = () => {
        const age0 = u.age, cp = cfg.comp[u.comp], nc = cfg.comp[u.newc], rows = [];
        const old = (a) => cfg.base + cfg.adj + cp.off + cp.deg * a + cp.cliffPen * Math.max(0, a - cp.cliff), neu = (j) => cfg.base + cfg.adj + nc.off + nc.deg * (j - 1) + (j === 1 ? cfg.outlap : 0) + (j <= 3 ? +u.traffic : 0);
        for (let k = 1; k <= 8; k++) { let adv = 0; for (let j = 1; j <= k; j++) adv += old(age0 + j) - neu(j); rows.push({ k, adv }); }
        return rows;
      };
      const rows = calc();
      box.innerHTML = `<p class="tx2" style="font-size:12.5px;margin-bottom:10px">Dois carros em pneus de mesma idade. O <b>carro de trás</b> (a ${u.gap.toFixed(1)} s) para <b>agora</b>; o da frente fica mais <i>k</i> voltas e depois para igual. Se o ganho (pneus novos vs. velhos) superar o intervalo, o <b>undercut</b> funciona; se ficar negativo, o <b>overcut</b> (esperar) rende mais.</p>
      <div class="grid g4" style="gap:10px">${num('u-gap', 'Intervalo para o da frente (s)', u.gap, 0.1)}${num('u-age', 'Idade dos pneus atuais (voltas)', u.age, 1)}<div class="ctl"><label for="u-c">Pneu atual</label><select id="u-c">${Object.keys(NAMES).map((c) => `<option value="${c}"${c === u.comp ? ' selected' : ''}>${NAMES[c]}</option>`).join('')}</select></div><div class="ctl"><label for="u-n">Pneu novo</label><select id="u-n">${Object.keys(NAMES).map((c) => `<option value="${c}"${c === u.newc ? ' selected' : ''}>${NAMES[c]}</option>`).join('')}</select></div>${num('u-t', 'Tráfego na saída (+s, 3 voltas)', u.traffic, 0.2)}</div>
      <div class="tbl-wrap mt-s"><table><thead><tr><th>Da frente para após (k)</th><th class="num">Ganho do que parou antes (s)</th><th class="num">Intervalo (s)</th><th>Leitura</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${r.k} volta${r.k > 1 ? 's' : ''}</td><td class="num ${r.adv > 0 ? 'up' : 'down'}">${deltaStr(r.adv, 2)}</td><td class="num">${u.gap.toFixed(1)}</td><td>${r.adv > u.gap ? '<span class="up">Undercut passa</span>' : r.adv > 0 ? '<span class="tx2">Ganha tempo, mas não passa</span>' : '<span class="down">Overcut favorecido</span>'}</td></tr>`).join('')}</tbody></table></div>
      <p class="note mt-s">${GW.ic('info')}<span>Considera a mesma perda de pit para ambos, penalidade de volta de saída, degradação do modelo e tráfego informado. Ignora ar sujo e diferença de ritmo entre pilotos.</span></p>`;
      const rd = () => { u.gap = +$('#u-gap', box).value; u.age = +$('#u-age', box).value; u.comp = $('#u-c', box).value; u.newc = $('#u-n', box).value; u.traffic = +$('#u-t', box).value; GW.store.set('stratUC', u); drawUC(box); };
      $$('input,select', box).forEach((x) => (x.onchange = rd));
    }

    /* ---------- eventos ---------- */
    const redraw = U.debounce(results, 180);
    const cfgBox = $('.g-strat', el);
    cfgBox.addEventListener('input', (e) => {
      const t = e.target; if (t.tagName !== 'INPUT' || t.type === 'text' && !t.dataset.s) return;
      const v = t.type === 'number' ? parseFloat(t.value) : t.value;
      if (t.dataset.comp) { cfg.comp[t.dataset.comp][t.dataset.k] = isNaN(v) ? 0 : v; cfg.comp[t.dataset.comp].src = 'editado'; }
      else if (t.dataset.s !== undefined) { const s = cfg.strategies[+t.dataset.s]; if (t.dataset.k === 'name') s.name = t.value; else if (t.dataset.j !== undefined) s.stops[+t.dataset.j][t.dataset.k] = isNaN(v) ? 1 : Math.round(v); }
      else if (t.dataset.sc !== undefined) cfg.sc[+t.dataset.sc][t.dataset.k] = isNaN(v) ? 1 : Math.round(v);
      else { const m = { 'f-laps': () => (cfg.laps = Math.round(v)), 'f-base': () => (cfg.base = v), 'f-pn': () => (cfg.pit.normal = v), 'f-ps': () => (cfg.pit.sc = v), 'f-pv': () => (cfg.pit.vsc = v), 'f-fuel': () => (cfg.fuel = v), 'f-out': () => (cfg.outlap = v), 'f-adj': () => (cfg.adj = v), 'f-tp': () => (cfg.traffic.pen = v), 'f-tl': () => (cfg.traffic.laps = Math.round(v)), 'f-rl': () => (cfg.rain.lap = Math.round(v)), 'f-rs': () => (cfg.rain.slick = v), 'f-ri': () => (cfg.rain.interDry = v), 'f-nl': () => (cfg.noise.lap = v), 'f-ns': () => (cfg.noise.stint = v), 'f-np': () => (cfg.noise.pit = v), 'f-runs': () => (cfg.runs = Math.min(2000, Math.max(50, Math.round(v)))) }[t.id]; if (m && !isNaN(v)) m(); else return; }
      redraw();
    });
    cfgBox.addEventListener('change', (e) => {
      const t = e.target; if (t.tagName !== 'SELECT') return;
      if (t.dataset.s !== undefined) { const s = cfg.strategies[+t.dataset.s], k = t.dataset.k; if (k === 'start') s.start = t.value; else if (k === 'c') s.stops[+t.dataset.j].c = t.value; else if (k === 'preset' && t.value) { const N = cfg.laps, m = Math.round(N / 2), pr = { one: { start: 'MEDIUM', stops: [{ lap: m, c: 'HARD' }] }, two: { start: 'SOFT', stops: [{ lap: Math.round(N * 0.3), c: 'MEDIUM' }, { lap: Math.round(N * 0.66), c: 'MEDIUM' }] }, under: { start: 'MEDIUM', stops: [{ lap: Math.round(m - N * 0.1), c: 'HARD' }] }, over: { start: 'MEDIUM', stops: [{ lap: Math.round(m + N * 0.1), c: 'HARD' }] } }[t.value]; Object.assign(s, JSON.parse(JSON.stringify(pr))); s.name = { one: '1 parada', two: '2 paradas', under: 'Undercut', over: 'Overcut' }[t.value]; drawStrat(); } }
      else if (t.dataset.sc !== undefined) cfg.sc[+t.dataset.sc].type = t.value;
      results();
    });
    cfgBox.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return; const d = b.dataset;
      if (d.del !== undefined) { cfg.strategies.splice(+d.del, 1); drawStrat(); results(); }
      else if (d.as !== undefined) { const s = cfg.strategies[+d.as], last = s.stops.at(-1); s.stops.push({ lap: Math.min(cfg.laps - 1, (last ? last.lap : 0) + Math.round(cfg.laps / 4)), c: 'HARD' }); drawStrat(); results(); }
      else if (d.rs !== undefined) { const [i, j] = d.rs.split(':').map(Number); cfg.strategies[i].stops.splice(j, 1); drawStrat(); results(); }
      else if (d.dsc !== undefined) { cfg.sc.splice(+d.dsc, 1); drawScen(); results(); }
      else if (b.id === 'addSC') { cfg.sc.push({ type: 'SC', start: Math.round(cfg.laps / 3), len: 4 }); drawScen(); results(); }
      else if (d.ld !== undefined) { cfg = Object.assign(defaults(), JSON.parse(JSON.stringify(GW.store.get('stratSaved', [])[+d.ld].cfg))); drawAll(); }
      else if (d.dl !== undefined) { const L = GW.store.get('stratSaved', []); L.splice(+d.dl, 1); GW.store.set('stratSaved', L); drawSaved(); }
    });
    $('#addS', el).onclick = () => { cfg.strategies.push({ name: 'Estratégia ' + (cfg.strategies.length + 1), start: 'MEDIUM', stops: [{ lap: Math.round(cfg.laps / 2), c: 'HARD' }] }); drawStrat(); results(); };
    $('#reset', el).onclick = () => { cfg = defaults(); cal = null; drawAll(); };
    $('#svBtn', el).onclick = () => { const n = $('#svName', el).value.trim() || 'Cenário ' + (GW.store.get('stratSaved', []).length + 1); const L = GW.store.get('stratSaved', []); L.unshift({ name: n, ts: Date.now(), cfg: JSON.parse(JSON.stringify(cfg)) }); GW.store.set('stratSaved', L.slice(0, 12)); $('#svName', el).value = ''; drawSaved(); GW.toast('Cenário salvo neste navegador'); };

    /* calibração */
    let meets = [];
    const loadMeets = async () => { const y = +$('#cY', el).value; meets = (await O.meetings(y)).filter((m) => !m.is_cancelled && !/testing/i.test(m.meeting_name) && new Date(m.date_start) < Date.now()); $('#cM', el).innerHTML = meets.length ? GW.options(meets.map((m) => [m.meeting_key, m.meeting_name]), meets.at(-1).meeting_key) : '<option value="">Sem GPs</option>'; if (meets.length) $('#cM', el).value = meets.at(-1).meeting_key; };
    $('#cY', el).onchange = () => loadMeets().catch((e) => ($('#calOut', el).innerHTML = GW.error(e)));
    loadMeets().catch((e) => ($('#calOut', el).innerHTML = GW.error(e)));
    $('#calGo', el).onclick = async () => {
      const out = $('#calOut', el), mk = +$('#cM', el).value, m = meets.find((x) => x.meeting_key === mk); if (!m) return;
      out.innerHTML = GW.loading('Baixando voltas e stints da corrida…');
      try {
        const ss = await O.sessions(mk), race = ss.find((s) => s.session_name === 'Race'); if (!race) { out.innerHTML = GW.empty('Corrida não encontrada'); return; }
        const [laps, stints, drv, mv] = await Promise.all([O.get('laps', { session_key: race.session_key }), O.stints(race.session_key), O.drivers(race.session_key), GW.MV.circuit(m.circuit_key, m.year)]);
        const r = calibrate(laps, stints); if (r.err) { out.innerHTML = `<div class="banner red">${esc(r.err)}</div>`; return; }
        const keys = Object.keys(r.comps), refC = r.comps.MEDIUM ? 'MEDIUM' : keys[0], a0 = r.comps[refC].a, N = Math.max(...laps.map((l) => l.lap_number));
        cfg.laps = N; cfg.fuel = Math.max(0, r.fuel); cfg.base = +(a0 + (-r.fuel) * 1).toFixed(2); cfg.adj = 0;
        keys.forEach((c) => { Object.assign(cfg.comp[c], { off: +(r.comps[c].a - a0).toFixed(3), deg: +Math.max(0, r.comps[c].deg).toFixed(4), src: `calibrado (${r.comps[c].n} voltas)` }); });
        if (mv?.pitLoss) { cfg.pit.normal = +mv.pitLoss.normal; cfg.pit.sc = +mv.pitLoss.sc; cfg.pit.vsc = +mv.pitLoss.vsc; }
        cal = r; calCtx = `${m.meeting_name} ${m.year}`;
        const dmap = new Map(drv.map((d) => [d.driver_number, d]));
        out.innerHTML = `<div class="banner info"><b>${esc(calCtx)}</b>: ${r.n} voltas limpas · R² ${r.r2.toFixed(2)} · efeito da volta (combustível + evolução da pista) ≈ ${(-r.fuel).toFixed(3)} s/volta · ruído residual σ ≈ ${r.sigma.toFixed(2)} s.${mv?.pitLoss ? ` Perda no pit do circuito: ${mv.pitLoss.normal} s (SC ${mv.pitLoss.sc} s, VSC ${mv.pitLoss.vsc} s).` : ' Perda de pit não encontrada: mantido valor assumido.'}</div>
          <div class="tbl-wrap mt-s"><table><thead><tr><th>Composto</th><th class="num">Degradação (s/volta)</th><th class="num">± IC 95%</th><th class="num">Voltas</th></tr></thead><tbody>${keys.map((c) => `<tr><td><i class="dot" style="background:${GW.COMPOUND[c]}"></i> ${NAMES[c]}</td><td class="num">${r.comps[c].deg.toFixed(3)}</td><td class="num">${r.comps[c].se != null ? '± ' + (1.96 * r.comps[c].se).toFixed(3) : '—'}</td><td class="num">${r.comps[c].n}</td></tr>`).join('')}</tbody></table></div>
          <div class="ctl mt-s"><label for="drvAdj">Referência de ritmo (piloto)</label><select id="drvAdj"><option value="">Média do pelotão</option>${Object.entries(r.driverAdj).map(([d, v]) => `<option value="${v}">${esc(dmap.get(+d)?.name_acronym || '#' + d)} (${deltaStr(v, 2)} s)</option>`).join('')}</select></div>
          <p class="note mt-s">${GW.ic('info')}<span>Isto é correlação em uma corrida: a degradação medida mistura desgaste, estado da pista, tráfego e estratégia — não prova a causa. Compostos com poucas voltas permanecem com valores assumidos.</span></p>`;
        $('#drvAdj', out).onchange = (e) => { cfg.adj = e.target.value ? +e.target.value : 0; drawBase(); results(); };
        drawAll();
      } catch (e) { out.innerHTML = GW.error(e); }
    };
    const drawAll = () => { drawBase(); drawStrat(); drawScen(); drawSaved(); results(); };
    drawAll();
  };
})();
