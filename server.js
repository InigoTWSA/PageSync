import express from 'express';
import cors from 'cors';

const app = express();
const port = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// Auth is handled entirely by Firebase Authentication + Firestore (see firebase.js).
// The in-memory user store and auth routes (/api/signup, /api/login, etc.) have
// been removed — they were never persisted and conflicted with Firebase.

// ── MangaDex proxy ────────────────────────────────────────────────────────────
// Forwards requests to MangaDex server-side to avoid browser CORS restrictions.

const MDX_BASE = 'https://api.mangadex.org';
const MDX_HEADERS = {
    'Content-Type': 'application/json',
    'User-Agent':   'PageSync/1.0',
};

// Search manga
app.get('/api/manga/search', async (req, res) => {
    try {
        const { q = '', limit = 18 } = req.query;
        const url = `${MDX_BASE}/manga?title=${encodeURIComponent(q)}&limit=${Math.min(Number(limit), 25)}&contentRating[]=safe&contentRating[]=suggestive&includes[]=cover_art&includes[]=author&availableTranslatedLanguage[]=en&order[relevance]=desc`;
        const response = await fetch(url, { headers: MDX_HEADERS });
        const data     = await response.json();
        return res.json(data);
    } catch (err) {
        console.error('[MangaDex proxy /search]', err.message);
        return res.status(500).json({ error: 'MangaDex search failed', data: [] });
    }
});

// Get manga detail
app.get('/api/manga/detail/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const url = `${MDX_BASE}/manga/${id}?includes[]=cover_art&includes[]=author&includes[]=artist`;
        const response = await fetch(url, { headers: MDX_HEADERS });
        const data     = await response.json();
        return res.json(data);
    } catch (err) {
        console.error('[MangaDex proxy /detail]', err.message);
        return res.status(500).json({ error: 'MangaDex detail failed' });
    }
});

// Get manga chapters
app.get('/api/manga/chapters/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const url = `${MDX_BASE}/manga/${id}/feed?translatedLanguage[]=en&limit=20&order[chapter]=asc&contentRating[]=safe&contentRating[]=suggestive`;
        const response = await fetch(url, { headers: MDX_HEADERS });
        const data     = await response.json();
        return res.json(data);
    } catch (err) {
        console.error('[MangaDex proxy /chapters]', err.message);
        return res.status(500).json({ error: 'MangaDex chapters failed' });
    }
});

// Get chapter pages (image URLs)
app.get('/api/manga/pages', async (req, res) => {
    try {
        const { id } = req.query;
        if (!id) return res.status(400).json({ error: 'id is required' });

        const response = await fetch(`https://api.mangadex.org/at-home/server/${id}`, {
            headers: { 'Content-Type': 'application/json', 'User-Agent': 'PageSync/1.0' },
        });

        if (!response.ok) {
            return res.status(response.status).json({ error: 'MangaDex returned error' });
        }

        const data     = await response.json();
        const baseUrl  = data.baseUrl;
        const hash     = data.chapter?.hash;
        const pages    = data.chapter?.data    || [];
        const lowPages = data.chapter?.dataSaver || [];

        return res.json({
            baseUrl,
            hash,
            pages:      pages.map(p    => `${baseUrl}/data/${hash}/${p}`),
            pagesSaver: lowPages.map(p => `${baseUrl}/data-saver/${hash}/${p}`),
        });
    } catch (err) {
        console.error('[MangaDex proxy /pages]', err.message);
        return res.status(500).json({ error: 'Failed to fetch chapter pages' });
    }
});

app.listen(port, () => {
    console.log(`PageSync running at http://localhost:${port}`);
});