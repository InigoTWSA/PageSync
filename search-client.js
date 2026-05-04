// search-client.js
// Client-side search + detail fetching using free, no-key public APIs.
//
// APIs used:
//   Books / Classics  → Open Library  (openlibrary.org)  — free, no key
//   Manga / Manhwa    → Jikan v4      (api.jikan.moe)    — free, no key (sfw=true enforced)
//   Comics            → Open Library  (subject search)   — free, no key
//   Classics          → Gutendex      (gutendex.com)     — free, no key

// ─── NSFW filter ─────────────────────────────────────────────────────────────
// Applied to every result from every source before returning.

// Exact or substring matches against title / subjects / description (case-insensitive).
const BLOCKED_TERMS = [
  // Explicit adult content labels
  'hentai', 'erotic', 'erotica', 'eroge', 'pornograph', 'explicit sex',
  'adult content', 'sexually explicit', 'xxx', 'nsfw',
  // Common adult manga/doujin labels
  'ecchi', 'doujinshi', 'doujin', 'lemon fanfic',
  // Fetish / kink terms
  'bdsm', 'bondage', 'fetish', 'dominatrix', 'sadism', 'masochism',
  // Violence-only extreme
  'gore', 'guro', 'snuff',
  // Nudity signals
  'nude', 'nudity', 'naked women', 'naked men',
  // Predatory / illegal
  'lolicon', 'shotacon', 'incest', 'child porn',
];

// Whole-title blocklist — titles that are entirely adult works
// (kept short; substring BLOCKED_TERMS above handles the rest)
const BLOCKED_TITLES = [
  'playboy', 'penthouse', 'hustler', 'barely legal',
];

// MAL / Jikan genre IDs that are adults-only
// 9 = Ecchi, 12 = Hentai, 49 = Erotica
const BLOCKED_JIKAN_GENRE_IDS = new Set([9, 12, 49]);

function isSafe(item) {
  const haystack = [
    item.title        || '',
    item.author       || '',
    item.description  || '',
    ...(item.subjects || []),
    ...(item.genres   || []),
    ...(item.themes   || []),
  ].join(' ').toLowerCase();

  // Check substring blocklist
  if (BLOCKED_TERMS.some(term => haystack.includes(term))) return false;

  // Check whole-title blocklist
  const titleLower = (item.title || '').toLowerCase();
  if (BLOCKED_TITLES.some(t => titleLower.includes(t))) return false;

  // Check Jikan genre IDs if present (raw genres from Jikan have .mal_id)
  if (item._rawGenreIds) {
    if (item._rawGenreIds.some(id => BLOCKED_JIKAN_GENRE_IDS.has(id))) return false;
  }

  return true;
}

function filterSafe(results) {
  return results.filter(isSafe).map(item => {
    // Strip internal-only field before returning
    const { _rawGenreIds, ...clean } = item;
    return clean;
  });
}

// ─── Search entry point ───────────────────────────────────────────────────────
export async function clientSearch(query, source = 'books', limit = 12) {
  if (!query?.trim()) return { results: [], parsed: {} };

  // Request more than needed so filtering doesn't leave us short
  const fetchLimit = limit + 10;
  const parsed     = parseQuery(query.trim(), source);
  const src        = source === 'books' && parsed.source !== 'books' ? parsed.source : source;

  let results = [];
  try {
    if (src === 'manga')         results = await searchJikan(parsed.keywords, fetchLimit);
    else if (src === 'comics')   results = await searchOpenLibrarySubject('comics', parsed.keywords, fetchLimit);
    else if (src === 'classics') results = await searchGutenbergRest(parsed.keywords, fetchLimit);
    else if (src === 'all') {
      const perSource = Math.ceil(fetchLimit / 3);
      const [books, manga, classics] = await Promise.allSettled([
        searchOpenLibrary(parsed.keywords, perSource),
        searchJikan(parsed.keywords, perSource),
        searchGutenbergRest(parsed.keywords, perSource),
      ]);
      results = [
        ...(books.status    === 'fulfilled' ? books.value    : []),
        ...(manga.status    === 'fulfilled' ? manga.value    : []),
        ...(classics.status === 'fulfilled' ? classics.value : []),
      ];
    } else {
      results = await searchOpenLibrary(parsed.keywords, fetchLimit);
    }
  } catch (err) {
    console.error('[search-client] error:', err);
  }

  return { results: filterSafe(results).slice(0, limit), parsed };
}

// ─── Detail entry point ───────────────────────────────────────────────────────
export async function getBookDetail(id, source) {
  if (source === 'manga-eden') {
    return await fetchJikanDetail(id);
  } else if (source === 'gutenberg') {
    return await fetchGutenbergDetail(id);
  } else {
    return await fetchOpenLibraryDetail(id);
  }
}

