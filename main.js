// main.js
const { Plugin, MarkdownView, WorkspaceLeaf, Setting, PluginSettingTab, setIcon } = require('obsidian');

// Default settings
const DEFAULT_SETTINGS = {
    bracketLinkFix: true,
    whiteCanvasMode: true
};

// Debounce function
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func.apply(this, args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// CSS for bracket link fix
const BRACKET_LINK_CSS = `
/* Bracket Link Fix - Injected by Personal Plugins */
.cm-s-obsidian span.cm-link {
    color: var(--text-normal) !important;
    text-decoration: none !important;
    cursor: text !important;
}
.cm-s-obsidian span.cm-link:hover {
    color: var(--text-normal) !important;
    text-decoration: none !important;
}
.cm-s-obsidian span.cm-link.cm-link-verified {
    color: var(--text-accent) !important;
    text-decoration: none !important;
    cursor: pointer !important;
}
.cm-s-obsidian span.cm-link.cm-link-verified:hover {
    color: var(--text-accent-hover) !important;
    text-decoration: underline !important;
}
`;

// CSS for white canvas mode
const WHITE_CANVAS_CSS = `
/* White Canvas Mode - Injected by Personal Plugins */
body:not(.is-mobile).theme-dark .workspace-tabs:not(.mod-stacked) .view-content.light-mode-active:not(.vignette-radial, .vignette-linear, .animate, .ptm-fullscreen-writing-focus-element) {
    background-color: #fff !important;
    border-top-left-radius: var(--card-border-radius-dark, 8px) !important;
    border-top-right-radius: var(--card-border-radius-dark, 8px) !important;
}
body:not(.is-mobile).theme-dark .workspace-tabs:not(.mod-stacked) .view-content.light-mode-active:not(.vignette-radial, .vignette-linear, .animate, .ptm-fullscreen-writing-focus-element) .cm-content {
    color: rgb(76, 76, 76);
}
body.theme-dark .view-content.light-mode-active .inline-title {
    color: rgb(76, 76, 76);
}
body .view-content.light-mode-active .markdown-source-view.mod-cm6 .cm-content {
    caret-color: var(--color-base-25);
}
`;

// Base class for plugin modules
class PluginModule {
    constructor(plugin) {
        this.plugin = plugin;
        this.app = plugin.app;
        this.enabled = false;
    }

    async enable() {
        if (this.enabled) return;
        this.enabled = true;
        await this.onEnable();
    }

    async disable() {
        if (!this.enabled) return;
        this.enabled = false;
        await this.onDisable();
    }

    async onEnable() {
        // Override in subclasses
    }

    async onDisable() {
        // Override in subclasses
    }
}

// Bracket Link Fix Module
class BracketLinkFixModule extends PluginModule {
    constructor(plugin) {
        super(plugin);
        this.styleEl = null;
        this.observer = null;
        this.debouncedApplyFix = null;
    }

    async onEnable() {
        // Inject CSS
        this.styleEl = document.createElement('style');
        this.styleEl.setAttribute('type', 'text/css');
        this.styleEl.textContent = BRACKET_LINK_CSS;
        document.head.appendChild(this.styleEl);

        // Initialize debounced functions
        this.debouncedApplyFix = debounce(this.applyFix.bind(this), 100);

        // Setup observer
        this.setupObserverAndApplyInitialFix();
        
        // Register events
        this.plugin.registerEvent(
            this.app.workspace.on('active-leaf-change', (leaf) => {
                if (leaf && leaf.view instanceof MarkdownView) {
                    this.setupObserverAndApplyInitialFix();
                } else {
                    this.disconnectObserver();
                }
            })
        );
    }

    async onDisable() {
        this.disconnectObserver();
        
        if (this.styleEl) {
            this.styleEl.remove();
            this.styleEl = null;
        }
    }

    disconnectObserver() {
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }
    }

    setupObserverAndApplyInitialFix() {
        this.disconnectObserver();
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!activeView?.editor?.cm?.contentDOM) return;
        
        const targetNode = activeView.editor.cm.contentDOM;
        if (targetNode) {
            const config = { childList: true, subtree: true };
            const callback = () => {
                this.debouncedApplyFix(targetNode);
            };
            this.observer = new MutationObserver(callback);
            this.observer.observe(targetNode, config);
            this.applyFix(targetNode);
        }
    }

    applyFix(targetElement) {
        if (!targetElement) return;
        
        const potentialLinks = targetElement.querySelectorAll('span.cm-link');
        let verifiedCount = 0;
        let revertedCount = 0;

        potentialLinks.forEach(span => {
            let nextNode = span.nextSibling;
            let isActualLinkSyntax = false;

            while (nextNode && nextNode.nodeType === Node.TEXT_NODE && nextNode.textContent.trim() === '') {
                nextNode = nextNode.nextSibling;
            }

            if (nextNode && nextNode.nodeType === Node.TEXT_NODE && nextNode.textContent.startsWith('(')) {
                isActualLinkSyntax = true;
            }

            if (isActualLinkSyntax) {
                if (!span.classList.contains('cm-link-verified')) {
                    span.classList.add('cm-link-verified');
                    verifiedCount++;
                }
            } else {
                if (span.classList.contains('cm-link-verified')) {
                    span.classList.remove('cm-link-verified');
                    revertedCount++;
                }
            }
        });
    }
}

