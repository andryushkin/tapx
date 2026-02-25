# Chrome Web Store — Full Description

> Max 1600 characters. SEO-optimized, EN.

---

## Single Purpose Statement

> Required by CWS policy: the extension must have a single, narrow, easy-to-understand purpose.

**TapX has a single purpose:** remove the visible gaps between split-image ("puzzle") posts on X / Twitter, so multi-panel artwork appears seamless — exactly as the creator intended.

---

TapX repairs split-image ("puzzle") posts on X / Twitter into seamless art — and with one tap shares the stitched result to the taptoview.site gallery.

When artists post multi-panel illustrations as 2–4 stacked tiles, X's layout forces visible gaps between each piece. TapX removes them instantly. Then a single click stitches all panels together and opens your personal gallery page — ready to share or bookmark.

**What TapX does:**
• Automatically removes gaps between split-image puzzle posts on X and Twitter
• One-click Share: stitch all panels → upload to taptoview.site gallery → gallery opens instantly
• "Merge" button in popup: collapse 2×2 gallery posts into a single vertical stitch
• Detects puzzle layouts with pixel precision; leaves regular galleries and panoramas untouched
• All stitching is local (Canvas API) — image is uploaded only when you click Share
• Lightweight — under 20 KB; Manifest V3

**Who it's for:**
• Fans of digital art and illustration puzzle posts
• Collectors who want to share or save multi-panel artwork
• Anyone tired of gaps breaking up split-image visuals

**How it works:**
TapX scans tweet pages for vertical split-image layouts using stable X.com selectors. It rebuilds the display with zero gaps using a CSS grid overlay. The Share button (overlay on the image) stitches all panels via Canvas API and uploads to taptoview.site — then opens or focuses the gallery tab.

Privacy-first · No tracking · No login required · Manifest V3

---

## Permission Justifications

**activeTab**
Used to communicate with the currently active X/Twitter tab when the user toggles the extension on or off from the popup. Allows the popup to send an enable/disable message to the page without requiring broad tab access.

**storage**
Stores the user's on/off toggle preference locally so the setting persists across browser sessions. No personal data is collected or transmitted.

**Host permissions — x.com/\*, twitter.com/\***
Required for the content script to run on X and Twitter pages. The script reads the DOM structure of tweet pages to detect split-image puzzle posts and remove the spacing between image tiles.

**Host permissions — taptoview.site/\*, cdn.taptoview.site/\***
Required to upload the stitched canvas image to taptoview.site when the user clicks the Share button. The POST request is made directly from the content script using the Fetch API. No data is sent without explicit user action (button click). cdn.taptoview.site is used to load gallery assets after upload.

---

## Remote Code

**No** — the extension does not use any remote code. All JavaScript is bundled in the extension package. No `eval()`, no external scripts, no dynamically loaded modules.

---

## Privacy Policy

> Host this text at a public URL (e.g. GitHub Pages, gist) and paste the link into the CWS form.

---

**Privacy Policy for TapX**

*Last updated: February 2026*

TapX ("the Extension") is a browser extension for Google Chrome that removes visible gaps between split-image posts on X (Twitter) and lets users share stitched results to the taptoview.site gallery.

**Data collection**
TapX does not collect, store, transmit, or share any personal data or user information. The extension does not track browsing history, page content, clicks, or any other user activity.

**Local storage**
The extension stores a single on/off preference (`isEnabled`) in the browser's local storage (`chrome.storage.local`). This value never leaves the user's device.

**Image upload**
When the user clicks the Share button (overlay on the puzzle image or "Share to Gallery" in the popup), TapX stitches the visible image panels into a single JPEG using the Canvas API and uploads it to taptoview.site along with the tweet ID, tweet URL, X username, and optional tweet text. This upload occurs only on explicit user action and is covered by the taptoview.site Privacy Policy.

**Third parties**
TapX does not integrate any analytics, advertising, or third-party services. No data is sold or transferred to any third party under any circumstances. The taptoview.site gallery service is the sole external destination, used only on explicit user action (Share button).

**Permissions**
The extension requests only the permissions necessary to function:
- `activeTab` and host permissions for x.com/twitter.com — to detect and fix split-image layouts on tweet pages.
- `storage` — to remember the user's on/off toggle setting.
- Host permissions for taptoview.site/cdn.taptoview.site — to upload stitched images and load gallery assets when the user clicks Share.

**Contact**
If you have questions about this policy, please open an issue at the extension's repository.

---

## Test Instructions

> For the Chrome Web Store review team.

No login, account, or special setup is required to use TapX.

**Steps to test core functionality:**

1. Install the extension.
2. Open any tweet that contains 2–4 stacked images (a "puzzle post" or "tap to view" post).
   Example: https://x.com/sydneysfiles/status/2024731512248127596
3. The gaps between the image tiles should be automatically removed — the images will appear as one continuous seamless artwork.
4. To verify the toggle works: click the TapX icon in the toolbar → turn the extension off → reload the page. The original gaps should reappear. Turn it back on → reload → gaps are gone again.

**No credentials required.** A free X (Twitter) account may be needed to view tweet pages, but the extension itself has no accounts or gating.

---

*Character count target: ≤ 1600*
