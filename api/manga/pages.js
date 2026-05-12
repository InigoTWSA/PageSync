// api/manga/pages.js
// Vercel serverless function — fetches chapter page image URLs from MangaDex

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'Chapter id is required' });

    try {
        const response = await fetch(`https://api.mangadex.org/at-home/server/${id}`, {
            headers: {
                'Content-Type': 'application/json',
                'User-Agent':   'PageSync/1.0',
            },
        });

        if (!response.ok) {
            return res.status(response.status).json({ error: 'MangaDex returned error' });
        }

        const data     = await response.json();
        const baseUrl  = data.baseUrl;
        const hash     = data.chapter?.hash;
        const pages    = data.chapter?.data    || [];
        const lowPages = data.chapter?.dataSaver || [];

        // Proxy images through /api/manga/image — the MangaDex CDN blocks browsers
        // that don't send a valid Referer header, causing pages 10+ to 404.
        const proxy = (url) => `/api/manga/image?url=${encodeURIComponent(url)}`;

        return res.status(200).json({
            baseUrl,
            hash,
            pages:      pages.map(p    => proxy(`${baseUrl}/data/${hash}/${p}`)),
            pagesSaver: lowPages.map(p => proxy(`${baseUrl}/data-saver/${hash}/${p}`)),
        });
    } catch (err) {
        console.error('[MangaDex pages proxy]', err.message);
        return res.status(500).json({ error: 'Failed to fetch chapter pages' });
    }
}