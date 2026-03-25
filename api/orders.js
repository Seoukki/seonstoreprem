// api/orders.js — Pesanan & Leaderboard
// GET /api/orders?action=leaderboard   => top buyers (public)
// GET /api/orders?action=stats         => statistik admin
// GET /api/orders                      => list semua (admin)

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
const ADM_PW = process.env.ADMIN_PASSWORD;

function isAdmin(req) {
  return (req.headers['x-admin-key'] || req.query?.admin_key) === ADM_PW;
}

async function sbFetch(path) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, {
    headers: {
      apikey:        SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json',
    },
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Supabase GET ${path}: ${r.status} ${t}`);
  }
  return r.json();
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  const action = req.query.action;

  try {
    // ── LEADERBOARD (public) ──────────────────────────────────
    if (action === 'leaderboard') {
      const orders = await sbFetch('orders?status=eq.paid&select=email,total&order=total.desc');
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
