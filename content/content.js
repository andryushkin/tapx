/**
 * TapX Content Script
 * Strategy: find all tweet containers with 2+ images from pbs.twimg.com,
 * replace their native (broken) layout with our own seamless grid.
 * 
 * How we identify "multi-image" tweets (vs single image):
 *  - The article[data-testid="tweet"] contains ≥2 <img src="https://pbs.twimg.com/media/...">
 *  - We exclude avatar images by checking they are NOT inside [data-testid^="UserAvatar"]
 *  - We do NOT try to distinguish "puzzle" vs "gallery" — seamless always looks better
 */

// ─────────────────────────────────────────────
//  State
// ─────────────────────────────────────────────
let isEnabled = true;

function isOnTweetPage() {
    return /\/status\/\d+/.test(window.location.pathname);
}

chrome.storage.local.get(['isEnabled'], (r) => {
    if (r.isEnabled !== undefined) isEnabled = r.isEnabled;
    if (isEnabled) scanAll();
});

chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'toggleState') {
        isEnabled = msg.isEnabled;
        isEnabled ? scanAll() : revertAll();
    }
});

// ─────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────

/** Returns pbs.twimg.com media images inside a node, excluding avatars.
 *  Deduplicates by src base (ignores quality param) to handle lazy-load twins. */
function getMediaImages(tweetEl) {
    const all = tweetEl.querySelectorAll('img[src*="pbs.twimg.com/media/"]');
    const seen = new Set();
    return Array.from(all).filter(img => {
        if (img.closest('[data-testid^="UserAvatar"]')) return false;
        // Deduplicate: strip query string for comparison
        const base = img.src.split('?')[0];
        if (seen.has(base)) return false;
        seen.add(base);
        return true;
    });
}

/**
 * Find the smallest ancestor of images[0] (inside article) that contains ALL images.
 * May also contain tweet text — that's fine, we'll handle it in processArticle.
 */
function findReplaceTarget(images, article) {
    let el = images[0].parentElement;
    while (el && el !== article) {
        if (images.every(img => el.contains(img))) return el;
        el = el.parentElement;
    }
    // Fallback: direct child of article containing first image
    for (const child of Array.from(article.children)) {
        if (child.contains(images[0])) return child;
    }
    return null;
}

/** Upgrade image URL to original quality */
function originalUrl(src) {
    return src
        .replace(/([?&]name=)[^&]+/, '$1orig')
        .replace(/([?&]format=)[^&]+/, '$1jpg');
}

/**
 * Detect grid layout (cols × rows) by reading real DOM rects of loaded images.
 * Must be called only after images are loaded (naturalWidth > 0).
 * Falls back to 1-col if rects are still zero.
 */
function detectLayout(images) {
    const rects = images.map(img => img.getBoundingClientRect());
    const allZero = rects.every(r => r.width === 0 && r.height === 0);
    if (allZero) return { cols: 1, rows: images.length };

    const bucket = v => Math.round(v / 10);
    const uniqueX = new Set(rects.map(r => bucket(r.left)));
    if (uniqueX.size <= 1) return { cols: 1, rows: images.length };

    const cols = uniqueX.size;
    const rows = Math.ceil(images.length / cols);
    return { cols, rows };
}

// ─────────────────────────────────────────────
//  Core: replace native layout with our grid
// ─────────────────────────────────────────────

function processArticle(article) {
    if (article.dataset.tapxDone) return;          // 'pending' или '1'
    article.dataset.tapxDone = 'pending';           // lock против двойного вызова

    const images = getMediaImages(article);
    if (images.length < 2) {
        delete article.dataset.tapxDone;
        return;
    }

    const unloaded = images.filter(img => !img.complete || img.naturalWidth === 0);
    if (unloaded.length > 0) {
        let done = false;
        const proceed = () => { if (!done) { done = true; buildGrid(article, images); } };
        unloaded.forEach(img => {
            img.addEventListener('load',  proceed, { once: true });
            img.addEventListener('error', proceed, { once: true });
        });
        // Fallback: строить даже если картинки не загрузились
        setTimeout(proceed, 800);
    } else {
        buildGrid(article, images); // картинки уже загружены — строить сразу
    }
}

function buildGrid(article, images) {
    if (article.dataset.tapxDone === '1') return;   // защита от гонки (timeout + load)

    const { cols, rows } = detectLayout(images);    // теперь с настоящими rect

    // Пазл — только вертикальный столбик (cols === 1). Всё остальное не трогаем.
    if (cols > 1) {
        article.dataset.tapxDone = 'skip';
        return;
    }

    article.dataset.tapxDone = '1';

    // Build our seamless grid container
    const grid = document.createElement('div');
    grid.className = 'tapx-grid-container tapx-loading';
    grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    grid.style.gridTemplateRows    = `repeat(${rows}, auto)`;
    grid.dataset.tapxImages = images.map(img => originalUrl(img.src)).join('|');

    // Clone each image into a cell
    images.forEach((img) => {
        const cell  = document.createElement('div');
        cell.className = 'tapx-grid-cell';
        const clone = document.createElement('img');
        clone.src = img.src;
        clone.alt = img.alt || '';
        cell.appendChild(clone);
        grid.appendChild(cell);
    });

    // Find the container holding all images (may also hold tweet text)
    const target = findReplaceTarget(images, article);
    if (!target || !target.parentElement) {
        delete article.dataset.tapxDone;
        return;
    }

    // Collect direct children of target that do NOT contain any media images.
    // These are tweet text / link preview blocks — clone them so they stay visible.
    const textBlock = document.createElement('div');
    textBlock.className = 'tapx-text-block';
    Array.from(target.children).forEach(child => {
        const containsImage = images.some(img => child === img || child.contains(img));
        if (!containsImage) textBlock.appendChild(child.cloneNode(true));
    });

    // Insert: [text clone (if any)] → [grid] → then hide original target
    const parent = target.parentElement;
    if (textBlock.hasChildNodes()) parent.insertBefore(textBlock, target);
    parent.insertBefore(grid, target);

    target.style.display = 'none';
    target.dataset.tapxHidden = '1';

    requestAnimationFrame(() => grid.classList.remove('tapx-loading'));

    injectStitchButton(article, images);
}


