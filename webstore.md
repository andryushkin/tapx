# Chrome Web Store — Full Description

> Max 1600 characters. SEO-optimized, EN.

---

## Single Purpose Statement

> Required by CWS policy: the extension must have a single, narrow, easy-to-understand purpose.

**TapX has a single purpose:** remove the visible gaps between split-image ("puzzle") posts on X / Twitter, so multi-panel artwork appears seamless — exactly as the creator intended.

---

TapX removes the distracting gaps between split-image ("puzzle") posts on X / Twitter — automatically, with zero clicks.

When artists post multi-panel illustrations or creators use the "tap to view" post format as 2–4 vertical image tiles, X's grid layout forces visible white spacing between each piece. TapX patches that in real time so every puzzle post looks like one seamless, continuous artwork — exactly as the creator intended.

**What TapX does:**
• Instantly removes gaps between split images on X and Twitter
• Works automatically on tweet pages — no settings, no toggles
• Detects vertical puzzle layouts; leaves galleries and panoramas untouched
• Lightweight — no background processes, no data collected

**Who it's for:**
• Digital artists and illustrators who post multi-panel puzzle content
• Creators using the "tap to view" multi-panel format
• Anyone tired of broken-up visuals interrupting their feed

**How it works:**
TapX uses stable X.com selectors to detect multi-image tweet layouts. When a vertical puzzle is found, it rebuilds the display as a seamless grid — no flicker, no layout breakage. No configuration needed.

Privacy-first · No accounts · No tracking · Manifest V3

---

## Permission Justifications

**activeTab**
Used to communicate with the currently active X/Twitter tab when the user toggles the extension on or off from the popup. Allows the popup to send an enable/disable message to the page without requiring broad tab access.

**storage**
Stores the user's on/off toggle preference locally so the setting persists across browser sessions. No personal data is collected or transmitted.

**Host permissions — x.com/\*, twitter.com/\***
Required for the content script to run on X and Twitter pages. The script reads the DOM structure of tweet pages to detect split-image puzzle posts and remove the spacing between image tiles.

---

## Remote Code

**No** — the extension does not use any remote code. All JavaScript is bundled in the extension package. No `eval()`, no external scripts, no dynamically loaded modules.

---

## Privacy Policy

> Host this text at a public URL (e.g. GitHub Pages, gist) and paste the link into the CWS form.

---

**Privacy Policy for TapX**

*Last updated: February 2026*

TapX ("the Extension") is a browser extension for Google Chrome that removes visible gaps between split-image posts on X (Twitter).

**Data collection**
TapX does not collect, store, transmit, or share any personal data or user information. The extension does not track browsing history, page content, clicks, or any other user activity.

**Local storage**
The extension stores a single on/off preference (`isEnabled`) in the browser's local storage (`chrome.storage.local`). This value never leaves the user's device.

**Third parties**
TapX does not integrate any analytics, advertising, or third-party services. No data is sold or transferred to any third party under any circumstances.

**Permissions**
The extension requests only the permissions necessary to function:
- `activeTab` and host permissions for x.com/twitter.com — to detect and fix split-image layouts on tweet pages.
- `storage` — to remember the user's on/off toggle setting.

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
