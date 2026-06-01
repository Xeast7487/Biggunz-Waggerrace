// Cache module-level : survive les appels répétés sur la même instance Vercel
let _cache = { data: null, ts: 0 };
const FIVE_MIN = 5 * 60 * 1000;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60');

  const apiKey = process.env.HYPEBET_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'HYPEBET_API_KEY manquante' });

  const now = Date.now();

  // Retourner le cache si moins de 5 minutes
  if (_cache.data && (now - _cache.ts) < FIVE_MIN) {
    return res.json({ ..._cache.data, fromCache: true });
  }

  const from = new Date(now.getFullYear !== undefined ? now : now)
  const d     = new Date();
  const from2 = '2026-05-31'; // Début de la race
  const to    = d.toISOString().split('T')[0];

  try {
    const response = await fetch(
      'https://api.hype.bet/wallet/api/v1/affiliate/creator/get-stats',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey, from: from2, to }),
      }
    );

    const data = await response.json();

    // Rate limit — retourner le cache même périmé plutôt que rien
    if (!response.ok) {
      if (_cache.data) return res.json({ ..._cache.data, fromCache: true, rateLimited: true });
      return res.status(response.status).json({ error: data.code || 'Erreur API' });
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

    const result = {
      leaderboard,
      totalWager,
      avgWager,
      totalUsers:  data.summary?.totalUsers || 0,
      dateRange:   data.dateRange,
      lastUpdated: new Date().toISOString(),
    };

    // Sauvegarder dans le cache
    _cache = { data: result, ts: Date.now() };

    return res.json(result);

  } catch (err) {
    // En cas d'erreur réseau, retourner le cache si disponible
    if (_cache.data) return res.json({ ..._cache.data, fromCache: true });
    return res.status(500).json({ error: err.message });
  }
}
