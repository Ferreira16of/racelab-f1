/* RaceLab — Patrocínio: página para marcas entrarem em contato (formulário que abre o e-mail já preenchido) */
(function () {
  'use strict';
  const { esc, $, $$ } = GW.util;
  const enc = encodeURIComponent;
  const getJ = (u) => fetch(u, { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);

  GW.pages.sponsor = async (p, el, tk) => {
    const cfg = (await getJ('data/sponsor.json')) || {};
    if (!GW.alive(tk)) return;
    const mail = cfg.email || '', tg = cfg.telegram || '';
    const faq = [
      ['Quanto custa patrocinar?', 'Depende do formato e do período. Conte seu objetivo e seu orçamento aproximado no formulário e eu envio uma proposta sob medida, sem compromisso.'],
      ['O site tem anúncios?', 'Não. O RaceLab é limpo e sem banners de rede de anúncios. Por isso cada parceria é discreta, combinada diretamente com a marca e escolhida a dedo.'],
      ['Posso escolher onde minha marca aparece?', 'Sim. Os espaços ficam no rodapé, na Home, na tela Ao vivo e em uma página própria de parceiro. Juntos definimos o que faz mais sentido para o seu objetivo.'],
      ['Vocês enviam relatório de resultados?', 'Sim. Ao final de cada período combinado envio um resumo com o que foi entregue e o alcance observado.'],
      ['Quanto tempo leva para a marca entrar no ar?', 'Depois de fechado o acordo e recebido o material (logo e link), a publicação costuma ser feita em poucos dias.'],
    ];
    const budgets = ['Ainda não definido', 'Até R$ 500', 'R$ 500 a R$ 1.500', 'R$ 1.500 a R$ 5.000', 'Acima de R$ 5.000'];
    const kitBody = 'Olá! Gostaria de receber o mídia kit e as opções de patrocínio do RaceLab.\n\nMarca:\nSite:\n';

    el.innerHTML = `
    <section class="sp-hero">
      <div class="sp-hero-txt">
        <span class="sp-pill">${GW.ic('star')} Para marcas e empresas</span>
        <h1>Patrocine o RaceLab</h1>
        <p>O RaceLab é o lugar onde fãs de Fórmula 1 acompanham resultados, telemetria e tempos ao vivo. Associe sua marca a esse público apaixonado, com espaços discretos que não atrapalham a leitura.</p>
        <div class="sp-cta"><a class="btn pri lg" href="#" data-go="sp-form">Falar sobre patrocínio</a>${mail ? `<a class="btn lg" href="mailto:${esc(mail)}?subject=${enc('Mídia kit RaceLab')}&body=${enc(kitBody)}">Pedir mídia kit</a>` : ''}</div>
        <ul class="sp-uses"><li>Público fiel de Fórmula 1</li><li>Sem anúncios de rede</li><li>Formatos sob medida</li></ul>
      </div>
      <div class="sp-preview" aria-hidden="true"><div class="sp-pv-card b2"></div><div class="sp-pv-card b1"></div><div class="sp-pv-card main"><div class="sp-pv-top"><span class="sp-av lg">${GW.ic('star')}</span><div><b>Sua marca aqui</b><span class="sp-badge b-chefe">Parceiro oficial</span></div></div><ul><li>Logo e link na Home e no rodapé</li><li>Página própria de parceiro</li><li>Menção em cada Grande Prêmio</li></ul></div></div>
    </section>

    <div class="sp-two mt">
      <section class="card sp-spon"><span class="sp-pill">Formatos</span><h2>Como sua marca aparece</h2>
        <ul class="sp-checks"><li>Logo e link no rodapé e na Home</li><li>Página de parceiro com texto, imagem e link</li><li>Destaque discreto na tela Ao vivo, durante as sessões</li><li>Menção nas divulgações de cada Grande Prêmio</li><li>Pacotes por temporada, etapa ou campanha</li></ul></section>
      <section class="card sp-faqc"><span class="sp-pill">Por que patrocinar</span><h2>Um público que acompanha toda corrida</h2>
        <ul class="sp-checks"><li>Fãs que voltam a cada fim de semana de corrida</li><li>Leitura focada em dados, sem poluição visual</li><li>Acesso pelo celular, tablet e computador</li><li>Parceria direta, sem intermediários</li></ul></section>
    </div>

    <section class="card mt"><h2>Como funciona</h2>
      <ol class="spn-steps"><li><b>1</b><span>Você conta o objetivo e o orçamento</span></li><li><b>2</b><span>Eu envio uma proposta sob medida</span></li><li><b>3</b><span>Fechado o acordo, sua marca entra no ar</span></li></ol></section>

    <section id="sp-form" class="card mt spn-card"><h2>Fale com a gente</h2><p class="sp-sub">Conte o que você procura e enviaremos a sua mensagem na hora. A resposta chega no e-mail que você informar.</p>
      <form id="spf" class="spn-form" novalidate>
        <div class="sp-two2">
          <label class="sp-f"><span>Seu nome</span><input id="fn" maxlength="60" autocomplete="name" placeholder="Como podemos te chamar"></label>
          <label class="sp-f"><span>Marca ou empresa</span><input id="fb" maxlength="80" autocomplete="organization" placeholder="Nome da marca"></label>
          <label class="sp-f"><span>Seu e-mail</span><input id="fe" type="email" maxlength="100" autocomplete="email" placeholder="voce@empresa.com"></label>
          <label class="sp-f"><span>Site ou perfil <em>(opcional)</em></span><input id="fs" type="url" maxlength="120" placeholder="https://"></label>
        </div>
        <label class="sp-f"><span>Orçamento aproximado</span><select id="fo">${budgets.map((b) => `<option>${esc(b)}</option>`).join('')}</select></label>
        <label class="sp-f"><span>Mensagem</span><textarea id="fm" rows="4" maxlength="800" placeholder="Conte seu objetivo, o período e o que você imagina para a parceria"></textarea></label>
        <p class="sp-err" id="sperr" role="alert" hidden></p>
        <input id="fhp" name="website2" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px;width:1px;height:1px;opacity:0">
        <div class="sp-send"><button class="btn pri lg" id="fg" type="submit">Enviar mensagem</button></div><small class="sp-hint" id="fhint">Sua mensagem vai direto para o nosso e-mail. Usamos seus dados apenas para responder ao contato.</small>
      </form>
      ${mail || tg ? `<div class="sp-direct"><span>Prefere falar direto?</span>${mail ? `<a href="mailto:${esc(mail)}">${esc(mail)}</a><button class="btn sm" id="fcp" type="button">Copiar e-mail</button>` : ''}${tg ? `<a class="btn sm" target="_blank" rel="noopener" href="https://t.me/${esc(String(tg).replace(/^@/, ''))}">Telegram</a>` : ''}</div>` : ''}
    </section>

    <section class="card mt sp-faqc"><h2>Perguntas frequentes</h2><div class="sp-faq">${faq.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('')}</div></section>`;

    $$('[data-go]', el).forEach((a) => (a.onclick = (e) => { e.preventDefault(); const t = document.getElementById(a.dataset.go); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); }));

    const f = $('#spf', el); if (!f) return;
    const err = $('#sperr', el), v = (id) => $('#' + id, el).value.trim();
    const fail = (t, id) => { err.textContent = t; err.hidden = !t; if (id) { const n = $('#' + id, el); n.classList.add('bad'); n.focus(); } };
    const ok = () => {
      $$('.bad', f).forEach((n) => n.classList.remove('bad')); fail('');
      if (!v('fn')) return fail('Informe seu nome.', 'fn'), false;
      if (!v('fb')) return fail('Informe a marca ou empresa.', 'fb'), false;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v('fe'))) return fail('Informe um e-mail válido para a resposta.', 'fe'), false;
      if (v('fm').length < 10) return fail('Conte um pouco sobre o que você procura.', 'fm'), false;
      return true;
    };
    // alternativa quando o envio automático não está disponível: abre o e-mail do próprio usuário
    const manual = () => {
      if (!mail) return '';
      const subject = `Patrocínio RaceLab — ${v('fb')}`, body = `Olá! Tenho interesse em patrocinar o RaceLab.\n\nNome: ${v('fn')}\nMarca: ${v('fb')}\nE-mail: ${v('fe')}\n${v('fs') ? `Site: ${v('fs')}\n` : ''}Orçamento: ${v('fo')}\n\n${v('fm')}`;
      return `<a class="btn" target="_blank" rel="noopener" href="https://mail.google.com/mail/?view=cm&fs=1&to=${enc(mail)}&su=${enc(subject)}&body=${enc(body)}">Enviar pelo meu Gmail</a> <a class="btn" href="mailto:${esc(mail)}?subject=${enc(subject)}&body=${enc(body)}">Usar outro e-mail</a>`;
    };
    f.onsubmit = async (e) => {
      e.preventDefault(); if (!ok()) return;
      const btn = $('#fg', el); btn.disabled = true; btn.textContent = 'Enviando…';
      let r; try { const x = await fetch('/api/contato', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: v('fn'), brand: v('fb'), email: v('fe'), site: v('fs'), budget: v('fo'), message: v('fm'), hp: v('fhp') }) }); r = { ok: x.ok, j: await x.json().catch(() => ({})) }; } catch { r = { ok: false, j: {} }; }
      if (r.ok) { f.outerHTML = `<div class="sp-thanks"><div class="sp-ok">✓</div><h2>Mensagem enviada!</h2><p>Recebemos o seu contato e vamos responder no e-mail <b>${esc(v('fe'))}</b>. Obrigado pelo interesse em patrocinar o RaceLab.</p></div>`; return; }
      btn.disabled = false; btn.textContent = 'Enviar mensagem';
      const unavailable = !r.j.error || r.j.error === 'indisponivel';
      fail(unavailable ? 'O envio automático não está disponível agora. Use uma das opções abaixo para enviar pelo seu e-mail.' : r.j.error);
      if (unavailable || r.j.error) { const m = manual(); if (m) { let box = $('#fmanual', el); if (!box) { box = document.createElement('div'); box.id = 'fmanual'; box.className = 'sp-send'; err.after(box); } box.innerHTML = m; } }
    };
    const cp = $('#fcp', el); if (cp) cp.onclick = async () => { try { await navigator.clipboard.writeText(mail); cp.textContent = 'Copiado!'; } catch { cp.textContent = mail; } setTimeout(() => (cp.textContent = 'Copiar e-mail'), 2000); };
  };
})();
