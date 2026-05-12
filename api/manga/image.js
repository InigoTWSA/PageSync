// api/manga/image.js
// Vercel serverless function — proxies MangaDex CDN images server-side.
// The MangaDex at-home CDN nodes reject direct browser requests after ~10 images
// because they check for a valid Referer. Routing through here fixes that.

export default async function handler(req, res) {
    if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        return res.status(200).end();
    }
    if (req.method !== 'GET') return res.status(405).end();

    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'url is required' });

    // Only allow MangaDex CDN domains to prevent open-proxy abuse
    let parsed;
    try { parsed = new URL(url); } catch { return res.status(400).json({ error: 'Invalid url' }); }

    if (!parsed.hostname.endsWith('.mangadex.network') && parsed.hostname !== 'uploads.mangadex.org') {
        return res.status(403).json({ error: 'Forbidden domain' });
    }

    try {
        const upstream = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36',
                'Referer':    'https://mangadex.org/',
                'Accept':     'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
            },
        });

        if (!upstream.ok) {
            return res.status(upstream.status).end();
        }

        const contentType = upstream.headers.get('content-type') || 'image/jpeg';
        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'public, max-age=86400'); // cache 24h
        res.setHeader('Access-Control-Allow-Origin', '*');

        // Stream the image body straight through to the browser
        const buffer = await upstream.arrayBuffer();
        return res.status(200).send(Buffer.from(buffer));
    } catch (err) {
        console.error('[MangaDex image proxy]', err.message);
        return res.status(502).json({ error: 'Failed to fetch image' });
    }
}