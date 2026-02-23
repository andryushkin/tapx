# Feature Plan: Upload to tapx.io

**Версия:** v0.2.0 (планируемая)
**Дата:** 2026-02-23
**Статус:** Запланировано — backend (tapx.io) является отдельным проектом

---

## Цель

Перевести пользователей на сайт tapx.io (монетизация через рекламу и Pro-тариф).

Флоу: клик в расширении → Canvas-склейка → upload на api.tapx.io → пользователь попадает на tapx.io → смотрит/скачивает там.

---

## Две точки входа

Оба действия ведут к одному результату — открыть изображение на tapx.io:

1. **Кнопка-оверлей** — появляется при hover прямо на изображении (правый нижний угол)
2. **Кнопка в action bar** — всегда видна под твитом (рядом с лайком/репостом)

---

## Новые данные для отправки

| Поле | Источник |
|---|---|
| `image` (Blob JPEG) | Canvas-склейка оригиналов |
| `username` | `getUsername(article)` |
| `tweetId` | `getTweetId(article)` |
| `tweetUrl` | `https://x.com/${username}/status/${tweetId}` |
| `tweetText` | `article.querySelector('[data-testid="tweetText"]')?.innerText` |
| `avatar` (Blob) | `fetch(avatarImg.src)` из content script |

---

## Архитектура на стороне расширения

### Рефактор content.js

`stitchAndDownload()` → разбить на:

```
stitchCanvas(images, article) → Promise<HTMLCanvasElement>
stitchAndDownload(images, article)   — локальное скачивание (оставить)
stitchAndUpload(images, article)     — новая функция → upload → window.open
```

### uploadToTapx()

```javascript
async function uploadToTapx(canvas, article) {
    const username = getUsername(article);
    const tweetId  = getTweetId(article);

    const [imageBlob, avatarBlob] = await Promise.all([
        new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.92)),
        fetchAvatarBlob(article)   // fetch() из content script — CORS разрешён через host_permissions
    ]);

    const form = new FormData();
    form.append('image',     imageBlob,  `tapx_${username}_${tweetId}.jpg`);
    form.append('username',  username);
    form.append('tweetId',   tweetId);
    form.append('tweetText', getTweetText(article));
    form.append('tweetUrl',  `https://x.com/${username}/status/${tweetId}`);
    if (avatarBlob) form.append('avatar', avatarBlob, 'avatar.jpg');

    const res  = await fetch('https://api.tapx.io/upload', { method: 'POST', body: form });
    const data = await res.json();
    return data.url; // https://tapx.io/d/abc123
}
```

### Оверлей-кнопка (seamless.css)

```css
.tapx-grid-container { position: relative; }

.tapx-upload-overlay {
    position: absolute;
    bottom: 10px; right: 10px;
    width: 36px; height: 36px;
    border-radius: 50%;
    background: rgba(0,0,0,0.55);
    backdrop-filter: blur(6px);
    cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    opacity: 0;
    transition: opacity 0.2s ease;
    z-index: 10;
}
.tapx-grid-container:hover .tapx-upload-overlay { opacity: 1; }
.tapx-upload-overlay.uploading { opacity: 1; animation: tapx-spin 1s linear infinite; }
@keyframes tapx-spin { to { transform: rotate(360deg); } }
```

---

## API-контракт для backend tapx.io

```
POST https://api.tapx.io/upload
Content-Type: multipart/form-data

Тело:
  image     Blob     JPEG-склейка пазла
  username  string   @username без @
  tweetId   string   числовой ID твита
  tweetText string   текст твита (может быть пустым)
  tweetUrl  string   https://x.com/username/status/id
  avatar    Blob?    аватарка пользователя (необязательно)

Ответ 200:
{
  "url": "https://tapx.io/d/abc123",
  "expires": "2026-03-25T00:00:00Z"
}
```

Страница `tapx.io/d/abc123`:
- Показывает склеенное изображение
- Текст твита + аватар + @username + ссылка на оригинал
- Кнопка Download
- Реклама / Pro-апселл

---

## Изменения в манифестах

```json
// manifest.json → host_permissions
"https://api.tapx.io/*"

// manifest-firefox.json → permissions
"https://api.tapx.io/*"
```

---

## Файлы для изменения

| Файл | Что меняется |
|---|---|
| `content/content.js` | getTweetText, fetchAvatarBlob, stitchCanvas, stitchAndUpload, uploadToTapx, overlay DOM |
| `content/seamless.css` | .tapx-upload-overlay + @keyframes tapx-spin |
| `manifest.json` | host_permissions += api.tapx.io |
| `manifest-firefox.json` | permissions += api.tapx.io |

---

## Зависимости

- **Backend tapx.io** — отдельный проект. Расширение готово к интеграции, как только поднят endpoint `POST /upload`.
- Заглушка для разработки: mock-endpoint, возвращающий `{ url: "https://tapx.io/d/test123" }`.
