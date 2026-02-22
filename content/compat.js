// Cross-browser API compatibility: Firefox uses `browser`, Chrome uses `chrome`
const api = typeof browser !== 'undefined' ? browser : chrome;
