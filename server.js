import express from 'express';
import cors from 'cors';
import crypto from 'crypto';

const app = express();
const port = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

const users = [];

function normalizeUsername(value) {
    return value.trim().toLowerCase();
}

function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

function findUserByEmail(email) {
    return users.find(u => u.email.toLowerCase() === email.toLowerCase());
}

function findUserByUsername(username) {
    return users.find(u => normalizeUsername(u.username) === normalizeUsername(username));
}

function findUserByGoogleId(googleId) {
    return users.find(u => u.provider === 'google' && u.googleId === googleId);
}

function generateUniqueUsername(base) {
    let username = normalizeUsername(base.replace(/[^a-z0-9]/gi, '') || 'user');
    let candidate = username;
    let suffix = 1;

    while (findUserByUsername(candidate)) {
        candidate = `${username}${suffix}`;
        suffix += 1;
    }

    return candidate;
}

app.get('/api/check-username', (req, res) => {
    const { username } = req.query;
    if (!username) {
        return res.status(400).json({ error: 'username query is required' });
    }

    const exists = !!findUserByUsername(username);
    return res.json({ available: !exists });
});

app.post('/api/signup', (req, res) => {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
        return res.status(400).json({ error: 'username, email, and password are required' });
    }

    if (findUserByUsername(username)) {
        return res.status(409).json({ error: 'Username already exists' });
    }

    if (findUserByEmail(email)) {
        return res.status(409).json({ error: 'Email already registered' });
    }

    const user = {
        id: crypto.randomUUID(),
        username: username.trim(),
        email: email.trim().toLowerCase(),
        passwordHash: hashPassword(password),
        provider: 'local',
        createdAt: new Date().toISOString(),
    };

    users.push(user);
    return res.status(201).json({ message: 'Account created', user: { id: user.id, username: user.username, email: user.email } });
});

app.post('/api/login', (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'email and password are required' });
    }

    const user = findUserByEmail(email);
    if (!user || user.passwordHash !== hashPassword(password)) {
        return res.status(401).json({ error: 'Invalid email or password' });
    }

    return res.json({ message: 'Signed in successfully', user: { id: user.id, username: user.username, email: user.email } });
});

app.post('/api/forgot-password', (req, res) => {
    const { identifier } = req.body;
    if (!identifier) {
        return res.status(400).json({ error: 'identifier is required' });
    }

    const user = identifier.includes('@')
        ? findUserByEmail(identifier)
        : findUserByUsername(identifier);

    if (!user) {
        return res.json({ message: 'If that account exists, a reset email was sent.' });
    }

    // In a real backend, send an email using a provider like SendGrid or Nodemailer.
    console.log(`Password reset requested for ${user.email}`);
    return res.json({ message: 'Reset password instructions sent.' });
});

app.post('/api/auth/google', (req, res) => {
    const { googleId, email, displayName } = req.body;
    if (!googleId || !email || !displayName) {
        return res.status(400).json({ error: 'googleId, email, and displayName are required' });
    }

    let user = findUserByGoogleId(googleId) || findUserByEmail(email);
    if (user) {
        if (!user.googleId) {
            user.googleId = googleId;
            user.provider = 'google';
        }
        return res.json({ message: 'Signed in with Google', user: { id: user.id, username: user.username, email: user.email } });
    }

    const username = generateUniqueUsername(displayName);
    user = {
        id: crypto.randomUUID(),
        username,
        email: email.trim().toLowerCase(),
        passwordHash: null,
        provider: 'google',
        googleId,
        createdAt: new Date().toISOString(),
    };

    users.push(user);
    return res.status(201).json({ message: 'Google account created', user: { id: user.id, username: user.username, email: user.email } });
});

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

app.listen(port, () => {
    console.log(`PageSync running at http://localhost:${port}`);
});
