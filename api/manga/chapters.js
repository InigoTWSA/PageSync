// api/manga/chapters.js
// Vercel serverless function — proxies MangaDex chapter feed server-side to avoid CORS

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'id is required' });

    try {
        const url = `https://api.mangadex.org/manga/${id}/feed?translatedLanguage[]=en&limit=20&order[chapter]=asc&contentRating[]=safe&contentRating[]=suggestive`;

        const response = await fetch(url, {
            headers: {
                'Content-Type': 'application/json',
                'User-Agent':   'PageSync/1.0',
            },
        });

        const data = await response.json();
        return res.status(200).json(data);
    } catch (err) {
        console.error('[MangaDex chapters proxy]', err.message);
        return res.status(500).json({ error: 'MangaDex chapters failed' });
    }
}