export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const SUPABASE_URL = process.env.SUPABASE_URL || 'https://itcmwsyzvefeqhnygoyc.supabase.co';
  const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_2KwvepVN05Nay8vjvdLJCw_ilJhXOWe';

  const body = req.body || {};
  const { action, email, password, name, phone, playerRole, jerseyNumber, userId, newRole } = body;
  const token = req.headers.authorization?.split(' ')[1];

  const baseHeaders = {
    'Content-Type': 'application/json',
    'apikey': SUPABASE_KEY,
  };

  try {

    // ── SIGNUP ──────────────────────────────────
    if (action === 'signup') {
      // Validate name is provided and not email
      const cleanName = (name || '').trim();
      if (!cleanName || cleanName.indexOf('@') > -1) {
        return res.status(400).json({ error: 'Please enter your full name (not email).' });
      }

      const authRes = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
        method: 'POST',
        headers: { ...baseHeaders },
        body: JSON.stringify({ email, password })
      });
      const authData = await authRes.json();
      if (authData.error) return res.status(400).json({ error: authData.error.message });

      // Create profile with the actual name typed by user
      if (authData.user?.id) {
        const profileRes = await fetch(`${SUPABASE_URL}/rest/v1/users`, {
          method: 'POST',
          headers: {
            ...baseHeaders,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify({
            id: authData.user.id,
            email: email,
            name: cleanName,          // ← actual name user typed
            phone: phone || null,
            player_role: playerRole || 'batsman',
            jersey_number: jerseyNumber ? parseInt(jerseyNumber) : null,
            role: 'player'
          })
        });
        console.log('Profile created for:', cleanName);
      }
      return res.status(200).json({ success: true, message: 'Account created! Please check email to verify.' });
    }

    // ── LOGIN ────────────────────────────────────
    if (action === 'login') {
      const authRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { ...baseHeaders },
        body: JSON.stringify({ email, password })
      });
      const authData = await authRes.json();
      if (authData.error) return res.status(400).json({ error: authData.error.message });
      if (!authData.user || !authData.access_token) {
        return res.status(400).json({ error: 'Login failed. Please verify your email first.' });
      }

      // Get profile
      const profileRes = await fetch(
        `${SUPABASE_URL}/rest/v1/users?id=eq.${authData.user.id}&select=*`,
        { headers: { ...baseHeaders, 'Authorization': `Bearer ${authData.access_token}` } }
      );
      const profiles = await profileRes.json();
      let profile = profiles[0];

      // If no profile exists yet, create one
      if (!profile) {
        const nameFromEmail = email.split('@')[0];
        await fetch(`${SUPABASE_URL}/rest/v1/users`, {
          method: 'POST',
          headers: { ...baseHeaders, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Prefer': 'return=minimal' },
          body: JSON.stringify({
            id: authData.user.id,
            email: email,
            name: nameFromEmail,
            role: 'player',
            player_role: 'batsman'
          })
        });
        profile = { name: nameFromEmail, role: 'player', player_role: 'batsman', email: email };
      }

      return res.status(200).json({
        user: authData.user,
        profile: profile,
        token: authData.access_token
      });
    }

    // ── GET MEMBERS ──────────────────────────────
    if (action === 'getMembers') {
      const membersRes = await fetch(
        `${SUPABASE_URL}/rest/v1/users?select=id,name,player_role,jersey_number,role,matches_played&order=name`,
        { headers: { ...baseHeaders, 'Authorization': `Bearer ${token || SUPABASE_KEY}` } }
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
          headers: { ...baseHeaders, 'Authorization': `Bearer ${token || SUPABASE_KEY}`, 'Prefer': 'return=representation' },
          body: JSON.stringify({ role: newRole })
        }
      );
      return res.status(200).json({ success: true });
    }

    // ── UPDATE PROFILE ───────────────────────────
    if (action === 'updateProfile') {
      const { newName, newPhone, newPlayerRole, newJersey } = body;
      const updateData = {};
      if (newName) updateData.name = newName.trim();
      if (newPhone !== undefined) updateData.phone = newPhone;
      if (newPlayerRole) updateData.player_role = newPlayerRole;
      if (newJersey !== undefined) updateData.jersey_number = newJersey ? parseInt(newJersey) : null;

      const updateRes = await fetch(
        `${SUPABASE_URL}/rest/v1/users?id=eq.${userId}`,
        {
          method: 'PATCH',
          headers: { ...baseHeaders, 'Authorization': `Bearer ${token}`, 'Prefer': 'return=representation' },
          body: JSON.stringify(updateData)
        }
      );
      const updated = await updateRes.json();
      return res.status(200).json({ success: true, profile: updated[0] });
    }

    return res.status(400).json({ error: 'Unknown action: ' + action });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
