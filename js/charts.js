/* RaceLab F1 — SVG charts (line w/ synced cursor, bars, track map) */
(function () {
  'use strict';
  const { esc, isNum } = GW.util;
  const groups = {};

  function niceTicks(lo, hi, n = 5) {
    if (lo === hi) { lo -= 1; hi += 1; }
    const span = hi - lo, raw = span / n, mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw);
    const a = Math.floor(lo / step) * step, b = Math.ceil(hi / step) * step, t = [];
    for (let v = a; v <= b + step / 2; v += step) t.push(+v.toFixed(10));
    return t;
  }
  function bisect(pts, x) { let lo = 0, hi = pts.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (pts[m][0] < x) lo = m + 1; else hi = m; } if (lo > 0 && Math.abs(pts[lo - 1][0] - x) < Math.abs(pts[lo][0] - x)) lo--; return lo; }

  /**
   * o: { series:[{name,color,pts:[[x,y]],step,area,dash,w}], height, xFmt,yFmt, xLabel,yLabel, unit,
   *      yDomain, xDomain, bands:[{x0,x1,color,label}], zero, group, tipHead(x), tipRow(s,y), noX, onHover(x), legend }
   */
  function drawLine(el, o, W0) {
    const W = W0 || 900, H = o.height || 240, m = { l: o.ml || 50, r: 12, t: 10, b: o.noX ? 6 : 26 };
    const S = o.series.filter((s) => s.pts && s.pts.length && !s.hidden);
    el.classList.add('chart');
    if (!S.length) { el.innerHTML = GW.empty('Sem dados', o.emptyMsg || 'Nenhuma série disponível para este gráfico.'); return null; }
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    S.forEach((s) => s.pts.forEach(([x, y]) => { if (x < x0) x0 = x; if (x > x1) x1 = x; if (isNum(y)) { if (y < y0) y0 = y; if (y > y1) y1 = y; } }));
    if (o.xDomain) [x0, x1] = o.xDomain;
    if (o.yDomain) [y0, y1] = o.yDomain; else { const p = (y1 - y0) * 0.08 || 1; y0 -= p; y1 += p; if (o.zero) { y0 = Math.min(y0, 0); y1 = Math.max(y1, 0); } if (o.yMin0) y0 = Math.max(0, y0); }
    const yt = niceTicks(y0, y1, Math.max(3, Math.round(H / 55)));
    if (!o.yDomain) { y0 = yt[0]; y1 = yt[yt.length - 1]; }
    const xt = niceTicks(x0, x1, W > 500 ? 8 : 5).filter((v) => v >= x0 - 1e-9 && v <= x1 + 1e-9);
    const sx = (x) => m.l + ((x - x0) / (x1 - x0 || 1)) * (W - m.l - m.r), sy = (y) => m.t + (1 - (y - y0) / (y1 - y0 || 1)) * (H - m.t - m.b);
    const yF = o.yFmt || ((v) => +v.toFixed(2)), xF = o.xFmt || ((v) => +v.toFixed(2));
    let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.title || 'Gráfico')}">`;
    (o.bands || []).forEach((b) => { svg += `<rect x="${sx(Math.max(b.x0, x0))}" y="${m.t}" width="${Math.max(0, sx(Math.min(b.x1, x1)) - sx(Math.max(b.x0, x0)))}" height="${H - m.t - m.b}" fill="${b.color}" opacity=".07"/>`; if (b.label) svg += `<text x="${sx(Math.max(b.x0, x0)) + 4}" y="${m.t + 10}">${esc(b.label)}</text>`; });
    yt.forEach((v) => { svg += `<line class="grid-l" x1="${m.l}" x2="${W - m.r}" y1="${sy(v)}" y2="${sy(v)}" stroke="#1b2235" stroke-width="1"/><text x="${m.l - 7}" y="${sy(v) + 3.5}" text-anchor="end">${esc(yF(v))}</text>`; });
    if (!o.noX) xt.forEach((v) => { svg += `<line x1="${sx(v)}" x2="${sx(v)}" y1="${H - m.b}" y2="${H - m.b + 4}" stroke="#2a3350"/><text x="${sx(v)}" y="${H - 8}" text-anchor="middle">${esc(xF(v))}</text>`; });
    if (o.zero && y0 < 0 && y1 > 0) svg += `<line x1="${m.l}" x2="${W - m.r}" y1="${sy(0)}" y2="${sy(0)}" stroke="#3a4666" stroke-dasharray="3 3"/>`;
    if (o.yLabel) svg += `<text x="4" y="${m.t + 2}" style="fill:#66708a">${esc(o.yLabel)}</text>`;
    S.forEach((s) => {
      let d = '', pen = false, last = null;
      s.pts.forEach(([x, y], i) => {
        if (!isNum(y)) { pen = false; return; }
        const px = sx(x).toFixed(1), py = sy(y).toFixed(1);
        if (s.step && pen) d += `H${px}V${py}`; else d += `${pen ? 'L' : 'M'}${px} ${py}`;
        pen = true; last = [px, py];
      });
      if (s.area) { const f = s.pts.filter((p) => isNum(p[1])); if (f.length) svg += `<path d="${d}L${sx(f[f.length - 1][0])} ${sy(Math.max(y0, 0))}L${sx(f[0][0])} ${sy(Math.max(y0, 0))}Z" fill="${s.color}" opacity=".12"/>`; }
      svg += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="${s.w || 1.8}" stroke-linejoin="round" stroke-linecap="round" ${s.dash ? `stroke-dasharray="${s.dash}"` : ''}/>`;
      if (s.dots) s.pts.forEach(([x, y]) => { if (isNum(y)) svg += `<circle cx="${sx(x)}" cy="${sy(y)}" r="3" fill="${s.color}"/>`; });
    });
    svg += `<line id="cur" y1="${m.t}" y2="${H - m.b}" stroke="#fff" stroke-opacity=".5" stroke-width="1" style="display:none"/><g id="dots"></g><rect id="hit" x="${m.l}" y="${m.t}" width="${W - m.l - m.r}" height="${H - m.t - m.b}" fill="transparent" style="cursor:crosshair"/></svg>`;
    el.innerHTML = (o.legend ? `<div class="legend">${S.filter((s) => s.name).map((s) => `<span><i class="dot" style="background:${s.color}"></i>${esc(s.name)}</span>`).join('')}</div>` : '') + `<div style="position:relative">${svg}<div class="tip" style="display:none"></div></div>`;
    const svgEl = el.querySelector('svg'), cur = el.querySelector('#cur'), dots = el.querySelector('#dots'), tip = el.querySelector('.tip'), hit = el.querySelector('#hit');
    const api = {
      setX(x, local) {
        if (x == null || x < x0 || x > x1) { cur.style.display = 'none'; dots.innerHTML = ''; tip.style.display = 'none'; return; }
        cur.style.display = ''; cur.setAttribute('x1', sx(x)); cur.setAttribute('x2', sx(x));
        const rows = []; let dh = '';
        S.forEach((s) => { const i = bisect(s.pts, x), p = s.pts[i]; if (p && isNum(p[1])) { rows.push([s, p]); dh += `<circle cx="${sx(p[0])}" cy="${sy(p[1])}" r="4" fill="${s.color}" stroke="#07090f" stroke-width="2"/>`; } });
        dots.innerHTML = dh;
        if (local) {
          const rect = svgEl.getBoundingClientRect(), k = rect.width / W;
          tip.innerHTML = `<div class="th">${esc(o.tipHead ? o.tipHead(x) : (o.xLabel ? o.xLabel + ' ' : '') + xF(x))}</div>` + rows.map(([s, p]) => `<div><i class="dot" style="background:${s.color}"></i> ${esc(s.name || '')} <b style="float:right;margin-left:14px">${esc(o.tipRow ? o.tipRow(s, p[1], p) : yF(p[1]) + (o.unit ? ' ' + o.unit : ''))}</b></div>`).join('');
          tip.style.display = 'block'; const tx = Math.min(Math.max(sx(x) * k, 70), rect.width - 70); tip.style.left = tx + 'px'; tip.style.top = (m.t * k + 30) + 'px'; tip.style.transform = 'translate(-50%, 0)';
        } else tip.style.display = 'none';
      },
    };
    if (o.group) { (groups[o.group] = groups[o.group] || new Set()).add(api); api.group = o.group; }
    const move = (e) => {
      const pt = e.touches ? e.touches[0] : e, rect = svgEl.getBoundingClientRect();
      const px = ((pt.clientX - rect.left) / rect.width) * W;
      const x = x0 + ((px - m.l) / (W - m.l - m.r)) * (x1 - x0);
      api.setX(x, true);
      if (o.group) groups[o.group].forEach((a) => a !== api && a.setX(x, false));
      o.onHover && o.onHover(x);
    };
    const leave = () => { api.setX(null); if (o.group) groups[o.group].forEach((a) => a.setX(null)); o.onHover && o.onHover(null); };
    hit.addEventListener('pointermove', move); hit.addEventListener('pointerleave', leave); hit.addEventListener('pointerdown', move);
    api.destroy = () => { if (o.group) groups[o.group].delete(api); };
    return api;
  }
  GW.clearGroup = (g) => { delete groups[g]; };
  /** desenha com a largura real do contêiner e redesenha quando ela muda (texto sempre nítido, de celular a monitor grande) */
  function auto(el, fn, o) {
    const width = () => Math.round(el.clientWidth || 900);
    el._chart = { fn, o }; el._cw = width(); el._chart.api = fn(el, o, el._cw);
    if (window.ResizeObserver && !el._ro) {
      el._ro = new ResizeObserver(() => { clearTimeout(el._rt); el._rt = setTimeout(() => { if (!el.isConnected || !el._chart) return; const nw = width(); if (nw < 100 || Math.abs(nw - el._cw) < 12) return; el._cw = nw; const ch = el._chart; if (ch.api && ch.api.destroy) ch.api.destroy(); ch.api = ch.fn(el, ch.o, nw); }, 140); });
      el._ro.observe(el);
    }
    return el._chart.api;
  }
  GW.lineChart = (el, o) => auto(el, drawLine, o);
  GW.barChart = (el, o) => auto(el, drawBar, o);


  /**
   * barChart: {cats:[label], series:[{name,color,vals}], stacked, height, yFmt, unit, horizontal}
   */
  function drawBar(el, o, W0) {
    el.classList.add('chart');
    const cats = o.cats, S = o.series, W = W0 || 900, H = o.height || 240, m = { l: 46, r: 10, t: 10, b: 30 };
    if (!cats.length) { el.innerHTML = GW.empty('Sem dados'); return; }
    let hi = 0, lo = 0;
    cats.forEach((_, i) => { if (o.stacked) { hi = Math.max(hi, S.reduce((a, s) => a + (+s.vals[i] || 0), 0)); } else S.forEach((s) => { if (isNum(s.vals[i])) { hi = Math.max(hi, +s.vals[i]); lo = Math.min(lo, +s.vals[i]); } }); });
    const yt = niceTicks(lo, hi || 1, 4); const y0 = yt[0], y1 = yt[yt.length - 1];
    const sy = (v) => m.t + (1 - (v - y0) / (y1 - y0)) * (H - m.t - m.b), bw = (W - m.l - m.r) / cats.length;
    const yF = o.yFmt || ((v) => v);
    let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.title || 'Gráfico de barras')}">`;
    yt.forEach((v) => { svg += `<line class="grid-l" x1="${m.l}" x2="${W - m.r}" y1="${sy(v)}" y2="${sy(v)}" stroke="#1b2235"/><text x="${m.l - 7}" y="${sy(v) + 3.5}" text-anchor="end">${esc(yF(v))}</text>`; });
    const every = Math.ceil(cats.length / Math.floor((W - m.l) / 46));
    cats.forEach((c, i) => {
      const gx = m.l + i * bw, inner = bw * 0.72, off = (bw - inner) / 2;
      if (i % every === 0) svg += `<text x="${gx + bw / 2}" y="${H - 10}" text-anchor="middle">${esc(c)}</text>`;
      let acc = 0;
      S.forEach((s, j) => {
        const v = s.vals[i]; if (!isNum(v)) return; const n = o.stacked ? 1 : S.length, w = inner / n;
        const bx = o.stacked ? gx + off : gx + off + j * w;
        const top = o.stacked ? sy(acc + +v) : sy(Math.max(0, +v)), bot = o.stacked ? sy(acc) : sy(Math.min(0, +v));
        svg += `<rect class="b" data-i="${i}" x="${bx}" y="${top}" width="${w - 1}" height="${Math.max(1, bot - top)}" rx="2" fill="${s.color}"><title>${esc(c)} · ${esc(s.name)}: ${esc(yF(+v))}${o.unit ? ' ' + o.unit : ''}</title></rect>`;
        if (o.stacked) acc += +v;
      });
    });
    svg += '</svg>';
    el.innerHTML = (S.length > 1 || o.legend ? `<div class="legend">${S.map((s) => `<span><i class="dot" style="background:${s.color}"></i>${esc(s.name)}</span>`).join('')}</div>` : '') + svg;
  }

  /**
   * trackMap: {pts:[[x,y]], colors:[per segment color], corners:[{n,x,y}], markers:[{x,y,color,label}], rotation, height, closed, arrows, onHover(i), width}
   */
  GW.trackMap = function (el, o) {
    const pts = o.pts; if (!pts || pts.length < 4) { el.innerHTML = GW.empty('Sem geometria', 'Não há traçado disponível para este circuito.'); return null; }
    const rot = ((o.rotation || 0) * Math.PI) / 180, cs = Math.cos(rot), sn = Math.sin(rot);
    const T = (x, y) => [x * cs - y * sn, -(x * sn + y * cs)]; // y up -> screen
    const P = pts.map(([x, y]) => T(x, y)), extra = [...(o.corners || []), ...(o.markers || [])].map((c) => T(c.x, c.y));
    const all = P.concat(extra), xs = all.map((p) => p[0]), ys = all.map((p) => p[1]);
    const minx = Math.min(...xs), maxx = Math.max(...xs), miny = Math.min(...ys), maxy = Math.max(...ys), pad = Math.max(maxx - minx, maxy - miny) * 0.08;
    const vw = maxx - minx + pad * 2, vh = maxy - miny + pad * 2, sw = Math.max(vw, vh) / 90;
    const X = (p) => (p[0] - minx + pad).toFixed(1), Y = (p) => (p[1] - miny + pad).toFixed(1);
    let svg = `<svg viewBox="0 0 ${vw.toFixed(0)} ${vh.toFixed(0)}" role="img" aria-label="${esc(o.title || 'Traçado do circuito')}" style="max-height:${o.height || 460}px;width:100%">`;
    if (!o.colors) svg += `<path d="M${P.map((p) => X(p) + ' ' + Y(p)).join('L')}${o.closed ? 'Z' : ''}" fill="none" stroke="#2a3350" stroke-width="${sw * 2.4}" stroke-linejoin="round" stroke-linecap="round"/><path d="M${P.map((p) => X(p) + ' ' + Y(p)).join('L')}${o.closed ? 'Z' : ''}" fill="none" stroke="${o.stroke || '#e8ecf8'}" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round"/>`;
    else { svg += `<path d="M${P.map((p) => X(p) + ' ' + Y(p)).join('L')}" fill="none" stroke="#1b2235" stroke-width="${sw * 2.6}" stroke-linejoin="round" stroke-linecap="round"/>`; for (let i = 0; i < P.length - 1; i++) svg += `<line x1="${X(P[i])}" y1="${Y(P[i])}" x2="${X(P[i + 1])}" y2="${Y(P[i + 1])}" stroke="${o.colors[i] || '#888'}" stroke-width="${sw * 1.3}" stroke-linecap="round"/>`; }
    (o.corners || []).forEach((c) => { const p = T(c.x, c.y); svg += `<g><circle cx="${X(p)}" cy="${Y(p)}" r="${sw * 1.7}" fill="#0b0e17" stroke="#66708a" stroke-width="${sw * 0.18}"/><text x="${X(p)}" y="${(+Y(p) + sw * 0.62).toFixed(1)}" text-anchor="middle" style="font:700 ${(sw * 1.8).toFixed(1)}px var(--mono);fill:#cfd6e8">${c.n}</text></g>`; });
    (o.markers || []).forEach((c) => { const p = T(c.x, c.y); svg += `<g><circle cx="${X(p)}" cy="${Y(p)}" r="${sw * 1.5}" fill="${c.color}" stroke="#07090f" stroke-width="${sw * 0.4}"/>${c.label ? `<text x="${+X(p) + sw * 2.2}" y="${+Y(p) + sw * 0.6}" style="font:700 ${(sw * 1.9).toFixed(1)}px var(--mono);fill:${c.color}">${esc(c.label)}</text>` : ''}</g>`; });
    svg += `<g id="hov"></g></svg>`;
    el.innerHTML = svg;
    const hov = el.querySelector('#hov'), svgEl = el.querySelector('svg');
    if (o.onMove) {
      const vb = svgEl.viewBox.baseVal; svgEl.style.cursor = 'crosshair';
      const near = (e) => { const r = svgEl.getBoundingClientRect(), sc = Math.min(r.width / vb.width, r.height / vb.height), ox = (r.width - vb.width * sc) / 2, oy = (r.height - vb.height * sc) / 2; const px = (e.clientX - r.left - ox) / sc, py = (e.clientY - r.top - oy) / sc; let b = -1, bd = Infinity; P.forEach((p, i) => { const d = (X(p) - px) ** 2 + (Y(p) - py) ** 2; if (d < bd) { bd = d; b = i; } }); return bd < (vw / 12) ** 2 ? b : null; };
      svgEl.addEventListener('pointermove', (e) => { const i = near(e); hov.innerHTML = i == null ? '' : `<circle cx="${X(P[i])}" cy="${Y(P[i])}" r="${sw * 2}" fill="#fff" stroke="#e10600" stroke-width="${sw * 0.5}"/>`; o.onMove(i, e); });
      svgEl.addEventListener('pointerleave', () => { hov.innerHTML = ''; o.onMove(null); });
    }
    return { setIdx(i) { hov.innerHTML = i == null || !P[i] ? '' : `<circle cx="${X(P[i])}" cy="${Y(P[i])}" r="${sw * 2}" fill="#fff" stroke="#e10600" stroke-width="${sw * 0.5}"/>`; }, svgEl };
  };
})();
