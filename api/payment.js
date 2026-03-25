import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { product_id, duration, quantity, email, whatsapp } = req.body;

    if (!product_id || !duration || !quantity || !email || !whatsapp) {
      return res.status(400).json({ error: 'Data tidak lengkap' });
    }

    const { data: product, error: pErr } = await sb
      .from('products')
      .select('*')
      .eq('id', product_id)
      .eq('active', true)
      .single();

    if (pErr || !product) return res.status(404).json({ error: 'Produk tidak ditemukan' });

    const price = product.prices[duration];
    if (!price) return res.status(400).json({ error: 'Durasi tidak valid' });

    const { count: stockCount } = await sb
      .from('account_pool')
      .select('id', { count: 'exact', head: true })
      .eq('product_id', product_id)
      .eq('used', false);

    if ((stockCount || 0) < quantity) {
      return res.status(400).json({ error: 'Stok tidak mencukupi' });
    }

    const total = price * quantity;
    const msgText = `${product.name} ${quantity}`;

    const apiUrl = `https://api.neoxr.eu/api/tako-create?username=${encodeURIComponent(process.env.TAKO_MERCHANT)}&amount=${total}&message=${encodeURIComponent(msgText)}&apikey=${process.env.TAKO_API_KEY}`;

    const payRes = await fetch(apiUrl);
    const payData = await payRes.json();

    if (!payData?.data?.id || !payData?.data?.qr_image) {
      console.error('NeoXR response:', JSON.stringify(payData));
      return res.status(502).json({ error: 'Gagal membuat QR pembayaran', detail: payData });
    }

    const txnId = payData.data.id;
    const qrImage = payData.data.qr_image;

    const durationLabels = {
      '1d':'1 Hari','3d':'3 Hari','7d':'1 Minggu','10d':'10 Hari',
      '15d':'15 Hari','20d':'20 Hari','1m':'1 Bulan','3m':'3 Bulan',
      '6m':'6 Bulan','1y':'1 Tahun'
    };

    const { error: oErr } = await sb.from('orders').insert({
      txn_id: txnId,
      product_id,
      product_name: product.name,
      category: product.category,
      email,
      whatsapp,
      duration,
      duration_label: durationLabels[duration] || duration,
      quantity,
      total,
      status: 'pending',
    });

    if (oErr) {
      console.error('Order insert error:', oErr);
      return res.status(500).json({ error: 'Gagal menyimpan pesanan' });
    }

    return res.status(200).json({ txn_id: txnId, qr_image: qrImage, total });
  } catch (err) {
    console.error('Payment error:', err);
    return res.status(500).json({ error: 'Internal server error', detail: err.message });
  }
        }
