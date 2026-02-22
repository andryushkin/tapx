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
