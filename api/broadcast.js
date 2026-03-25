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

  if (req.method === 'GET') {
    const { data, error } = await sb
      .from('broadcast')
      .select('id, message, created_at')
      .eq('active', true)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data?.[0] || null);
  }

  if (!adminCheck(req)) return res.status(401).json({ error: 'Unauthorized' });

  if (req.method === 'POST') {
    const { message } = req.body;
    if (!message?.trim()) return res.status(400).json({ error: 'Pesan tidak boleh kosong' });

    await sb.from('broadcast').update({ active: false }).eq('active', true);
    const { data, error } = await sb.from('broadcast').insert({ message: message.trim(), active: true }).select().single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json(data);
  }

  if (req.method === 'DELETE') {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: 'ID diperlukan' });
    const { error } = await sb.from('broadcast').update({ active: false }).eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
