export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const SUPABASE_URL = process.env.SUPABASE_URL || 'https://itcmwsyzvefeqhnygoyc.supabase.co';
  const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_2KwvepVN05Nay8vjvdLJCw_ilJhXOWe';

  const { action, email, password, name, phone, playerRole, jerseyNumber, userId, newRole } = req.body || {};
  const token = req.headers.authorization?.split(' ')[1];

  const authHeaders = {
    'Content-Type': 'application/json',
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${token || SUPABASE_KEY}`
  };

  try {

    // ── SIGNUP ──────────────────────────────────
    if (action === 'signup') {
      const authRes = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY },
        body: JSON.stringify({ email, password })
      });
      const authData = await authRes.json();
      if (authData.error) return res.status(400).json({ error: authData.error.message });

      // Create profile
      if (authData.user?.id) {
        await fetch(`${SUPABASE_URL}/rest/v1/users`, {
          method: 'POST',
          headers: { ...authHeaders, 'Prefer': 'return=minimal' },
          body: JSON.stringify({
            id: authData.user.id,
            email: email,
            name: name,
            phone: phone || null,
            player_role: playerRole || 'batsman',
            jersey_number: jerseyNumber ? parseInt(jerseyNumber) : null,
            role: 'player'
          })
        });
      }
      return res.status(200).json({ success: true, message: 'Account created! Please check email to verify.' });
    }

    // ── LOGIN ────────────────────────────────────
    if (action === 'login') {
      const authRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY },
        body: JSON.stringify({ email, password })
      });
      const authData = await authRes.json();
      if (authData.error) return res.status(400).json({ error: authData.error.message });

      // Get profile
      const profileRes = await fetch(
        `${SUPABASE_URL}/rest/v1/users?id=eq.${authData.user.id}&select=*`,
        { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${authData.access_token}` } }
      );
      const profiles = await profileRes.json();
      const profile = profiles[0] || { name: email.split('@')[0], role: 'player', player_role: 'batsman' };
      return res.status(200).json({ user: authData.user, profile, token: authData.access_token });
    }

    // ── GET MEMBERS ──────────────────────────────
    if (action === 'getMembers') {
      const membersRes = await fetch(
        `${SUPABASE_URL}/rest/v1/users?select=id,name,player_role,jersey_number,role,matches_played&order=name`,
        { headers: authHeaders }
      );
      const members = await membersRes.json();
      return res.status(200).json({ members: Array.isArray(members) ? members : [] });
    }

    // ── UPDATE ROLE ──────────────────────────────
    if (action === 'updateRole') {
      const updateRes = await fetch(
        `${SUPABASE_URL}/rest/v1/users?id=eq.${userId}`,
        {
          method: 'PATCH',
          headers: { ...authHeaders, 'Prefer': 'return=representation' },
          body: JSON.stringify({ role: newRole })
        }
      );
      const updated = await updateRes.json();
      return res.status(200).json({ success: true, updated });
    }

    // ── GET MY PROFILE ───────────────────────────
    if (action === 'getProfile') {
      const profileRes = await fetch(
        `${SUPABASE_URL}/rest/v1/users?id=eq.${req.body.userId}&select=*`,
        { headers: authHeaders }
      );
      const profiles = await profileRes.json();
      return res.status(200).json({ profile: profiles[0] || null });
    }

    return res.status(400).json({ error: 'Unknown action: ' + action });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
