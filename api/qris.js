// api/qris.js — QRIS Payment via neoxr.eu
// POST /api/qris?action=create  => buat QRIS baru
// POST /api/qris?action=check   => cek status pembayaran

const NEOXR_KEY  = process.env.NEOXR_API_KEY;
const NEOXR_USER = process.env.NEOXR_USERNAME;
const SB_URL     = process.env.SUPABASE_URL;
const SB_KEY     = process.env.SUPABASE_SERVICE_KEY;

async function sbFetch(path, method = 'GET', body = null) {
  const opts = {
    method,
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json',
      Prefer: method === 'POST' ? 'return=representation' : '',
    },
  };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, opts);
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Supabase ${method} ${path}: ${r.status} ${t}`);
  }
  return r.json();
}

// ─── CREATE QRIS ────────────────────────────────────────────────
async function createQris(req, res) {
  const { amount, email, whatsapp, product_id, product_name, duration, quantity, category } = req.body || {};

  if (!amount || !email || !product_id) {
    return res.status(400).json({ success: false, message: 'Parameter tidak lengkap' });
  }

  // Generate txn_id unik
  const txn_id = `TXN-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;

  // Panggil neoxr.eu untuk buat QRIS
  let qrisData;
  try {
    const neoxrRes = await fetch('https://api.neoxr.eu/api/tako-create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        apikey:   NEOXR_KEY,
        username: NEOXR_USER,
        amount:   Number(amount),
        cid:      txn_id, // customer/order id sebagai referensi
      }),
    });

    if (!neoxrRes.ok) {
      const txt = await neoxrRes.text();
      console.error('NeoxR error:', neoxrRes.status, txt);
      return res.status(502).json({ success: false, message: 'Gagal membuat QRIS, coba lagi' });
    }

    qrisData = await neoxrRes.json();
    console.log('NeoxR create response:', JSON.stringify(qrisData));
  } catch (e) {
    console.error('NeoxR fetch error:', e.message);
    return res.status(502).json({ success: false, message: 'Tidak dapat terhubung ke payment gateway' });
  }

  // neoxr response bisa bermacam format, handle semua kemungkinan
  const status = qrisData?.status ?? qrisData?.success ?? false;
  if (!status) {
    return res.status(400).json({ success: false, message: qrisData?.message || 'QRIS gagal dibuat' });
  }

  // Ambil QR image dan payment ID dari response
  const d       = qrisData?.data ?? qrisData;
  const qrImage = d?.qris ?? d?.qr_image ?? d?.data ?? d?.image ?? null;
  const payId   = d?.id   ?? d?.reff    ?? d?.ref_id ?? d?.transactionId ?? txn_id;

  // Simpan order ke Supabase
  try {
    await sbFetch('orders', 'POST', {
      txn_id:       payId,
      product_id,
      product_name: product_name || 'Unknown',
      category:     category || '',
      email,
      whatsapp:     whatsapp || '',
      duration:     duration || '',
      quantity:     Number(quantity) || 1,
      total:        Number(amount),
      status:       'pending',
    });
  } catch (e) {
    console.error('Supabase insert error:', e.message);
    // Tetap lanjutkan meski gagal simpan, agar user bisa bayar
  }

  return res.json({
    success:  true,
    txn_id:   payId,
    qr_image: qrImage,
    amount:   Number(amount),
  });
}

// ─── CHECK PAYMENT ───────────────────────────────────────────────
async function checkQris(req, res) {
  const txn_id = req.body?.txn_id || req.query?.txn_id;
  if (!txn_id) return res.status(400).json({ success: false, message: 'txn_id diperlukan' });

  // Cek ke neoxr.eu
  let checkData;
  try {
    const neoxrRes = await fetch('https://api.neoxr.eu/api/tako-check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        apikey:   NEOXR_KEY,
        username: NEOXR_USER,
        id:       txn_id,
      }),
    });

    if (!neoxrRes.ok) {
      const txt = await neoxrRes.text();
      console.error('NeoxR check error:', neoxrRes.status, txt);
      return res.status(502).json({ success: false, message: 'Gagal mengecek status pembayaran' });
    }

    checkData = await neoxrRes.json();
    console.log('NeoxR check response:', JSON.stringify(checkData));
  } catch (e) {
    return res.status(502).json({ success: false, message: 'Tidak dapat terhubung ke payment gateway' });
  }

  const d      = checkData?.data ?? checkData;
  const paid   = d?.status === 'PAID' || d?.status === 'paid' ||
                 d?.paid === true    || checkData?.status === 'success' ||
                 checkData?.success  === true;

  if (!paid) {
    return res.json({ success: false, paid: false, message: 'Belum dibayar' });
  }

  // ── PEMBAYARAN BERHASIL: kirim akun ──────────────────────────
  let accountData = null;
  let orderId     = null;

  try {
    // Ambil order dari Supabase
    const orders = await sbFetch(`orders?txn_id=eq.${encodeURIComponent(txn_id)}&limit=1`);
    const order  = orders?.[0];

    if (order && order.status !== 'paid') {
      orderId = order.id;

      // Ambil akun dari pool
      const pool = await sbFetch(
        `account_pool?product_id=eq.${order.product_id}&used=eq.false&limit=${order.quantity}`
      );

      if (pool && pool.length > 0) {
        accountData = pool.map(p => p.account_data);

        // Tandai akun sebagai used
        const poolIds = pool.map(p => `'${p.id}'`).join(',');
        await sbFetch(
          `account_pool?id=in.(${poolIds})`,
          'PATCH',
          { used: true, order_id: orderId }
        );
      }

      // Update order status
      await sbFetch(
        `orders?txn_id=eq.${encodeURIComponent(txn_id)}`,
        'PATCH',
        {
          status:       'paid',
          paid_at:      new Date().toISOString(),
          account_data: accountData,
        }
      );

      // Kurangi stok produk
      if (order.product_id && order.quantity) {
        const prods = await sbFetch(`products?id=eq.${order.product_id}&limit=1`);
        const prod  = prods?.[0];
        if (prod) {
          const newStock = Math.max(0, (prod.stock || 0) - order.quantity);
          await sbFetch(`products?id=eq.${order.product_id}`, 'PATCH', { stock: newStock });
        }
      }
    } else if (order?.status === 'paid') {
      accountData = order.account_data;
    }
  } catch (e) {
    console.error('Post-payment processing error:', e.message);
  }

  return res.json({
    success:      true,
    paid:         true,
    txn_id,
    account_data: accountData,
  });
}

// ─── HANDLER ────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  const action = req.query.action;
  if (action === 'create') return createQris(req, res);
  if (action === 'check')  return checkQris(req, res);

  return res.status(400).json({ success: false, message: 'action harus create atau check' });
}
