// api/broadcast.js — Broadcast management
// GET    /api/broadcast           => broadcast aktif (public)
// POST   /api/broadcast           => tambah broadcast (admin)
// PUT    /api/broadcast?id=xxx    => update (admin)
// DELETE /api/broadcast?id=xxx    => hapus (admin)

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
const ADM_PW = process.env.ADMIN_PASSWORD;

function isAdmin(req) {
  return (req.headers['x-admin-key'] || req.body?.admin_key) === ADM_PW;
}

async function sbFetch(path, method = 'GET', body = null) {
  const opts = {
    method,
    headers: {
      apikey:        SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json',
      Prefer:        'return=representation',
    },
  };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, opts);
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Supabase ${method} ${path}: ${r.status} ${t}`);
  }
  const txt = await r.text();
  return txt ? JSON.parse(txt) : null;
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      // Admin dapat semua, public hanya yang aktif
      const q = isAdmin(req)
        ? 'broadcast?order=created_at.desc'
        : 'broadcast?active=eq.true&order=created_at.desc&limit=1';
      const rows = await sbFetch(q);
      return res.json(rows || []);
    }

    if (!isAdmin(req)) return res.status(403).json({ error: 'Unauthorized' });

    if (req.method === 'POST') {
      const { message } = req.body;
      if (!message) return res.status(400).json({ error: 'message diperlukan' });
      // Nonaktifkan broadcast lama dulu
      await sbFetch('broadcast?active=eq.true', 'PATCH', { active: false });
      const rows = await sbFetch('broadcast', 'POST', { message, active: true });
      return res.status(201).json(rows?.[0] || rows);
    }

    if (req.method === 'PUT') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id diperlukan' });
      const { message, active } = req.body;
      const patch = { updated_at: new Date().toISOString() };
      if (message !== undefined) patch.message = message;
      if (active  !== undefined) patch.active  = active;
      const rows = await sbFetch(`broadcast?id=eq.${id}`, 'PATCH', patch);
      return res.json(rows?.[0] || rows);
    }

    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id diperlukan' });
      await sbFetch(`broadcast?id=eq.${id}`, 'DELETE');
      return res.json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error('broadcast handler error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
