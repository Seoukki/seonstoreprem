import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).end();

  const { data, error } = await sb
    .from('orders')
    .select('email, total')
    .eq('status', 'paid');

  if (error) return res.status(500).json({ error: error.message });

  const map = {};
  (data || []).forEach(o => {
    const k = o.email.replace(/(.{2}).*(@.*)/, '$1***$2');
    if (!map[o.email]) map[o.email] = { email: k, total: 0, count: 0 };
    map[o.email].total += o.total || 0;
    map[o.email].count += 1;
  });

  const lb = Object.values(map).sort((a, b) => b.total - a.total).slice(0, 10);
  const totalCustomers = Object.keys(map).length;

  return res.status(200).json({ leaderboard: lb, total_customers: totalCustomers });
}
