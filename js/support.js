/* RaceLab F1 — Apoie: assistente em 3 passos (valor, Pix, confirmação), mural de apoiadores e patrocínio */
(function () {
  'use strict';
  const { esc, $, $$ } = GW.util;
  const getJ = (u) => fetch(u, { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const enc = encodeURIComponent;
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
    const tierOf = (id) => tiers.find((t) => t.id === id) || {};
    const tierName = (id) => tierOf(id).name || 'Apoiador';
    const S = { step: 1, tier: (tiers.find((t) => t.id === 'mecanico') || tiers[0] || {}).id, custom: 0, name: '', msg: '', link: '', show: true, sent: GW.store.get('apoio', null), code: 'RL-' + Date.now().toString(36).slice(-5).toUpperCase() };
    const amount = () => (S.custom > 0 ? S.custom : tierOf(S.tier).amount || 0);
    const pixTxt = () => pixCode(pix, amount());
    const canLink = () => S.custom > 0 || RANK[S.tier] <= 1;
    const message = () => `Olá! Fiz um apoio ao RaceLab F1 e quero confirmar.\n\nCódigo: ${S.code}\nNome: ${S.name}\nNível: ${S.custom > 0 ? 'Outro valor' : tierName(S.tier)}\nValor: ${amount() ? brl(amount()) : '—'}\nAparecer no Mural: ${S.show ? 'sim' : 'não (apoio anônimo)'}${S.msg ? `\nMensagem: ${S.msg}` : ''}${S.link && canLink() ? `\nLink: ${S.link}` : ''}\n\n(Anexe o comprovante do Pix.)`;
    const subject = () => `Apoio RaceLab F1 — ${S.code}`;
    const faq = [
      ['Para onde vai o dinheiro?', 'Para domínio, hospedagem e para o tempo de desenvolvimento de novas análises e melhorias. O site continua gratuito e sem anúncios.'],
      ['Posso apoiar sem aparecer no site?', 'Sim. No passo 3, desligue “Aparecer no Mural”. Você continua sendo Apoiador oficial, mas seu nome não é exibido.'],
      ['Quanto tempo leva para eu virar Apoiador oficial?', 'A confirmação é manual: confiro o Pix e adiciono você ao Mural. Costuma levar até alguns dias.'],
      ['O apoio é mensal?', 'Não. É um Pix único, no valor que você escolher. Se quiser apoiar de novo no futuro, fico muito grato.'],
    ];
    const STEPS = [['Escolha o valor', 'Nível ou valor livre'], ['Faça o Pix', 'QR Code ou copia e cola'], ['Confirme', 'Vire Apoiador oficial']];

    el.innerHTML = `
    <section class="sp-hero">
      <div class="sp-hero-txt">
        <span class="sp-pill">${GW.ic('star')} Apoie o projeto</span>
        <h1>Ajude o RaceLab F1 a continuar de pé</h1>
        <p>O RaceLab F1 é gratuito e sem anúncios. Seu apoio paga domínio, hospedagem e o tempo para criar novas análises, e você entra no <b>Mural de Apoiadores</b> com o selo de <b>Apoiador oficial</b>.</p>
        <div class="sp-cta"><a class="btn pri lg" href="#" data-go="sp-wiz">Apoiar agora</a><a class="btn lg" href="#" data-go="sp-spon">Sou uma marca</a></div>
        <ul class="sp-uses"><li>Hospedagem e domínio</li><li>Dados sempre atualizados</li><li>Novas análises e telas</li></ul>
      </div>
      <div class="sp-preview" aria-hidden="true">
        <div class="sp-pv-card b2"></div><div class="sp-pv-card b1"></div>
        <div class="sp-pv-card main"><div class="sp-pv-top"><span class="sp-av lg">${GW.ic('star')}</span><div><b>Seu nome aqui</b><span class="sp-badge b-chefe">Apoiador oficial</span></div></div><p>“Vai, RaceLab!”</p><ul><li>Selo no Mural de Apoiadores</li><li>Mensagem e link opcionais</li><li>Apoie do seu jeito, com ou sem nome</li></ul></div>
      </div>
    </section>

    <section id="sp-wiz" class="sp-wiz card"><nav class="sp-stepper" id="spst" aria-label="Passos do apoio"></nav><div class="sp-panel" id="sppn"></div></section>

    <section class="card mt sp-wall-card"><div class="card-h"><h2>Mural de Apoiadores</h2><span class="meta">${people.length ? people.length + (people.length === 1 ? ' apoiador' : ' apoiadores') : ''}</span></div>
      ${people.length ? `<div class="sp-wall">${people.map((a) => `<div class="sp-p t-${esc(a.tier)}"><span class="sp-av">${esc(String(a.name || '?').trim().charAt(0).toUpperCase())}</span><div class="sp-pi"><span class="sp-name">${a.url && RANK[a.tier] <= 1 ? `<a href="${esc(a.url)}" target="_blank" rel="noopener nofollow">${esc(a.name)}</a>` : esc(a.name)}</span><span class="sp-badge b-${esc(a.tier)}">${esc(tierName(a.tier))}</span>${a.message ? `<small>“${esc(a.message)}”</small>` : ''}</div></div>`).join('')}</div>`
      : `<div class="sp-empty"><div class="sp-wall ghost"><div class="sp-p"><span class="sp-av">?</span><div class="sp-pi"><span class="sp-name">Sua vaga</span><span class="sp-badge b-chefe">Apoiador oficial</span></div></div><div class="sp-p"><span class="sp-av">?</span><div class="sp-pi"><span class="sp-name">Sua vaga</span><span class="sp-badge b-mecanico">Apoiador oficial</span></div></div><div class="sp-p"><span class="sp-av">?</span><div class="sp-pi"><span class="sp-name">Sua vaga</span><span class="sp-badge b-torcedor">Apoiador oficial</span></div></div></div><p>O Mural está começando. Seja a primeira pessoa a aparecer aqui.</p></div>`}
    </section>

    <div class="sp-two mt">
      <section id="sp-spon" class="card sp-spon"><span class="sp-pill">Para marcas</span><h2>Patrocine o RaceLab F1</h2><p>Associe sua marca a um público apaixonado por Fórmula 1 e análise de dados, com espaços discretos que não atrapalham a leitura.</p>
        <ul class="sp-checks"><li>Logo e link no rodapé e na Home</li><li>Página de parceiro com texto e link</li><li>Menção nas divulgações de cada Grande Prêmio</li><li>Formatos sob medida para o seu objetivo</li></ul>
        ${ct.email ? `<div class="sp-cta"><a class="btn pri" href="mailto:${esc(ct.email)}?subject=${enc('Patrocínio RaceLab F1')}&body=${enc('Olá! Tenho interesse em patrocinar o RaceLab F1.\n\nMarca:\nSite:\nObjetivo:\nOrçamento aproximado:\n')}">Falar sobre patrocínio</a><a class="btn" target="_blank" rel="noopener" href="https://mail.google.com/mail/?view=cm&fs=1&to=${enc(ct.email)}&su=${enc('Patrocínio RaceLab F1')}">Abrir no Gmail</a></div>` : '<p class="muted">Contato em breve.</p>'}</section>
      <section class="card sp-faqc"><h2>Perguntas frequentes</h2><div class="sp-faq">${faq.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('')}</div></section>
    </div>`;

    $$('[data-go]', el).forEach((a) => (a.onclick = (e) => { e.preventDefault(); const t = document.getElementById(a.dataset.go); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); }));

    /* ---------- assistente ---------- */
    const stepper = () => { $('#spst', el).innerHTML = STEPS.map(([t, s], i) => `<button type="button" class="sp-st ${S.step === i + 1 ? 'on' : ''} ${S.step > i + 1 ? 'done' : ''}" data-st="${i + 1}"><b>${S.step > i + 1 ? '✓' : i + 1}</b><span><em>${t}</em><small>${s}</small></span></button>`).join(''); $$('.sp-st', el).forEach((b) => (b.onclick = () => go(+b.dataset.st))); };
    const go = (n) => { if (n > 1 && !(amount() > 0 || !tiers.length)) n = 1; S.step = n; draw(); const w = $('#sp-wiz', el); if (w && w.getBoundingClientRect().top < 0) w.scrollIntoView({ behavior: 'smooth', block: 'start' }); };

    const tierCard = (t) => `<label class="sp-tier t-${esc(t.id)}"><input type="radio" name="tier" value="${esc(t.id)}" ${S.custom <= 0 && t.id === S.tier ? 'checked' : ''}><span class="sp-tier-in"><span class="sp-tier-name">${esc(t.name)}</span><b class="sp-price">${esc(t.price)}</b><ul>${(t.perks || []).map((k) => `<li>${esc(k)}</li>`).join('')}</ul></span></label>`;

    function step1(p) {
      p.innerHTML = `<h2>Escolha o valor do seu apoio</h2><p class="sp-sub">Todos os níveis recebem o selo de Apoiador oficial. Escolha o que cabe no seu bolso.</p>
        <div class="sp-tiers">${tiers.map(tierCard).join('')}</div>
        <label class="sp-f sp-money"><span>Ou digite outro valor</span><div><i>R$</i><input id="spv" inputmode="decimal" placeholder="0,00" autocomplete="off" value="${S.custom > 0 ? String(S.custom).replace('.', ',') : ''}"></div></label>
        <div class="sp-nav"><span class="sp-total">Total: <b id="sptot">${amount() ? brl(amount()) : '—'}</b></span><button class="btn pri lg" id="spn1" type="button" ${amount() > 0 ? '' : 'disabled'}>Continuar para o Pix</button></div>`;
      const upd = () => { $('#sptot', p).textContent = amount() ? brl(amount()) : '—'; $('#spn1', p).disabled = !(amount() > 0); };
      $$('input[name=tier]', p).forEach((r) => (r.onchange = () => { S.tier = r.value; S.custom = 0; $('#spv', p).value = ''; upd(); }));
      $('#spv', p).oninput = (e) => { const n = parseFloat(e.target.value.replace(/\./g, '').replace(',', '.')); S.custom = n > 0 && n < 100000 ? n : 0; $$('input[name=tier]', p).forEach((r) => (r.checked = S.custom <= 0 && r.value === S.tier)); upd(); };
      $('#spn1', p).onclick = () => go(2);
    }

    function step2(p) {
      if (!pix.key) { p.innerHTML = '<h2>Faça o Pix</h2><p class="sp-sub">As formas de apoio serão divulgadas em breve.</p>'; return; }
      p.innerHTML = `<h2>Faça o Pix de ${brl(amount())}</h2><p class="sp-sub">Abra o app do seu banco, escolha Pix e leia o QR Code ou cole o código. O valor já vai preenchido.</p>
        <div class="sp-pixbox"><div class="sp-qr" id="spqr" aria-label="QR Code do Pix"><small>Gerando QR…</small></div>
          <div class="sp-pixinfo">
            <div class="sp-field"><small>Pix copia e cola</small><code class="sp-code" id="spcode"></code></div>
            <button class="btn pri" id="pixcc" type="button">Copiar Pix copia e cola</button>
            <div class="sp-field"><small>Ou use a chave Pix</small><code id="pixk">${esc(pix.key)}</code></div>
            <button class="btn" id="pixc" type="button">Copiar chave</button>
            ${links.map((l) => `<a class="btn" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)}</a>`).join('')}
          </div></div>
        <div class="sp-nav"><button class="btn" id="spb2" type="button">Voltar</button><button class="btn pri lg" id="spn2" type="button">Já fiz o Pix</button></div>`;
      const code = pixTxt(); $('#spcode', p).textContent = code;
      qrSvg(code).then((svg) => { const q = $('#spqr', p); if (q && GW.alive(tk)) q.innerHTML = svg || '<small>QR indisponível. Use o código ao lado.</small>'; });
      const flash = (b, t) => { const o = b.textContent; b.textContent = t; setTimeout(() => (b.textContent = o), 1800); };
      const copy = async (text, b, node) => { try { await navigator.clipboard.writeText(text); flash(b, 'Copiado!'); } catch { const r = document.createRange(); r.selectNodeContents(node); const s = getSelection(); s.removeAllRanges(); s.addRange(r); flash(b, 'Selecionado'); } };
      $('#pixcc', p).onclick = (e) => copy(code, e.target, $('#spcode', p));
      $('#pixc', p).onclick = (e) => copy(pix.key, e.target, $('#pixk', p));
      $('#spb2', p).onclick = () => go(1); $('#spn2', p).onclick = () => go(3);
    }

    function step3(p) {
      if (S.sent && S.sent.done && S.step === 3 && S.thanks) {
        p.innerHTML = `<div class="sp-thanks"><div class="sp-ok">✓</div><h2>Obrigado pelo apoio!</h2><p>Se o e-mail não abriu, use o botão para copiar a mensagem e envie para <b>${esc(ct.email || '')}</b> com o comprovante. Quando eu confirmar o Pix, você vira <b>Apoiador oficial</b> em até alguns dias${S.show ? ' e aparece no Mural' : ', sem ter o nome exibido'}.</p><div class="sp-code-box">Seu código: <b>${esc(S.code)}</b></div><div class="sp-nav"><button class="btn" id="spcp" type="button">Copiar mensagem</button><button class="btn" id="sped" type="button">Editar dados</button></div></div>`;
        $('#spcp', p).onclick = async (e) => { try { await navigator.clipboard.writeText(message()); e.target.textContent = 'Copiado!'; } catch { e.target.textContent = 'Selecione e copie manualmente'; } };
        $('#sped', p).onclick = () => { S.thanks = false; draw(); };
        return;
      }
      p.innerHTML = `<h2>Confirme seu apoio</h2><p class="sp-sub">Conte como quer aparecer e envie o comprovante. Eu confirmo o Pix e te adiciono como <b>Apoiador oficial</b>.</p>
        <form id="supf" class="sp-form" novalidate>
          <label class="sp-f"><span>Seu nome ou apelido</span><input id="sn" maxlength="40" placeholder="Como podemos te chamar" autocomplete="name" value="${esc(S.name)}"></label>
          <label class="sp-switch"><input type="checkbox" id="sv" ${S.show ? 'checked' : ''}><i></i><span><b>Aparecer no Mural de Apoiadores</b><small id="svh"></small></span></label>
          <div class="sp-opt" id="spopt" ${S.show ? '' : 'hidden'}>
            <label class="sp-f"><span>Mensagem <em>(opcional)</em></span><input id="sm" maxlength="100" placeholder="Ex.: Vai, RaceLab!" value="${esc(S.msg)}"></label>
            ${canLink() ? `<label class="sp-f"><span>Link <em>(opcional)</em></span><input id="sl" type="url" placeholder="https://seusite.com" value="${esc(S.link)}"></label>` : ''}
          </div>
          ${ct.email ? `<div class="sp-send"><button class="btn pri lg" id="spgm" type="submit">Enviar pelo Gmail</button><button class="btn lg" id="spml" type="button">Usar outro e-mail</button></div><small class="sp-hint">Abre o e-mail já preenchido. É só anexar o comprovante do Pix e enviar.</small>` : '<p class="muted">A confirmação estará disponível em breve.</p>'}
        </form>
        ${S.sent && S.sent.done ? `<div class="sp-prev">Você já enviou uma confirmação em ${esc(S.sent.when)} (código ${esc(S.sent.code)}).</div>` : ''}
        <div class="sp-nav"><button class="btn" id="spb3" type="button">Voltar</button></div>`;
      const sv = $('#sv', p), svh = $('#svh', p), opt = $('#spopt', p);
      const hint = () => { svh.textContent = sv.checked ? 'Seu nome e mensagem ficam visíveis no site.' : 'Apoio anônimo: você é Apoiador oficial, mas seu nome não aparece.'; opt.hidden = !sv.checked; };
      const read = () => { S.name = $('#sn', p).value.trim(); S.show = sv.checked; S.msg = sv.checked ? ($('#sm', p) || {}).value?.trim() || '' : ''; S.link = sv.checked && $('#sl', p) ? $('#sl', p).value.trim() : ''; };
      sv.onchange = () => { read(); hint(); }; hint();
      const done = () => { S.sent = { done: true, when: new Date().toLocaleDateString('pt-BR'), code: S.code }; GW.store.set('apoio', S.sent); S.thanks = true; draw(); };
      const ok = () => { read(); const n = $('#sn', p); if (!S.name) { n.classList.add('bad'); n.focus(); return false; } return true; };
      $('#supf', p) && ($('#supf', p).onsubmit = (e) => { e.preventDefault(); if (!ok()) return; window.open(`https://mail.google.com/mail/?view=cm&fs=1&to=${enc(ct.email)}&su=${enc(subject())}&body=${enc(message())}`, '_blank', 'noopener'); done(); });
      const ml = $('#spml', p); if (ml) ml.onclick = () => { if (!ok()) return; location.href = `mailto:${ct.email}?subject=${enc(subject())}&body=${enc(message())}`; done(); };
      $('#spb3', p).onclick = () => { read(); go(2); };
    }

    function draw() { stepper(); const p = $('#sppn', el); [step1, step2, step3][S.step - 1](p); }
    draw();
  };
})();
