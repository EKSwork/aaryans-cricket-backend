export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const SUPABASE_URL = process.env.SUPABASE_URL || 'https://itcmwsyzvefeqhnygoyc.supabase.co';
  const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_2KwvepVN05Nay8vjvdLJCw_ilJhXOWe';
  const token = req.headers.authorization?.split(' ')[1];

  const headers = {
    'Content-Type': 'application/json',
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${token || SUPABASE_KEY}`,
    'Prefer': 'return=representation'
  };

  const { table, action, data, id, query } = req.body || {};

  try {
    if (action === 'insert') {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
        method: 'POST', headers,
        body: JSON.stringify(data)
      });
      return res.status(200).json(await r.json());
    }

    if (action === 'select') {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query || 'order=created_at.desc'}`, { headers });
      return res.status(200).json(await r.json());
    }

    if (action === 'update') {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
        method: 'PATCH', headers,
        body: JSON.stringify(data)
      });
      return res.status(200).json(await r.json());
    }

    if (action === 'delete') {
      await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
        method: 'DELETE', headers
      });
      return res.status(200).json({ success: true });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
