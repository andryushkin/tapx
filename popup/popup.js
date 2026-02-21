document.addEventListener('DOMContentLoaded', () => {
    const toggleSwitch = document.getElementById('toggle-switch');

    // Load initial state
    chrome.storage.local.get(['isEnabled'], (result) => {
        if (result.isEnabled !== undefined) {
            toggleSwitch.checked = result.isEnabled;
        } else {
            toggleSwitch.checked = true;
        }
    });

    // Listen for toggle changes
    toggleSwitch.addEventListener('change', (e) => {
        const isEnabled = e.target.checked;
        chrome.storage.local.set({ isEnabled: isEnabled });

        // Broadcast to all valid tabs
        chrome.tabs.query({ url: ["*://*.x.com/*", "*://*.twitter.com/*"] }, (tabs) => {
            for (let tab of tabs) {
                chrome.tabs.sendMessage(tab.id, {
                    action: 'toggleState',
                    isEnabled: isEnabled
                });
            }
        });
    });
});
