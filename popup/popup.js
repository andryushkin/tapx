// Cross-browser API compatibility
const api = typeof browser !== 'undefined' ? browser : chrome;

document.addEventListener('DOMContentLoaded', () => {
    const toggleSwitch = document.getElementById('toggle-switch');

    // Load initial state
    api.storage.local.get(['isEnabled'], (result) => {
        if (result.isEnabled !== undefined) {
            toggleSwitch.checked = result.isEnabled;
        } else {
            toggleSwitch.checked = true;
        }
    });

    // Upload button
    const uploadBtn = document.getElementById('upload-btn');
    const collapseBtn = document.getElementById('collapse-btn');

    // Скрыть кнопки изначально — покажем только когда знаем статус
    uploadBtn.style.display = 'none';
    collapseBtn.style.display = 'none';

    function applyStatus(hasPuzzle, hasGallery) {
        uploadBtn.style.display = hasPuzzle ? '' : 'none';
        collapseBtn.style.display = hasGallery ? '' : 'none';
    }

    // Запросить статус при открытии popup
    api.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs[0];
        if (!tab) return;
        const isXcom = /^https?:\/\/(x|twitter)\.com\//.test(tab.url || '');
        if (!isXcom) return;
        api.tabs.sendMessage(tab.id, { action: 'getStatus' }, (response) => {
            void api.runtime.lastError;
            if (!response) return;
            applyStatus(response.hasPuzzle, response.hasGallery);
        });
    });

    uploadBtn.addEventListener('click', () => {
        uploadBtn.disabled = true;

        api.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const tab = tabs[0];
            if (!tab) {
                uploadBtn.disabled = false;
                return;
            }
            api.tabs.sendMessage(tab.id, { action: 'uploadCurrent' }, (response) => {
                void api.runtime.lastError;
                uploadBtn.disabled = false;
            });
        });
    });

    collapseBtn.addEventListener('click', () => {
        collapseBtn.disabled = true;

        api.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const tab = tabs[0];
            if (!tab) {
                collapseBtn.disabled = false;
                return;
            }
            api.tabs.sendMessage(tab.id, { action: 'forceColumn' }, (response) => {
                void api.runtime.lastError;
                if (response && response.ok) {
                    applyStatus(true, false);
                }
                collapseBtn.disabled = false;
            });
        });
    });

    // Listen for toggle changes
    toggleSwitch.addEventListener('change', (e) => {
        const isEnabled = e.target.checked;
        api.storage.local.set({ isEnabled: isEnabled });

        // Broadcast to all valid tabs
        api.tabs.query({ url: ["*://*.x.com/*", "*://*.twitter.com/*"] }, (tabs) => {
            for (let tab of tabs) {
                api.tabs.sendMessage(
                    tab.id,
                    { action: 'toggleState', isEnabled },
                    () => { void api.runtime.lastError; }
                );
            }
        });
    });
});
