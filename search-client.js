// search-client.js
// Client-side search + detail fetching using free, no-key public APIs.
//
// APIs used:
//   Books             → Open Library    (openlibrary.org)    — free, no key
//   Manga / Manhwa    → MangaDex        (via /api/manga proxy in server.js) — no CORS
//   Manga fallback    → Jikan v4        (api.jikan.moe)      — if proxy unavailable
//   Classics          → Gutendex        (gutendex.com)       — free, no key
//   Free Books        → Standard Ebooks (standardebooks.org) — free, no key
//   Academic          → Internet Archive(archive.org)        — free, no key

// ─── Gemini NLP query parser ──────────────────────────────────────────────────
// Fill in your key from https://aistudio.google.com/app/apikey (free).
// Leave empty and the regex fallback is used automatically.
const GEMINI_API_KEY = 'AIzaSyDxasdDlGC0Bb1xsGs0OUW7jaZIsoVuH0k';

function parseQueryRegex(query, forcedSource) {
  let source = forcedSource || 'books';
  if (!forcedSource || forcedSource === 'books') {
    if (/manga|manhwa|manhua|webtoon|anime|shonen|shojo|seinen|isekai/i.test(query))
      source = 'manga';
    else if (/classic|gutenberg|public domain|dickens|tolstoy|austen|shakespeare/i.test(query))
      source = 'classics';
    else if (/academic|research|scholarly|history|science|philosophy/i.test(query))
      source = 'academic';
    else if (/free|read now|readable|standard ebooks/i.test(query))
      source = 'free';
  }
  const keywords = query
    .replace(/\b(find|show|search|give me|recommend|good|best|popular|top|free|readable)\b/gi, '')
    .replace(/\s+/g, ' ').trim() || query.trim();
  return { keywords, source };
}

async function parseQuery(query, forcedSource) {
  if (!GEMINI_API_KEY) return parseQueryRegex(query, forcedSource);
  try {
    const prompt = `You are a search query parser for a book/manga/comics app.
Respond ONLY with valid JSON: { "keywords": "clean search keywords", "source": "books|manga|classics|academic|free|all" }
Rules: source=manga for manga/manhwa/manhua/webtoon, source=classics for classic/public domain, source=academic for scholarly/research, source=free for free/readable, source=all if vague, source=books otherwise.
${forcedSource && forcedSource !== 'books' ? `Keep source as "${forcedSource}".` : ''}
Query: ${query}`;
    const res  = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        signal: AbortSignal.timeout(4000) }
    );
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const p    = JSON.parse(text.replace(/```json|```/g, '').trim());
    return { keywords: p.keywords || query, source: forcedSource || p.source || 'books' };
  } catch (err) {
    console.warn('[Gemini] fallback to regex:', err.message);
    return parseQueryRegex(query, forcedSource);
  }
}

// ─── NSFW filter ─────────────────────────────────────────────────────────────
// Applied to every result from every source before returning.

// Exact or substring matches against title / subjects / description (case-insensitive).
const BLOCKED_TERMS = [
  // Explicit adult content labels (title/genre only)
  'hentai', 'pornograph', 'eroge',
  // Predatory / illegal
  'lolicon', 'shotacon', 'child porn',
];

// Whole-title blocklist — titles that are entirely adult works
// (kept short; substring BLOCKED_TERMS above handles the rest)
const BLOCKED_TITLES = [
  'playboy', 'penthouse', 'hustler', 'barely legal',
];

function isSafe(item) {
  // Only check title + genres/themes against blocked terms
  // (descriptions often mention these words in legitimate context)
  const strictHaystack = [
    item.title        || '',
    ...(item.subjects || []),
    ...(item.genres   || []),
    ...(item.themes   || []),
  ].join(' ').toLowerCase();

  if (BLOCKED_TERMS.some(term => strictHaystack.includes(term))) return false;

  const titleLower = (item.title || '').toLowerCase();
  if (BLOCKED_TITLES.some(t => titleLower.includes(t))) return false;

  // Only check description for the hardest explicit terms
  const hardTerms = ['hentai', 'pornograph', 'sexually explicit', 'lolicon', 'shotacon', 'child porn'];
  const desc = (item.description || '').toLowerCase();
  if (hardTerms.some(term => desc.includes(term))) return false;

  return true;
}