// White Canvas Mode Module
class WhiteCanvasModeModule extends PluginModule {
    constructor(plugin) {
        super(plugin);
        this.styleEl = null;
        this.activeLeaves = new Set();
    }

    async onEnable() {
        // Inject CSS
        this.styleEl = document.createElement('style');
        this.styleEl.setAttribute('type', 'text/css');
        this.styleEl.id = 'white-canvas-mode-styles';
        this.styleEl.textContent = WHITE_CANVAS_CSS;
        document.head.appendChild(this.styleEl);

        // Add buttons to existing tabs
        this.addButtonToExistingTabs();

        // Register events
        this.plugin.registerEvent(
            this.app.workspace.on('layout-change', () => {
                this.addButtonToExistingTabs();
            })
        );
    }

    async onDisable() {
        this.removeAllButtons();
        
        if (this.styleEl) {
            this.styleEl.remove();
            this.styleEl = null;
        }
    }

    addButtonToExistingTabs() {
        const leaves = this.app.workspace.getLeavesOfType('markdown');
        
        leaves.forEach(leaf => {
            if (!this.activeLeaves.has(leaf)) {
                this.addButtonToTab(leaf);
                this.activeLeaves.add(leaf);
            }
        });
    }

    addButtonToTab(leaf) {
        const view = leaf.view;
        if (!view || !view.containerEl) return;

        // Look for the view actions area (where edit/reader mode toggle is)
        const viewActions = view.containerEl.querySelector('.view-actions');
        if (!viewActions) return;
        
        // Check if button already exists
        if (viewActions.querySelector('.light-mode-toggle')) return;
        
        // Create the button element. Using 'a' is common for view actions in Obsidian.
        const button = document.createElement('a');
        // 'view-action' is the standard class for styling. We add our own for querying.
        button.className = 'clickable-icon view-action light-mode-toggle';
        button.setAttribute('aria-label', 'Toggle white canvas mode for this note');
        
        // Use Obsidian's built-in 'setIcon' function to add the icon.
        // This avoids manually embedding SVG strings and is the recommended approach.
        setIcon(button, 'sun-moon');
        
        button.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.toggleWhiteCanvas(leaf, button);
        });
        
        // Add button to view actions
        viewActions.prepend(button);
    }

    toggleWhiteCanvas(leaf, button) {
        const view = leaf.view;
        if (!view || !view.containerEl) return;

        const viewContent = view.containerEl.querySelector('.view-content');
        if (!viewContent) return;

        // .toggle() returns true if the class is now present, and false if it was removed.
        const isNowActive = viewContent.classList.toggle('light-mode-active');
        
        // Sync the button's appearance and aria-label with the new state.
        // 'is-active' is the standard Obsidian class for a toggled/active state.
        button.classList.toggle('is-active', isNowActive);
        if (isNowActive) {
            button.setAttribute('aria-label', 'Disable white canvas mode for this note');
        } else {
            button.setAttribute('aria-label', 'Enable white canvas mode for this note');
        }
    }

    removeAllButtons() {
        const buttons = document.querySelectorAll('.light-mode-toggle');
        buttons.forEach(button => button.remove());
        
        const viewContents = document.querySelectorAll('.view-content.light-mode-active');
        viewContents.forEach(content => content.classList.remove('light-mode-active'));
        
        this.activeLeaves.clear();
    }
}

// Settings Tab
class CustomModulesSettingTab extends PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display() {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h2', { text: 'Custom Modules Settings' });

        // Bracket Link Fix Setting
        new Setting(containerEl)
            .setName('Bracket Link Fix')
            .setDesc('Fix bracket links to only show as links when followed by parentheses')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.bracketLinkFix)
                .onChange(async (value) => {
                    this.plugin.settings.bracketLinkFix = value;
                    await this.plugin.saveSettings();
                    await this.plugin.toggleModule('bracketLinkFix', value);
                })
            );

        // White Canvas Mode Setting
        new Setting(containerEl)
            .setName('White Canvas Mode')
            .setDesc('Add toggle buttons to tabs for white background in dark mode')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.whiteCanvasMode)
                .onChange(async (value) => {
                    this.plugin.settings.whiteCanvasMode = value;
                    await this.plugin.saveSettings();
                    await this.plugin.toggleModule('whiteCanvasMode', value);
                })
            );
    }
}

// Main Plugin Class
class CustomModulesPlugin extends Plugin {
    constructor() {
        super(...arguments);
        this.settings = DEFAULT_SETTINGS;
        this.modules = {};
    }

    async onload() {
        // Load settings
        await this.loadSettings();

        // Initialize modules
        this.modules.bracketLinkFix = new BracketLinkFixModule(this);
        this.modules.whiteCanvasMode = new WhiteCanvasModeModule(this);

        // Add settings tab
        this.addSettingTab(new CustomModulesSettingTab(this.app, this));

        // Enable modules based on settings
        this.app.workspace.onLayoutReady(async () => {
            await this.initializeModules();
        });
    }

    async onunload() {
        // Disable all modules
        for (const module of Object.values(this.modules)) {
            await module.disable();
        }
    }

    async initializeModules() {
        for (const [key, module] of Object.entries(this.modules)) {
            if (this.settings[key]) {
                await module.enable();
            }
        }
    }

    async toggleModule(moduleKey, enabled) {
        const module = this.modules[moduleKey];
        if (!module) return;

        if (enabled) {
            await module.enable();
        } else {
            await module.disable();
        }
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}

module.exports = CustomModulesPlugin;