// ─── Open Library detail ──────────────────────────────────────────────────────
async function fetchOpenLibraryDetail(externalId) {
  const workKey = externalId.startsWith('/works/') ? externalId : `/works/${externalId}`;
  const [workRes, ratingsRes] = await Promise.allSettled([
    fetch(`https://openlibrary.org${workKey}.json`),
    fetch(`https://openlibrary.org${workKey}/ratings.json`),
  ]);

  const work    = workRes.status    === 'fulfilled' ? await workRes.value.json()    : {};
  const ratings = ratingsRes.status === 'fulfilled' ? await ratingsRes.value.json() : {};

  let authors = [];
  if (work.authors?.length) {
    const authorData = await Promise.all(
      work.authors.slice(0, 3).map(a => {
        const key = a.author?.key || a.key;
        return key
          ? fetch(`https://openlibrary.org${key}.json`).then(r => r.json()).catch(() => ({}))
          : Promise.resolve({});
      })
    );
    authors = authorData.map(a => a.name).filter(Boolean);
  }

  let description = '';
  if (work.description) {
    description = typeof work.description === 'string' ? work.description : work.description?.value || '';
  }

  const cover    = work.covers?.length ? `https://covers.openlibrary.org/b/id/${work.covers[0]}-L.jpg` : null;
  const subjects = (work.subjects || []).slice(0, 8);
  const rating   = ratings?.summary?.average ? Math.round(ratings.summary.average * 10) / 10 : null;

  return {
    id:          `ol-${workKey.replace('/works/', '')}`,
    externalId:  workKey,
    source:      'open-library',
    sourceLabel: 'Book',
    title:       work.title || 'Unknown Title',
    authors,
    author:      authors[0] || 'Unknown Author',
    cover,
    rating,
    ratingCount: ratings?.summary?.count || null,
    year:        work.first_publish_date || null,
    description,
    subjects,
    pages:       null,
    status:      null,
    chapters:    null,
    genres:      subjects.slice(0, 5),
    url:         `https://openlibrary.org${workKey}`,
  };
}

// ─── Jikan detail ─────────────────────────────────────────────────────────────
async function fetchJikanDetail(malId) {
  const res  = await fetch(`https://api.jikan.moe/v4/manga/${malId}/full`);
  const data = await res.json();
  const m    = data.data || {};

  const authors  = (m.authors || []).map(a => a.name?.replace(/,\s*/, ' ')).filter(Boolean);
  const genres   = (m.genres  || []).map(g => g.name);
  const themes   = (m.themes  || []).map(t => t.name);
  const subjects = [...genres, ...themes].slice(0, 8);

  return {
    id:          `jikan-${m.mal_id}`,
    externalId:  String(m.mal_id),
    source:      'manga-eden',
    sourceLabel: m.type === 'Manhwa' ? 'Manhwa' : m.type === 'Manhua' ? 'Manhua' : 'Manga',
    title:       m.title_english || m.title || 'Unknown Title',
    titleNative: m.title_japanese || m.title_synonyms?.[0] || null,
    authors,
    author:      authors[0] || 'Unknown Author',
    cover:       m.images?.jpg?.large_image_url || m.images?.jpg?.image_url || null,
    rating:      m.score || null,
    ratingCount: m.scored_by || null,
    rank:        m.rank || null,
    popularity:  m.popularity || null,
    year:        m.published?.prop?.from?.year || null,
    description: m.synopsis || null,
    status:      m.status || null,
    chapters:    m.chapters || null,
    volumes:     m.volumes  || null,
    subjects,
    genres,
    themes,
    url:         m.url || null,
  };
}

// ─── Gutenberg detail ─────────────────────────────────────────────────────────
async function fetchGutenbergDetail(gutenbergId) {
  const res  = await fetch(`https://gutendex.com/books/${gutenbergId}`);
  const b    = await res.json();

  const authors  = (b.authors || []).map(a => a.name?.replace(/,\s*\d+.*$/, '')).filter(Boolean);
  const subjects = (b.subjects || []).slice(0, 8);

  return {
    id:            `gutenberg-${b.id}`,
    externalId:    String(b.id),
    source:        'gutenberg',
    sourceLabel:   'Classic',
    title:         b.title || 'Unknown Title',
    authors,
    author:        authors[0] || 'Unknown Author',
    cover:         b.formats?.['image/jpeg'] || null,
    rating:        null,
    ratingCount:   null,
    year:          b.authors?.[0]?.birth_year || null,
    description:   subjects.join(' · ') || null,
    status:        'Public Domain',
    chapters:      null,
    subjects,
    genres:        subjects.slice(0, 5),
    downloadCount: b.download_count || null,
    readUrl:       b.formats?.['text/html'] || b.formats?.['application/epub+zip'] || null,
    url:           `https://www.gutenberg.org/ebooks/${b.id}`,
  };
}

