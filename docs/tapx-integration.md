# Инструкция: подключение расширения TapX к taptoview.site

## Контекст

Сервис **taptoview.site** — уже запущен в production на Cloudflare Workers. Он принимает пазлы с X.com через REST API и отдаёт их пользователям. Задача этого документа — дать исчерпывающую инструкцию для другого Claude Code агента, который будет реализовывать интеграцию в браузерном расширении **TapX**.

Расширение должно:
1. Загружать пазл (изображение + метаданные) на taptoview.site
2. Получать обратно ссылку на страницу пазла
3. Предоставлять пользователю возможность скачать пазл через этот же сервис

---

## API сервера — полная спецификация

### Base URL

```
https://taptoview.site
```

---

### POST /api/upload — загрузить пазл

#### Запрос

```
POST https://taptoview.site/api/upload
Content-Type: multipart/form-data
```

**Обязательные поля FormData:**

| Поле | Тип | Описание |
|------|-----|----------|
| `image` | File (Blob) | Изображение пазла. MIME: `image/jpeg` или `image/png`. Макс. 50 MB |
| `username` | string | Имя автора твита (без @) |
| `tweetId` | string | ID твита (числовая строка, например `1234567890123456789`) |
| `tweetUrl` | string | Полный URL твита: `https://x.com/username/status/1234567890` |

**Опциональные поля FormData:**

| Поле | Тип | Описание |
|------|-----|----------|
| `tweetText` | string | Текст твита |
| `avatar` | File (Blob) | Аватарка автора. MIME: `image/jpeg` или `image/png`. Макс. 2 MB |

#### CORS

Сервер принимает запросы от расширений (`chrome-extension://...`):
```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: POST, OPTIONS
Access-Control-Allow-Headers: Content-Type
```

Перед POST нужен preflight `OPTIONS /api/upload` → сервер ответит `204 No Content`.

#### Успешный ответ — 200

```json
{
  "id": "aBcD1e2fGh",
  "url": "https://taptoview.site/d/aBcD1e2fGh",
  "expires": "2026-03-26 14:32:45"
}
```

| Поле | Описание |
|------|----------|
| `id` | Уникальный 10-символьный ID пазла (A-Za-z0-9) |
| `url` | Прямая ссылка на страницу пазла — показать пользователю |
| `expires` | Дата истечения (30 дней), формат: `YYYY-MM-DD HH:MM:SS` |

#### Ошибки

| Статус | `error` | Причина |
|--------|---------|---------|
| 400 | `invalid_form` | Невалидный multipart/form-data |
| 400 | `missing_field` | Отсутствует обязательное поле |
| 400 | `invalid_mime` | MIME не image/jpeg и не image/png |
| 413 | `too_large` | Файл превышает лимит (50 MB для image, 2 MB для avatar) |
| 429 | `rate_limited` | Лимит 20 загрузок/IP/час. Заголовок `Retry-After: <секунды>` |

Формат ошибки:
```json
{
  "error": "rate_limited",
  "message": "Rate limit exceeded. Try again later."
}
```

---

### GET /api/d/:id — получить данные пазла

```
GET https://taptoview.site/api/d/aBcD1e2fGh
```

Ответ 200:
```json
{
  "id": "aBcD1e2fGh",
  "username": "john_doe",
  "tweetId": "1234567890123456789",
  "tweetUrl": "https://x.com/john_doe/status/1234567890123456789",
  "tweetText": "Check out this puzzle!",
  "imageUrl": "https://cdn.taptoview.site/uploads/aBcD1e2fGh.jpg",
  "avatarUrl": "https://cdn.taptoview.site/avatars/aBcD1e2fGh.jpg",
  "imageSize": 1048576,
  "downloadCount": 3,
  "createdAt": "2026-02-24 14:32:45",
  "expiresAt": "2026-03-26 14:32:45"
}
```

- `avatarUrl` — `null` если аватара не была передана при загрузке
- Ошибка 404 если пазл не найден или истёк (TTL 30 дней)

---

### GET /api/d/:id/download — скачать пазл

```
GET https://taptoview.site/api/d/aBcD1e2fGh/download
```

