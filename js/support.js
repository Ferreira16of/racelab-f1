/* RaceLab F1 — Apoie: apoio individual, mural de apoiadores e contato para patrocínio */
(function () {
  'use strict';
  const { esc, $ } = GW.util;
  const getJ = (u) => fetch(u, { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const mail = (to, subject, body) => `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  const RANK = { chefe: 0, mecanico: 1, torcedor: 2 };

  GW.pages.support = async (p, el, tk) => {
    const [cfg, sup] = await Promise.all([getJ('data/support.json'), getJ('data/supporters.json')]);
    if (!GW.alive(tk)) return;
    const c = cfg || {}, pix = c.pix || {}, links = (c.links || []).filter((l) => l.url), ct = c.contact || {}, tiers = c.tiers || [];
    const people = (sup || []).slice().sort((a, b) => (RANK[a.tier] ?? 9) - (RANK[b.tier] ?? 9) || String(a.since || '').localeCompare(String(b.since || '')));
    const tierName = (id) => (tiers.find((t) => t.id === id) || {}).name || 'Apoiador';
    const hasPay = pix.key || links.length;

    el.innerHTML = `<div class="page-head"><div><span class="eyebrow">Apoie o projeto</span><h1>Apoie o RaceLab F1</h1><p class="sub">O RaceLab F1 é gratuito e sem anúncios. O apoio ajuda a pagar domínio, hospedagem e o tempo para criar novas análises. Apoiadores aparecem no Mural com o selo de <b>Apoiador oficial</b>.</p></div></div>
    ${tiers.length ? `<div class="grid g3 sup-tiers">${tiers.map((t) => `<div class="card sup-tier t-${esc(t.id)}"><span class="chip">${esc(t.name)}</span><div class="sup-price">${esc(t.price)}</div><ul>${(t.perks || []).map((k) => `<li>${esc(k)}</li>`).join('')}</ul></div>`).join('')}</div><p class="note mt-s">${GW.ic('info')}<span>Qualquer valor ajuda. Se quiser contribuir com outro valor, o selo de Apoiador oficial vale para todos.</span></p>` : ''}
    <div class="grid g2 mt">
      <div class="card"><div class="card-h"><h2>Como apoiar</h2></div>
        ${hasPay ? `${pix.key ? `<div class="sup-pix"><b>Pix</b><div class="sup-key"><code id="pixk">${esc(pix.key)}</code><button class="btn sm" id="pixc">Copiar</button></div>${pix.name ? `<small class="muted">Favorecido: ${esc(pix.name)}</small>` : ''}${pix.qr ? `<img class="sup-qr" src="${esc(pix.qr)}" alt="QR Code do Pix" loading="lazy">` : ''}</div>` : ''}
        ${links.length ? `<div class="row mt-s" style="gap:8px;flex-wrap:wrap">${links.map((l) => `<a class="btn pri" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)}</a>`).join('')}</div>` : ''}`
        : `<p class="muted">As formas de apoio serão divulgadas em breve.</p>`}
        <p class="note mt-s">${GW.ic('info')}<span>Ao finalizar o pagamento, você em breve será <b>Apoiador oficial</b>. Preencha o formulário ao lado e escolha se quer aparecer no Mural ou apoiar de forma anônima. A confirmação é feita manualmente, por isso pode levar alguns dias.</span></p>
      </div>
      <div class="card"><div class="card-h"><h2>Já apoiou? Confirme aqui</h2></div>
        ${ct.email ? `<form id="supf" class="sup-form"><div class="ctl"><label for="sn">Seu nome ou apelido</label><input id="sn" required maxlength="40" placeholder="Como podemos te chamar"></div>
        <div class="ctl"><label for="st">Nível</label><select id="st">${tiers.map((t) => `<option value="${esc(t.id)}">${esc(t.name)} — ${esc(t.price)}</option>`).join('') || '<option>Apoiador</option>'}</select></div>
        <div class="ctl"><label for="sl">Link opcional (site ou perfil)</label><input id="sl" type="url" placeholder="https://"></div>
        <div class="ctl"><label for="sm">Mensagem opcional</label><input id="sm" maxlength="100" placeholder="Ex.: Vai, RaceLab!"></div>
        <label class="sup-opt"><input type="checkbox" id="sv" checked> <span>Quero aparecer no Mural de Apoiadores</span></label><small class="muted">Desmarcado, você continua sendo Apoiador oficial, mas seu nome não é exibido no site.</small>
        <button class="btn pri" type="submit">Enviar por e-mail</button></form>` : `<p class="muted">Confirmação em breve.</p>`}
      </div>
    </div>
    <div class="card mt"><div class="card-h"><h2>Mural de Apoiadores</h2><span class="meta">${people.length ? people.length + (people.length === 1 ? ' apoiador' : ' apoiadores') : ''}</span></div>
      ${people.length ? `<div class="sup-wall">${people.map((a) => { const n = esc(a.name), inner = `<span class="sup-name">${a.url && RANK[a.tier] <= 1 ? `<a href="${esc(a.url)}" target="_blank" rel="noopener nofollow">${n}</a>` : n}</span><span class="chip sup-badge b-${esc(a.tier)}">${esc(tierName(a.tier))}</span>${a.message ? `<small class="muted">“${esc(a.message)}”</small>` : ''}`; return `<div class="sup-p t-${esc(a.tier)}">${inner}</div>`; }).join('')}</div>` : GW.empty('Seja a primeira pessoa no Mural', 'O espaço de Apoiador oficial está aberto. Apoie e apareça aqui.')}
    </div>
    <div class="card mt sup-spon"><div class="card-h"><h2>Patrocínio</h2></div>
      <p>Quer associar sua marca a um público apaixonado por Fórmula 1 e dados? O RaceLab F1 oferece espaços discretos, que não atrapalham a análise:</p>
      <ul><li>Logo e link no rodapé e na Home</li><li>Página de parceiro com texto e link</li><li>Menção nas divulgações de cada Grande Prêmio</li><li>Formatos sob medida para o seu objetivo</li></ul>
      <p class="muted">Envie uma mensagem com o nome da marca e o objetivo. Respondo com o material de apresentação.</p>
      ${ct.email ? `<a class="btn pri" id="spon" href="${esc(mail(ct.email, 'Patrocínio RaceLab F1', 'Olá! Tenho interesse em patrocinar o RaceLab F1.\n\nMarca:\nSite:\nObjetivo:\nOrçamento aproximado:\n'))}">Falar sobre patrocínio</a>` : `<p class="muted">Contato em breve.</p>`}${ct.telegram ? ` <a class="btn" href="${esc(ct.telegram)}" target="_blank" rel="noopener">Telegram</a>` : ''}
    </div>`;

    const pc = $('#pixc', el);
    if (pc) pc.onclick = async () => { try { await navigator.clipboard.writeText(pix.key); pc.textContent = 'Copiado!'; } catch { const r = document.createRange(); r.selectNodeContents($('#pixk', el)); const s = getSelection(); s.removeAllRanges(); s.addRange(r); pc.textContent = 'Selecionado'; } setTimeout(() => (pc.textContent = 'Copiar'), 1800); };
    const f = $('#supf', el);
    if (f) f.onsubmit = (e) => { e.preventDefault(); const v = (i) => $('#' + i, el).value.trim(); location.href = mail(ct.email, 'Mural de Apoiadores RaceLab F1', `Quero aparecer no Mural de Apoiadores.\n\nNome: ${v('sn')}\nNível: ${tierName(v('st'))}\nAparecer no Mural: ${$('#sv', el).checked ? 'sim' : 'não (apoio anônimo)'}\nLink: ${v('sl')}\nMensagem: ${v('sm')}\n\n(Anexe o comprovante do apoio.)`); };
  };
})();
