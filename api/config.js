// api/config.js — Returns safe public config to frontend
// Semua config diambil dari ENV, tidak ada hardcode

export default function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  res.setHeader('Cache-Control', 'public, max-age=60');
  res.json({
    supabaseUrl:  process.env.SUPABASE_URL  || '',
    supabaseAnon: process.env.SUPABASE_ANON_KEY || '',
    storeName:    process.env.STORE_NAME    || 'SeonsPrems',
    whatsapp:     process.env.WA_NUMBER     || '',
    telegram:     process.env.TG_USERNAME   || '',
    instagram:    process.env.IG_USERNAME   || '',
  });
}
