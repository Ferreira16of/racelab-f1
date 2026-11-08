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

  /* ---------- tradução de status de corrida e nomes de GP ---------- */
  const ST = { Finished: 'Completou', Lapped: 'Volta perdida', Retired: 'Abandonou', 'Did not start': 'Não largou', 'Not classified': 'Não classificado', Disqualified: 'Desclassificado', Withdrew: 'Desistiu', Excluded: 'Excluído', Accident: 'Acidente', Collision: 'Colisão', 'Collision damage': 'Danos de colisão', 'Spun off': 'Rodou', Engine: 'Motor', 'Power Unit': 'Unidade de potência', 'Power loss': 'Perda de potência', Gearbox: 'Câmbio', Transmission: 'Transmissão', Clutch: 'Embreagem', Suspension: 'Suspensão', Brakes: 'Freios', Electrical: 'Elétrica', Electronics: 'Eletrônica', Hydraulics: 'Hidráulica', Overheating: 'Superaquecimento', 'Oil leak': 'Vazamento de óleo', 'Oil pressure': 'Pressão do óleo', 'Oil pump': 'Bomba de óleo', 'Oil pipe': 'Tubo de óleo', 'Fuel system': 'Sistema de combustível', 'Fuel leak': 'Vazamento de combustível', 'Fuel pressure': 'Pressão de combustível', 'Fuel pump': 'Bomba de combustível', 'Fuel pipe': 'Tubo de combustível', Fuel: 'Combustível', 'Out of fuel': 'Sem combustível', Turbo: 'Turbo', Throttle: 'Acelerador', Ignition: 'Ignição', Halfshaft: 'Semieixo', Driveshaft: 'Eixo de transmissão', Axle: 'Eixo', Wheel: 'Roda', 'Wheel nut': 'Porca da roda', 'Wheel bearing': 'Rolamento da roda', Differential: 'Diferencial', Tyre: 'Pneu', Puncture: 'Furo no pneu', Handling: 'Dirigibilidade', Steering: 'Direção', Radiator: 'Radiador', Injection: 'Injeção', 'Water leak': 'Vazamento de água', 'Water pressure': 'Pressão da água', 'Water pump': 'Bomba de água', Alternator: 'Alternador', Physical: 'Problema físico', Exhaust: 'Escapamento', Chassis: 'Chassi', Mechanical: 'Mecânica', Technical: 'Técnica', Magneto: 'Magneto', 'Heat shield fire': 'Incêndio no protetor térmico', Battery: 'Bateria', Distributor: 'Distribuidor', Injury: 'Lesão', Injured: 'Lesionado', 'Driver unwell': 'Piloto indisposto', Vibrations: 'Vibrações', 'Broken wing': 'Asa quebrada', 'Rear wing': 'Asa traseira', 'Front wing': 'Asa dianteira', ERS: 'Sistema ERS', Supercharger: 'Compressor', Pneumatics: 'Pneumática', 'Fatal accident': 'Acidente fatal', Fire: 'Incêndio', 'Spark plugs': 'Velas', Undertray: 'Assoalho' };
  GW.statusPt = (s) => { s = String(s == null ? '' : s); const m = /^\+(\d+) Laps?$/.exec(s); return m ? `+${m[1]} ${+m[1] === 1 ? 'volta' : 'voltas'}` : ST[s] || s; };
  const GP = { Australian: 'da Austrália', Chinese: 'da China', Japanese: 'do Japão', Miami: 'de Miami', Canadian: 'do Canadá', Monaco: 'de Mônaco', Barcelona: 'de Barcelona', Austrian: 'da Áustria', British: 'da Grã-Bretanha', Belgian: 'da Bélgica', Hungarian: 'da Hungria', Dutch: 'da Holanda', Italian: 'da Itália', Spanish: 'da Espanha', Azerbaijan: 'do Azerbaijão', Singapore: 'de Singapura', 'United States': 'dos Estados Unidos', 'Mexico City': 'da Cidade do México', Mexican: 'do México', Brazilian: 'do Brasil', 'São Paulo': 'de São Paulo', 'Sao Paulo': 'de São Paulo', 'Las Vegas': 'de Las Vegas', Qatar: 'do Catar', 'Abu Dhabi': 'de Abu Dhabi', Bahrain: 'do Bahrein', 'Saudi Arabian': 'da Arábia Saudita', 'Emilia Romagna': 'da Emília-Romanha', French: 'da França', German: 'da Alemanha', Portuguese: 'de Portugal', Turkish: 'da Turquia', Russian: 'da Rússia', Styrian: 'da Estíria', Eifel: 'de Eifel', Tuscan: 'da Toscana', Sakhir: 'de Sakhir', European: 'da Europa', Pacific: 'do Pacífico', 'San Marino': 'de San Marino', Argentine: 'da Argentina', 'South African': 'da África do Sul', Korean: 'da Coreia', Indian: 'da Índia', Malaysian: 'da Malásia', Swiss: 'da Suíça', Moroccan: 'do Marrocos', Caesars: 'de Caesars Palace', Detroit: 'de Detroit', Dallas: 'de Dallas', Luxembourg: 'de Luxemburgo', Mexican: 'do México' };
  GW.gpName = (n) => { n = String(n || ''); const m = /^(.+?) Grand Prix\b/.exec(n); return m && GP[m[1]] ? `GP ${GP[m[1]]}` : n; };
  const ptRaces = (m) => { try { (m.RaceTable.Races || []).forEach((r) => { r.raceName = GW.gpName(r.raceName); }); } catch { /* sem corridas */ } return m; };
  J.raw = async (path, year, extra = {}) => ptRaces((await GW.http(`${JB}/${path}`, { ttl: year != null ? ttlFor(year) : 12 * 3600e3, persist: true, ...extra })).MRData);
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

  /** há sessão em andamento (ou recém-terminada)? Nesse período a OpenF1 detalhada fica fechada. */
  GW.liveBlock = async () => {
    try { const now = Date.now(); return (await J.schedule(GW.currentYear)).some((r) => GW.weekend(r).some((x) => now >= +x.start && now <= +x.end + 3 * 60e3)); } catch { return false; }
  };
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
     foto oficial da temporada (2024+), testando o slug da equipe; senão, iniciais */
  const TEAM_SLUG = { red_bull: ['redbullracing', 'redbull'], rb: ['racingbulls', 'rb'], alphatauri: ['alphatauri'], aston_martin: ['astonmartin'], haas: ['haasf1team', 'haas'], alpine: ['alpine'], alfa: ['alfaromeo'], sauber: ['kicksauber', 'sauber'], audi: ['audi'], cadillac: ['cadillac'], mercedes: ['mercedes'], ferrari: ['ferrari'], mclaren: ['mclaren'], williams: ['williams'] };
  const FB_SIZE = '29218'; // tamanho da imagem genérica devolvida quando a foto não existe
  const slug = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');
  /** pilotos aposentados / sem foto oficial: banco de imagens esportivo (TheSportsDB), conferindo a data de nascimento */
  /** arquivo de pilotos do site oficial da F1 (cobre muitos pilotos recentes que já saíram do grid) */
  GW.f1ArchivePhoto = async (d) => {
    const clean = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z ]/g, '').trim();
    const first = clean(d.givenName).split(' ')[0], last = clean(d.familyName).replace(/\s+/g, '_');
    if (!first || !last) return null;
    const code = (first.slice(0, 3) + last.replace(/_/g, '').slice(0, 3)).toUpperCase() + '01';
    const u = `https://media.formula1.com/d_driver_fallback_image.png/content/dam/fom-website/drivers/${first[0].toUpperCase()}/${code}_${first}_${last}/${code.toLowerCase()}.png.transform/1col/image.png`;
    try { const r = await fetch(u, { method: 'HEAD' }); return r.ok && +r.headers.get('content-length') > 2500 ? u : null; } catch { return null; }
  };
  /** testa se uma imagem existe (sem depender de CORS) */
  const imgOk = (u) => new Promise((res) => { const i = new Image(); i.onload = () => res(true); i.onerror = () => res(false); i.src = u; });
  GW.statsf1Photo = async (d) => { const u = `https://www.statsf1.com/pilotes/photos/${d.driverId}.png`; return (await imgOk(u)) ? u : null; };
  /** enquadra o rosto: mede a área opaca da imagem (PNG com fundo transparente) e centraliza cabeça e ombros */
  const FIT = {};
  GW.fitHead = (u) => (FIT[u] = FIT[u] || new Promise((res) => {
    const i = new Image(); i.crossOrigin = 'anonymous';
    i.onload = () => {
      try {
        const w = i.naturalWidth, h = i.naturalHeight, k = Math.min(1, 160 / Math.max(w, h)), cw = Math.max(1, Math.round(w * k)), ch = Math.max(1, Math.round(h * k));
        const c = document.createElement('canvas'); c.width = cw; c.height = ch; const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(i, 0, 0, cw, ch);
        const px = x.getImageData(0, 0, cw, ch).data; let x0 = cw, x1 = 0, y0 = ch, y1 = 0;
        for (let yy = 0; yy < ch; yy++) for (let xx = 0; xx < cw; xx++) if (px[(yy * cw + xx) * 4 + 3] > 40) { if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; if (yy < y0) y0 = yy; }
        for (let yy = ch - 1; yy >= 0 && !y1; yy--) for (let xx = 0; xx < cw; xx++) if (px[(yy * cw + xx) * 4 + 3] > 40) { y1 = yy; break; }
        if (x1 <= x0 || y1 <= y0 || (x1 - x0 > cw * 0.97 && y0 < 2 && y1 > ch - 3)) return res(null); // imagem sem transparência: mantém o corte padrão
        const bw = x1 - x0 + 1, bh = y1 - y0 + 1, r = bh / bw, s = Math.min(bh, r > 1.6 ? bw * 1.25 : Math.max(bw, bh) * 1.1); // lado do quadrado: cabeça + ombros
        const cx = (x0 + x1) / 2, top = y0 - s * 0.06, left = cx - s / 2, bgW = cw / s * 100;
        const dx = 1 - cw / s, dy = 1 - ch / s;
        res({ size: `${bgW.toFixed(1)}% auto`, pos: `${Math.abs(dx) < 0.02 ? 50 : ((-left / s) / dx * 100).toFixed(1)}% ${Math.abs(dy) < 0.02 ? 0 : ((-top / s) / dy * 100).toFixed(1)}%` });
      } catch { res(null); }
    };
    i.onerror = () => res(null); i.src = u;
  }));
  let STATIC = null;
  GW.archivePhoto = async (d) => {
    STATIC = STATIC || fetch('data/driver-photos.json').then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
    const known = (await STATIC)[d.driverId]; // pré-carregado: resposta instantânea, sem limite de consultas
    if (known) return known;
    const sf = await GW.statsf1Photo(d); if (sf) return sf; // arquivo histórico (statsf1), sem limite de consultas
    if (known !== undefined) return null;
    try {
      const q = encodeURIComponent(`${d.givenName} ${d.familyName}`.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().replace(/\s+/g, '_'));
      const r = await GW.http(`https://www.thesportsdb.com/api/v1/json/123/searchplayers.php?p=${q}`, { ttl: 365 * DAY, persist: true });
      const list = ((r && r.player) || []).filter((x) => x.strSport === 'Motorsport' && (x.strCutout || x.strThumb));
      const hit = list.find((x) => d.dateOfBirth && x.dateBorn === d.dateOfBirth) || (!d.dateOfBirth && list.length === 1 ? list[0] : null);
      return hit ? hit.strCutout || hit.strThumb : null;
    } catch { return undefined; } // erro de rede/limite: não guardar como "sem foto"
  };
  const PHC = {};
  GW.driverPhoto = (d, year, teamIds) => {
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
      if (!url) url = await GW.f1ArchivePhoto(d);
      if (!url) { url = await GW.archivePhoto(d); if (url === undefined) { delete PHC[key]; return null; } }
      GW.store.set(ck, url || '');
      return url;
    })());
  };
  /** preenche os avatares [data-id] do contêiner com a foto do piloto */
  GW.hydratePhotos = (root) => {
    root.querySelectorAll('.avatar[data-id]').forEach(async (a) => {
      const d = { driverId: a.dataset.id, givenName: a.dataset.given, familyName: a.dataset.family, dateOfBirth: a.dataset.dob };
      const u = await GW.driverPhoto(d, +a.dataset.year || GW.currentYear, (a.dataset.teams || '').split(',').filter(Boolean)).catch(() => null);
      if (u && a.isConnected) {
        a.style.backgroundImage = `url("${u}")`; a.classList.add('photo'); a.textContent = '';
        if (/statsf1/.test(u)) a.classList.add('contain');
        else if (/thesportsdb\.com.*\/cutout\//.test(u)) { a.classList.add('fit'); a.style.backgroundSize = '210% auto'; a.style.backgroundPosition = '50% 0%'; } // recorte de corpo inteiro: aproxima da cabeça
        else { const f = await GW.fitHead(u); if (f && a.isConnected) { a.classList.add('fit'); a.style.backgroundSize = f.size; a.style.backgroundPosition = f.pos; } }
      }
    });
  };
  GW.finished = (r) => /^(Finished|\+\d+ Laps?)$/.test(r.status || '') || /^\+/.test(r.status || '');
  GW.yearSelect = async (id, sel) => { const ys = await J.seasons(); return GW.ctl(id, 'Temporada', GW.options(ys.map((y) => [y, y]), sel)); };

})();