function revertAll() {
    document.querySelectorAll('.tapx-grid-container').forEach(g => g.remove());
    document.querySelectorAll('.tapx-text-block').forEach(t => t.remove());
    document.querySelectorAll('[data-tapx-hidden="1"]').forEach(el => {
        el.style.display = '';
        el.removeAttribute('data-tapx-hidden');
    });
    document.querySelectorAll('[data-testid="tweet"]').forEach(a => {
        delete a.dataset.tapxDone;
    });
    document.querySelectorAll('.tapx-stitch-btn').forEach(b => b.remove());
}

function scanAll() {
    if (!isOnTweetPage()) return;
    document.querySelectorAll('article[data-testid="tweet"]').forEach(processArticle);
}

// ─────────────────────────────────────────────
//  Stitch button injection
// ─────────────────────────────────────────────

const STITCH_SVG = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
  <path d="M4 4h6v6H4V4zm10 0h6v6h-6V4zM4 14h6v6H4v-6zm10 0h6v6h-6v-6z"/>
</svg>`;

function injectStitchButton(article, images) {
    // Find action bar—try several stable selectors
    let bar = article.querySelector('[role="group"][aria-label]')
        || article.querySelector('[data-testid="tweet-footer"]')
        || article.querySelector('[role="group"]');
    if (!bar) return;

    if (article.querySelector('.tapx-stitch-btn')) return;

    const btn = document.createElement('div');
    btn.className = 'tapx-stitch-btn';
    btn.title = 'Сшить и скачать оригиналы';
    btn.innerHTML = STITCH_SVG;

    btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        stitchAndDownload(images, article);
    });

    bar.appendChild(btn);
}

// ─────────────────────────────────────────────
//  Canvas Stitching & Download
// ─────────────────────────────────────────────

async function stitchAndDownload(images, article) {
    const urls = images.map(img => originalUrl(img.src));

    try {
        const loaded = await Promise.all(urls.map(loadImage));

        // Re-use detectLayout logic but based on naturalWidth of loaded images
        // since original DOM images may already be hidden
        // Treat images as same X (vertical stack) unless they differ in natural size pattern
        // For simplicity: use the same detection as visual grid (stored in grid dataset)
        const gridEl = article.querySelector('.tapx-grid-container');
        const style = gridEl ? gridEl.style.gridTemplateColumns : '';
        const colMatch = style.match(/repeat\((\d+)/);
        const cols = colMatch ? parseInt(colMatch[1], 10) : 1;
        const rows = Math.ceil(loaded.length / cols);

        // Each tile uses its own naturalWidth/Height for pixel-perfect stitching
        // For 1-col layout: width = max naturalWidth, stacked vertically
        const tileW = loaded[0].naturalWidth;
        const tileH = loaded[0].naturalHeight;

        const canvas = document.createElement('canvas');
        canvas.width = tileW * cols;
        canvas.height = tileH * rows;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        loaded.forEach((img, i) => {
            const col = i % cols;
            const row = Math.floor(i / cols);
            const x = col * tileW;
            const y = row * tileH;
            // +0.5 anti-seam: slightly overpaint to cover sub-pixel gaps
            ctx.drawImage(img, x, y, img.naturalWidth + 0.5, img.naturalHeight + 0.5);
        });

        const username = getUsername(article);
        const tweetId = getTweetId(article);
        const filename = `tapx_${username}_${tweetId}_stitched.jpg`;

        const dataUrl = canvas.toDataURL('image/jpeg', 0.98);
        chrome.runtime.sendMessage({ action: 'downloadCanvas', dataUrl, filename });

    } catch (err) {
        console.error('TapX stitch error:', err);
        alert('TapX: не удалось сшить изображения. Подробности в консоли.');
    }
}

function loadImage(url) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(`Failed to load: ${url}`));
        img.src = url;
    });
}

function getUsername(article) {
    const links = article.querySelectorAll('a[href^="/"][role="link"]');
    for (const link of links) {
        const match = link.getAttribute('href').match(/^\/([A-Za-z0-9_]{1,50})(?:\/)?$/);
        if (match) return match[1];
    }
    return 'unknown';
}

function getTweetId(article) {
    const a = article.querySelector('a[href*="/status/"]');
    if (a) {
        const m = a.getAttribute('href').match(/status\/(\d+)/);
        if (m) return m[1];
    }
    return Date.now().toString();
}

// ─────────────────────────────────────────────
//  MutationObserver — handle infinite scroll
// ─────────────────────────────────────────────

const observer = new MutationObserver(() => {
    if (!isEnabled) return;
    // Debounce slightly
    clearTimeout(observer._timer);
    observer._timer = setTimeout(scanAll, 200);
});

observer.observe(document.body, { childList: true, subtree: true });

// Initial scan
scanAll();
