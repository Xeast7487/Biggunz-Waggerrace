// Vercel Serverless Function — proxy Hype.bet API
// Protège la clé API côté serveur + cache Vercel Edge 5 minutes

export default async function handler(req, res) {
  const apiKey = process.env.HYPEBET_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'HYPEBET_API_KEY not configured' });
  }

  // Date range : 1er du mois actuel → aujourd'hui
  const now   = new Date();
  const from  = new Date(now.getFullYear(), now.getMonth(), 1)
                  .toISOString().split('T')[0];
  const to    = now.toISOString().split('T')[0];

  try {
    const response = await fetch(
      'https://api.hype.bet/wallet/api/v1/affiliate/creator/get-stats',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey, from, to }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    // Trier par wagered décroissant + convertir centimes → dollars
    const sorted = [...(data.summarizedBets || [])]
      .sort((a, b) => b.wagered - a.wagered);

    const leaderboard = sorted.map((entry, i) => ({
      rank:   i + 1,
      name:   entry.user.username,
      avatar: entry.user.avatar || null,
      wager:  entry.wagered / 100,   // centimes → dollars
      bets:   entry.bets,
    }));

    const totalWager = leaderboard.reduce((s, e) => s + e.wager, 0);
    const avgWager   = leaderboard.length > 0 ? totalWager / leaderboard.length : 0;

    // Cache Vercel Edge 5 minutes (= cooldown de l'API)
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60');
    res.setHeader('Access-Control-Allow-Origin', '*');

    return res.json({
      leaderboard,
      totalWager,
      avgWager,
      totalUsers:  data.summary?.totalUsers || 0,
      dateRange:   data.dateRange,
      lastUpdated: new Date().toISOString(),
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