function filterSafe(results) {
  return results.filter(isSafe);
}

// ─── Search entry point ───────────────────────────────────────────────────────
// Source routing is handled by the Claude NLP backend (/api/search).
// clientSearch is used for direct/explicit source fetches only (e.g. user picks
// a tab, or the backend is unavailable). Keywords are passed as-is — no regex.
export async function clientSearch(query, source = 'books', limit = 12) {
  if (!query?.trim()) return { results: [], parsed: {} };

  const fetchLimit = limit + 10;
  const parsed     = await parseQuery(query.trim(), source);
  const keywords   = parsed.keywords;
  const src        = parsed.source || source;

  let results = [];
  try {
    if (src === 'manga')         results = await searchMangaDex(keywords, fetchLimit);
    else if (src === 'classics') results = await searchGutenbergRest(keywords, fetchLimit);
    else if (src === 'standard') results = await searchStandardEbooks(keywords, fetchLimit);
    else if (src === 'academic') results = await searchInternetArchive(keywords, fetchLimit);
    else if (src === 'free') {
      const perSource = Math.ceil(fetchLimit / 2);
      const [gutenberg, standard] = await Promise.allSettled([
        searchGutenbergRest(keywords, perSource),
        searchStandardEbooks(keywords, perSource),
      ]);
      results = [
        ...(gutenberg.status === 'fulfilled' ? gutenberg.value : []),
        ...(standard.status  === 'fulfilled' ? standard.value  : []),
      ];
    } else if (src === 'all') {
      const perSource = Math.ceil(fetchLimit / 5);
      const [books, manga, classics, standard, academic] = await Promise.allSettled([
        searchOpenLibrary(keywords, perSource),
        searchMangaDex(keywords, perSource),
        searchGutenbergRest(keywords, perSource),
        searchStandardEbooks(keywords, perSource),
        searchInternetArchive(keywords, perSource),
      ]);
      results = [
        ...(books.status    === 'fulfilled' ? books.value    : []),
        ...(manga.status    === 'fulfilled' ? manga.value    : []),
        ...(classics.status === 'fulfilled' ? classics.value : []),
        ...(standard.status === 'fulfilled' ? standard.value : []),
        ...(academic.status === 'fulfilled' ? academic.value : []),
      ];
    } else {
      results = await searchOpenLibrary(keywords, fetchLimit);
    }
  } catch (err) {
    console.error('[search-client] error:', err);
  }

  return { results: filterSafe(results).slice(0, limit), parsed };
}

