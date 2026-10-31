// Ponte para o JSON público de cronometragem ao vivo (o endereço de origem não libera CORS para o navegador).
const BASE = 'https://www.f1mania.net/wp-content/uploads/f1mania-live-center/';
const url = (id) => `${BASE}session-${id}-timing.json?_f1mlc=`;
const get = async (id) => {
  const r = await fetch(url(id), { signal: AbortSignal.timeout(7000), headers: { Accept: 'application/json' } });
  if (!r.ok || !/json/.test(r.headers.get('content-type') || '')) return null;
  return r.json();
};

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    if (req.query.scan) {
      const from = Math.max(1, +req.query.from || 100), ids = Array.from({ length: 45 }, (_, i) => from + i);
      const out = (await Promise.all(ids.map((id) => get(id).then((j) => j && j.session && { id, name: j.session.name, event: j.session.event_name, type: j.session.type, final: !!j.final, status: j.session.status && j.session.status.label, at: j.generated_at_ms, n: (j.rows || []).filter((r) => r.position).length, stale: !!j.critical_data_stale }, () => null)))).filter(Boolean);
      res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60');
      return res.status(200).json(out);
    }
    const id = String(req.query.id || '');
    if (!/^\d{1,4}$/.test(id)) return res.status(400).json({ error: 'id inválido' });
    const j = await get(id);
    if (!j) { res.setHeader('Cache-Control', 'public, s-maxage=10'); return res.status(404).json({ error: 'sessão sem dados' }); }
    res.setHeader('Cache-Control', 'public, s-maxage=5, stale-while-revalidate=10');
    res.status(200).json(j);
  } catch (e) {
    res.setHeader('Cache-Control', 'no-store');
    res.status(502).json({ error: String(e.message || e) });
  }
};
