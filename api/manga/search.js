// api/manga/search.js
// Vercel serverless function — proxies MangaDex search server-side to avoid CORS

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const { q = '', limit = 18 } = req.query;

    try {
        const url = `https://api.mangadex.org/manga?title=${encodeURIComponent(q)}&limit=${Math.min(Number(limit), 25)}&contentRating[]=safe&contentRating[]=suggestive&includes[]=cover_art&includes[]=author&availableTranslatedLanguage[]=en&order[relevance]=desc`;

        const response = await fetch(url, {
            headers: {
                'Content-Type': 'application/json',
                'User-Agent':   'PageSync/1.0',
            },
        });

        const data = await response.json();
        return res.status(200).json(data);
    } catch (err) {
        console.error('[MangaDex search proxy]', err.message);
        return res.status(500).json({ error: 'MangaDex search failed', data: [] });
    }
}