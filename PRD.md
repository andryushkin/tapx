# PRD — TapX v0.1.0

**Дата:** 2026-02-23
**Статус:** Shipped (в ревью Chrome Web Store)

---

## Проблема

X.com принудительно оборачивает все изображения в твите в CSS Grid с зазором (~2–15 px). Авторы намеренно разбивают одно большое изображение на 2–4 вертикальных фрагмента («пазл»), но платформа показывает их с зазорами — художественный замысел разрушается.

Решение в браузере — единственный способ исправить это без изменений на стороне X.com.

---

## Решение

TapX — Chrome (MV3) и Firefox (MV2)-расширение, которое:

1. **Автоматически убирает зазоры** между фрагментами пазла, заменяя нативный контейнер на CSS Grid с `gap: 0`.
2. **Предоставляет кнопку "Сшить и скачать"** в action bar твита — экспортирует склеенный JPG в 4K через Canvas API.

Никаких настроек от пользователя не требуется — расширение работает автоматически.

---

## Пользователь

Зритель твитов с изображениями-пазлами: художники, их подписчики, коллекционеры цифрового арта. Устанавливает расширение один раз, далее пазлы отображаются корректно без каких-либо действий.

---

## Функциональные требования (реализованы в v0.1.0)

### FR-1: Бесшовный просмотр пазла

- Расширение сканирует `article[data-testid="tweet"]` на странице твита.
- Собирает `img[src*="pbs.twimg.com/media/"]`, исключая аватары (`[data-testid^="UserAvatar"]`).
- Дедуплицирует изображения по base URL (без query string) — на случай lazy-load дублей.
- Ждёт загрузки всех изображений (или 800 мс fallback), затем вызывает `detectLayout()`.
- `detectLayout()` определяет `cols` по уникальным X-координатам из `getBoundingClientRect()` (bucket 10 px).
- **Только `cols === 1`** (вертикальный столбик) → заменяем на `tapx-grid-container` с `gap: 0`.
- `cols > 1` (галерея 2×2, панорама 2×1) → помечаем `tapxDone = 'skip'`, не трогаем.
- Оригинальный контейнер скрывается (`display: none`), не удаляется.
- Текстовые блоки внутри контейнера (не содержащие изображений) клонируются и вставляются рядом с grid.

### FR-2: Экспорт «Сшить и скачать»

- Кнопка с SVG-иконкой инжектируется в `[role="group"]` (action bar твита).
- По клику: заменяет `name=small/medium` → `name=orig` в URL каждого изображения.
- Загружает оригиналы с `crossOrigin = "anonymous"` (обход CORS).
- Рисует их на Canvas (матрица `cols × rows`), с компенсацией субпиксельных швов (`+0.5 px`).
- Фон Canvas — чёрный (`#000000`).
- **Chrome:** отправляет `dataUrl` (JPEG 0.98) в background service worker → Downloads API.
- **Firefox:** `canvas.toBlob` → `URL.createObjectURL` → `<a>.click()` прямо из content script (Downloads API не поддерживает data-URL в Firefox).
- Имя файла: `tapx_{username}_{tweetId}_stitched.jpg`.

### FR-3: Toggle вкл/выкл

- Popup с переключателем синхронизирует состояние через `api.storage.local` (полифил: `browser ?? chrome`).
- При отключении — `revertAll()` восстанавливает оригинальный DOM.
- При включении — `scanAll()` повторно обрабатывает страницу.

### FR-4: Infinite scroll

- `MutationObserver` с debounce 200 мс перехватывает динамически добавляемые твиты.
- `scanAll()` проверяет `isOnTweetPage()` перед обработкой — в ленте расширение не работает.

---

## Нефункциональные требования

| Требование | Значение |
|---|---|
| Платформа | Chrome MV3 + Firefox MV2 |
| Разрешения Chrome | `activeTab`, `storage` + host_permissions: `x.com`, `twitter.com` |
| Разрешения Firefox | `activeTab`, `storage`, `tabs` + `x.com`, `twitter.com`, `pbs.twimg.com` |
| Приватность | Вся обработка локальная, без трекинга, без серверов |
| Размер | ~20 KB (ZIP для CWS / AMO) |
| Производительность | MutationObserver с debounce; DOM-изменения только на странице твита |

