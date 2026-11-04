/* RaceLab F1 — apoios via Paddle (sem banco de dados: o Mural é montado a partir das transações pagas).
   Variáveis de ambiente (Vercel > Settings > Environment Variables):
     PADDLE_API_KEY       chave de API (servidor) — nunca no código
     PADDLE_CLIENT_TOKEN  token de cliente (público, começa com live_ ou test_)
     APOIO_ESCONDER       (opcional) ids de transações a esconder do Mural, separados por vírgula */
const MIN = 5, MAX = 1000;
const BAD = ['porra', 'caralho', 'merda', 'puta', 'fdp', 'foder', 'foda-se', 'fodase', 'buceta', 'cuzao', 'cu', 'arrombado', 'viado', 'veado', 'nazi', 'hitler', 'estupr', 'negro de merda', 'macaco', 'vagabund', 'otario', 'idiota', 'retardado'];

const key = () => process.env.PADDLE_API_KEY || '';
const base = () => (key().startsWith('pdl_sdbx') ? 'https://sandbox-api.paddle.com' : 'https://api.paddle.com');
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ');
const dirty = (s) => { const t = ' ' + norm(s) + ' '; return BAD.some((w) => (w.length <= 3 ? t.includes(' ' + w + ' ') : t.includes(w))); };
const clean = (s, n) => String(s || '').replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, n);
const tierOf = (v) => (v >= 30 ? 'chefe' : v >= 15 ? 'mecanico' : 'torcedor');
const TN = { chefe: 'Chefe de equipe', mecanico: 'Mecânico', torcedor: 'Torcedor' };
const okUrl = (u) => { try { const x = new URL(u); return x.protocol === 'https:' && x.hostname.includes('.') ? x.href.slice(0, 200) : ''; } catch { return ''; } };

async function paddle(path, init) {
  const r = await fetch(base() + path, { ...init, headers: { Authorization: 'Bearer ' + key(), 'Content-Type': 'application/json', 'Paddle-Version': '1', ...(init && init.headers) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error((j.error && j.error.detail) || 'paddle ' + r.status); e.status = r.status; throw e; }
  return j;
}
const readBody = async (req) => { if (req.body && typeof req.body === 'object') return req.body; let s = ''; for await (const c of req) { s += c; if (s.length > 5000) break; } try { return JSON.parse(s); } catch { return {}; } };

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const send = (code, obj, cache) => { res.setHeader('Cache-Control', cache || 'no-store'); res.statusCode = code; res.end(JSON.stringify(obj)); };
  if (req.method === 'OPTIONS') { res.setHeader('Access-Control-Allow-Headers', 'Content-Type'); res.setHeader('Access-Control-Allow-Methods', 'GET,POST'); return send(204, {}); }
  const q = req.query || Object.fromEntries(new URL(req.url, 'http://x').searchParams);
  const ready = !!(key() && process.env.PADDLE_CLIENT_TOKEN);

  try {
    /* configuração pública para o navegador */
    if (q.cfg) return send(200, { ready, token: ready ? process.env.PADDLE_CLIENT_TOKEN : '', env: key().startsWith('pdl_sdbx') ? 'sandbox' : 'production', min: MIN, max: MAX }, 'public, s-maxage=300');
    if (!key()) return send(503, { error: 'indisponivel' });

    /* estado de um pagamento */
    if (q.id) {
      if (!/^txn_[a-z0-9]{20,40}$/.test(q.id)) return send(400, { error: 'id' });
      const t = (await paddle('/transactions/' + q.id)).data;
      if (!t.custom_data || t.custom_data.app !== 'racelab') return send(404, { error: 'nao encontrado' });
      return send(200, { status: t.status, paid: t.status === 'completed' || t.status === 'paid' });
    }

    /* Mural de apoiadores */
    if (q.list) {
      const hide = (process.env.APOIO_ESCONDER || '').split(',').map((s) => s.trim()).filter(Boolean);
      const j = await paddle('/transactions?status=completed&order_by=id[DESC]&per_page=200');
      const out = [];
      for (const t of j.data || []) {
        const c = t.custom_data || {};
        if (c.app !== 'racelab' || hide.includes(t.id)) continue;
        const v = Number(c.v) || 0;
        const a = { tier: c.t || tierOf(v), since: (t.billed_at || t.created_at || '').slice(0, 10) };
        if (c.s === '1' && c.n && !dirty(c.n)) {
          a.name = c.n;
          if (c.m && !dirty(c.m)) a.message = c.m;
          if (c.l && a.tier !== 'torcedor') a.url = c.l;
        } else a.hidden = true;
        out.push(a);
      }
      return send(200, { total: out.length, people: out.filter((x) => !x.hidden) }, 'public, s-maxage=60, stale-while-revalidate=300');
    }

    /* criar cobrança */
    if (req.method !== 'POST') return send(405, { error: 'metodo' });
    const b = await readBody(req);
    const v = Math.round(Number(b.amount) * 100) / 100;
    if (!(v >= MIN && v <= MAX)) return send(400, { error: `Valor entre R$ ${MIN} e R$ ${MAX}.` });
    const show = b.show ? '1' : '0';
    const name = clean(b.name, 40);
    if (show === '1' && !name) return send(400, { error: 'Informe seu nome ou apelido.' });
    if (show === '1' && (dirty(name) || dirty(b.message))) return send(400, { error: 'Nome ou mensagem não permitidos. Tente outro texto.' });
    const t = tierOf(v);
    const custom = { app: 'racelab', v: String(v), t, s: show, n: show === '1' ? name : '', m: show === '1' ? clean(b.message, 100) : '', l: show === '1' && t !== 'torcedor' ? okUrl(b.link) : '' };
    const r = await paddle('/transactions', {
      method: 'POST',
      body: JSON.stringify({
        currency_code: 'BRL',
        collection_mode: 'automatic',
        custom_data: custom,
        items: [{ quantity: 1, price: { name: 'Apoio RaceLab F1 — ' + TN[t], description: 'Apoio único ao RaceLab F1 (' + TN[t] + ')', unit_price: { amount: String(Math.round(v * 100)), currency_code: 'BRL' }, product: { name: 'Apoio ao RaceLab F1', description: 'Apoio único ao projeto RaceLab F1', tax_category: 'standard' } } }],
      }),
    });
    return send(200, { id: r.data.id });
  } catch (e) {
    return send(e.status && e.status < 500 ? 400 : 502, { error: 'Não foi possível processar agora. Tente novamente em instantes.' });
  }
};
