# CLAUDE.md — TapX

Chrome (MV3) + Firefox (MV2)-расширение для бесшовного отображения и склейки изображений-пазлов на X.com / Twitter.

## Структура проекта

```
tapx/
├── manifest.json              — Chrome MV3 конфиг, версия 0.1.0
├── manifest-firefox.json      — Firefox MV2 конфиг (browser_action, background.scripts)
├── content/
│   ├── compat.js              — полифил: const api = browser ?? chrome (подключается первым)
│   ├── content.js             — основная логика: сканирование твитов, DOM-замена, Canvas-склейка
│   └── seamless.css           — стили: tapx-grid-container, tapx-stitch-btn, tapx-toast
├── background/
│   └── background.js          — service worker (Chrome) / background script (Firefox): Downloads API
├── popup/
│   ├── popup.html             — UI: заголовок + toggle on/off
│   └── popup.js               — синхронизация toggle со storage и открытыми вкладками
├── icons/                     — иконки 16/32/48/128px
├── build_extension.py         — сборщик ZIP (python 3.9+), поддерживает --target firefox
├── tapx_release.zip           — Chrome релиз (не коммитить)
├── tapx_firefox.zip           — Firefox релиз (не коммитить)
├── концепция.md               — PRD: архитектура, конкурентный анализ, монетизация
└── webstore.md                — SEO-описание для Chrome Web Store (EN, ≤1600 символов)
```

## Разрешения

**Chrome (manifest.json):** `activeTab`, `storage` | host_permissions: `https://x.com/*`, `https://twitter.com/*`
**Firefox (manifest-firefox.json):** `activeTab`, `storage`, `tabs` + те же хосты внутри `permissions`

> `tabs` нужен в Firefox для `browser.tabs.query({ url: [...] })` в popup.js

## Как работает content.js

### Основной флоу

1. При загрузке читает `isEnabled` из `api.storage.local` (полифил: `browser ?? chrome`), запускает `scanAll()`
2. `scanAll()` — ищет все `article[data-testid="tweet"]`, вызывает `processArticle()`
3. `processArticle()`:
   - Собирает медиа-изображения (`pbs.twimg.com/media/`), исключая аватары (`[data-testid^="UserAvatar"]`)
   - Пропускает твиты с < 2 изображений
   - Ставит lock `pending`, ждёт загрузки изображений (`img.complete && naturalWidth > 0`), затем вызывает `buildGrid()`
   - Fallback-таймер 800ms — строит grid даже если изображения не загрузились
4. `buildGrid()`:
   - Определяет layout через `detectLayout(images)` — читает реальные `getBoundingClientRect()`
   - Если `cols > 1` → **пропускает** (галерея/панорама — не пазл, не трогаем)
   - Пазл = только `cols === 1` (вертикальный столбик, 2–4 изображения)
   - Создаёт `tapx-grid-container` с CSS Grid, клонирует изображения
   - Скрывает оригинальный контейнер (`display: none`)
   - Инжектирует кнопку "Сшить и скачать" в action bar
4. `MutationObserver` с debounce 200ms обрабатывает infinite scroll

### Ключевые селекторы (стабильные data-testid X.com)

| Элемент | Селектор |
|---|---|
| Корень твита | `article[data-testid="tweet"]` |
| Изображение | `img[src*="pbs.twimg.com/media/"]` |
| Аватар (исключение) | `[data-testid^="UserAvatar"]` |
| Action bar | `[role="group"][aria-label]` или `[role="group"]` |

### Canvas-склейка (`stitchAndDownload`)

- Заменяет `name=small/medium` → `name=orig` для скачивания в 4K
- Использует `crossOrigin = "anonymous"` для обхода CORS
- Рисует grid матрицу через `ctx.drawImage` с +0.5px anti-seam
- **Chrome:** отправляет `dataUrl` в background через `api.runtime.sendMessage`
- **Firefox:** `canvas.toBlob` → `URL.createObjectURL` → `<a>.click()` прямо из content script (Firefox не поддерживает data-URL в downloads API)
- Имя файла: `tapx_{username}_{tweetId}_stitched.jpg`

## Сборка и публикация

```bash
python build_extension.py                    # Chrome → tapx_release.zip (~20 KB)
python build_extension.py --target firefox   # Firefox → tapx_firefox.zip (~20 KB)
```

Упаковывает: манифест (переименовывается в `manifest.json`), `popup/`, `content/`, `background/`, `icons/`.

**Chrome:** [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
**Firefox тест:** `about:debugging` → This Firefox → Load Temporary Add-on → выбрать `tapx_firefox.zip`
> ⚠️ Firefox всегда читает `manifest.json` из директории, игнорируя выбранный файл. Тестировать нужно через ZIP, а не через `manifest-firefox.json` напрямую.

## Известные проблемы / технический долг

1. ~~**Toast-спам**~~ — **Исправлено:** `showToast()` удалена, расширение активно только на `/status/\d+` (страница твита).
2. ~~**Race condition с lazy load**~~ — **Исправлено:** `processArticle` ждёт загрузки изображений, только потом `buildGrid` вызывает `detectLayout(images)` с реальными `getBoundingClientRect()`.
   > ⚠️ **НЕ возвращать count-based detectLayout** — не различает вертикальный пазл (4×1) и галерею (2×2). Единственный правильный способ — рект после загрузки.
3. **Canvas использует размеры первого изображения** для всей матрицы — при асимметричных макетах (3 фото) сшивка геометрически неточна.
4. **`revertAll()`** ставит `display: ''` вместо сохранённого исходного значения — может сломать layout если оригинал был `flex`/`grid`.
5. ~~**`getUsername()`**~~ — **Исправлено:** строгий regex `/^\/([A-Za-z0-9_]{1,50})(?:\/)?$/` исключает служебные пути.
6. ~~**`chrome.tabs.sendMessage` без обработки ошибок**~~ — **Исправлено:** callback `() => { void api.runtime.lastError; }` подавляет Unchecked error.

> **Архитектурное решение:** расширение намеренно работает только на страницах твитов (`/status/\d+`), а не в ленте — пазл в ленте не виден целиком, обработка там лишена смысла.

## Монетизация (план из концепция.md)

- **Free:** визуальное устранение зазоров (текущий функционал)
- **Донаты:** Ko-fi / GitHub Sponsors с умными триггерами
- **Pro:** 4K Canvas-экспорт + Grid Splitter (разрезание изображений) через ExtensionPay

## Конкуренты

| Расширение | Устраняет зазоры в ленте | 4K экспорт | Склейка |
|---|---|---|---|
| FrostFall | Нет | Да | Вертикальный стек |
| X-Stitch | Нет | Да | Вертикальный стек |
| X-Puzzle-Kit | Опционально | Да | 2×2 и панорамы |
| **TapX** | **Да (авто)** | Да | **Матричный** |
