/* RaceLab F1 — core: utilities, http (cache/throttle/retry), store, router, UI helpers */
(function () {
  'use strict';
  const GW = (window.GW = { pages: {}, util: {}, lastUpdate: {} });

  /* ---------- utils ---------- */
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
  const isNum = (v) => v !== null && v !== undefined && v !== '' && !isNaN(+v);
  const NA = '<span class="na" title="Dado indisponível">—</span>';
  const val = (v, f = (x) => x) => (isNum(v) ? f(+v) : NA);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const debounce = (fn, ms = 200) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

  function lapTime(sec, dec = 3) {
    if (!isNum(sec)) return null;
    sec = +sec;
    const m = Math.floor(sec / 60), s = sec - m * 60;
    const ss = s.toFixed(dec).padStart(dec ? dec + 3 : 2, '0');
    return m ? `${m}:${ss}` : ss;
  }
  function totalTime(sec) {
    sec = +sec; const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return `${h}:${String(m).padStart(2, '0')}:${s.toFixed(3).padStart(6, '0')}`;
  }
  function parseLap(str) { // "1:32.608" -> seconds
    if (!str) return null; const m = /^(?:(\d+):)?(\d+(?:\.\d+)?)$/.exec(str.trim());
    return m ? (m[1] ? +m[1] * 60 : 0) + +m[2] : null;
  }
  const deltaStr = (d, dec = 3) => (isNum(d) ? (d > 0 ? '+' : d < 0 ? '−' : '') + Math.abs(d).toFixed(dec) : '—');
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const tzShort = () => { try { return new Date().toLocaleTimeString('pt-BR', { timeZoneName: 'short' }).split(' ').pop(); } catch { return tz; } };
  function toDate(date, time) { return new Date(`${date}T${time || '12:00:00Z'}`); }
  const fmtDay = (d) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '');
  const fmtDT = (d) => d.toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).replace('.', '');
  const fmtFull = (d) => d.toLocaleString('pt-BR', { dateStyle: 'medium', timeStyle: 'short' });
  const ago = (ts) => { const s = (Date.now() - ts) / 1000; return s < 60 ? 'agora há pouco' : s < 3600 ? `há ${Math.floor(s / 60)} min` : s < 86400 ? `há ${Math.floor(s / 3600)} h` : `há ${Math.floor(s / 86400)} d`; };
  const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const stdev = (a) => { if (a.length < 2) return null; const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
  const quantile = (sorted, q) => { const p = (sorted.length - 1) * q, b = Math.floor(p); return sorted[b] + (sorted[Math.min(b + 1, sorted.length - 1)] - sorted[b]) * (p - b); };
  Object.assign(GW.util, { esc, $, $$, isNum, NA, val, sleep, debounce, lapTime, totalTime, parseLap, deltaStr, tz, tzShort, toDate, fmtDay, fmtDT, fmtFull, ago, mean, median, stdev, quantile });

  /* ---------- team colours (Jolpica constructorId) ---------- */
  const TEAMS = {
    mercedes: '#27f4d2', ferrari: '#e8002d', mclaren: '#ff8000', red_bull: '#3671c6', alpine: '#ff87bc', alpine_renault: '#ff87bc',
    williams: '#64c4ff', aston_martin: '#229971', haas: '#b6babd', rb: '#6692ff', alphatauri: '#5e8faa', toro_rosso: '#469bff',
    sauber: '#52e252', alfa: '#c92d4b', audi: '#c8ced8', cadillac: '#d8b45a', renault: '#ffd800', racing_point: '#f596c8',
    force_india: '#f596c8', lotus_f1: '#c9a400', benetton: '#00a651', jordan: '#ffe500', tyrrell: '#1f3a93', brabham: '#1d6b38',
    minardi: '#111', mf1: '#d22', spyker: '#f60', super_aguri: '#d00', toyota: '#e5233a', honda: '#eee', bar: '#aaa', bmw_sauber: '#7ad', jaguar: '#0a5', arrows: '#f80', stewart: '#fff', prost: '#06c', ligier: '#06f', wolf: '#f90', march: '#c00', lotus: '#c9a400', cooper: '#144', brm: '#1a5'
  };
  const OF1_TEAM = { 'red bull racing': '#3671c6', 'mclaren': '#ff8000', 'ferrari': '#e8002d', 'mercedes': '#27f4d2', 'alpine': '#ff87bc', 'aston martin': '#229971', 'williams': '#64c4ff', 'haas f1 team': '#b6babd', 'racing bulls': '#6692ff', 'kick sauber': '#52e252', 'audi': '#c8ced8', 'cadillac': '#d8b45a' };
  function teamColor(id, name) {
    if (id && TEAMS[id]) return TEAMS[id];
    const n = (name || '').toLowerCase();
    for (const k in OF1_TEAM) if (n.includes(k)) return OF1_TEAM[k];
    let hsh = 0; for (const c of id || name || 'x') hsh = (hsh * 31 + c.charCodeAt(0)) % 360;
    return `hsl(${hsh} 25% 62%)`;
  }
  GW.teamColor = teamColor;
  /** logo (versão branca) das equipes atuais; equipes sem logo ficam sem imagem */
  const TLOGO = { alpine: 'alpine', aston_martin: 'astonmartin', audi: 'audi', cadillac: 'cadillac', ferrari: 'ferrari', haas: 'haasf1team', mclaren: 'mclaren', mercedes: 'mercedes', rb: 'racingbulls', red_bull: 'redbullracing', williams: 'williams' };
  GW.teamLogo = (id, h = 18, year) => {
    const k = TLOGO[id]; if (!k || (year && +year < 2005)) return '';
    return `<img class="tlogo" src="https://media.formula1.com/image/upload/c_fit,h_${h * 3}/q_auto/v1740000001/common/f1/2026/${k}/2026${k}logowhite.webp" alt="" height="${h}" loading="lazy" decoding="async" onerror="this.remove()">`;
  };
  const COMPOUND = { SOFT: '#ff3b3b', MEDIUM: '#ffd23a', HARD: '#f2f2f2', INTERMEDIATE: '#3ec65a', WET: '#3a8bff', C1: '#f2f2f2', C2: '#f2f2f2', C3: '#ffd23a', C4: '#ff3b3b', C5: '#ff3b3b' };
  GW.COMPOUND = COMPOUND;

  /* ---------- icons ---------- */
  const IC = {
    home: '<path d="M3 11 12 3l9 8M5 10v10h5v-6h4v6h5V10"/>', cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>', user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>', users: '<circle cx="9" cy="8" r="3.5"/><path d="M2 20c0-3.5 3-5.5 7-5.5s7 2 7 5.5M17 5a3.5 3.5 0 0 1 0 7M22 20c0-2.5-1.5-4-4-5"/>',
    trophy: '<path d="M7 4h10v5a5 5 0 0 1-10 0V4zM7 6H3v2a4 4 0 0 0 4 4M17 6h4v2a4 4 0 0 1-4 4M9 21h6M12 14v7"/>', pulse: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
    timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 2h6"/>', map: '<path d="m9 4-6 2v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14"/>', swords: '<path d="m14 5 6-2-2 6-9 9-4-4zM5 17l-2 4 4-2"/><path d="m10 5-6-2 2 6 9 9"/>',
    star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>', alert: '<circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 16.5v.5"/>', inbox: '<path d="M3 13h5l1 3h6l1-3h5M5 5h14l2 8v6H3v-6z"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>', x: '<path d="M6 6l12 12M18 6 6 18"/>', refresh: '<path d="M20 11a8 8 0 0 0-14-4L4 9M4 4v5h5M4 13a8 8 0 0 0 14 4l2-2M20 20v-5h-5"/>', ext: '<path d="M14 4h6v6M20 4 10 14M18 14v6H4V6h6"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>', db: '<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>', save: '<path d="M5 3h12l4 4v14H5zM8 3v6h8V3M8 21v-7h8v7"/>', trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14"/>', play: '<path d="m7 4 13 8-13 8z"/>', chev: '<path d="m9 6 6 6-6 6"/>', clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'
  };
  const ic = (n, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[n] || ''}</svg>`;
  GW.ic = ic;

  /* ---------- store ---------- */
  const store = {
    get(k, d) { try { const v = localStorage.getItem('gw:' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem('gw:' + k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
  };
  GW.store = store;
  GW.ctx = Object.assign({ year: null, round: null, session: null, drivers: [] }, store.get('ctx', {}));
  GW.setCtx = (patch) => { Object.assign(GW.ctx, patch); store.set('ctx', GW.ctx); renderCtx(); };
  GW.toast = (msg) => { const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 2600); };

  /* ---------- http: cache, in-flight dedupe, throttle, retry ---------- */
  const mem = new Map(), inflight = new Map(), queues = {};
  const GAP = { 'api.jolpi.ca': 300, 'api.openf1.org': 380, 'api.multiviewer.app': 0, 'www.thesportsdb.com': 2300 };
  let active = 0;
  const prog = () => { const b = $('#progress i'); if (!b) return; b.style.opacity = active ? 1 : 0; b.style.width = active ? '70%' : '100%'; if (!active) setTimeout(() => { b.style.width = '0'; }, 300); };
  function lsGet(k) { try { const r = localStorage.getItem('gwc:' + k); return r ? JSON.parse(r) : null; } catch { return null; } }
  function lsSet(k, v) {
    try { localStorage.setItem('gwc:' + k, JSON.stringify(v)); }
    catch { // quota: drop oldest cached entries
      try {
        const keys = Object.keys(localStorage).filter((x) => x.startsWith('gwc:')).map((x) => [x, (JSON.parse(localStorage.getItem(x)) || {}).ts || 0]).sort((a, b) => a[1] - b[1]);
        keys.slice(0, Math.ceil(keys.length / 2)).forEach(([x]) => localStorage.removeItem(x));
        localStorage.setItem('gwc:' + k, JSON.stringify(v));
      } catch { /* give up */ }
    }
  }
  const cool = (host, ms) => { const q = (queues[host] = queues[host] || { t: 0 }); q.t = Math.max(q.t, Date.now() + ms); };
  function schedule(host, fn) {
    const q = (queues[host] = queues[host] || { t: 0 });
    const now = Date.now(), at = Math.max(now, q.t); q.t = at + (GAP[host] || 0);
    return new Promise((res, rej) => setTimeout(() => fn().then(res, rej), at - now));
  }
  /** GW.http(url,{ttl,persist}) — ttl in ms; persist keeps it in localStorage (survives reloads). */
  GW.http = async function (url, { ttl = 5 * 60e3, persist = false } = {}) {
    const now = Date.now();
    let hit = mem.get(url) || (persist ? lsGet(url) : null);
    if (hit && now - hit.ts < ttl) { mem.set(url, hit); return hit.data; }
    if (inflight.has(url)) return inflight.get(url);
    const host = new URL(url).host;
    const p = (async () => {
      active++; prog();
      try {
        let err;
        const LIVE_MSG = 'Os dados detalhados desta sessão ainda não estão disponíveis. Tento de novo automaticamente em instantes.';
        if (host === 'api.openf1.org' && !hit) { // durante sessão ao vivo a API detalhada fica fechada: nem tenta (evita erro no console)
          if (Date.now() - (GW._of1Lock || 0) < 15000 || (GW.liveBlock && (await GW.liveBlock()))) { const e = new Error(LIVE_MSG); e.status = 503; throw e; }
        }
        for (let i = 0; i < 6; i++) {
          try {
            const r = await schedule(host, () => fetch(url, { headers: { Accept: 'application/json' } }));
            if (r.status === 429 || r.status >= 500) { err = new Error(r.status === 429 ? 'Muitas consultas em pouco tempo. Aguarde alguns segundos e tente de novo.' : 'Serviço temporariamente indisponível. Tente novamente em instantes.'); err.status = r.status; cool(host, 1800 * (i + 1)); await sleep(300); continue; }
            if (r.status === 404) { const e = new Error('Dados não encontrados'); e.status = 404; throw e; }
            if (!r.ok) { const e = new Error('Não foi possível carregar estes dados'); e.status = r.status; throw e; }
            const data = await r.json();
            // OpenF1 returns {detail:"No results found."} with 404/200 depending on route
            const rec = { ts: Date.now(), data }; mem.set(url, rec);
            if (persist && JSON.stringify(data).length < 900000) lsSet(url, rec);
            GW.lastUpdate[host] = rec.ts;
            return data;
          } catch (e) { err = e; if (e.status === 404) break; if (host === 'api.openf1.org' && !e.status) { GW._of1Lock = Date.now(); err = new Error(LIVE_MSG); break; } if (i < 5 && !e.status) { cool(host, 2000 * (i + 1)); await sleep(300); } }
        }
        if (hit) { GW.stale = true; return hit.data; } // stale-on-error
        throw err || new Error('Sem conexão. Verifique sua internet e tente de novo.');
      } finally { active--; prog(); inflight.delete(url); }
    })();
    inflight.set(url, p);
    return p;
  };
  GW.cachedAt = (url) => (mem.get(url) || lsGet(url) || {}).ts;

  /* ---------- UI helpers ---------- */
  GW.skeleton = (n = 3) => `<div class="grid" aria-busy="true" aria-live="polite">${Array.from({ length: n }, (_, i) => `<div class="skel" style="height:${i ? 120 : 180}px"></div>`).join('')}</div>`;
  GW.loading = (msg = 'Carregando dados…') => `<div class="state"><div class="spinner"></div><p>${esc(msg)}</p></div>`;
  GW.empty = (title, msg) => `<div class="state">${ic('inbox')}<h3>${esc(title)}</h3><p>${esc(msg || '')}</p></div>`;
  GW.error = (e, retry) => `<div class="state err">${ic('alert')}<h3>Não foi possível carregar</h3><p>${esc(e?.message || e)}</p>${retry ? `<button class="btn sm" data-retry>${ic('refresh')} Tentar novamente</button>` : ''}</div>`;
  GW.src = () => '';
  GW.chipKind = (k) => ({ meas: '', deriv: '', sim: '<span class="chip sim" title="Resultado de simulação, não é histórico">simulado</span>' }[k]);
  GW.options = (items, sel) => items.map(([v, t]) => `<option value="${esc(v)}"${String(v) === String(sel) ? ' selected' : ''}>${esc(t)}</option>`).join('');
  GW.ctl = (id, label, inner, extra = '') => `<div class="ctl"><label for="${id}">${esc(label)}</label><select id="${id}" ${extra}>${inner}</select></div>`;

  /** sortable table. cols: [{k,label,num,render(row),sort(row)}] */
  GW.table = function (el, cols, rows, { sortKey, desc, rowClass, empty = 'Sem dados para exibir.', onSort } = {}) {
    let sk = sortKey, d = !!desc;
    const draw = () => {
      let data = rows.slice();
      const c = cols.find((x) => x.k === sk);
      if (c) data.sort((a, b) => { const A = (c.sort || ((r) => r[c.k]))(a), B = (c.sort || ((r) => r[c.k]))(b); const na = A == null || A === '', nb = B == null || B === ''; if (na !== nb) return na ? 1 : -1; return (typeof A === 'string' ? A.localeCompare(B) : A - B) * (d ? -1 : 1); });
      if (!data.length) { el.innerHTML = GW.empty(empty); return; }
      el.innerHTML = `<div class="tbl-wrap scroll-x"><table><thead><tr>${cols.map((c) => `<th class="${c.num ? 'num ' : ''}${c.nosort ? '' : 'sortable'}" data-k="${c.k}" ${sk === c.k ? `aria-sort="${d ? 'descending' : 'ascending'}"` : ''}>${esc(c.label)}${sk === c.k ? `<span class="arr">${d ? '▼' : '▲'}</span>` : ''}</th>`).join('')}</tr></thead><tbody>${data.map((r, i) => `<tr class="${rowClass ? rowClass(r, i) : ''}">${cols.map((c) => `<td class="${c.num ? 'num ' : ''}${c.cls || ''}">${c.render ? c.render(r, i) : esc(r[c.k] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
      $$('th.sortable', el).forEach((th) => th.addEventListener('click', () => { const k = th.dataset.k; if (sk === k) d = !d; else { sk = k; d = !!cols.find((x) => x.k === k).num; } draw(); onSort && onSort(sk, d); }));
    };
    draw();
  };

  /* ---------- router ---------- */
  const NAV = [['home', 'Home', 'home'], ['seasons', 'Temporadas', 'cal'], ['results', 'Resultados', 'flag'], ['drivers', 'Pilotos', 'user'], ['teams', 'Equipes', 'users'], ['championships', 'Campeonatos', 'trophy'], ['telemetry', 'Telemetry Lab', 'pulse'], ['strategy', 'Strategy Lab', 'timer'], ['circuits', 'Circuit Explorer', 'map'], ['wars', 'Driver Wars', 'swords'], ['live', 'Ao Vivo', 'play']];
  let token = 0, cleanup = null;
  /* páginas pesadas só são baixadas quando visitadas */
  const LAZY = { drivers: 'pages2', teams: 'pages2', wars: 'pages2', telemetry: 'telemetry', strategy: 'strategy', circuits: 'circuits', live: 'live', support: 'support' };
  const loaded = {};
  const loadJs = (n) => (loaded[n] = loaded[n] || new Promise((res, rej) => { const sc = document.createElement('script'); sc.src = `js/${n}.js`; sc.onload = res; sc.onerror = () => { delete loaded[n]; rej(new Error('Não foi possível carregar esta página. Verifique sua conexão.')); }; document.head.appendChild(sc); }));
  const DESC = { home: 'Resultados, classificação, próximo GP e destaques da temporada de Fórmula 1.', seasons: 'Calendário completo da Fórmula 1 por temporada, com sessões e resultados.', results: 'Resultados de corridas, classificação, sprint, pit stops, pneus e melhores voltas da Fórmula 1.', drivers: 'Perfis de pilotos de Fórmula 1: vitórias, pódios, poles, títulos e comparação com companheiros.', teams: 'Equipes de Fórmula 1: pilotos, pontos, vitórias e evolução no campeonato de construtores.', championships: 'Classificação de pilotos e construtores da Fórmula 1 e lista de campeões mundiais.', telemetry: 'Telemetry Lab: compare voltas da Fórmula 1 com velocidade, freio, acelerador e delta de tempo.', strategy: 'Strategy Lab: simule estratégias de pit stop, pneus e Safety Car com intervalos de incerteza.', circuits: 'Circuit Explorer: traçado real, curvas, histórico de vencedores e recordes dos circuitos de F1.', wars: 'Driver Wars: compare pilotos de Fórmula 1 lado a lado, na mesma temporada ou na carreira.', support: 'Apoie o RaceLab F1 e apareça no Mural de Apoiadores, ou fale sobre patrocínio.', live: 'Acompanhe os carros na pista, a classificação e a direção de prova ao vivo ou em replay.' };
  const setMeta = (name) => { const d = DESC[name] || DESC.home; [['meta[name=description]'], ['meta[property="og:description"]'], ['meta[name="twitter:description"]']].forEach(([q]) => { const m = document.querySelector(q); if (m) m.content = d; }); };
  GW.alive = (t) => t === token;
  GW.go = (path) => { location.hash = '#/' + path.replace(/^#?\/?/, ''); };
  GW.link = (path) => '#/' + path;
  GW.reload = () => route();

  function renderNav(cur) {
    $('#navlinks').innerHTML = NAV.map(([p, t, i]) => `<a href="#/${p}" class="${p === cur ? 'on' : ''}" ${p === cur ? 'aria-current="page"' : ''}>${GW.ic(i)}<span>${t}</span></a>`).join('');
  }
  function renderCtx() {
    const c = GW.ctx, el = $('#navctx'); if (!el) return;
    el.innerHTML = c.year ? `<span class="chip red" title="Temporada em contexto">${c.year}${c.round ? ' · R' + c.round : ''}</span>` : '';
  }
  async function route() {
    const parts = location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent).filter(Boolean);
    const name = GW.pages[parts[0]] || LAZY[parts[0]] ? parts[0] : 'home';
    const params = parts.slice(1);
    const my = ++token, main = $('#app');
    try { if (window.va) window.va('pageview', { route: parts.length > 1 ? `/${name}/[...]` : `/${name === 'home' ? '' : name}`, path: '/' + (name === 'home' ? '' : parts.join('/')) }); } catch { /* sem métricas */ }
    if (cleanup) { try { cleanup(); } catch { /* noop */ } cleanup = null; }
    renderNav(name); $('#navlinks').classList.remove('open');
    const titles = Object.fromEntries(NAV.map((n) => [n[0], n[1]])); titles.support = 'Apoie';
    document.title = name === 'home' ? 'RaceLab F1 — Resultados, telemetria e análise de Fórmula 1' : `${titles[name]} — RaceLab F1`; setMeta(name);
    main.innerHTML = GW.skeleton();
    window.scrollTo({ top: 0 });
    try { if (!GW.pages[name] && LAZY[name]) await loadJs(LAZY[name]); if (!GW.alive(my)) return; const c = await GW.pages[name](params, main, my); if (typeof c === 'function') cleanup = c; }
    catch (e) {
      if (!GW.alive(my)) return;
      console.error(e);
      main.innerHTML = GW.error(e, true);
      const b = $('[data-retry]', main); if (b) b.onclick = () => route();
    }
    if (GW.alive(my)) { main.focus({ preventScroll: true }); }
  }
  /** qualquer linha/cartão com link vira clicável por inteiro */
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.target.closest('a, button, input, select, textarea, label, summary')) return;
    const box = e.target.closest('tbody tr, .bar-row, .stint-row, .sess, .duel-card, .card.hov');
    const a = box && box.querySelector('a[href^="#/"]');
    if (a) { e.preventDefault(); location.hash = a.getAttribute('href'); }
  });
  window.addEventListener('hashchange', route);
  document.addEventListener('DOMContentLoaded', async () => {
    $('#burger').addEventListener('click', () => { const o = $('#navlinks').classList.toggle('open'); $('#burger').setAttribute('aria-expanded', o); });
    $('#tzlabel').textContent = `${tz} (${tzShort()})`;
    renderCtx();
    fetch('data/support.json', { cache: 'no-cache' }).then((r) => r.json()).then((c) => { if (c.public === true) document.querySelectorAll('.sup-link').forEach((a) => (a.hidden = false)); }).catch(() => {});
    if (!location.hash) location.hash = '#/home';
    route();
  });
})();