---

## Ограничения scope

- **Только страницы твитов** (`/status/\d+`) — в ленте расширение намеренно отключено: пазл в ленте не виден целиком, обработка там лишена смысла.
- **Только вертикальный пазл** (`cols === 1`) — галереи и панорамы не трогаем.
- **Только X.com / Twitter** — другие платформы не поддерживаются.
- **Chrome и Firefox** — Safari не в scope v0.1.0.

---

## Технический долг

| # | Проблема | Серьёзность |
|---|---|---|
| TD-1 | Canvas использует `naturalWidth`/`naturalHeight` первого изображения как размер тайла для всей матрицы. При асимметричных макетах (3 фото) сшивка геометрически неточна. | Средняя |
| TD-2 | `revertAll()` ставит `display: ''` вместо сохранённого исходного значения — может сломать layout, если оригинальный контейнер был `flex` или `grid`. | Низкая (страница обычно перезагружается) |

---

## Out of scope (v0.1.0)

- Обратный сплиттер (разрезание изображения на фрагменты для публикации).
- Пакетная архивация тредов.
- ~~Поддержка Firefox~~ — **реализовано в v0.1.0** (MV2, blob download). Поддержка Safari — вне scope.

- Монетизация и Pro-тариф.
- Работа в ленте (timeline feed).
- Обработка галерей (`cols > 1`).

---

## v0.2.0 — Upload to taptoview.site ✅ Реализовано

**Дата:** 2026-02-24

**Цель:** конвертировать пользователей расширения в посетителей taptoview.site (монетизация через рекламу).

**Сервис:** `https://taptoview.site` (Cloudflare Workers, production). API-спецификация: `docs/tapx-integration.md`.

### FR-5: Загрузка на taptoview.site ✅

Флоу: клик на кнопку-оверлей → синхронно `window.open` + `newWin.focus()` (loading-страница видна сразу) → `buildStitchedCanvas` → `POST https://taptoview.site/api/upload` (FormData: image JPEG, username, tweetId, tweetText, tweetUrl, avatar blob) → в ответ `{ id, url, expires }` → `newWin.location.href = url` + `newWin.focus()`.

- **Кнопка-оверлей** (download-arrow SVG) — правый нижний угол картинки, `position: absolute`; полупрозрачный тёмный фон с blur, зелёный hover
- **tapx-wrapper** (position: relative) оборачивает grid, чтобы кнопка не клипалась `overflow: hidden`
- **Кнопка в попапе** — "Поделиться на taptoview.site", триггерит `uploadCurrent` через message passing

### Технические требования v0.2.0 — выполнено

| Требование | Статус |
|---|---|
| `buildStitchedCanvas` выделен из `stitchAndDownload` | ✅ |
| `stitchAndUpload(images, article, btn, newWin)` — newWin передаётся из sync click handler | ✅ |
| `fetchAvatarBlob(article)` — опционально, graceful | ✅ |
| `getTweetText(article)` | ✅ |
| `showUploadToast` — только для ошибок (success → window.open) | ✅ |
| host_permissions: `taptoview.site`, `cdn.taptoview.site` | ✅ |
| `downloads` permission в обоих манифестах | ✅ |

### FR-6: Кнопка «Собрать в столбик» ✅

Для твитов, где автор опубликовал пазл как галерею 2×2 (X.com выбрал layout автоматически).
TapX пропускает такие твиты (`tapxDone='skip'`). Ручная сборка через popup:

- **Popup кнопка** `#collapse-btn` (иконка 2×2 SVG) → `forceColumn` message → content.js
- `buildGrid(article, images, true)` — принудительно `cols=1`, игнорирует detectLayout
- После сборки появляется `.tapx-stitch-btn` → пользователь жмёт → обычный upload flow
- Fix: снятие `overflow:hidden` + фиксированной высоты на родительских контейнерах X.com

### В backlog

- Кнопка "Download from taptoview" (если пазл уже загружен, знаем id)
