/* RaceLab — envio automático do formulário de patrocínio por e-mail (Resend).
   Variáveis de ambiente (Vercel > Settings > Environment Variables):
     RESEND_API_KEY   chave de API do Resend (nunca no código)
     CONTACT_TO       (opcional) e-mail que recebe as mensagens; padrão: o e-mail de contato do site. No plano grátis sem domínio próprio, precisa ser o e-mail da conta do Resend
     CONTACT_FROM     (opcional) remetente, ex.: "RaceLab <contato@seudominio.com>" — padrão: onboarding@resend.dev */
const hits = new Map(); // limite simples por IP (melhor esforço; a instância pode reiniciar)
const WINDOW = 60 * 60e3, MAX_HITS = 5;

const clean = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, n);
const oneLine = (s, n) => clean(s, n).replace(/\s+/g, ' ');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const okMail = (s) => /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(s) && s.length <= 120;
const okUrl = (u) => { if (!u) return ''; try { const x = new URL(/^https?:\/\//i.test(u) ? u : 'https://' + u); return x.protocol.startsWith('http') && x.hostname.includes('.') ? x.href.slice(0, 200) : ''; } catch { return ''; } };
const readBody = async (req) => { if (req.body && typeof req.body === 'object') return req.body; let s = ''; for await (const c of req) { s += c; if (s.length > 12000) break; } try { return JSON.parse(s); } catch { return {}; } };

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  const send = (code, obj) => { res.statusCode = code; res.end(JSON.stringify(obj)); };
  if (req.method !== 'POST') return send(405, { error: 'metodo' });

  const key = process.env.RESEND_API_KEY, to = process.env.CONTACT_TO || 'thony.ferreira.az@gmail.com';
  if (!key) return send(503, { error: 'indisponivel', faltando: 'RESEND_API_KEY' });

  const ip = String((req.headers['x-forwarded-for'] || '').split(',')[0] || req.socket?.remoteAddress || 'x').trim(), now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < WINDOW);
  if (arr.length >= MAX_HITS) return send(429, { error: 'Muitas mensagens em pouco tempo. Tente novamente mais tarde.' });

  const b = await readBody(req);
  if (b.hp) return send(200, { ok: true }); // campo-isca preenchido: robô; finge sucesso
  const name = oneLine(b.name, 60), brand = oneLine(b.brand, 80), email = oneLine(b.email, 120), site = okUrl(oneLine(b.site, 200)), budget = oneLine(b.budget, 40), msg = clean(b.message, 1500);
  if (!name) return send(400, { error: 'Informe seu nome.' });
  if (!brand) return send(400, { error: 'Informe a marca ou empresa.' });
  if (!okMail(email)) return send(400, { error: 'Informe um e-mail válido para a resposta.' });
  if (msg.length < 10) return send(400, { error: 'Conte um pouco sobre o que você procura.' });

  arr.push(now); hits.set(ip, arr);
  if (hits.size > 500) for (const [k, v] of hits) if (!v.some((t) => now - t < WINDOW)) hits.delete(k);

  const text = `Novo contato de patrocínio pelo site RaceLab\n\nNome: ${name}\nMarca: ${brand}\nE-mail: ${email}\n${site ? `Site: ${site}\n` : ''}Orçamento: ${budget || 'não informado'}\n\nMensagem:\n${msg}\n`;
  const html = `<div style="font:15px/1.6 Arial,sans-serif;color:#111"><h2 style="margin:0 0 12px">Novo contato de patrocínio</h2><table cellpadding="4" style="font-size:15px"><tr><td><b>Nome</b></td><td>${esc(name)}</td></tr><tr><td><b>Marca</b></td><td>${esc(brand)}</td></tr><tr><td><b>E-mail</b></td><td><a href="mailto:${esc(email)}">${esc(email)}</a></td></tr>${site ? `<tr><td><b>Site</b></td><td><a href="${esc(site)}">${esc(site)}</a></td></tr>` : ''}<tr><td><b>Orçamento</b></td><td>${esc(budget || 'não informado')}</td></tr></table><p style="white-space:pre-wrap;border-left:3px solid #e10600;padding-left:12px;margin:16px 0">${esc(msg)}</p><p style="color:#666;font-size:13px">Responda este e-mail para falar direto com ${esc(name)}.</p></div>`;
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.CONTACT_FROM || 'RaceLab <onboarding@resend.dev>', to: [to], reply_to: email, subject: `Patrocínio RaceLab — ${brand}`, html, text }),
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) return send(502, { error: 'Não foi possível enviar agora. Tente novamente em instantes.' });
    return send(200, { ok: true });
  } catch {
    return send(502, { error: 'Não foi possível enviar agora. Tente novamente em instantes.' });
  }
};
