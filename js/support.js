/* RaceLab F1 — Apoie: valor, Pix (com QR e copia e cola), confirmação, mural de apoiadores e patrocínio */
(function () {
  'use strict';
  const { esc, $, $$ } = GW.util;
  const getJ = (u) => fetch(u, { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const mail = (to, subject, body) => `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  const RANK = { chefe: 0, mecanico: 1, torcedor: 2 };
  const brl = (n) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  /* ---------- Pix "copia e cola" (BR Code estático) ---------- */
  const tlv = (id, v) => id + String(v.length).padStart(2, '0') + v;
  const crc16 = (s) => { let c = 0xffff; for (let i = 0; i < s.length; i++) { c ^= s.charCodeAt(i) << 8; for (let k = 0; k < 8; k++) c = c & 0x8000 ? ((c << 1) ^ 0x1021) & 0xffff : (c << 1) & 0xffff; } return c.toString(16).toUpperCase().padStart(4, '0'); };
  const ascii = (s, n) => String(s || '').normalize('NFD').replace(/[^\x20-\x7e]/g, '').slice(0, n).toUpperCase();
  function pixCode(pix, amount) {
    const body = tlv('00', '01') + tlv('26', tlv('00', 'br.gov.bcb.pix') + tlv('01', pix.key)) + tlv('52', '0000') + tlv('53', '986') + (amount > 0 ? tlv('54', amount.toFixed(2)) : '') + tlv('58', 'BR') + tlv('59', ascii(pix.name || 'RaceLab F1', 25) || 'RACELAB F1') + tlv('60', ascii(pix.city || 'SAO PAULO', 15) || 'SAO PAULO') + tlv('62', tlv('05', '***')) + '6304';
    return body + crc16(body);
  }
  let qrLib = null;
  const loadQr = () => (qrLib = qrLib || new Promise((res) => { if (window.qrcode) return res(window.qrcode); const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js'; s.onload = () => res(window.qrcode); s.onerror = () => res(null); document.head.appendChild(s); }));
  async function qrSvg(text) { const q = await loadQr(); if (!q) return ''; const m = q(0, 'M'); m.addData(text); m.make(); return m.createSvgTag({ cellSize: 4, margin: 2, scalable: true }); }

  GW.pages.support = async (p, el, tk) => {
    const [cfg, sup] = await Promise.all([getJ('data/support.json'), getJ('data/supporters.json')]);
    if (!GW.alive(tk)) return;
    const c = cfg || {}, pix = c.pix || {}, links = (c.links || []).filter((l) => l.url), ct = c.contact || {}, tiers = c.tiers || [];
    const people = (sup || []).slice().sort((a, b) => (RANK[a.tier] ?? 9) - (RANK[b.tier] ?? 9) || String(a.since || '').localeCompare(String(b.since || '')));
    const tierOf = (id) => tiers.find((t) => t.id === id);
    const tierName = (id) => (tierOf(id) || {}).name || 'Apoiador';
    let sel = (tiers.find((t) => t.id === 'mecanico') || tiers[0] || {}).id, custom = 0;

    const tierCard = (t) => `<label class="sp-tier t-${esc(t.id)}"><input type="radio" name="tier" value="${esc(t.id)}" ${t.id === sel ? 'checked' : ''}><span class="sp-tier-in"><span class="sp-tier-name">${esc(t.name)}</span><b class="sp-price">${esc(t.price)}</b><ul>${(t.perks || []).map((k) => `<li>${esc(k)}</li>`).join('')}</ul></span></label>`;
    const faq = [
      ['Para onde vai o dinheiro?', 'Para domínio, hospedagem e para o tempo de desenvolvimento de novas análises e melhorias. O site continua gratuito e sem anúncios.'],
      ['Posso apoiar sem aparecer no site?', 'Sim. Na confirmação, desmarque “Quero aparecer no Mural”. Você continua sendo Apoiador oficial, mas seu nome não é exibido.'],
      ['Quanto tempo leva para eu virar Apoiador oficial?', 'A confirmação é manual: confiro o Pix e adiciono você ao Mural. Costuma levar até alguns dias.'],
      ['O apoio é mensal?', 'Não. É um Pix único, no valor que você escolher. Se quiser apoiar de novo no futuro, fico muito grato.'],
    ];

    el.innerHTML = `
    <section class="sp-hero">
      <div class="sp-heart">${GW.ic('star')}</div>
      <span class="eyebrow">Apoie o projeto</span>
      <h1>Ajude o RaceLab F1 a continuar de pé</h1>
      <p>O RaceLab F1 é gratuito e sem anúncios. Seu apoio paga domínio, hospedagem e o tempo para criar novas análises — e você entra no <b>Mural de Apoiadores</b> com o selo de <b>Apoiador oficial</b>.</p>
      <div class="row" style="gap:10px;flex-wrap:wrap"><a class="btn pri" href="#" data-go="sp-pay">Apoiar agora</a><a class="btn" href="#" data-go="sp-spon">Quero patrocinar</a></div>
      <div class="sp-uses"><span>Hospedagem e domínio</span><span>Dados sempre atualizados</span><span>Novas análises e telas</span></div>
    </section>

    <ol class="sp-steps"><li><b>1</b><span>Escolha um nível</span></li><li><b>2</b><span>Faça o Pix</span></li><li><b>3</b><span>Confirme e vire Apoiador oficial</span></li></ol>

    <section id="sp-pay" class="sp-pay">
      <div class="card sp-col">
        <div class="card-h"><h2><span class="sp-n">1</span> Escolha o nível</h2></div>
        <div class="sp-tiers">${tiers.map(tierCard).join('')}</div>
        <div class="sp-other"><label for="spv">Prefere outro valor?</label><div class="sp-money"><span>R$</span><input id="spv" inputmode="decimal" placeholder="0,00" autocomplete="off"></div></div>
        <div class="card-h mt"><h2><span class="sp-n">2</span> Faça o Pix</h2></div>
        ${pix.key ? `<div class="sp-pixbox"><div class="sp-qr" id="spqr" aria-label="QR Code do Pix"></div><div class="sp-pixinfo"><div class="sp-sum" id="spsum"></div>
          <div class="sp-field"><small>Chave Pix</small><code id="pixk">${esc(pix.key)}</code></div>
          <div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn sm" id="pixc" type="button">Copiar chave</button><button class="btn sm pri" id="pixcc" type="button">Copiar Pix copia e cola</button></div>
          <small class="muted">Abra o app do seu banco, escolha Pix e leia o QR Code ou cole o código. O valor já vai preenchido.</small></div></div>` : '<p class="muted">As formas de apoio serão divulgadas em breve.</p>'}
        ${links.length ? `<div class="row mt-s" style="gap:8px;flex-wrap:wrap">${links.map((l) => `<a class="btn" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)}</a>`).join('')}</div>` : ''}
      </div>
      <div class="card sp-col">
        <div class="card-h"><h2><span class="sp-n">3</span> Já apoiou? Confirme aqui</h2></div>
        ${ct.email ? `<form id="supf" class="sp-form" novalidate>
          <div class="ctl"><label for="sn">Seu nome ou apelido</label><input id="sn" required maxlength="40" placeholder="Como podemos te chamar" autocomplete="name"></div>
          <div class="ctl"><label for="sm">Mensagem (opcional)</label><input id="sm" maxlength="100" placeholder="Ex.: Vai, RaceLab!"></div>
          <div class="ctl"><label for="sl">Link (opcional)</label><input id="sl" type="url" placeholder="https://seusite.com"></div>
          <label class="sp-switch"><input type="checkbox" id="sv" checked><i></i><span><b>Aparecer no Mural de Apoiadores</b><small id="svh">Seu nome e mensagem ficam visíveis no site.</small></span></label>
          <button class="btn pri sp-send" type="submit">Enviar confirmação por e-mail</button>
          <small class="muted">Vai abrir seu e-mail com tudo preenchido. Anexe o comprovante do Pix e envie.</small>
        </form><div id="spdone" class="sp-done" hidden><div class="sp-heart sm">${GW.ic('star')}</div><h3>Obrigado pelo apoio!</h3><p>Seu e-mail foi aberto. Assim que eu receber o comprovante, você vira <b>Apoiador oficial</b> em até alguns dias.</p><button class="btn sm" id="spback" type="button">Voltar ao formulário</button></div>` : '<p class="muted">A confirmação estará disponível em breve.</p>'}
      </div>
    </section>

    <section class="card mt sp-wall-card"><div class="card-h"><h2>Mural de Apoiadores</h2><span class="meta">${people.length ? people.length + (people.length === 1 ? ' apoiador' : ' apoiadores') : ''}</span></div>
      ${people.length ? `<div class="sp-wall">${people.map((a) => `<div class="sp-p t-${esc(a.tier)}"><span class="sp-av">${esc(String(a.name || '?').trim().charAt(0).toUpperCase())}</span><div class="sp-pi"><span class="sp-name">${a.url && RANK[a.tier] <= 1 ? `<a href="${esc(a.url)}" target="_blank" rel="noopener nofollow">${esc(a.name)}</a>` : esc(a.name)}</span><span class="sp-badge b-${esc(a.tier)}">${esc(tierName(a.tier))}</span>${a.message ? `<small>“${esc(a.message)}”</small>` : ''}</div></div>`).join('')}</div>`
      : `<div class="sp-empty"><div class="sp-wall ghost"><div class="sp-p"><span class="sp-av">?</span><div class="sp-pi"><span class="sp-name">Sua vaga</span><span class="sp-badge b-chefe">Apoiador oficial</span></div></div><div class="sp-p"><span class="sp-av">?</span><div class="sp-pi"><span class="sp-name">Sua vaga</span><span class="sp-badge b-mecanico">Apoiador oficial</span></div></div><div class="sp-p"><span class="sp-av">?</span><div class="sp-pi"><span class="sp-name">Sua vaga</span><span class="sp-badge b-torcedor">Apoiador oficial</span></div></div></div><p>O Mural está começando. Seja a primeira pessoa a aparecer aqui.</p><a class="btn pri" href="#" data-go="sp-pay">Apoiar agora</a></div>`}
    </section>

    <section id="sp-spon" class="card mt sp-spon"><div class="sp-spon-in"><div><span class="eyebrow">Para marcas</span><h2>Patrocine o RaceLab F1</h2><p>Associe sua marca a um público apaixonado por Fórmula 1 e análise de dados, com espaços discretos que não atrapalham a leitura.</p>
      ${ct.email ? `<div class="row" style="gap:10px;flex-wrap:wrap"><a class="btn pri" href="${esc(mail(ct.email, 'Patrocínio RaceLab F1', 'Olá! Tenho interesse em patrocinar o RaceLab F1.\n\nMarca:\nSite:\nObjetivo:\nOrçamento aproximado:\n'))}">Falar sobre patrocínio</a>${ct.telegram ? `<a class="btn" href="${esc(ct.telegram)}" target="_blank" rel="noopener">Telegram</a>` : ''}</div>` : '<p class="muted">Contato em breve.</p>'}</div>
      <ul class="sp-checks"><li>Logo e link no rodapé e na Home</li><li>Página de parceiro com texto e link</li><li>Menção nas divulgações de cada Grande Prêmio</li><li>Formatos sob medida para o seu objetivo</li></ul></div></section>

    <section class="card mt"><div class="card-h"><h2>Perguntas frequentes</h2></div><div class="sp-faq">${faq.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('')}</div></section>`;

    /* rolagem suave para as seções */
    $$('[data-go]', el).forEach((a) => (a.onclick = (e) => { e.preventDefault(); const t = document.getElementById(a.dataset.go); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); }));

    /* valor + Pix */
    const amount = () => (custom > 0 ? custom : ((tierOf(sel) || {}).amount || 0));
    let code = '';
    const refresh = async () => {
      if (!pix.key) return;
      const v = amount(); code = pixCode(pix, v);
      $('#spsum', el).innerHTML = v ? `Valor: <b>${brl(v)}</b>${custom > 0 ? '' : ` · ${esc(tierName(sel))}`}` : 'Valor: <b>você escolhe no app do banco</b>';
      const svg = await qrSvg(code); if (!GW.alive(tk)) return; const q = $('#spqr', el); if (q) q.innerHTML = svg || '<small class="muted">QR indisponível. Use o código.</small>';
    };
    $$('input[name=tier]', el).forEach((r) => (r.onchange = () => { sel = r.value; custom = 0; $('#spv', el).value = ''; refresh(); }));
    const spv = $('#spv', el);
    if (spv) spv.oninput = () => { const n = parseFloat(spv.value.replace(/\./g, '').replace(',', '.')); custom = n > 0 && n < 100000 ? n : 0; if (custom) $$('input[name=tier]', el).forEach((r) => (r.checked = false)); else $$('input[name=tier]', el).forEach((r) => (r.checked = r.value === sel)); refresh(); };
    const flash = (b, t) => { const o = b.textContent; b.textContent = t; setTimeout(() => (b.textContent = o), 1800); };
    const copy = async (text, b) => { try { await navigator.clipboard.writeText(text); flash(b, 'Copiado!'); } catch { const r = document.createRange(); r.selectNodeContents($('#pixk', el)); const s = getSelection(); s.removeAllRanges(); s.addRange(r); flash(b, 'Selecionado'); } };
    const pc = $('#pixc', el); if (pc) pc.onclick = () => copy(pix.key, pc);
    const pcc = $('#pixcc', el); if (pcc) pcc.onclick = () => copy(code, pcc);
    refresh();

    /* confirmação */
    const f = $('#supf', el);
    if (f) {
      const sv = $('#sv', el), svh = $('#svh', el);
      sv.onchange = () => (svh.textContent = sv.checked ? 'Seu nome e mensagem ficam visíveis no site.' : 'Apoio anônimo: você é Apoiador oficial, mas seu nome não aparece.');
      f.onsubmit = (e) => {
        e.preventDefault(); const nm = $('#sn', el); if (!nm.value.trim()) { nm.focus(); nm.classList.add('bad'); return; } nm.classList.remove('bad');
        const v = (i) => $('#' + i, el).value.trim(), val = amount();
        location.href = mail(ct.email, 'Mural de Apoiadores RaceLab F1', `Quero confirmar meu apoio ao RaceLab F1.\n\nNome: ${v('sn')}\nNível: ${custom > 0 ? 'Outro valor' : tierName(sel)}\nValor: ${val ? brl(val) : '—'}\nAparecer no Mural: ${sv.checked ? 'sim' : 'não (apoio anônimo)'}\nLink: ${v('sl')}\nMensagem: ${v('sm')}\n\n(Anexe o comprovante do Pix.)`);
        f.hidden = true; $('#spdone', el).hidden = false;
      };
      $('#spback', el).onclick = () => { f.hidden = false; $('#spdone', el).hidden = true; };
    }
  };
})();
