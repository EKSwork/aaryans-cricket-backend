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

  const { action, table, data, id, query, matchId } = req.body || {};

  try {

    // ── GENERIC CRUD ─────────────────────────────
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
        method: 'PATCH', headers, body: JSON.stringify(data)
      });
      return res.status(200).json(await r.json());
    }

    if (action === 'delete') {
      await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, { method: 'DELETE', headers });
      return res.status(200).json({ success: true });
    }

    // ── SAVE COMPLETE MATCH WITH AUTO STATS ──────
    if (action === 'saveMatch') {
      const { match, balls, playerStats } = req.body;

      // 1. Insert match
      const matchRes = await fetch(`${SUPABASE_URL}/rest/v1/matches`, {
        method: 'POST', headers,
        body: JSON.stringify(match)
      });
      const matchData = await matchRes.json();
      const newMatchId = matchData[0]?.id;
      if (!newMatchId) return res.status(400).json({ error: 'Failed to save match' });

      // 2. Insert ball-by-ball data
      if (balls && balls.length > 0) {
        const ballsWithMatch = balls.map(b => ({ ...b, match_id: newMatchId }));
        await fetch(`${SUPABASE_URL}/rest/v1/scorecard_balls`, {
          method: 'POST', headers: { ...headers, 'Prefer': 'return=minimal' },
          body: JSON.stringify(ballsWithMatch)
        });
      }

      // 3. Auto-insert player stats
      if (playerStats && playerStats.length > 0) {
        const statsWithMatch = playerStats.map(s => ({ ...s, match_id: newMatchId }));
        for (const stat of statsWithMatch) {
          await fetch(`${SUPABASE_URL}/rest/v1/player_stats`, {
            method: 'POST', headers: { ...headers, 'Prefer': 'return=minimal' },
            body: JSON.stringify(stat)
          });
        }
      }

      // 4. Update user aggregate stats
      if (playerStats && playerStats.length > 0) {
        for (const stat of playerStats) {
          if (stat.user_id) {
            // Get current user stats
            const userRes = await fetch(
              `${SUPABASE_URL}/rest/v1/users?id=eq.${stat.user_id}&select=matches_played,total_runs,total_wickets,total_catches`,
              { headers }
            );
            const users = await userRes.json();
            const user = users[0];
            if (user) {
              await fetch(`${SUPABASE_URL}/rest/v1/users?id=eq.${stat.user_id}`, {
                method: 'PATCH', headers,
                body: JSON.stringify({
                  matches_played: (user.matches_played || 0) + 1,
                  total_runs: (user.total_runs || 0) + (stat.runs || 0),
                  total_wickets: (user.total_wickets || 0) + (stat.wickets || 0),
                  total_catches: (user.total_catches || 0) + (stat.catches || 0)
                })
              });
            }
          }
        }
      }

      return res.status(200).json({ success: true, matchId: newMatchId });
    }

    // ── GET FULL MATCH DETAILS ───────────────────
    if (action === 'getMatch') {
      const matchRes = await fetch(`${SUPABASE_URL}/rest/v1/matches?id=eq.${id}&select=*`, { headers });
      const matches = await matchRes.json();
      const statsRes = await fetch(`${SUPABASE_URL}/rest/v1/player_stats?match_id=eq.${id}&select=*&order=runs.desc`, { headers });
      const stats = await statsRes.json();
      return res.status(200).json({ match: matches[0], stats });
    }

    // ── GET LEADERBOARD ──────────────────────────
    if (action === 'getLeaderboard') {
      const statsRes = await fetch(
        `${SUPABASE_URL}/rest/v1/player_stats?select=player_name,runs,balls_faced,wickets,overs_bowled,runs_conceded,catches,run_outs,fours,sixes,not_out&order=runs.desc`,
        { headers }
      );
      const stats = await statsRes.json();
      // Aggregate per player
      const players = {};
      (Array.isArray(stats) ? stats : []).forEach(s => {
        if (!players[s.player_name]) {
          players[s.player_name] = { name: s.player_name, matches: 0, runs: 0, balls: 0, wickets: 0, overs: 0, runsConceded: 0, catches: 0, runOuts: 0, fifties: 0, hundreds: 0 };
        }
        const p = players[s.player_name];
        p.matches++;
        p.runs += s.runs || 0;
        p.balls += s.balls_faced || 0;
        if ((s.runs || 0) >= 100) p.hundreds++;
        else if ((s.runs || 0) >= 50) p.fifties++;
        p.wickets += s.wickets || 0;
        p.overs += parseFloat(s.overs_bowled) || 0;
        p.runsConceded += s.runs_conceded || 0;
        p.catches += s.catches || 0;
        p.runOuts += s.run_outs || 0;
      });
      return res.status(200).json({ players: Object.values(players) });
    }

    // ── GET MATCH HISTORY ────────────────────────
    if (action === 'getHistory') {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/matches?select=*&order=created_at.desc&result=neq.pending`,
        { headers }
      );
      return res.status(200).json(await r.json());
    }

    // ── GET LIVE MATCHES ─────────────────────────
    if (action === 'getLive') {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/matches?is_live=eq.true&select=*`,
        { headers }
      );
      return res.status(200).json(await r.json());
    }

    return res.status(400).json({ error: 'Unknown action: ' + action });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
