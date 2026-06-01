// Vercel Serverless Function — proxy Hype.bet API
// Cache Vercel Edge 5 minutes (= cooldown API)

module.exports = async function handler(req, res) {
  const apiKey = process.env.HYPEBET_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'HYPEBET_API_KEY non configurée' });
  }

  const now  = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const to   = now.toISOString().split('T')[0];

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

    const sorted = [...(data.summarizedBets || [])].sort((a, b) => b.wagered - a.wagered);

    const leaderboard = sorted.map((entry, i) => ({
      rank:   i + 1,
      name:   entry.user.username,
      avatar: entry.user.avatar || null,
      wager:  entry.wagered / 100,
      bets:   entry.bets,
    }));

    const totalWager = leaderboard.reduce((s, e) => s + e.wager, 0);
    const avgWager   = leaderboard.length > 0 ? totalWager / leaderboard.length : 0;

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
};
