// Cross-browser API compatibility
const api = typeof browser !== 'undefined' ? browser : chrome;

// background.js - Service worker to handle downloads and storage

api.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'openTab') {
        api.tabs.query({ url: 'https://taptoview.site/*' }, (existing) => {
            if (existing && existing.length > 0) {
                const tab = existing[0];
                api.tabs.update(tab.id, { url: request.url, active: true });
                api.windows.update(tab.windowId, { focused: true });
            } else {
                api.tabs.create({ url: request.url });
            }
            sendResponse({ success: true });
        });
        return true;
    }
});

// Initialize settings on installation
api.runtime.onInstalled.addListener(() => {
    api.storage.local.get(['isEnabled'], (result) => {
        if (result.isEnabled === undefined) {
            api.storage.local.set({ isEnabled: true });
        }
    });
});
