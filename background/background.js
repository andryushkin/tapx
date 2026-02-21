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

        // Increment solved puzzle counter
        chrome.storage.local.get(['solvedCount'], (result) => {
            const currentCount = result.solvedCount || 0;
            chrome.storage.local.set({ solvedCount: currentCount + 1 });
        });

        sendResponse({ success: true });
        return true;
    }
});

// Initialize settings on installation
chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.local.get(['isEnabled', 'solvedCount'], (result) => {
        if (result.isEnabled === undefined) {
            chrome.storage.local.set({ isEnabled: true });
        }
        if (result.solvedCount === undefined) {
            chrome.storage.local.set({ solvedCount: 0 });
        }
    });
});
