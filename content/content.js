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

api.storage.local.get(['isEnabled'], (r) => {
    if (r.isEnabled !== undefined) isEnabled = r.isEnabled;
    if (isEnabled) scanAll();
});

api.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.action === 'toggleState') {
        isEnabled = msg.isEnabled;
        isEnabled ? scanAll() : revertAll();
    } else if (msg.action === 'uploadCurrent') {
        const article = document.querySelector('article[data-tapx-done="1"]');
        if (!article) {
            sendResponse({ error: 'no_puzzle' });
            return false;
        }
        const images = getMediaImages(article);
        const btn = article.querySelector('.tapx-stitch-btn') || { classList: { add: () => {}, remove: () => {} } };
        sendResponse({ ok: true });
        stitchAndUpload(images, article, btn, null);
        return false;
    } else if (msg.action === 'tapxDiag') {
        tapxShowDiag();
        sendResponse({ ok: true });
        return false;
    } else if (msg.action === 'forceColumn') {
        const article = document.querySelector('article[data-tapx-done="skip"]');
        if (!article) {
            sendResponse({ error: 'no_gallery' });
            return false;
        }
        delete article.dataset.tapxDone;
        const images = getMediaImages(article);
        buildGrid(article, images, true);
        sendResponse({ ok: true });
        return false;
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

function buildGrid(article, images, force = false) {
    if (article.dataset.tapxDone === '1') return;   // защита от гонки (timeout + load)

    const { cols: detectedCols, rows: detectedRows } = detectLayout(images);
    const cols = force ? 1 : detectedCols;
    const rows = force ? images.length : detectedRows;

    // Пазл — только вертикальный столбик (cols === 1). Всё остальное не трогаем.
    if (!force && cols > 1) {
        article.dataset.tapxDone = 'skip';
        return;
    }

    article.dataset.tapxDone = '1';

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

    // Wrap so button can be absolutely positioned over content
    const wrapper = document.createElement('div');
    wrapper.className = 'tapx-wrapper';

    // В force-режиме target находится внутри position:absolute контейнера
    // (паттерн X.com: padding-bottom spacer + абсолютный overlay).
    // Если вставить wrapper туда — canvas-img обрежется по высоте spacer'а (~317px).
    // Поднимаемся выше всех absolute предков, чтобы вставить wrapper в нормальный поток.
    let hideEl = target;
    if (force) {
        let el = target.parentElement;
        while (el && el !== article) {
            const pos = getComputedStyle(el).position;
            if (pos === 'absolute' || pos === 'fixed') {
                hideEl = el;
                el = el.parentElement;
            } else {
                // Первый не-absolute предок: если проходили через absolute — прячем его тоже
                // (он содержит и spacer, и absolute overlay)
                if (hideEl !== target) hideEl = el;
                break;
            }
        }
    }
    const parent = hideEl.parentElement;

    // Insert: [text clone (if any)] → [wrapper] → then hide hideEl
    if (textBlock.hasChildNodes()) parent.insertBefore(textBlock, hideEl);
    parent.insertBefore(wrapper, hideEl);

    hideEl.style.display = 'none';
    hideEl.dataset.tapxHidden = '1';

    if (force) {
        // В force-режиме сшиваем изображения в canvas и показываем как одну картинку.
        // Wrapper вставлен в нормальный поток — никаких ограничений высоты.
        stitchForceColumn(images, article, wrapper);
        return;
    }

    // Normal puzzle: CSS seamless grid
    const grid = document.createElement('div');
    grid.className = 'tapx-grid-container tapx-loading';
    grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    grid.style.gridTemplateRows    = `repeat(${rows}, auto)`;
    grid.dataset.tapxImages = images.map(img => originalUrl(img.src)).join('|');

    images.forEach((img) => {
        const cell  = document.createElement('div');
        cell.className = 'tapx-grid-cell';
        const clone = document.createElement('img');
        clone.src = img.src;
        clone.alt = img.alt || '';
        cell.appendChild(clone);
        grid.appendChild(cell);
    });

    wrapper.appendChild(grid);
    requestAnimationFrame(() => grid.classList.remove('tapx-loading'));
    injectStitchButton(article, images, wrapper);
}

/**
 * Force-column mode: stitch images into a canvas and display as a single <img>.
 * Completely bypasses X.com ancestor overflow/height constraints.
 */
async function stitchForceColumn(images, article, wrapper) {
    const placeholder = document.createElement('div');
    placeholder.style.cssText =
        'display:flex;align-items:center;justify-content:center;' +
        'min-height:120px;color:#888;font-family:system-ui,sans-serif;font-size:13px;';
    placeholder.textContent = 'Сшивка\u2026';
    wrapper.appendChild(placeholder);

    try {
        // Загружаем с crossOrigin — те же URL, вероятно уже в кеше браузера
        const loaded = await Promise.all(images.map(img => new Promise((res, rej) => {
            const el = new Image();
            el.crossOrigin = 'anonymous';
            el.onload  = () => res(el);
            el.onerror = () => rej(new Error('load failed: ' + img.src));
            el.src = img.src;
        })));

        // Рисуем вертикальный стек на canvas в натуральном разрешении
        const w = loaded[0].naturalWidth || 900;
        const heights = loaded.map(img =>
            img.naturalWidth ? Math.round(w * img.naturalHeight / img.naturalWidth) : w
        );
        const totalH = heights.reduce((a, b) => a + b, 0);

        const canvas = document.createElement('canvas');
        canvas.width  = w;
        canvas.height = totalH;
        const ctx = canvas.getContext('2d');

        let y = 0;
        loaded.forEach((img, i) => {
            ctx.drawImage(img, 0, y, w, heights[i]);
            y += heights[i];
        });

        const blobUrl = await new Promise(res =>
            canvas.toBlob(b => res(URL.createObjectURL(b)), 'image/jpeg', 0.95)
        );

        const stitchedImg = document.createElement('img');
        stitchedImg.src = blobUrl;
        stitchedImg.style.cssText = 'width:100%;height:auto;display:block;border-radius:16px;';
        stitchedImg.alt = '';
        placeholder.replaceWith(stitchedImg);

    } catch (e) {
        console.error('TapX: stitchForceColumn failed', e);
        placeholder.textContent = 'Ошибка сшивки';
    }

    injectStitchButton(article, images, wrapper);
}


function revertAll() {
    document.querySelectorAll('.tapx-wrapper').forEach(w => w.remove());
    document.querySelectorAll('.tapx-text-block').forEach(t => t.remove());
    document.querySelectorAll('[data-tapx-hidden="1"]').forEach(el => {
        el.style.display = '';
        el.removeAttribute('data-tapx-hidden');
    });
    document.querySelectorAll('[data-tapx-ancestor-fixed="1"]').forEach(el => {
        el.style.overflow = '';
        el.style.height = '';
        el.style.maxHeight = '';
        el.style.minHeight = '';
        delete el.dataset.tapxAncestorFixed;
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

const UPLOAD_SVG = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
  <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
</svg>`;

function injectStitchButton(article, images, wrapper) {
    if (wrapper.querySelector('.tapx-stitch-btn')) return;

    const btn = document.createElement('div');
    btn.className = 'tapx-stitch-btn';
    btn.title = 'Поделиться на taptoview.site';
    btn.innerHTML = UPLOAD_SVG;
    btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        // Открываем окно здесь — чистый синхронный контекст user gesture
        const newWin = window.open('', '_blank');
        if (newWin) {
            try {
                newWin.document.write(
                    '<!DOCTYPE html><html><head><meta charset="utf-8"><title>TapX</title>' +
                    '<style>*{margin:0;box-sizing:border-box}' +
                    'body{background:#000;color:#fff;font-family:system-ui,sans-serif;' +
                    'display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;gap:16px}' +
                    '.spinner{width:32px;height:32px;border:3px solid #333;border-top-color:#00ba7c;' +
                    'border-radius:50%;animation:spin 0.8s linear infinite}' +
                    '@keyframes spin{to{transform:rotate(360deg)}}</style></head>' +
                    '<body><div class="spinner"></div><p>Склейка и загрузка\u2026</p></body></html>'
                );
                newWin.document.close();
            } catch (_) {
                // Firefox sandbox ограничивает document.write — продолжаем без спиннера
            }
            newWin.focus();
        }
        stitchAndUpload(images, article, btn, newWin);
    });
    wrapper.appendChild(btn);
}

// ─────────────────────────────────────────────
//  Canvas Stitching & Download / Upload
// ─────────────────────────────────────────────

/** Build a stitched canvas from puzzle images. Returns the canvas element. */
async function buildStitchedCanvas(images, article) {
    const urls = images.map(img => originalUrl(img.src));
    const loaded = await Promise.all(urls.map(loadImage));

    const gridEl = article.querySelector('.tapx-grid-container');
    const style = gridEl ? gridEl.style.gridTemplateColumns : '';
    const colMatch = style.match(/repeat\((\d+)/);
    const cols = colMatch ? parseInt(colMatch[1], 10) : 1;
    const rows = Math.ceil(loaded.length / cols);

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
        // +0.5 anti-seam: slightly overpaint to cover sub-pixel gaps
        ctx.drawImage(img, col * tileW, row * tileH, img.naturalWidth + 0.5, img.naturalHeight + 0.5);
    });

    return canvas;
}

function getTweetText(article) {
    return article.querySelector('[data-testid="tweetText"]')?.innerText || '';
}

async function fetchAvatarBlob(article) {
    const avatarImg = article.querySelector('[data-testid^="UserAvatar"] img');
    if (!avatarImg) return null;
    try {
        const resp = await fetch(avatarImg.src);
        if (!resp.ok) return null;
        return await resp.blob();
    } catch {
        return null;
    }
}

function showUploadToast(message, type, url) {
    const existing = document.querySelector('.tapx-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'tapx-toast' + (type === 'error' ? ' tapx-toast--error' : '');

    if (url) {
        const link = document.createElement('a');
        link.href = url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = message;
        toast.appendChild(link);
    } else {
        toast.textContent = message;
    }

    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('tapx-toast--show'));
    setTimeout(() => {
        toast.classList.remove('tapx-toast--show');
        setTimeout(() => toast.remove(), 300);
    }, 6000);
}

async function stitchAndUpload(images, article, btn, newWin) {
    btn.classList.add('tapx-loading');

    try {
        const canvas = await buildStitchedCanvas(images, article);
        const imageBlob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.98));

        const username = getUsername(article);
        const tweetId = getTweetId(article);
        const tweetUrl = `https://x.com/${username}/status/${tweetId}`;
        const tweetText = getTweetText(article);
        const avatarBlob = await fetchAvatarBlob(article);

        const formData = new FormData();
        formData.append('image', imageBlob, 'puzzle.jpg');
        formData.append('username', username);
        formData.append('tweetId', tweetId);
        formData.append('tweetUrl', tweetUrl);
        if (tweetText) formData.append('tweetText', tweetText);
        if (avatarBlob) formData.append('avatar', avatarBlob, 'avatar.jpg');

        const response = await fetch('https://taptoview.site/api/upload', {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({ error: String(response.status), message: response.statusText }));
            if (newWin && !newWin.closed) newWin.close();
            if (response.status === 429) {
                const retryAfter = response.headers.get('Retry-After') || '3600';
                const minutes = Math.ceil(parseInt(retryAfter) / 60);
                showUploadToast(`Лимит загрузок. Попробуйте через ${minutes} мин.`, 'error');
            } else {
                showUploadToast(`Ошибка: ${err.message || err.error}`, 'error');
            }
            return;
        }

        const { url } = await response.json();
        if (newWin && !newWin.closed) {
            newWin.location.href = url;
            newWin.focus();
        } else {
            // Popup upload: открыть результат в новой вкладке через background
            api.runtime.sendMessage({ action: 'openTab', url }, () => {
                void api.runtime.lastError;
            });
        }

    } catch (err) {
        if (newWin && !newWin.closed) newWin.close();
        console.error('TapX upload error:', err);
        showUploadToast('Не удалось загрузить. Попробуйте снова.', 'error');
    } finally {
        btn.classList.remove('tapx-loading');
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
//  Diagnostics overlay
// ─────────────────────────────────────────────

function tapxShowDiag() {
    const existing = document.getElementById('tapx-diag-overlay');
    if (existing) { existing.remove(); return; }

    const lines = [];

    const containers = document.querySelectorAll('.tapx-grid-container');
    if (!containers.length) {
        lines.push('Нет .tapx-grid-container на странице');
    }

    containers.forEach((grid, gi) => {
        const gr = grid.getBoundingClientRect();
        const isForce = grid.classList.contains('tapx-force-column');
        const gcs = getComputedStyle(grid);
        lines.push(`GRID[${gi}] force=${isForce} rect=${Math.round(gr.width)}x${Math.round(gr.height)}`);
        lines.push(`  cols="${grid.style.gridTemplateColumns}" rows="${grid.style.gridTemplateRows}"`);
        lines.push(`  computed: display=${gcs.display} overflow=${gcs.overflow} height=${gcs.height}`);

        grid.querySelectorAll('.tapx-grid-cell').forEach((cell, ci) => {
            const cr = cell.getBoundingClientRect();
            const ccs = getComputedStyle(cell);
            lines.push(`  CELL[${ci}] rect=${Math.round(cr.width)}x${Math.round(cr.height)}`);
            lines.push(`    h=${ccs.height} overflow=${ccs.overflow} aspect=${ccs.aspectRatio} inline-aspect="${cell.style.aspectRatio}"`);
            const img = cell.querySelector('img');
            if (img) {
                const ir = img.getBoundingClientRect();
                const ics = getComputedStyle(img);
                lines.push(`    IMG nat=${img.naturalWidth}x${img.naturalHeight} rect=${Math.round(ir.width)}x${Math.round(ir.height)}`);
                lines.push(`      h=${ics.height} object-fit=${ics.objectFit}`);
            }
        });
    });

    lines.push('');
    lines.push('ANCESTORS (tapx-ancestor-fixed):');
    const ancestors = document.querySelectorAll('[data-tapx-ancestor-fixed]');
    if (!ancestors.length) {
        lines.push('  нет');
    }
    ancestors.forEach((el, i) => {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        const pr = el.parentElement ? el.parentElement.getBoundingClientRect() : null;
        const pcs = el.parentElement ? getComputedStyle(el.parentElement) : null;
        lines.push(`  [${i}] ${el.tagName} rect=${Math.round(r.width)}x${Math.round(r.height)}`);
        lines.push(`    computed: h=${cs.height} minH=${cs.minHeight} maxH=${cs.maxHeight} overflow=${cs.overflow}`);
        lines.push(`    flex:     display=${cs.display} alignSelf=${cs.alignSelf} flexShrink=${cs.flexShrink}`);
        lines.push(`    inline:   h="${el.style.height}" alignSelf="${el.style.alignSelf}"`);
        if (pcs) lines.push(`    parent:   display=${pcs.display} alignItems=${pcs.alignItems} h=${pcs.height} rect=${pr ? Math.round(pr.height) : '?'}px`);
    });

    const wrapper = document.querySelector('.tapx-wrapper');
    if (wrapper) {
        const wr = wrapper.getBoundingClientRect();
        const wcs = getComputedStyle(wrapper);
        lines.push('');
        lines.push(`WRAPPER rect=${Math.round(wr.width)}x${Math.round(wr.height)}`);
        lines.push(`  computed: overflow=${wcs.overflow} h=${wcs.height}`);
        lines.push(`  inline: h="${wrapper.style.height}"`);
    }

    const overlay = document.createElement('div');
    overlay.id = 'tapx-diag-overlay';
    overlay.style.cssText =
        'position:fixed;bottom:10px;right:10px;max-width:520px;max-height:70vh;' +
        'overflow:auto;background:#111;color:#ddd;font-family:monospace;font-size:11px;' +
        'line-height:1.6;padding:12px 16px;border-radius:8px;z-index:999999;' +
        'border:1px solid #555;white-space:pre;box-shadow:0 4px 24px rgba(0,0,0,0.9)';

    const title = document.createElement('div');
    title.style.cssText = 'font-size:12px;font-weight:bold;color:#00ba7c;margin-bottom:8px';
    title.textContent = '=== TAPX DIAG (клик — закрыть) ===';

    const body = document.createElement('div');
    body.textContent = lines.join('\n');

    overlay.appendChild(title);
    overlay.appendChild(body);
    overlay.addEventListener('click', () => overlay.remove());
    document.body.appendChild(overlay);
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
