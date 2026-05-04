<div align="center">

# 🔖 PageSync

**AI-Powered Book Tracking & Discovery App**

[![React](https://img.shields.io/badge/Vanilla_JS-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![Firebase](https://img.shields.io/badge/Firebase-FFCA28?style=for-the-badge&logo=firebase&logoColor=black)](https://firebase.google.com/)
[![Gemini AI](https://img.shields.io/badge/Gemini_AI-4285F4?style=for-the-badge&logo=google&logoColor=white)](https://ai.google.dev/)
[![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org/)

</div>

---

## Description

**PageSync** is a community-friendly book tracking Progressive Web App designed to help readers organize and discover books, manga, comics, and classics — all from a single dashboard. By leveraging **Natural Language Processing (NLP)** via the Gemini AI API, users can search using plain conversational queries (e.g. *"dark romance manhwa"* or *"something like Dune"*) and the system intelligently routes those queries to the right source APIs.

The platform prioritizes a **privacy-first auth flow** using Firebase Authentication with session-scoped tokens, supporting both email/password and Google OAuth sign-in.

---

## Key Features

- **AI-Powered Search** — Natural language queries parsed by Gemini to extract intent, genre, mood, and source type, then fanned out to the appropriate API.
- **Multi-Source Discovery** — Aggregates results from Open Library, Jikan (MyAnimeList), Gutendex (Project Gutenberg), and Comic Vine in a unified UI.
- **Firebase Auth** — Email/password signup with OTP verification + one-click Google Sign-In.
- **Personal Shelf** — Per-user book library stored in Cloud Firestore, with status tracking (reading, completed, planned).
- **PWA Ready** — Responsive, mobile-optimized layout for seamless use on any device.

---

## Tech Stack

| Layer | Technologies |
|---|---|
| Frontend | Vanilla HTML, CSS3, JavaScript (ES Modules) |
| Backend | Node.js, Express |
| Database & Auth | Firebase Firestore (NoSQL), Firebase Authentication |
| AI / NLP | Google Gemini API (Query Parsing & Source Routing) |
| Search APIs | Open Library, Jikan v4, Gutendex, Comic Vine |
| Email | EmailJS (OTP & Password Reset) |
| DevOps | Git, GitHub, Static Site Hosting |

---

## Setup

```bash
# 1. Clone the repo
git clone https://github.com/yourusername/pagesync.git
cd pagesync

# 2. Copy and fill in your credentials
cp config.example.js config.js
# → Edit config.js with your Firebase and EmailJS keys

# 3. Install dependencies
npm install

# 4. Start the local server
node server.js
# → App running at http://localhost:4000
```

> ⚠️ `config.js` is gitignored — **never commit it.** Use `config.example.js` as the reference template.

---

## Environment Variables

If deploying to a serverless platform (e.g. Vercel), set these in your project settings:

| Variable | Description |
|---|---|
| `GEMINI_API_KEY` | Gemini API key for NLP query parsing |
| `HARDCOVER_TOKEN` | Hardcover GraphQL API token |
| `RAPIDAPI_KEY` | RapidAPI key (Manga Eden, Gutenberg) |
| `COMICVINE_API_KEY` | Comic Vine API key |
| `FIREBASE_PROJECT_ID` | Firebase project ID (server-side admin) |
| `FIREBASE_PRIVATE_KEY` | Firebase service account private key |
| `FIREBASE_CLIENT_EMAIL` | Firebase service account email |

---

<div align="center">

Made with ☕ in Olongapo City 🇵🇭

</div>
