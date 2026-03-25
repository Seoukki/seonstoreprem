import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

function adminCheck(req) {
  return (req.headers['x-admin-key'] || '') === process.env.ADMIN_PASSWORD;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-key');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!adminCheck(req)) return res.status(401).json({ error: 'Unauthorized' });

  const { data, error } = await sb
    .from('orders')
    .select('id, txn_id, product_name, email, total, status, created_at, paid_at, quantity, duration_label')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) return res.status(500).json({ error: error.message });

  const totalRevenue = (data || [])
    .filter(o => o.status === 'paid')
    .reduce((s, o) => s + (o.total || 0), 0);

  const leaderboard = {};
  (data || []).filter(o => o.status === 'paid').forEach(o => {
    if (!leaderboard[o.email]) leaderboard[o.email] = { email: o.email, total: 0, count: 0 };
    leaderboard[o.email].total += o.total || 0;
    leaderboard[o.email].count += 1;
  });

  return res.status(200).json({
    orders: data || [],
    stats: {
      total_orders: data?.length || 0,
      paid_orders: data?.filter(o => o.status === 'paid').length || 0,
      total_revenue: totalRevenue,
    },
    leaderboard: Object.values(leaderboard).sort((a, b) => b.total - a.total).slice(0, 10),
  });
}      const orders = await sbFetch('orders?status=eq.paid&select=email,total&order=total.desc');
      // Aggregate by email
      const map = {};
      for (const o of orders || []) {
        if (!o.email) continue;
        const key = o.email;
        if (!map[key]) map[key] = { email: key, total_spent: 0, orders: 0 };
        map[key].total_spent += Number(o.total);
        map[key].orders++;
      }
      const sorted = Object.values(map)
        .sort((a, b) => b.total_spent - a.total_spent)
        .slice(0, 20)
        .map((x, i) => ({ ...x, rank: i + 1, email: maskEmail(x.email) }));

      return res.json(sorted);
    }

    // ── STATS (admin) ─────────────────────────────────────────
    if (action === 'stats') {
      if (!isAdmin(req)) return res.status(403).json({ error: 'Unauthorized' });

      const [allOrders, allProducts] = await Promise.all([
        sbFetch('orders?select=total,status,product_name,created_at'),
        sbFetch('products?active=eq.true&select=id,name,stock'),
      ]);

      const paid     = (allOrders || []).filter(o => o.status === 'paid');
      const revenue  = paid.reduce((s, o) => s + Number(o.total), 0);
      const lowStock = (allProducts || []).filter(p => p.stock < 5);

      // Chart: sales per product
      const prodMap = {};
      for (const o of paid) {
        const k = o.product_name || 'Unknown';
        prodMap[k] = (prodMap[k] || 0) + 1;
      }

      return res.json({
        total_products: (allProducts || []).length,
        total_orders:   (allOrders   || []).length,
        paid_orders:    paid.length,
        revenue,
        low_stock:      lowStock.length,
        low_stock_items: lowStock.map(p => p.name),
        sales_by_product: prodMap,
      });
    }

    // ── LIST ORDERS (admin) ───────────────────────────────────
    if (!isAdmin(req)) return res.status(403).json({ error: 'Unauthorized' });

    const limit  = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Number(req.query.offset) || 0;
    const status = req.query.status;

    let q = `orders?select=*&order=created_at.desc&limit=${limit}&offset=${offset}`;
    if (status) q += `&status=eq.${status}`;

    const orders = await sbFetch(q);
    return res.json(orders || []);

  } catch (e) {
    console.error('orders handler error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}

function maskEmail(email) {
  if (!email || !email.includes('@')) return email;
  const [user, domain] = email.split('@');
  const masked = user.length <= 2
    ? user[0] + '*'
    : user[0] + '*'.repeat(Math.min(user.length - 2, 4)) + user.slice(-1);
  return `${masked}@${domain}`;
}
