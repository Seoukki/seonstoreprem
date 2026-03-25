import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

function adminCheck(req) {
  const key = req.headers['x-admin-key'] || '';
  return key === process.env.ADMIN_PASSWORD;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-key');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    const isAdmin = adminCheck(req);
    let query = sb.from('products').select(`
      id, name, category, description, image_url, prices, badge, active, rules, created_at,
      account_pool(count)
    `);
    if (!isAdmin) query = query.eq('active', true);
    query = query.order('created_at', { ascending: false });

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });

    const products = (data || []).map(p => ({
      ...p,
      stock: p.account_pool?.[0]?.count ?? 0,
      account_pool: undefined,
    }));

    return res.status(200).json(products);
  }

  if (!adminCheck(req)) return res.status(401).json({ error: 'Unauthorized' });

  if (req.method === 'POST') {
    const { name, category, description, image_url, prices, badge, rules } = req.body;
    if (!name || !category || !prices) return res.status(400).json({ error: 'Data tidak lengkap' });

    const { data, error } = await sb.from('products').insert({
      name, category, description, image_url, prices, badge: badge || '', rules: rules || '', active: true,
    }).select().single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json(data);
  }

  if (req.method === 'PUT') {
    const { id, name, category, description, image_url, prices, badge, active, rules } = req.body;
    if (!id) return res.status(400).json({ error: 'ID diperlukan' });

    const { data, error } = await sb.from('products').update({
      name, category, description, image_url, prices, badge, active, rules,
      updated_at: new Date().toISOString(),
    }).eq('id', id).select().single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === 'DELETE') {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: 'ID diperlukan' });

    const { error } = await sb.from('products').update({ active: false }).eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}export default async function handler(req, res) {
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
