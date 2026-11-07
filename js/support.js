/* RaceLab F1 — Apoie: assistente em 3 passos (valor, dados, pagamento via Paddle), mural de apoiadores e patrocínio */
(function () {
  'use strict';
  const { esc, $, $$ } = GW.util;
  const getJ = (u) => fetch(u, { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const enc = encodeURIComponent;
  const RANK = { chefe: 0, mecanico: 1, torcedor: 2 };
  const brl = (n) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  /* ---------- Paddle ---------- */
  const api = (u, o) => fetch(u, o).then((r) => r.json().catch(() => ({})).then((j) => ({ ok: r.ok, j }))).catch(() => ({ ok: false, j: {} }));
  let padP = null;
  const loadPaddle = (cfg, onEvent) => (padP = padP || new Promise((res) => {
    const init = () => { try { if (cfg.env === 'sandbox') window.Paddle.Environment.set('sandbox'); window.Paddle.Initialize({ token: cfg.token, eventCallback: (e) => onEvent && onEvent(e) }); res(window.Paddle); } catch { res(null); } };
    if (window.Paddle) return init();
    const s = document.createElement('script'); s.src = 'https://cdn.paddle.com/paddle/v2/paddle.js'; s.onload = init; s.onerror = () => res(null); document.head.appendChild(s);
  }));

  GW.pages.support = async (p, el, tk) => {
    const [cfg, sup0, pc, wall] = await Promise.all([getJ('data/support.json'), getJ('data/supporters.json'), api('/api/apoiar?cfg=1'), api('/api/apoiar?list=1')]);
    const sup = wall.ok && Array.isArray(wall.j.people) ? wall.j.people : sup0;
    const PC = pc.ok ? pc.j : {};
    if (!GW.alive(tk)) return;
    const c = cfg || {}, ct = c.contact || {}, tiers = c.tiers || [];
    const people = (sup || []).slice().sort((a, b) => (RANK[a.tier] ?? 9) - (RANK[b.tier] ?? 9) || String(a.since || '').localeCompare(String(b.since || '')));
    const tierOf = (id) => tiers.find((t) => t.id === id) || {};
    const tierName = (id) => tierOf(id).name || 'Apoiador';
    const S = { step: 1, tier: (tiers.find((t) => t.id === 'mecanico') || tiers[0] || {}).id, custom: 0, name: '', msg: '', link: '', show: true, txn: null };
    const amount = () => (S.custom > 0 ? S.custom : tierOf(S.tier).amount || 0);
    const canLink = () => S.custom > 0 || RANK[S.tier] <= 1;
    const faq = [
      ['Para onde vai o dinheiro?', 'Para domínio, hospedagem e para o tempo de desenvolvimento de novas análises e melhorias. O site continua gratuito e sem anúncios.'],
      ['Posso apoiar sem aparecer no site?', 'Sim. No passo 2, desligue “Aparecer no Mural”. Você continua sendo Apoiador oficial, mas seu nome não é exibido.'],
      ['Quanto tempo leva para eu virar Apoiador oficial?', 'É automático: assim que o pagamento é aprovado, você vira Apoiador oficial e, se escolheu aparecer, seu nome entra no Mural em poucos minutos.'],
      ['Posso pedir reembolso?', 'Não. O apoio é uma contribuição voluntária e não é reembolsável, então confira o valor antes de pagar. Em caso de cobrança em duplicidade ou com valor errado, escreva para o e-mail de contato e verificamos.'],
      ['O apoio é mensal?', 'Não. É um pagamento único, no valor que você escolher. Se quiser apoiar de novo no futuro, fico muito grato.'],
    ];
    const STEPS = [['Escolha o valor', 'Nível ou valor livre'], ['Seus dados', 'Como quer aparecer'], ['Pagamento', 'Confirmação automática']];

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
    const go = (n) => { if (n > 1 && !(amount() > 0)) n = 1; if (n === 2 && S.step === 3) n = 1; S.step = n; draw(); const w = $('#sp-wiz', el); if (w && w.getBoundingClientRect().top < 0) w.scrollIntoView({ behavior: 'smooth', block: 'start' }); };

    const tierCard = (t) => `<label class="sp-tier t-${esc(t.id)}"><input type="radio" name="tier" value="${esc(t.id)}" ${S.custom <= 0 && t.id === S.tier ? 'checked' : ''}><span class="sp-tier-in"><span class="sp-tier-name">${esc(t.name)}</span><b class="sp-price">${esc(t.price)}</b><ul>${(t.perks || []).map((k) => `<li>${esc(k)}</li>`).join('')}</ul></span></label>`;

    function step1(p) {
      p.innerHTML = `<h2>Escolha o valor do seu apoio</h2><p class="sp-sub">Todos os níveis recebem o selo de Apoiador oficial. Escolha o que cabe no seu bolso.</p>
        <div class="sp-tiers">${tiers.map(tierCard).join('')}</div>
        <label class="sp-f sp-money"><span>Ou digite outro valor</span><div><i>R$</i><input id="spv" inputmode="decimal" placeholder="mín. 5,00" autocomplete="off" value="${S.custom > 0 ? String(S.custom).replace('.', ',') : ''}"></div></label>
        <div class="sp-nav"><span class="sp-total">Total: <b id="sptot">${amount() ? brl(amount()) : '—'}</b></span><button class="btn pri lg" id="spn1" type="button" ${amount() > 0 ? '' : 'disabled'}>Continuar</button></div>`;
      const upd = () => { $('#sptot', p).textContent = amount() ? brl(amount()) : '—'; $('#spn1', p).disabled = !(amount() > 0); };
      $$('input[name=tier]', p).forEach((r) => (r.onchange = () => { S.tier = r.value; S.custom = 0; $('#spv', p).value = ''; upd(); }));
      $('#spv', p).oninput = (e) => { const n = parseFloat(e.target.value.replace(/\./g, '').replace(',', '.')); S.custom = n >= (PC.min || 5) && n <= (PC.max || 1000) ? n : 0; $$('input[name=tier]', p).forEach((r) => (r.checked = S.custom <= 0 && r.value === S.tier)); upd(); };
      $('#spn1', p).onclick = () => go(2);
    }

    function step2(p) {
      p.innerHTML = `<h2>Como você quer aparecer?</h2><p class="sp-sub">Seu apoio de <b>${brl(amount())}</b> é confirmado automaticamente assim que o pagamento é aprovado. O apoio é voluntário e não é reembolsável.</p>
        <form id="supf" class="sp-form" novalidate>
          <label class="sp-switch"><input type="checkbox" id="sv" ${S.show ? 'checked' : ''}><i></i><span><b>Aparecer no Mural de Apoiadores</b><small id="svh"></small></span></label>
          <div class="sp-opt" id="spopt" ${S.show ? '' : 'hidden'}>
            <label class="sp-f"><span>Seu nome ou apelido</span><input id="sn" maxlength="40" placeholder="Como podemos te chamar" autocomplete="nickname" value="${esc(S.name)}"></label>
            <label class="sp-f"><span>Mensagem <em>(opcional)</em></span><input id="sm" maxlength="100" placeholder="Ex.: Vai, RaceLab!" value="${esc(S.msg)}"></label>
            ${canLink() ? `<label class="sp-f"><span>Link <em>(opcional)</em></span><input id="sl" type="url" placeholder="https://seusite.com" value="${esc(S.link)}"></label>` : ''}
          </div>
          <p class="sp-err" id="sperr" role="alert" hidden></p>
          <div class="sp-nav"><button class="btn" id="spb2" type="button">Voltar</button><button class="btn pri lg" id="spn2" type="submit" ${PC.ready ? '' : 'disabled'}>${PC.ready ? 'Pagar ' + brl(amount()) : 'Pagamento em breve'}</button></div>
          <small class="sp-hint">Pagamento seguro em janela da Paddle. Você pode apoiar sem aparecer: desligue a opção acima.</small>
          <small class="sp-hint"><b>Atenção:</b> o apoio é voluntário e <b>não é reembolsável</b>. Confira o valor antes de pagar.</small>
        </form>`;
      const sv = $('#sv', p), svh = $('#svh', p), opt = $('#spopt', p), err = $('#sperr', p);
      const hint = () => { svh.textContent = sv.checked ? 'Seu nome e mensagem ficam visíveis no site.' : 'Apoio anônimo: você é Apoiador oficial, mas seu nome não aparece.'; opt.hidden = !sv.checked; };
      const read = () => { S.show = sv.checked; S.name = ($('#sn', p) || {}).value?.trim() || ''; S.msg = ($('#sm', p) || {}).value?.trim() || ''; S.link = ($('#sl', p) || {}).value?.trim() || ''; };
      const fail = (t) => { err.textContent = t; err.hidden = !t; };
      sv.onchange = () => { read(); hint(); }; hint();
      $('#spb2', p).onclick = () => { read(); go(1); };
      $('#supf', p).onsubmit = async (e) => {
        e.preventDefault(); read(); fail('');
        if (S.show && !S.name) { const n = $('#sn', p); n.classList.add('bad'); n.focus(); return fail('Informe seu nome ou apelido, ou desligue “Aparecer no Mural”.'); }
        const b = $('#spn2', p); b.disabled = true; b.textContent = 'Abrindo pagamento…';
        const r = await api('/api/apoiar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amount: amount(), show: S.show, name: S.name, message: S.msg, link: canLink() ? S.link : '' }) });
        b.disabled = false; b.textContent = 'Pagar ' + brl(amount());
        if (!r.ok || !r.j.id) return fail(r.j.error || 'Não foi possível iniciar o pagamento. Tente novamente.');
        S.txn = r.j.id; checkout();
      };
    }

    async function checkout() {
      const pd = await loadPaddle(PC, (ev) => { if (ev && ev.name === 'checkout.completed') { go(3); } });
      if (!pd) { S.step = 2; draw(); const er = $('#sperr', el); if (er) { er.textContent = 'Não foi possível abrir o pagamento. Desative bloqueadores e tente de novo.'; er.hidden = false; } return; }
      pd.Checkout.open({ transactionId: S.txn, settings: { displayMode: 'overlay', theme: 'dark', locale: 'pt-BR', showAddDiscounts: false } });
    }

    function step3(p) {
      if (!S.txn) { go(1); return; }
      p.innerHTML = `<div class="sp-thanks" id="spth"><div class="sp-ok">…</div><h2>Confirmando seu pagamento</h2><p>Isso leva alguns segundos. Não feche esta página.</p></div>`;
      let n = 0;
      const poll = async () => {
        if (!GW.alive(tk) || S.step !== 3) return;
        const r = await api('/api/apoiar?id=' + S.txn);
        if (r.ok && r.j.paid) {
          const t = $('#spth', el); if (!t) return;
          t.innerHTML = `<div class="sp-ok">✓</div><h2>Pagamento confirmado. Obrigado!</h2><p>Você agora é <b>Apoiador oficial</b> do RaceLab F1${S.show ? ' e seu nome aparece no Mural em alguns minutos' : ', sem ter o nome exibido'}. O recibo foi enviado para o seu e-mail.</p><div class="sp-nav"><a class="btn pri" href="#/home">Voltar ao início</a></div>`;
          S.txn = null; return;
        }
        if (++n > 40) { const t = $('#spth', el); if (t) t.innerHTML = '<div class="sp-ok">!</div><h2>Ainda aguardando o banco</h2><p>Se você já pagou, seu apoio será confirmado em breve e o recibo chega por e-mail. Se não concluiu, volte e tente novamente.</p><div class="sp-nav"><button class="btn" id="spretry" type="button">Voltar</button></div>'; const rb = $('#spretry', el); if (rb) rb.onclick = () => go(2); return; }
        setTimeout(poll, 3000);
      };
      poll();
    }

    function draw() { stepper(); const p = $('#sppn', el); [step1, step2, step3][S.step - 1](p); }
    draw();
  };
})();
