import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { txn_id } = req.body;
    if (!txn_id) return res.status(400).json({ error: 'txn_id diperlukan' });

    const { data: order, error: oErr } = await sb
      .from('orders')
      .select('*')
      .eq('txn_id', txn_id)
      .single();

    if (oErr || !order) return res.status(404).json({ error: 'Pesanan tidak ditemukan' });

    if (order.status === 'paid') {
      return res.status(200).json({ status: 'paid', accounts: order.account_data, order });
    }

    if (order.status === 'expired' || order.status === 'failed') {
      return res.status(200).json({ status: order.status });
    }

    const checkUrl = `https://api.neoxr.eu/api/tako-status?id=${encodeURIComponent(txn_id)}&apikey=${process.env.TAKO_API_KEY}`;
    const checkRes = await fetch(checkUrl);
    const checkData = await checkRes.json();

    const payStatus = checkData?.data?.status || checkData?.status || 'pending';

    if (payStatus !== 'paid' && payStatus !== 'success' && payStatus !== 'settlement') {
      if (payStatus === 'expired' || payStatus === 'cancel') {
        await sb.from('orders').update({ status: 'expired' }).eq('txn_id', txn_id);
        return res.status(200).json({ status: 'expired' });
      }
      return res.status(200).json({ status: 'pending' });
    }

    const { data: product } = await sb
      .from('products')
      .select('rules')
      .eq('id', order.product_id)
      .single();

    const { data: poolItems, error: poolErr } = await sb
      .from('account_pool')
      .select('id, account_data')
      .eq('product_id', order.product_id)
      .eq('used', false)
      .limit(100);

    if (poolErr || !poolItems || poolItems.length < order.quantity) {
      console.error('Pool error or insufficient stock:', poolErr, poolItems?.length);
      return res.status(500).json({ error: 'Stok habis, hubungi admin' });
    }

    const shuffled = [...poolItems].sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, order.quantity);
    const selectedIds = selected.map(i => i.id);
    const accountDataArr = selected.map(i => i.account_data);

    const { error: delErr } = await sb
      .from('account_pool')
      .delete()
      .in('id', selectedIds);

    if (delErr) {
      console.error('Delete pool error:', delErr);
      return res.status(500).json({ error: 'Gagal memproses akun' });
    }

    const deliveredAccounts = accountDataArr.map(a => ({
      ...a,
      rules: product?.rules || null,
    }));

    const { error: updErr } = await sb.from('orders').update({
      status: 'paid',
      paid_at: new Date().toISOString(),
      account_data: deliveredAccounts,
    }).eq('txn_id', txn_id);

    if (updErr) {
      console.error('Order update error:', updErr);
      return res.status(500).json({ error: 'Gagal update pesanan' });
    }

    return res.status(200).json({ status: 'paid', accounts: deliveredAccounts, order: { ...order, status: 'paid' } });
  } catch (err) {
    console.error('Check error:', err);
    return res.status(500).json({ error: 'Internal server error', detail: err.message });
  }
}
