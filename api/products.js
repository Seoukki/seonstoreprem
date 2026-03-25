// api/products.js — Produk CRUD
// GET    /api/products          => list semua produk aktif (public)
// GET    /api/products?id=xxx   => detail produk
// POST   /api/products          => tambah produk (admin)
// PUT    /api/products?id=xxx   => edit produk (admin)
// DELETE /api/products?id=xxx   => hapus produk (admin)

const SB_URL  = process.env.SUPABASE_URL;
const SB_KEY  = process.env.SUPABASE_SERVICE_KEY;
const ADM_PW  = process.env.ADMIN_PASSWORD;

function isAdmin(req) {
  const auth = req.headers['x-admin-key'] || req.body?.admin_key;
  return auth === ADM_PW;
}

async function sbFetch(path, method = 'GET', body = null) {
  const opts = {
    method,
    headers: {
      apikey:        SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json',
      Prefer:        method === 'POST' ? 'return=representation' : 'return=representation',
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
    // GET — list or single
    if (req.method === 'GET') {
      const { id, category } = req.query;
      if (id) {
        const rows = await sbFetch(`products?id=eq.${id}&active=eq.true&limit=1`);
        return res.json(rows?.[0] || null);
      }
      let q = 'products?active=eq.true&order=created_at.asc';
      if (category && category !== 'all') q += `&category=eq.${category}`;
      const rows = await sbFetch(q);
      return res.json(rows || []);
    }

    // POST — create (admin only)
    if (req.method === 'POST') {
      if (!isAdmin(req)) return res.status(403).json({ error: 'Unauthorized' });
      const { name, category, description, image_url, prices, stock, badge } = req.body;
      if (!name || !category) return res.status(400).json({ error: 'name dan category wajib diisi' });

      const rows = await sbFetch('products', 'POST', {
        name,
        category,
        description: description || '',
        image_url:   image_url   || '',
        prices:      prices      || {},
        stock:       Number(stock) || 0,
        badge:       badge       || '',
        active:      true,
      });
      return res.status(201).json(rows?.[0] || rows);
    }

    // PUT — update (admin only)
    if (req.method === 'PUT') {
      if (!isAdmin(req)) return res.status(403).json({ error: 'Unauthorized' });
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id diperlukan' });

      const { name, category, description, image_url, prices, stock, badge, active } = req.body;
      const patch = {};
      if (name        !== undefined) patch.name        = name;
      if (category    !== undefined) patch.category    = category;
      if (description !== undefined) patch.description = description;
      if (image_url   !== undefined) patch.image_url   = image_url;
      if (prices      !== undefined) patch.prices      = prices;
      if (stock       !== undefined) patch.stock       = Number(stock);
      if (badge       !== undefined) patch.badge       = badge;
      if (active      !== undefined) patch.active      = active;
      patch.updated_at = new Date().toISOString();

      const rows = await sbFetch(`products?id=eq.${id}`, 'PATCH', patch);
      return res.json(rows?.[0] || rows);
    }

    // DELETE — soft delete (admin only)
    if (req.method === 'DELETE') {
      if (!isAdmin(req)) return res.status(403).json({ error: 'Unauthorized' });
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id diperlukan' });
      await sbFetch(`products?id=eq.${id}`, 'PATCH', { active: false });
      return res.json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error('products handler error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