- **302 Redirect** на `https://cdn.taptoview.site/uploads/aBcD1e2fGh.jpg`
- Инкрементирует счётчик `download_count` в базе
- Ошибка 404 если пазл не существует

Для скачивания в расширении использовать `chrome.downloads.download({ url: downloadUrl })`, где `downloadUrl = "https://taptoview.site/api/d/{id}/download"`.

---

## Что реализовать в расширении

### 1. Кнопка "Share to taptoview"

При клике на кнопку рядом с пазлом (или через context menu) расширение должно:

1. Извлечь из DOM/страницы X.com:
   - Изображение пазла (`image` / Blob)
   - `username` автора (без `@`)
   - `tweetId` — числовой ID из URL: `https://x.com/*/status/{tweetId}`
   - `tweetUrl` — полный URL твита
   - `tweetText` — текст твита (опционально)
   - Аватарку автора (`avatar` / Blob, опционально)

2. Отправить `POST /api/upload` через `fetch` из background service worker (обходит CORS):

```js
async function uploadPuzzle({ imageBlob, avatarBlob, username, tweetId, tweetUrl, tweetText }) {
  const formData = new FormData()
  formData.append('image', imageBlob, 'puzzle.jpg')
  formData.append('username', username)
  formData.append('tweetId', tweetId)
  formData.append('tweetUrl', tweetUrl)
  if (tweetText) formData.append('tweetText', tweetText)
  if (avatarBlob) formData.append('avatar', avatarBlob, 'avatar.jpg')

  const response = await fetch('https://taptoview.site/api/upload', {
    method: 'POST',
    body: formData,
    // Content-Type НЕ указывать вручную — fetch сам выставит boundary для multipart
  })

  if (!response.ok) {
    const err = await response.json()
    throw new Error(`Upload failed: ${err.error} — ${err.message}`)
  }

  return await response.json() // { id, url, expires }
}
```

3. После успеха — показать пользователю `url` из ответа (нотификация / попап).

### 2. Кнопка "Download from taptoview"

Если пазл уже загружен (известен `id`):

```js
async function downloadPuzzle(id) {
  const downloadUrl = `https://taptoview.site/api/d/${id}/download`
  await chrome.downloads.download({
    url: downloadUrl,
    filename: `puzzle-${id}.jpg`
  })
}
```

---

## Разрешения в manifest.json

```json
{
  "permissions": [
    "downloads"
  ],
  "host_permissions": [
    "https://taptoview.site/*",
    "https://cdn.taptoview.site/*"
  ]
}
```

---

## Обработка ошибок в расширении

| Статус | Что показать пользователю |
|--------|--------------------------|
| 413 | "Изображение слишком большое (макс. 50 MB)" |
| 429 | `Retry-After` заголовок → "Попробуйте через X минут" |
| 400 | "Не удалось загрузить пазл: {message}" |
| 5xx | "Сервис временно недоступен, попробуйте позже" |

```js
if (response.status === 429) {
  const retryAfter = response.headers.get('Retry-After') || '3600'
  const minutes = Math.ceil(parseInt(retryAfter) / 60)
  showError(`Лимит загрузок. Попробуйте через ${minutes} мин.`)
}
```

---

## Проверка интеграции

1. Загрузить тестовый пазл через расширение → убедиться что ответ содержит `{ id, url, expires }`
2. Открыть `url` в браузере → страница `https://taptoview.site/d/{id}` должна показать пазл
3. Нажать Download → проверить что `download_count` в `/api/d/{id}` инкрементировался
4. Проверить rate limit: отправить 21 запрос с одного IP → 20-й должен пройти, 21-й вернуть 429

---

## Важные детали

- `Content-Type` заголовок при POST **не устанавливать вручную** — браузер/fetch сам добавит `multipart/form-data; boundary=...`
- Изображение должно быть передано как `File` или `Blob`, не как base64 строка
- `tweetId` — только числовой ID, не полный URL
- `username` — без символа `@`
- Сервер работает на edge Cloudflare (глобально), задержка минимальная
- Файлы хранятся 30 дней, потом автоматически удаляются
