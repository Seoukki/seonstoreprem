import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

function adminCheck(req) {
  return (req.headers['x-admin-key'] || '') === process.env.ADMIN_PASSWORD;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-key');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!adminCheck(req)) return res.status(401).json({ error: 'Unauthorized' });

  if (req.method === 'GET') {
    const { product_id } = req.query;
    if (!product_id) return res.status(400).json({ error: 'product_id diperlukan' });

    const { data, error, count } = await sb
      .from('account_pool')
      .select('id, account_data, used, created_at', { count: 'exact' })
      .eq('product_id', product_id)
      .eq('used', false)
      .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ items: data || [], count: count || 0 });
  }

  if (req.method === 'POST') {
    const { product_id, account_data } = req.body;
    if (!product_id || !account_data) return res.status(400).json({ error: 'Data tidak lengkap' });

    const { data, error } = await sb.from('account_pool').insert({
      product_id,
      account_data,
      used: false,
    }).select().single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json(data);
  }

  if (req.method === 'DELETE') {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: 'ID diperlukan' });

    const { error } = await sb.from('account_pool').delete().eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
