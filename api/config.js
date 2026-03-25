export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).end();

  return res.status(200).json({
    store_name: process.env.STORE_NAME || 'SeonsPrems',
    wa_number: process.env.WA_NUMBER || '',
    telegram_user: process.env.TELEGRAM_USER || '',
    ig_user: process.env.IG_USER || '',
  });
}
