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
      <ol class="sp-steps"><li><b>1</b><span>Você conta o objetivo e o orçamento</span></li><li><b>2</b><span>Eu envio uma proposta sob medida</span></li><li><b>3</b><span>Fechado o acordo, sua marca entra no ar</span></li></ol></section>

    <section id="sp-form" class="card mt sp-wiz"><h2>Fale com a gente</h2><p class="sp-sub">Preencha os campos e o e-mail abre já pronto para enviar${mail ? ` para <b>${esc(mail)}</b>` : ''}.</p>
      <form id="spf" class="sp-form" novalidate>
        <div class="sp-two2">
          <label class="sp-f"><span>Seu nome</span><input id="fn" maxlength="60" autocomplete="name" placeholder="Como podemos te chamar"></label>
          <label class="sp-f"><span>Marca ou empresa</span><input id="fb" maxlength="80" autocomplete="organization" placeholder="Nome da marca"></label>
          <label class="sp-f"><span>Seu e-mail</span><input id="fe" type="email" maxlength="100" autocomplete="email" placeholder="voce@empresa.com"></label>
          <label class="sp-f"><span>Site ou perfil <em>(opcional)</em></span><input id="fs" type="url" maxlength="120" placeholder="https://"></label>
        </div>
        <label class="sp-f"><span>Orçamento aproximado</span><select id="fo">${budgets.map((b) => `<option>${esc(b)}</option>`).join('')}</select></label>
        <label class="sp-f"><span>Mensagem</span><textarea id="fm" rows="4" maxlength="800" placeholder="Conte seu objetivo, o período e o que você imagina para a parceria"></textarea></label>
        <p class="sp-err" id="sperr" role="alert" hidden></p>
        ${mail ? `<div class="sp-send"><button class="btn pri lg" id="fg" type="submit">Enviar pelo Gmail</button><button class="btn lg" id="fo2" type="button">Usar outro e-mail</button></div><small class="sp-hint">Nada é enviado por este site: abrimos o seu e-mail com a mensagem pronta, e você só confirma o envio.</small>` : '<p class="muted">Contato em breve.</p>'}
      </form>
      ${mail || tg ? `<div class="sp-direct"><span>Prefere falar direto?</span>${mail ? `<a href="mailto:${esc(mail)}">${esc(mail)}</a><button class="btn sm" id="fcp" type="button">Copiar e-mail</button>` : ''}${tg ? `<a class="btn sm" target="_blank" rel="noopener" href="https://t.me/${esc(String(tg).replace(/^@/, ''))}">Telegram</a>` : ''}</div>` : ''}
    </section>

    <section class="card mt sp-faqc"><h2>Perguntas frequentes</h2><div class="sp-faq">${faq.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('')}</div></section>`;

    $$('[data-go]', el).forEach((a) => (a.onclick = (e) => { e.preventDefault(); const t = document.getElementById(a.dataset.go); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); }));

    const f = $('#spf', el); if (!f || !mail) return;
    const err = $('#sperr', el), v = (id) => $('#' + id, el).value.trim();
    const fail = (t, id) => { err.textContent = t; err.hidden = !t; if (id) { const n = $('#' + id, el); n.classList.add('bad'); n.focus(); } };
    const data = () => {
      const subject = `Patrocínio RaceLab — ${v('fb')}`;
      const body = `Olá! Tenho interesse em patrocinar o RaceLab.\n\nNome: ${v('fn')}\nMarca: ${v('fb')}\nE-mail: ${v('fe')}\n${v('fs') ? `Site: ${v('fs')}\n` : ''}Orçamento: ${v('fo')}\n\n${v('fm')}`;
      return { subject, body };
    };
    const ok = () => {
      $$('.bad', f).forEach((n) => n.classList.remove('bad')); fail('');
      if (!v('fn')) return fail('Informe seu nome.', 'fn'), false;
      if (!v('fb')) return fail('Informe a marca ou empresa.', 'fb'), false;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v('fe'))) return fail('Informe um e-mail válido para a resposta.', 'fe'), false;
      if (v('fm').length < 10) return fail('Conte um pouco sobre o que você procura.', 'fm'), false;
      return true;
    };
    f.onsubmit = (e) => { e.preventDefault(); if (!ok()) return; const d = data(); window.open(`https://mail.google.com/mail/?view=cm&fs=1&to=${enc(mail)}&su=${enc(d.subject)}&body=${enc(d.body)}`, '_blank', 'noopener'); };
    $('#fo2', el).onclick = () => { if (!ok()) return; const d = data(); location.href = `mailto:${mail}?subject=${enc(d.subject)}&body=${enc(d.body)}`; };
    const cp = $('#fcp', el); if (cp) cp.onclick = async () => { try { await navigator.clipboard.writeText(mail); cp.textContent = 'Copiado!'; } catch { cp.textContent = mail; } setTimeout(() => (cp.textContent = 'Copiar e-mail'), 2000); };
  };
})();
