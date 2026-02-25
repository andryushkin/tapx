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
    const collapseBtn = document.getElementById('collapse-btn');

    // Скрыть кнопки изначально — покажем только когда знаем статус
    uploadBtn.style.display = 'none';
    collapseBtn.style.display = 'none';

    function applyStatus(hasPuzzle, hasGallery) {
        uploadBtn.style.display = hasPuzzle ? '' : 'none';
        collapseBtn.style.display = hasGallery ? '' : 'none';
        if (!hasPuzzle && !hasGallery) {
            uploadStatus.textContent = 'Пазл не найден на странице';
        }
    }

    // Запросить статус при открытии popup
    api.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs[0];
        if (!tab) { uploadStatus.textContent = 'Вкладка не найдена'; return; }
        const isXcom = /^https?:\/\/(x|twitter)\.com\//.test(tab.url || '');
        if (!isXcom) { uploadStatus.textContent = 'Откройте страницу твита на X.com'; return; }
        api.tabs.sendMessage(tab.id, { action: 'getStatus' }, (response) => {
            void api.runtime.lastError;
            if (!response) { uploadStatus.textContent = 'Пазл не найден'; return; }
            applyStatus(response.hasPuzzle, response.hasGallery);
        });
    });

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
                    applyStatus(true, false);
                } else {
                    uploadStatus.textContent = 'Не удалось собрать';
                }
                collapseBtn.disabled = false;
            });
        });
    });

    // Diagnostics button
    const diagBtn = document.getElementById('diag-btn');
    diagBtn.addEventListener('click', () => {
        api.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const tab = tabs[0];
            if (!tab) return;
            api.tabs.sendMessage(tab.id, { action: 'tapxDiag' }, () => {
                void api.runtime.lastError;
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
