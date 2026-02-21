// background.js - Service worker to handle downloads and storage

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'downloadCanvas') {
        const base64Data = request.dataUrl;

        // Use Chrome Downloads API to avoid blob URL restrictions in Background fetch
        chrome.downloads.download({
            url: base64Data,
            filename: request.filename,
            saveAs: true
        });

        // No tracking implementation, ensuring privacy.

        sendResponse({ success: true });
        return true;
    }
});

// Initialize settings on installation
chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.local.get(['isEnabled'], (result) => {
        if (result.isEnabled === undefined) {
            chrome.storage.local.set({ isEnabled: true });
        }
    });
});
