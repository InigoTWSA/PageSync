// theme.js — shared dark/light mode toggle
// Import this on every page, then call renderThemeToggle(container) to inject the button.

const STORAGE_KEY = 'pagesync-theme';

export function getTheme() {
    return localStorage.getItem(STORAGE_KEY) || 'dark';
}

export function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(STORAGE_KEY, theme);
}

export function toggleTheme() {
    const next = getTheme() === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    // Update all toggle buttons on the page
    document.querySelectorAll('.theme-toggle').forEach(btn => updateBtn(btn, next));
}

function updateBtn(btn, theme) {
    btn.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
    btn.innerHTML = theme === 'dark' ? sunIcon() : moonIcon();
}

function sunIcon() {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="5"/>
        <line x1="12" y1="1" x2="12" y2="3"/>
        <line x1="12" y1="21" x2="12" y2="23"/>
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
        <line x1="1" y1="12" x2="3" y2="12"/>
        <line x1="21" y1="12" x2="23" y2="12"/>
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
    </svg>`;
}

function moonIcon() {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    </svg>`;
}

// Call once per page — injects a .theme-toggle button into the given parent element
export function renderThemeToggle(container) {
    const btn = document.createElement('button');
    btn.className = 'theme-toggle';
    updateBtn(btn, getTheme());
    btn.addEventListener('click', toggleTheme);
    container.appendChild(btn);
}

// Apply saved theme immediately on load (call this at the top of every page)
export function initTheme() {
    applyTheme(getTheme());
}