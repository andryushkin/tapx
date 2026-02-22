# CLAUDE.md — TapX

Chrome-расширение (Manifest V3) для бесшовного отображения и склейки изображений-пазлов на X.com / Twitter.

## Структура проекта

```
tapx/
├── manifest.json              — MV3 конфиг, версия 0.01
├── content/
│   ├── content.js             — основная логика: сканирование твитов, DOM-замена, Canvas-склейка
│   └── seamless.css           — стили: tapx-grid-container, tapx-stitch-btn, tapx-toast
├── background/
│   └── background.js          — service worker: обработка скачивания (Downloads API)
├── popup/
│   ├── popup.html             — UI: заголовок + toggle on/off
│   └── popup.js               — синхронизация toggle со storage и открытыми вкладками
├── icons/                     — иконки 16/48/128px
├── build_extension.py         — сборщик ZIP для Chrome Web Store (python 3.9+)
├── tapx_release.zip           — последний собранный релиз (не коммитить)
└── концепция.md               — PRD: архитектура, конкурентный анализ, монетизация
```

## Разрешения (manifest.json)

- `activeTab`, `storage`, `downloads`
- `host_permissions`: `https://x.com/*`, `https://twitter.com/*`, `https://pbs.twimg.com/*`

## Как работает content.js

### Основной флоу

1. При загрузке читает `isEnabled` из `chrome.storage.local`, запускает `scanAll()`
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
- Отправляет `dataUrl` в background через `chrome.runtime.sendMessage`
- Имя файла: `tapx_{username}_{tweetId}_stitched.jpg`

## Сборка и публикация

```bash
# Собрать ZIP для Chrome Web Store
python build_extension.py
```

Упаковывает: `manifest.json`, `popup/`, `content/`, `background/`, `icons/`.
Результат: `tapx_release.zip` (~24 KB).

**Загрузка в CWS:** [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)

## Известные проблемы / технический долг

1. ~~**Toast-спам**~~ — **Исправлено:** `showToast()` удалена, расширение активно только на `/status/\d+` (страница твита).
2. ~~**Race condition с lazy load**~~ — **Исправлено:** `processArticle` ждёт загрузки изображений, только потом `buildGrid` вызывает `detectLayout(images)` с реальными `getBoundingClientRect()`.
   > ⚠️ **НЕ возвращать count-based detectLayout** — не различает вертикальный пазл (4×1) и галерею (2×2). Единственный правильный способ — рект после загрузки.
3. **Canvas использует размеры первого изображения** для всей матрицы — при асимметричных макетах (3 фото) сшивка геометрически неточна.
4. **`revertAll()`** ставит `display: ''` вместо сохранённого исходного значения — может сломать layout если оригинал был `flex`/`grid`.
5. ~~**`getUsername()`**~~ — **Исправлено:** строгий regex `/^\/([A-Za-z0-9_]{1,50})(?:\/)?$/` исключает служебные пути.
6. ~~**`chrome.tabs.sendMessage` без обработки ошибок**~~ — **Исправлено:** callback `() => { void chrome.runtime.lastError; }` подавляет Unchecked error.

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