// ─── Query parser ─────────────────────────────────────────────────────────────
function parseQuery(query, forcedSource) {
  let source = forcedSource || 'books';
  if (forcedSource === 'books' || !forcedSource) {
    if (/manga|manhwa|manhua|webtoon|anime|shonen|shojo|seinen|isekai/i.test(query))
      source = 'manga';
    else if (/comic|graphic novel|marvel|dc comics|batman|superman|spider.?man/i.test(query))
      source = 'comics';
    else if (/classic|gutenberg|public domain|dickens|tolstoy|austen|shakespeare/i.test(query))
      source = 'classics';
  }
  const keywords = query
    .replace(/\b(find|show|search|give me|recommend|good|best|popular|top)\b/gi, '')
    .replace(/\s+/g, ' ').trim();
  return { keywords, source };
}

// ─── Open Library search ──────────────────────────────────────────────────────
async function searchOpenLibrary(keywords, limit = 12) {
  const url  = `https://openlibrary.org/search.json?q=${encodeURIComponent(keywords)}&limit=${limit}&fields=key,title,author_name,cover_i,first_publish_year,ratings_average,subject`;
  const data = await fetch(url).then(r => r.json());
  return (data.docs || []).map((d, i) => ({
    id:          `ol-${d.key?.replace('/works/', '') || i}`,
    externalId:  d.key || String(i),
    source:      'open-library',
    sourceLabel: 'Book',
    title:       d.title || 'Unknown Title',
    author:      d.author_name?.[0] || 'Unknown Author',
    cover:       d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg` : null,
    rating:      d.ratings_average ? Math.round(d.ratings_average * 10) / 10 : null,
    year:        d.first_publish_year || null,
    subjects:    (d.subject || []).slice(0, 6),
  }));
}

async function searchOpenLibrarySubject(subject, keywords, limit = 12) {
  const url  = `https://openlibrary.org/search.json?q=${encodeURIComponent(keywords + ' ' + subject)}&limit=${limit}&fields=key,title,author_name,cover_i,first_publish_year,ratings_average,subject`;
  const data = await fetch(url).then(r => r.json());
  return (data.docs || []).map((d, i) => ({
    id:          `ol-comic-${d.key?.replace('/works/', '') || i}`,
    externalId:  d.key || String(i),
    source:      'open-library',
    sourceLabel: 'Comics',
    title:       d.title || 'Unknown Title',
    author:      d.author_name?.[0] || 'Unknown Author',
    cover:       d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg` : null,
    rating:      d.ratings_average ? Math.round(d.ratings_average * 10) / 10 : null,
    year:        d.first_publish_year || null,
    subjects:    (d.subject || []).slice(0, 6),
  }));
}

// ─── Gutenberg search ─────────────────────────────────────────────────────────
async function searchGutenbergRest(keywords, limit = 12) {
  const url  = `https://gutendex.com/books/?search=${encodeURIComponent(keywords)}&mime_type=image%2F`;
  const data = await fetch(url).then(r => r.json());
  return (data.results || []).map((b, i) => ({
    id:          `gutenberg-${b.id || i}`,
    externalId:  String(b.id || i),
    source:      'gutenberg',
    sourceLabel: 'Classic',
    title:       b.title || 'Unknown Title',
    author:      b.authors?.[0]?.name?.replace(/,\s*\d+.*$/, '') || 'Unknown Author',
    cover:       b.formats?.['image/jpeg'] || null,
    rating:      null,
    year:        b.authors?.[0]?.birth_year || null,
    description: b.subjects?.slice(0, 2).join(', ') || null,
    subjects:    (b.subjects || []).slice(0, 6),
  }));
}

// ─── Jikan search — sfw=true enforced at API level + client filter ────────────
async function searchJikan(keywords, limit = 12) {
  // sfw=true tells Jikan to exclude adult-rated entries at the source
  const url  = `https://api.jikan.moe/v4/manga?q=${encodeURIComponent(keywords)}&limit=${Math.min(limit, 25)}&order_by=popularity&sort=asc&sfw=true`;
  const data = await fetch(url).then(r => r.json());
  return (data.data || []).map((m, i) => ({
    id:              `jikan-${m.mal_id || i}`,
    externalId:      String(m.mal_id || i),
    source:          'manga-eden',
    sourceLabel:     m.type === 'Manhwa' ? 'Manhwa' : m.type === 'Manhua' ? 'Manhua' : 'Manga',
    title:           m.title_english || m.title || 'Unknown Title',
    author:          m.authors?.[0]?.name?.replace(/,\s*/, ' ') || 'Unknown Author',
    cover:           m.images?.jpg?.large_image_url || m.images?.jpg?.image_url || null,
    rating:          m.score || null,
    year:            m.published?.prop?.from?.year || null,
    description:     m.synopsis ? m.synopsis.slice(0, 200) : null,
    status:          m.status || null,
    chapters:        m.chapters || null,
    genres:          (m.genres || []).map(g => g.name),
    themes:          (m.themes || []).map(t => t.name),
    // Internal field used by isSafe() — stripped before export
    _rawGenreIds:    (m.genres || []).map(g => g.mal_id),
  }));
}
