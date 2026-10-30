/* GRID WORLD — data layer: Jolpica-F1 (histórico), OpenF1 (sessões/telemetria), MultiViewer (geometria) */
(function () {
  'use strict';
  const { toDate, parseLap, isNum } = GW.util;
  const JB = 'https://api.jolpi.ca/ergast/f1', OB = 'https://api.openf1.org/v1', MB = 'https://api.multiviewer.app/api/v1';
  const DAY = 864e5;
  GW.currentYear = new Date().getFullYear();

  /* ---------- Jolpica ---------- */
  const J = (GW.J = {});
  // histórico fechado muda pouco -> cache longo; temporada em curso -> curto
  const ttlFor = (year) => (+year < GW.currentYear ? 30 * DAY : 10 * 60e3);
  J.raw = async (path, year, extra = {}) => (await GW.http(`${JB}/${path}`, { ttl: year != null ? ttlFor(year) : 12 * 3600e3, persist: true, ...extra })).MRData;
  J.init = async () => { // descobre a temporada corrente real segundo a fonte
    if (J._init) return J._init;
    J._init = (async () => {
      try { const d = await GW.http(`${JB}/current.json?limit=1`, { ttl: 3600e3, persist: true }); GW.currentYear = +d.MRData.RaceTable.season || GW.currentYear; } catch { /* mantém ano do relógio */ }
      if (!GW.ctx.year) GW.setCtx({ year: GW.currentYear });
      return GW.currentYear;
    })();
    return J._init;
  };
  J.seasons = async () => { const d = await J.raw('seasons.json?limit=100'); return d.SeasonTable.Seasons.map((s) => +s.season).sort((a, b) => b - a); };
  J.schedule = async (y) => (await J.raw(`${y}.json?limit=100`, y)).RaceTable.Races;
  J.driverStandings = async (y, r) => { const d = await J.raw(`${y}${r ? '/' + r : ''}/driverstandings.json?limit=100`, y); const l = d.StandingsTable.StandingsLists[0]; return l ? { round: +l.round, rows: l.DriverStandings } : { round: 0, rows: [] }; };
  J.constructorStandings = async (y, r) => { const d = await J.raw(`${y}${r ? '/' + r : ''}/constructorstandings.json?limit=100`, y); const l = d.StandingsTable.StandingsLists[0]; return l ? { round: +l.round, rows: l.ConstructorStandings } : { round: 0, rows: [] }; };
  J.session = async (y, r, kind) => { // kind: results | qualifying | sprint
    const d = await J.raw(`${y}/${r}/${kind}.json?limit=100`, y); const race = d.RaceTable.Races[0];
    return race ? { race, rows: race[{ results: 'Results', qualifying: 'QualifyingResults', sprint: 'SprintResults' }[kind]] || [] } : { race: null, rows: [] };
  };
  J.pitstops = async (y, r) => { const d = await J.raw(`${y}/${r}/pitstops.json?limit=100`, y); return d.RaceTable.Races[0]?.PitStops || []; };
  J.laps = async (y, r) => { // todas as voltas (paginado); pode ser pesado -> sob demanda
    let off = 0, out = {}, total = 1;
    while (off < total) {
      const d = await J.raw(`${y}/${r}/laps.json?limit=100&offset=${off}`, y); total = +d.total; const race = d.RaceTable.Races[0];
      (race?.Laps || []).forEach((l) => { (out[l.number] = out[l.number] || []).push(...l.Timings); }); off += 100;
      if (!race) break;
    }
    return out;
  };
  /** todos os GPs da temporada de um tipo, mesclando páginas */
  J.seasonAll = async (y, kind) => {
    const key = { results: 'Results', qualifying: 'QualifyingResults', sprint: 'SprintResults' }[kind];
    let off = 0, total = 1; const byRound = new Map();
    while (off < total) {
      const d = await J.raw(`${y}/${kind}.json?limit=100&offset=${off}`, y); total = +d.total;
      d.RaceTable.Races.forEach((r) => { const e = byRound.get(r.round) || { ...r, [key]: [] }; e[key] = e[key].concat(r[key]); byRound.set(r.round, e); });
      off += 100;
    }
    return [...byRound.values()].sort((a, b) => a.round - b.round).map((r) => ({ round: +r.round, raceName: r.raceName, date: r.date, Circuit: r.Circuit, rows: r[key] }));
  };
  J.total = async (path) => { try { return +(await J.raw(path + (path.includes('?') ? '&' : '?') + 'limit=1')).total; } catch { return null; } };
  J.drivers = async (y) => (await J.raw(`${y}/drivers.json?limit=100`, y)).DriverTable.Drivers;
  J.constructors = async (y) => (await J.raw(`${y}/constructors.json?limit=100`, y)).ConstructorTable.Constructors;
  J.driver = async (id) => (await J.raw(`drivers/${id}.json`)).DriverTable.Drivers[0];
  J.circuits = async (y) => (await J.raw(`${y ? y + '/' : ''}circuits.json?limit=100`, y)).CircuitTable.Circuits;
  /** circuitos que já receberam ao menos um GP (com contagem e período); exclui pistas só anunciadas */
  let CIDX = null;
  J.circuitIndex = () => (CIDX = CIDX || (async () => {
    const m = new Map(); let off = 0, total = 1;
    while (off < total) {
      const d = await J.raw(`races.json?limit=100&offset=${off}`, GW.currentYear); total = +d.total;
      d.RaceTable.Races.forEach((r) => { if (toDate(r.date, r.time) >= Date.now()) return; const e = m.get(r.Circuit.circuitId) || { n: 0, first: +r.season, last: +r.season }; e.n++; e.first = Math.min(e.first, +r.season); e.last = Math.max(e.last, +r.season); m.set(r.Circuit.circuitId, e); });
      off += 100;
    }
    return m;
  })().catch((e) => { CIDX = null; throw e; }));
  J.circuitRaces = async (id) => (await J.raw(`circuits/${id}/races.json?limit=100`)).RaceTable.Races;
  J.circuitWinners = async (id) => (await J.raw(`circuits/${id}/results/1.json?limit=100`)).RaceTable.Races;
  J.circuitFastest = async (id) => (await J.raw(`circuits/${id}/fastest/1/results.json?limit=100`)).RaceTable.Races;

  /* ---------- sessões do fim de semana (nomenclatura por temporada) ---------- */
  const DUR = { FP1: 60, FP2: 60, FP3: 60, SQ: 45, SPRINT: 45, Q: 60, RACE: 120 };
  GW.weekend = function (race) {
    const y = +race.season, y2 = y;
    const S = [];
    const add = (key, name, o, kind) => { if (o && o.date) { const s = toDate(o.date, o.time); S.push({ key, name, kind, start: s, end: new Date(+s + DUR[key] * 6e4), hasTime: !!o.time }); } };
    add('FP1', 'Treino Livre 1', race.FirstPractice); add('FP2', 'Treino Livre 2', race.SecondPractice); add('FP3', 'Treino Livre 3', race.ThirdPractice);
    add('SQ', y2 === 2023 ? 'Sprint Shootout' : y2 >= 2024 ? 'Sprint Qualifying' : 'Classificação (Sprint)', race.SprintQualifying || race.SprintShootout);
    add('SPRINT', 'Corrida Sprint', race.Sprint, 'sprint');
    add('Q', 'Classificação', race.Qualifying, 'qualifying'); add('RACE', 'Grande Prêmio', { date: race.date, time: race.time }, 'results');
    S.sort((a, b) => a.start - b.start);
    const now = Date.now();
    S.forEach((s) => { s.status = now < +s.start ? 'future' : now <= +s.end ? 'live' : 'done'; });
    return S;
  };
  GW.raceStatus = (race) => {
    const w = GW.weekend(race), now = Date.now();
    if (w.some((s) => s.status === 'live')) return 'live';
    const race_ = w.find((s) => s.key === 'RACE');
    return race_ && race_.status === 'done' ? 'done' : w.length && now >= +w[0].start ? 'live' : 'future';
  };
  GW.sessionLabel = (k) => ({ FP1: 'TL1', FP2: 'TL2', FP3: 'TL3', SQ: 'SQ', SPRINT: 'Sprint', Q: 'Quali', RACE: 'Corrida' }[k] || k);

  /* ---------- OpenF1 ---------- */
  const O = (GW.O = {});
  const q = (o) => Object.entries(o).filter(([, v]) => v != null).map(([k, v]) => `${k.replace(/[<>]=?$/, (m) => encodeURIComponent(m))}${/[<>]/.test(k) ? '' : '='}${encodeURIComponent(v)}`).join('&');
  O.get = async (ep, params, opt = {}) => {
    const url = `${OB}/${ep}?${q(params)}`;
    try { const d = await GW.http(url, { ttl: opt.ttl ?? 6 * 3600e3, persist: opt.persist !== false }); return Array.isArray(d) ? d : []; }
    catch (e) { if (e.status === 404) return []; throw e; }
  };
  O.meetings = (y) => O.get('meetings', { year: y }, { ttl: +y < GW.currentYear ? 30 * DAY : 3600e3 });
  O.sessions = (meeting_key) => O.get('sessions', { meeting_key }, { ttl: 3600e3 });
  O.drivers = (session_key) => O.get('drivers', { session_key });
  O.laps = (session_key, driver_number) => O.get('laps', { session_key, driver_number });
  O.stints = (session_key) => O.get('stints', { session_key });
  O.pit = (session_key) => O.get('pit', { session_key });
  O.weather = (session_key) => O.get('weather', { session_key });
  O.raceControl = (session_key) => O.get('race_control', { session_key });
  const iso = (t) => new Date(t).toISOString().replace('Z', '+00:00').replace('+', '%2B');
  const dateRange = (a, b) => `date%3E=${iso(a)}&date%3C=${iso(b)}`;
  O.window = async (ep, session_key, driver_number, t0, t1) => {
    const url = `${OB}/${ep}?session_key=${session_key}&driver_number=${driver_number}&${dateRange(t0, t1)}`;
    try { const d = await GW.http(url, { ttl: 30 * DAY, persist: true }); return Array.isArray(d) ? d : []; } catch (e) { if (e.status === 404) return []; throw e; }
  };

  /** liga rodada Jolpica <-> meeting OpenF1 por data (ids não são intercambiáveis) */
  O.meetingForRace = async (race) => {
    const ms = await O.meetings(race.season);
    const t = +toDate(race.date, race.time);
    return ms.find((m) => !m.is_cancelled && t >= +new Date(m.date_start) - DAY && t <= +new Date(m.date_end) + DAY) || null;
  };
  O.raceForMeeting = (races, m) => races.find((r) => { const t = +toDate(r.date, r.time); return t >= +new Date(m.date_start) - DAY && t <= +new Date(m.date_end) + DAY; });

  /* ---------- MultiViewer: geometria real do circuito ---------- */
  GW.MV = {
    circuit: async (key, year) => {
      const tryY = [year, year - 1, year - 2, year - 3];
      for (const y of tryY) { try { const d = await GW.http(`${MB}/circuits/${key}/${y}`, { ttl: 30 * DAY, persist: true }); if (d && d.x) return { ...d, _year: y }; } catch { /* tenta ano anterior */ } }
      return null;
    },
  };
  /** extensão estimada (km) a partir da geometria, unidade = 1/10 m (validado contra Xangai) */
  GW.trackLengthKm = (mv) => { let L = 0; for (let i = 0; i < mv.x.length - 1; i++) L += Math.hypot(mv.x[i + 1] - mv.x[i], mv.y[i + 1] - mv.y[i]); L += Math.hypot(mv.x[0] - mv.x.at(-1), mv.y[0] - mv.y.at(-1)); return L / 10000; };

  /* ---------- helpers de domínio ---------- */
  GW.fullName = (d) => `${d.givenName} ${d.familyName}`;
  GW.pts = (v) => (isNum(v) ? (+v % 1 ? (+v).toFixed(1) : String(+v)) : '—');
  const ISO = { British: 'gb', Dutch: 'nl', Monegasque: 'mc', Spanish: 'es', Australian: 'au', Mexican: 'mx', Thai: 'th', Japanese: 'jp', Canadian: 'ca', French: 'fr', German: 'de', Finnish: 'fi', Danish: 'dk', Chinese: 'cn', Italian: 'it', American: 'us', Brazilian: 'br', 'New Zealander': 'nz', Argentine: 'ar', Argentinian: 'ar', Austrian: 'at', Swiss: 'ch', Belgian: 'be', Swedish: 'se', Polish: 'pl', Russian: 'ru', Venezuelan: 've', Indonesian: 'id', Colombian: 'co', Hungarian: 'hu', Irish: 'ie', Portuguese: 'pt', Uruguayan: 'uy', Chilean: 'cl', Malaysian: 'my', Indian: 'in', Czech: 'cz', Liechtensteiner: 'li', 'South African': 'za', Rhodesian: 'zw', Estonian: 'ee', Monacan: 'mc', 'East German': 'de', Thai2: 'th' };
  /** bandeira como imagem (emoji de bandeira não aparece no Windows) */
  GW.flag = (nat) => (ISO[nat] ? `<img class="flag" src="https://flagcdn.com/w40/${ISO[nat]}.png" srcset="https://flagcdn.com/w80/${ISO[nat]}.png 2x" alt="${GW.util.esc(nat)}" title="${GW.util.esc(nat)}" width="20" height="15" loading="lazy">` : '');
  /* ---------- fotos dos pilotos ----------
     1) foto oficial da temporada (2024+), testando o slug da equipe; 2) foto da Wikipédia; 3) iniciais */
  const TEAM_SLUG = { red_bull: ['redbullracing', 'redbull'], rb: ['racingbulls', 'rb'], alphatauri: ['alphatauri'], aston_martin: ['astonmartin'], haas: ['haasf1team', 'haas'], alpine: ['alpine'], alfa: ['alfaromeo'], sauber: ['kicksauber', 'sauber'], audi: ['audi'], cadillac: ['cadillac'], mercedes: ['mercedes'], ferrari: ['ferrari'], mclaren: ['mclaren'], williams: ['williams'] };
  const FB_SIZE = '29218'; // tamanho da imagem genérica devolvida quando a foto não existe
  const slug = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');
  const PHC = {};
  GW.driverPhoto = (d, year, teamIds, wikiUrl) => {
    const key = `${year}:${d.driverId}:${(teamIds || []).join(',')}`;
    return (PHC[key] = PHC[key] || (async () => {
      const ck = 'ph:' + key, saved = GW.store.get(ck, undefined); if (saved !== undefined && saved !== null) return saved || null;
      let url = null;
      if (year >= 2024) {
        const code = slug((d.givenName || '').split(' ')[0]).slice(0, 3) + slug(d.familyName).slice(0, 3) + '01';
        for (const id of teamIds || []) for (const t of TEAM_SLUG[id] || []) {
          const u = `https://media.formula1.com/image/upload/c_fill,w_440/q_auto/d_common:f1:${year}:fallback:driver:${year}fallbackdriverright.webp/v1740000001/common/f1/${year}/${t}/${code}/${year}${t}${code}right.webp`;
          try { const r = await fetch(u, { method: 'HEAD' }); if (r.ok && r.headers.get('content-length') !== FB_SIZE && +r.headers.get('content-length') > 5000) { url = u; break; } } catch { /* tenta o próximo */ }
        }
      }
      if (!url) { const w = await GW.wiki(wikiUrl || d.url).catch(() => null); url = w && w.thumb ? w.thumb : null; }
      GW.store.set(ck, url || '');
      return url;
    })());
  };
  /** preenche os avatares [data-id] do contêiner com a foto do piloto */
  GW.hydratePhotos = (root) => {
    root.querySelectorAll('.avatar[data-id]').forEach(async (a) => {
      const d = { driverId: a.dataset.id, givenName: a.dataset.given, familyName: a.dataset.family, url: a.dataset.wiki };
      const u = await GW.driverPhoto(d, +a.dataset.year || GW.currentYear, (a.dataset.teams || '').split(',').filter(Boolean), a.dataset.wiki).catch(() => null);
      if (u && a.isConnected) { a.style.backgroundImage = `url("${u}")`; a.classList.add('photo'); a.textContent = ''; }
    });
  };
  GW.finished = (r) => /^(Finished|\+\d+ Laps?)$/.test(r.status || '') || /^\+/.test(r.status || '');
  GW.yearSelect = async (id, sel) => { const ys = await J.seasons(); return GW.ctl(id, 'Temporada', GW.options(ys.map((y) => [y, y]), sel)); };

  /* ---------- Wikipédia: resumo em português (fallback inglês) ---------- */
  const WK = {};
  GW.wiki = (url) => {
    const m = /\/wiki\/([^#?]+)/.exec(url || ''); if (!m) return Promise.resolve(null);
    let title = m[1]; try { title = decodeURIComponent(title); } catch { /* mantém */ }
    return (WK[title] = WK[title] || (async () => {
      const opt = { ttl: 30 * DAY, persist: true }, enc = encodeURIComponent(title);
      const pick = (d, lang) => (d && d.extract ? { text: d.extract, thumb: d.thumbnail ? d.thumbnail.source : null, lang } : null);
      try {
        const ll = await GW.http(`https://en.wikipedia.org/w/api.php?action=query&prop=langlinks&lllang=pt&titles=${enc}&format=json&origin=*&redirects=1`, opt);
        const pg = Object.values(ll.query.pages)[0], pt = pg && pg.langlinks && pg.langlinks[0] && pg.langlinks[0]['*'];
        if (pt) { const r = pick(await GW.http(`https://pt.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(pt)}`, opt), 'pt'); if (r) return r; }
      } catch { /* tenta inglês */ }
      try { return pick(await GW.http(`https://en.wikipedia.org/api/rest_v1/page/summary/${enc}`, opt), 'en'); } catch { return null; }
    })());
  };
  /** preenche o contêiner com o resumo da Wikipédia; remove o contêiner se não houver conteúdo */
  GW.wikiInto = async (box, url, label = 'Sobre') => {
    if (!box) return; const w = await GW.wiki(url).catch(() => null);
    if (!box.isConnected) return;
    if (!w) { box.remove(); return; }
    const cut = w.text.length > 900 ? w.text.lastIndexOf('. ', 900) + 1 : 0, t = cut > 200 ? w.text.slice(0, cut) : w.text.slice(0, 900);
    box.innerHTML = `<div class="card"><div class="card-h"><h2>${label}</h2></div><div class="wiki">${w.thumb ? `<img src="${GW.util.esc(w.thumb)}" alt="" loading="lazy">` : ''}<div><p>${GW.util.esc(t)}</p><p class="note mt-s"><span>Texto: Wikipédia${w.lang === 'en' ? ' (em inglês)' : ''} · CC BY-SA</span></p></div></div></div>`;
  };
})();
