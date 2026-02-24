# CLAUDE.md — TapX

Chrome (MV3) + Firefox (MV2)-расширение для бесшовного отображения и склейки изображений-пазлов на X.com / Twitter.

## Структура проекта

```
tapx/
├── manifest.json              — Chrome MV3 конфиг, версия 0.1.0
├── manifest-firefox.json      — Firefox MV2 конфиг (browser_action, background.scripts)
├── content/
│   ├── compat.js              — полифил: const api = browser ?? chrome (подключается первым)
│   ├── content.js             — основная логика: сканирование твитов, DOM-замена, Canvas-склейка, upload
│   └── seamless.css           — стили: tapx-wrapper, tapx-grid-container, tapx-stitch-btn, tapx-toast
├── background/
│   └── background.js          — service worker (Chrome) / background script (Firefox): Downloads API + openTab action
├── popup/
│   ├── popup.html             — UI: заголовок + toggle + кнопка "Поделиться на taptoview.site"
│   └── popup.js               — toggle + upload-кнопка (sendMessage uploadCurrent в active tab)
├── icons/                     — иконки 16/32/48/128px
├── docs/
│   └── tapx-integration.md   — полная спецификация API taptoview.site для расширения
├── build_extension.py         — сборщик ZIP (python 3.9+), поддерживает --target firefox
├── tapx_release.zip           — Chrome релиз (не коммитить)
├── tapx_firefox.zip           — Firefox релиз (не коммитить)
├── webstore.md                — SEO-описание для Chrome Web Store (EN, ≤1600 символов)
├── PRD.md                     — Product Requirements: v0.1.0 (shipped) + v0.2.0 roadmap
├── plan-upload-to-tapx.md    — Детальный план фичи Upload to tapx.io (v0.2.0)
└── website.md                — Спецификация tapx.io: API-контракт, бизнес-логика, монетизация
```

## Разрешения

**Chrome (manifest.json):** `activeTab`, `storage`, `downloads` | host_permissions: `https://x.com/*`, `https://twitter.com/*`, `https://taptoview.site/*`, `https://cdn.taptoview.site/*`
**Firefox (manifest-firefox.json):** `activeTab`, `storage`, `tabs`, `downloads` + те же хосты внутри `permissions`

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
   - Оборачивает `tapx-grid-container` в `tapx-wrapper` (`position: relative`)
   - Скрывает оригинальный контейнер (`display: none`)
   - Инжектирует одну кнопку-оверлей в правый нижний угол картинки (`.tapx-stitch-btn`, `position: absolute; bottom: 10px; right: 10px`)
4. `MutationObserver` с debounce 200ms обрабатывает infinite scroll

### Ключевые селекторы (стабильные data-testid X.com)

| Элемент | Селектор |
|---|---|
| Корень твита | `article[data-testid="tweet"]` |
| Изображение | `img[src*="pbs.twimg.com/media/"]` |
| Аватар (исключение) | `[data-testid^="UserAvatar"]` |
| Action bar | `[role="group"][aria-label]` или `[role="group"]` |

### Canvas-склейка

Общая логика вынесена в `buildStitchedCanvas(images, article)` → возвращает `canvas`.

- Заменяет `name=small/medium` → `name=orig` для скачивания в 4K
- Использует `crossOrigin = "anonymous"` для обхода CORS
- Рисует grid матрицу через `ctx.drawImage` с +0.5px anti-seam

**`stitchAndUpload`** (поделиться на taptoview.site) — **реализовано**:
- `buildStitchedCanvas` → `canvas.toBlob` → `FormData` → `fetch POST https://taptoview.site/api/upload`
- Upload делается из content script напрямую (CORS `*`, background не нужен)
- Отправляет: image blob, username, tweetId, tweetUrl, tweetText (опц.), avatar blob (опц.)
- После успеха: `newWin.location.href = url` + `newWin.focus()` — навигирует заранее открытую вкладку на результат и выводит её на передний план
- Ошибки: toast только для 429 ("Попробуйте через X мин.") и generic
- `fetchAvatarBlob` — graceful degradation (null при ошибке, upload продолжается)
- Спецификация API: `docs/tapx-integration.md`

> ⚠️ **`stitchAndDownload` удалена** — кнопка Download убрана. Не восстанавливать без явного запроса.

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
7. ~~**Вкладка открывалась в фоне при upload**~~ — **Исправлено:** `window.open` + `document.write` + `newWin.focus()` вынесены в синхронный click handler в `injectStitchButton`. `newWin` передаётся параметром в `stitchAndUpload(images, article, btn, newWin)`. После `newWin.location.href = url` снова вызывается `newWin.focus()`. Если `newWin = null` (popup upload) — background открывает вкладку через `openTab` action.
   > ⚠️ **НЕ перемещать `window.open` обратно в `stitchAndUpload`** — браузер открывает вкладку в фоне без возможности `focus()`.
8. ~~**Firefox "corrupt" при установке из файла**~~ — **Исправлено:** добавлен `browser_specific_settings.gecko.id = "tapx@taptoview.site"` в `manifest-firefox.json`. Firefox требует gecko ID для установки через `about:addons`. Для временной установки (`about:debugging`) ID не обязателен.
9. ~~**Firefox: about:blank при клике кнопки на картинке**~~ — **Исправлено:** `newWin.document.write` в Firefox content script бросал exception (XrayWrapper sandbox), что прерывало click handler до вызова `stitchAndUpload`. Фикс: `try/catch` вокруг `document.write`.
   > ⚠️ **НЕ убирать try/catch вокруг `document.write`** — без него Firefox не запускает upload.
10. ~~**Chrome popup: результат не открывался в новой вкладке**~~ — **Исправлено:** при `newWin = null` (popup upload) используется `api.runtime.sendMessage({ action: 'openTab', url })` → background делает `api.tabs.create({ url })`.
   > background.js обязан иметь handler для `openTab` — без него popup upload не открывает результат.

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