// ─── Detail entry point ───────────────────────────────────────────────────────
export async function getBookDetail(id, source) {
  if (source === 'mangadex')         return await fetchMangaDexDetail(id);
  if (source === 'jikan')            return await fetchJikanDetail(id);
  if (source === 'gutenberg')        return await fetchGutenbergDetail(id);
  if (source === 'standard-ebooks')  return await fetchStandardEbooksDetail(id);
  if (source === 'internet-archive') return await fetchArchiveDetail(id);
  return await fetchOpenLibraryDetail(id);
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

  // Check if this work has a freely readable ebook via Internet Archive
  let readUrl     = null;
  let sourceLabel = 'Book';
  try {
    const editionRes = await fetch(`https://openlibrary.org${workKey}/editions.json?limit=5`);
    const editionData = await editionRes.json();
    const editions    = editionData.entries || [];
    // Find a publicly readable edition
    for (const ed of editions) {
      if (ed.ocaid && ed.ebook_access === 'public') {
        readUrl     = `https://openlibrary.org/embed/books/ia:${ed.ocaid}`;
        sourceLabel = 'Free Book';
        break;
      }
    }
  } catch { /* editions not critical */ }

  return {
    id:          `ol-${workKey.replace('/works/', '')}`,
    externalId:  workKey,
    source:      'open-library',
    sourceLabel,
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
    readUrl,
    url:         `https://openlibrary.org${workKey}`,
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

// ─── Open Library search ──────────────────────────────────────────────────────
async function searchOpenLibrary(keywords, limit = 12) {
  const url  = `https://openlibrary.org/search.json?q=${encodeURIComponent(keywords)}&limit=${limit}&fields=key,title,author_name,cover_i,first_publish_year,ratings_average,subject,ebook_access,ia`;
  const data = await fetch(url).then(r => r.json());
  return (data.docs || []).map((d, i) => {
    const isReadable = d.ebook_access === 'public';
    const iaId       = Array.isArray(d.ia) ? d.ia[0] : (d.ia || null);
    const readUrl    = isReadable && iaId
      ? `https://openlibrary.org/embed/books/ia:${iaId}`
      : null;

    return {
      id:          `ol-${d.key?.replace('/works/', '') || i}`,
      externalId:  d.key || String(i),
      source:      'open-library',
      sourceLabel: isReadable ? 'Free Book' : 'Book',
      title:       d.title || 'Unknown Title',
      author:      d.author_name?.[0] || 'Unknown Author',
      cover:       d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg` : null,
      rating:      d.ratings_average ? Math.round(d.ratings_average * 10) / 10 : null,
      year:        d.first_publish_year || null,
      subjects:    (d.subject || []).slice(0, 6),
      readUrl,
      ebookAccess: d.ebook_access || null,
      iaId,
    };
  });
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
    readUrl:     b.formats?.['text/html'] || b.formats?.['application/epub+zip'] || null,
    url:         b.id ? `https://www.gutenberg.org/ebooks/${b.id}` : null,
  }));
}

// ─── Standard Ebooks search (OPDS feed) ──────────────────────────────────────
// Standard Ebooks publishes beautiful public-domain books with clean typography.
// We use their OPDS catalog which returns Atom/XML — parsed client-side.

export async function searchStandardEbooks(keywords, limit = 12) {
  // SE's OPDS search endpoint
  const url  = `https://standardebooks.org/opds/all`;
  try {
    const res  = await fetch(url);
    const text = await res.text();
    const parser = new DOMParser();
    const xml  = parser.parseFromString(text, 'application/xml');
    const entries = Array.from(xml.querySelectorAll('entry'));

    // Filter by keyword match against title/author/summary
    const kw = keywords.toLowerCase();
    const matched = entries.filter(e => {
      const title   = e.querySelector('title')?.textContent || '';
      const author  = e.querySelector('author name')?.textContent || '';
      const summary = e.querySelector('summary')?.textContent || '';
      return title.toLowerCase().includes(kw) ||
             author.toLowerCase().includes(kw) ||
             summary.toLowerCase().includes(kw);
    });

    // If no keyword match, return a slice of all (for browse mode)
    const pool = matched.length ? matched : entries;

    return pool.slice(0, limit).map(e => {
      const title   = e.querySelector('title')?.textContent || 'Unknown Title';
      const author  = e.querySelector('author name')?.textContent || 'Unknown Author';
      const summary = e.querySelector('summary')?.textContent || null;
      const id      = e.querySelector('id')?.textContent || '';
      const slug    = id.replace('https://standardebooks.org/ebooks/', '').replace(/\/$/, '');

      // Cover image — SE uses a predictable URL pattern
      const coverUrl = slug
        ? `https://standardebooks.org/ebooks/${slug}/downloads/cover.jpg`
        : null;

      // Read URL — SE provides free epub + web reader
      const readUrl = slug
        ? `https://standardebooks.org/ebooks/${slug}/text/single-page`
        : null;

      // Download links from OPDS
      const epubLink = Array.from(e.querySelectorAll('link')).find(l =>
        l.getAttribute('type')?.includes('epub')
      );
      const downloadUrl = epubLink?.getAttribute('href') || null;

      // Subjects / categories
      const subjects = Array.from(e.querySelectorAll('category'))
        .map(c => c.getAttribute('label') || c.getAttribute('term') || '')
        .filter(Boolean).slice(0, 6);

      // Published year
      const published = e.querySelector('published')?.textContent || null;
      const year = published ? published.slice(0, 4) : null;

      return {
        id:          `se-${slug}`,
        externalId:  slug,
        source:      'standard-ebooks',
        sourceLabel: 'Free Book',
        title,
        author,
        cover:       coverUrl,
        rating:      null,
        year,
        description: summary,
        subjects,
        readUrl,
        downloadUrl,
        url:         slug ? `https://standardebooks.org/ebooks/${slug}` : null,
      };
    });
  } catch (err) {
    console.error('[SE search] error:', err);
    return [];
  }
}

// ─── Standard Ebooks detail ───────────────────────────────────────────────────
async function fetchStandardEbooksDetail(slug) {
  // Fetch the OPDS entry for a specific book
  const url = `https://standardebooks.org/opds/all`;
  try {
    const res  = await fetch(url);
    const text = await res.text();
    const parser = new DOMParser();
    const xml  = parser.parseFromString(text, 'application/xml');
    const entries = Array.from(xml.querySelectorAll('entry'));

    const entry = entries.find(e => {
      const id = e.querySelector('id')?.textContent || '';
      return id.includes(slug);
    });

    if (!entry) throw new Error('Entry not found');

    const title   = entry.querySelector('title')?.textContent || 'Unknown Title';
    const author  = entry.querySelector('author name')?.textContent || 'Unknown Author';
    const summary = entry.querySelector('summary')?.textContent || null;
    const published = entry.querySelector('published')?.textContent || null;
    const year    = published ? published.slice(0, 4) : null;

    const coverUrl = slug
      ? `https://standardebooks.org/ebooks/${slug}/downloads/cover.jpg`
      : null;

    const readUrl = slug
      ? `https://standardebooks.org/ebooks/${slug}/text/single-page`
      : null;

    const epubLink = Array.from(entry.querySelectorAll('link')).find(l =>
      l.getAttribute('type')?.includes('epub')
    );
    const downloadUrl = epubLink?.getAttribute('href') || null;

    const subjects = Array.from(entry.querySelectorAll('category'))
      .map(c => c.getAttribute('label') || c.getAttribute('term') || '')
      .filter(Boolean).slice(0, 8);

    return {
      id:            `se-${slug}`,
      externalId:    slug,
      source:        'standard-ebooks',
      sourceLabel:   'Free Book',
      title,
      authors:       [author],
      author,
      cover:         coverUrl,
      rating:        null,
      ratingCount:   null,
      year,
      description:   summary,
      status:        'Public Domain',
      subjects,
      genres:        subjects.slice(0, 5),
      readUrl,
      downloadUrl,
      url:           `https://standardebooks.org/ebooks/${slug}`,
    };
  } catch (err) {
    console.error('[SE detail] error:', err);
    // Return minimal data from slug
    return {
      id:          `se-${slug}`,
      externalId:  slug,
      source:      'standard-ebooks',
      sourceLabel: 'Free Book',
      title:       slug.split('/').pop()?.replace(/_/g, ' ') || 'Unknown',
      author:      'Unknown Author',
      cover:       `https://standardebooks.org/ebooks/${slug}/downloads/cover.jpg`,
      readUrl:     `https://standardebooks.org/ebooks/${slug}/text/single-page`,
      url:         `https://standardebooks.org/ebooks/${slug}`,
    };
  }
}

// ─── MangaDex search (Jikan primary, MangaDex proxy as enhancement) ──────────
// Jikan works everywhere with no CORS. Returns multiple results reliably.

const BLOCKED_JIKAN_GENRE_IDS = new Set([9, 12, 49]); // Ecchi, Hentai, Erotica

async function searchMangaDex(keywords, limit = 12) {
  // Use Jikan directly — no server needed, works on GitHub Pages.
  // When the user opens a book, fetchJikanDetail cross-references MangaDex
  // by title to get a real UUID so chapters and the reader work.
  return await searchJikanFallback(keywords, limit);
}

async function searchJikanFallback(keywords, limit = 12) {
  try {
    const url  = `https://api.jikan.moe/v4/manga?q=${encodeURIComponent(keywords)}&limit=${Math.min(limit + 5, 25)}&order_by=scored&sort=desc&sfw=true`;
    const data = await fetch(url).then(r => r.json());
    return (data.data || []).map((m, i) => {
      const authors = (m.authors || []).map(a => a.name?.replace(/,\s*/, ' ')).filter(Boolean);
      const typeMap = { Manhwa: 'Manhwa', Manhua: 'Manhua', Novel: 'Novel' };
      return {
        id:          `jikan-${m.mal_id || i}`,
        externalId:  String(m.mal_id || i),
        source:      'jikan',
        sourceLabel: typeMap[m.type] || 'Manga',
        title:       m.title_english || m.title || 'Unknown Title',
        author:      authors[0] || 'Unknown Author',
        cover:       m.images?.jpg?.large_image_url || m.images?.jpg?.image_url || null,
        rating:      m.score || null,
        year:        m.published?.prop?.from?.year || null,
        description: m.synopsis ? m.synopsis.slice(0, 200) : null,
        status:      m.status || null,
        chapters:    m.chapters || null,
        genres:      (m.genres  || []).map(g => g.name),
        themes:      (m.themes  || []).map(t => t.name),
        url:         m.url || null,
        readUrl:     m.url || null,
      };
    }).filter(m => {
      const rawIds = (m.genres || []).map(g => g.mal_id);
      return !rawIds.some(id => BLOCKED_JIKAN_GENRE_IDS.has(id));
    });
  } catch (err) {
    console.error('[Jikan fallback] error:', err);
    return [];
  }
}


// ─── Jikan detail → cross-reference MangaDex for real chapters ───────────────
async function fetchJikanDetail(malId) {
  try {
    const detailRes = await fetch(`https://api.jikan.moe/v4/manga/${malId}`);
    const detail    = await detailRes.json();
    const m         = detail.data || {};

    const authors = (m.authors || []).map(a => a.name?.replace(/,\s*/, ' ')).filter(Boolean);
    const genres  = (m.genres  || []).map(g => g.name);
    const themes  = (m.themes  || []).map(t => t.name);
    const typeMap = { Manhwa: 'Manhwa', Manhua: 'Manhua', Novel: 'Novel' };
    const title   = m.title_english || m.title || 'Unknown Title';

    // Cross-reference MangaDex by title to get a real UUID + chapters
    let mangadexId  = null;
    let chapterList = [];
    let mdxCover    = null;

    try {
      const mdxSearch = await fetch(
        `https://api.mangadex.org/manga?title=${encodeURIComponent(title)}&limit=5` +
        `&contentRating[]=safe&contentRating[]=suggestive` +
        `&includes[]=cover_art&availableTranslatedLanguage[]=en`,
        { signal: AbortSignal.timeout(6000) }
      );
      const mdxData = await mdxSearch.json();
      const match   = (mdxData.data || [])[0];

      if (match) {
        mangadexId = match.id;
        const coverRel  = (match.relationships || []).find(r => r.type === 'cover_art');
        const coverFile = coverRel?.attributes?.fileName;
        if (coverFile) mdxCover = `https://uploads.mangadex.org/covers/${match.id}/${coverFile}.512.jpg`;

        const chRes = await fetch(
          `https://api.mangadex.org/manga/${match.id}/feed` +
          `?translatedLanguage[]=en&limit=20&order[chapter]=asc` +
          `&contentRating[]=safe&contentRating[]=suggestive`,
          { signal: AbortSignal.timeout(6000) }
        );
        const chData = await chRes.json();
        chapterList = (chData.data || []).map(ch => ({
          id:      ch.id,
          chapter: ch.attributes?.chapter || '?',
          title:   ch.attributes?.title   || `Chapter ${ch.attributes?.chapter || '?'}`,
          pages:   ch.attributes?.pages   || null,
          url:     `https://mangadex.org/chapter/${ch.id}`,
        }));
      }
    } catch (mdxErr) {
      console.warn('[MangaDex cross-ref] failed:', mdxErr.message);
    }

    return {
      id:          mangadexId ? `mdx-${mangadexId}` : `jikan-${malId}`,
      externalId:  mangadexId || String(malId),
      source:      mangadexId ? 'mangadex' : 'jikan',
      sourceLabel: typeMap[m.type] || 'Manga',
      title,
      titleNative: m.title_japanese || null,
      authors,
      author:      authors[0] || 'Unknown Author',
      cover:       mdxCover || m.images?.jpg?.large_image_url || m.images?.jpg?.image_url || null,
      rating:      m.score || null,
      ratingCount: m.scored_by || null,
      year:        m.published?.prop?.from?.year || null,
      description: m.synopsis || null,
      status:      m.status || null,
      chapters:    m.chapters || null,
      volumes:     m.volumes  || null,
      rank:        m.rank     || null,
      popularity:  m.popularity || null,
      genres,
      themes,
      subjects:    [...genres, ...themes].slice(0, 8),
      chapterList,
      url:         mangadexId ? `https://mangadex.org/title/${mangadexId}` : (m.url || null),
      readUrl:     mangadexId ? `https://mangadex.org/title/${mangadexId}` : (m.url || null),
    };
  } catch (err) {
    console.error('[Jikan detail] error:', err);
    return null;
  }
}

// ─── MangaDex detail (via proxy) ──────────────────────────────────────────────
async function fetchMangaDexDetail(mangaId) {
  try {
    const [detailRes, chaptersRes] = await Promise.allSettled([
      fetch(`/api/manga/detail?id=${mangaId}`),
      fetch(`/api/manga/chapters?id=${mangaId}`),
    ]);

    const mangaData = detailRes.status   === 'fulfilled' ? await detailRes.value.json()    : {};
    const feedData  = chaptersRes.status === 'fulfilled' ? await chaptersRes.value.json()  : {};

    const m     = mangaData.data || {};
    const attrs = m.attributes || {};

    const title  = attrs.title?.en || Object.values(attrs.title || {})[0] || 'Unknown Title';
    const desc   = attrs.description?.en || Object.values(attrs.description || {})[0] || null;

    const authorRel = (m.relationships || []).find(r => r.type === 'author');
    const artistRel = (m.relationships || []).find(r => r.type === 'artist');
    const author    = authorRel?.attributes?.name || 'Unknown Author';
    const artist    = artistRel?.attributes?.name || null;
    const authors   = [author, artist && artist !== author ? artist : null].filter(Boolean);

    const coverRel  = (m.relationships || []).find(r => r.type === 'cover_art');
    const coverFile = coverRel?.attributes?.fileName;
    const cover     = coverFile
      ? `https://uploads.mangadex.org/covers/${m.id}/${coverFile}.512.jpg`
      : null;

    const genres   = (attrs.tags || []).filter(t => t.attributes?.group === 'genre').map(t => t.attributes?.name?.en || '').filter(Boolean);
    const themes   = (attrs.tags || []).filter(t => t.attributes?.group === 'theme').map(t => t.attributes?.name?.en || '').filter(Boolean);
    const subjects = [...genres, ...themes].slice(0, 8);

    const typeMap     = { ko: 'Manhwa', zh: 'Manhua', 'zh-hk': 'Manhua' };
    const sourceLabel = typeMap[attrs.originalLanguage] || 'Manga';

    const chapterList = (feedData.data || []).map(ch => {
      const ca = ch.attributes || {};
      return {
        id:      ch.id,
        chapter: ca.chapter || '?',
        title:   ca.title || `Chapter ${ca.chapter || '?'}`,
        pages:   ca.pages || null,
        url:     `https://mangadex.org/chapter/${ch.id}`,
      };
    });

    return {
      id:          `mdx-${m.id}`,
      externalId:  m.id,
      source:      'mangadex',
      sourceLabel,
      title,
      titleNative: attrs.altTitles?.find(t => t.ja)?.ja || null,
      authors,
      author,
      cover,
      rating:      attrs.rating?.bayesian ? Math.round(attrs.rating.bayesian * 10) / 10 : null,
      ratingCount: attrs.rating?.count || null,
      year:        attrs.year || null,
      description: desc,
      status:      attrs.status ? attrs.status.charAt(0).toUpperCase() + attrs.status.slice(1) : null,
      chapters:    attrs.lastChapter || null,
      volumes:     attrs.lastVolume  || null,
      subjects,
      genres,
      themes,
      chapterList,
      readUrl:     `https://mangadex.org/title/${m.id}`,
      url:         `https://mangadex.org/title/${m.id}`,
    };
  } catch (err) {
    console.error('[MangaDex detail proxy] error:', err);
    return null;
  }
}

// ─── Internet Archive search ──────────────────────────────────────────────────
// Uses Archive.org's public search API — returns only texts with open access.
// Embeddable via archive.org/embed/{identifier}

async function searchInternetArchive(keywords, limit = 12) {
  // Search for texts that are openly accessible (not borrowed/restricted)
  const url = `https://archive.org/advancedsearch.php?q=${encodeURIComponent(keywords)}+mediatype:texts+access-restricted-item:false&fl=identifier,title,creator,description,year,subject,downloads,avg_rating,num_reviews,imagecount&rows=${Math.min(limit, 20)}&page=1&output=json&sort=downloads+desc`;

  try {
    const res  = await fetch(url);
    const data = await res.json();
    const docs = data.response?.docs || [];

    return docs.map((d, i) => {
      const identifier = d.identifier || '';
      const cover      = identifier
        ? `https://archive.org/services/img/${identifier}`
        : null;
      const subjects   = Array.isArray(d.subject) ? d.subject.slice(0, 6)
                       : d.subject ? [d.subject] : [];

      return {
        id:          `ia-${identifier}`,
        externalId:  identifier,
        source:      'internet-archive',
        sourceLabel: 'Academic',
        title:       d.title || 'Unknown Title',
        author:      Array.isArray(d.creator) ? d.creator[0] : (d.creator || 'Unknown Author'),
        cover,
        rating:      d.avg_rating ? Math.round(Number(d.avg_rating) * 10) / 10 : null,
        year:        d.year || null,
        description: d.description
          ? (Array.isArray(d.description) ? d.description[0] : d.description).slice(0, 200)
          : null,
        subjects,
        downloadCount: d.downloads || null,
        // Archive embed URL — works in iframe
        readUrl:     `https://archive.org/embed/${identifier}`,
        url:         `https://archive.org/details/${identifier}`,
      };
    });
  } catch (err) {
    console.error('[Internet Archive search] error:', err);
    return [];
  }
}

// ─── Internet Archive detail ──────────────────────────────────────────────────
async function fetchArchiveDetail(identifier) {
  try {
    const res  = await fetch(`https://archive.org/metadata/${identifier}`);
    const data = await res.json();
    const meta = data.metadata || {};

    const title   = Array.isArray(meta.title)   ? meta.title[0]   : (meta.title   || 'Unknown Title');
    const creator = Array.isArray(meta.creator)  ? meta.creator    : (meta.creator ? [meta.creator] : ['Unknown Author']);
    const desc    = Array.isArray(meta.description) ? meta.description[0] : (meta.description || null);
    const subject = Array.isArray(meta.subject)  ? meta.subject    : (meta.subject ? [meta.subject] : []);
    const year    = meta.year || meta.date?.slice(0, 4) || null;

    // Find a readable file — prefer PDF then epub then djvu
    const files   = data.files || [];
    const pdfFile = files.find(f => f.name?.endsWith('.pdf'));
    const epubFile= files.find(f => f.name?.endsWith('.epub'));

    const downloadUrl = pdfFile
      ? `https://archive.org/download/${identifier}/${pdfFile.name}`
      : epubFile
        ? `https://archive.org/download/${identifier}/${epubFile.name}`
        : null;

    return {
      id:            `ia-${identifier}`,
      externalId:    identifier,
      source:        'internet-archive',
      sourceLabel:   'Academic',
      title,
      authors:       creator,
      author:        creator[0] || 'Unknown Author',
      cover:         `https://archive.org/services/img/${identifier}`,
      rating:        meta.avg_rating ? Math.round(Number(meta.avg_rating) * 10) / 10 : null,
      ratingCount:   meta.num_reviews ? Number(meta.num_reviews) : null,
      year,
      description:   desc,
      status:        'Open Access',
      subjects:      subject.slice(0, 8),
      genres:        subject.slice(0, 5),
      downloadCount: meta.downloads ? Number(meta.downloads) : null,
      downloadUrl,
      // Archive's built-in embed viewer
      readUrl:       `https://archive.org/embed/${identifier}`,
      url:           `https://archive.org/details/${identifier}`,
    };
  } catch (err) {
    console.error('[Archive detail] error:', err);
    return null;
  }
}