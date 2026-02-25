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
    const uploadStatus = document.getElementById('upload-status');

    uploadBtn.addEventListener('click', () => {
        uploadBtn.disabled = true;
        uploadStatus.textContent = 'Загрузка...';

        api.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const tab = tabs[0];
            if (!tab) {
                uploadStatus.textContent = 'Вкладка не найдена';
                uploadBtn.disabled = false;
                return;
            }
            api.tabs.sendMessage(tab.id, { action: 'uploadCurrent' }, (response) => {
                void api.runtime.lastError;
                if (!response) {
                    uploadStatus.textContent = 'Откройте страницу твита на X.com';
                } else if (response.error === 'no_puzzle') {
                    uploadStatus.textContent = 'Пазл не найден на странице';
                } else if (response.ok) {
                    uploadStatus.textContent = 'Открыто в новой вкладке ✓';
                } else {
                    uploadStatus.textContent = 'Не удалось загрузить';
                }
                uploadBtn.disabled = false;
            });
        });
    });

    // Collapse gallery button
    const collapseBtn = document.getElementById('collapse-btn');

    collapseBtn.addEventListener('click', () => {
        collapseBtn.disabled = true;
        uploadStatus.textContent = 'Сборка...';

        api.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const tab = tabs[0];
            if (!tab) {
                uploadStatus.textContent = 'Вкладка не найдена';
                collapseBtn.disabled = false;
                return;
            }
            api.tabs.sendMessage(tab.id, { action: 'forceColumn' }, (response) => {
                void api.runtime.lastError;
                if (!response) {
                    uploadStatus.textContent = 'Откройте страницу твита на X.com';
                } else if (response.error === 'no_gallery') {
                    uploadStatus.textContent = 'Галерея не найдена';
                } else if (response.ok) {
                    uploadStatus.textContent = 'Собрана ✓ Нажмите кнопку на картинке';
                } else {
                    uploadStatus.textContent = 'Не удалось собрать';
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
