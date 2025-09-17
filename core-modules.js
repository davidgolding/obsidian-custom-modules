// core-modules.js - Built-in modules that ship with the plugin
// The 'obsidian' and 'PluginModule' objects are now injected by the module loader.
const { MarkdownView, Notice, setIcon, Setting } = obsidian;

// Utility: Debounce function
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

// Bracket Link Fix Module
class BracketLinkFixModule extends PluginModule {
    constructor(plugin) {
        super(plugin);
        this.id = 'core-bracket-link-fix';
        this.name = 'Bracket Link Fix';
        this.description = 'Fix bracket links to only show as links when followed by parentheses';
        this.styleEl = null;
        this.observer = null;
        this.debouncedApplyFix = null;
    }

    async onEnable() {
        const css = `
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

        // Inject CSS
        this.styleEl = document.createElement('style');
        this.styleEl.setAttribute('type', 'text/css');
        this.styleEl.textContent = css;
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
        this.id = 'core-white-canvas-mode';
        this.name = 'White Canvas Mode';
        this.description = 'Add toggle buttons to tabs for white background in dark mode';
        this.styleEl = null;
        this.activeLeaves = new Set();
    }

    async onEnable() {
        const css = `
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

        // Inject CSS
        this.styleEl = document.createElement('style');
        this.styleEl.setAttribute('type', 'text/css');
        this.styleEl.id = 'white-canvas-mode-styles';
        this.styleEl.textContent = css;
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

        const viewActions = view.containerEl.querySelector('.view-actions');
        if (!viewActions) return;
        
        if (viewActions.querySelector('.light-mode-toggle')) return;
        
        const button = document.createElement('a');
        button.className = 'clickable-icon view-action light-mode-toggle';
        button.setAttribute('aria-label', 'Toggle white canvas mode for this note');
        
        setIcon(button, 'sun-moon');
        
        button.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.toggleWhiteCanvas(leaf, button);
        });
        
        viewActions.prepend(button);
    }

    toggleWhiteCanvas(leaf, button) {
        const view = leaf.view;
        if (!view || !view.containerEl) return;

        const viewContent = view.containerEl.querySelector('.view-content');
        if (!viewContent) return;

        const isNowActive = viewContent.classList.toggle('light-mode-active');
        
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

// Smartify Quotes Module
class SmartifyQuotesModule extends PluginModule {
    constructor(plugin) {
        super(plugin);
        this.id = 'core-smartify-quotes';
        this.name = 'Smartify Quotes';
        this.description = 'Add button to convert straight quotes to smart quotes';
        this.activeLeaves = new Set();
    }

    async onEnable() {
        this.addButtonToExistingTabs();
        this.plugin.registerEvent(
            this.app.workspace.on('layout-change', () => {
                this.addButtonToExistingTabs();
            })
        );
    }

    async onDisable() {
        this.removeAllButtons();
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

        const viewActions = view.containerEl.querySelector('.view-actions');
        if (!viewActions) return;

        if (viewActions.querySelector('.smartify-quotes')) return;

        const button = document.createElement('a');
        button.className = 'clickable-icon view-action smartify-quotes';
        button.setAttribute('aria-label', 'Convert simple quotes to smart quotes');

        setIcon(button, 'quote');

        button.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.convertToSmartQuotes(view);
        });

        viewActions.prepend(button);
    }

    convertToSmartQuotes(view) {
        if (!view || view.getViewType() !== 'markdown') return;

        const editor = view.editor;
        if (!editor) return;

        const content = editor.getValue();
        const convertedContent = this.processSmartQuotes(content);

        if (content !== convertedContent) {
            editor.setValue(convertedContent);
        }
    }

    processSmartQuotes(text) {
        const parts = [];
        const codeBlockRegex = /```[\s\S]*?```/g;
        let lastIndex = 0;
        let match;

        while ((match = codeBlockRegex.exec(text)) !== null) {
            if (match.index > lastIndex) {
                parts.push({
                    text: text.slice(lastIndex, match.index),
                    isCodeBlock: false
                });
            }

            parts.push({
                text: match[0],
                isCodeBlock: true
            });

            lastIndex = match.index + match[0].length;
        }

        if (lastIndex < text.length) {
            parts.push({
                text: text.slice(lastIndex),
                isCodeBlock: false
            });
        }

        return parts.map(part => {
            if (part.isCodeBlock) {
                return part.text;
            }
            return this.convertQuotesInText(part.text);
        }).join('');
    }

    convertQuotesInText(text) {
        return text
            .replace(/(^|\s|--|—|\[|\()"(\S)/g, '$1“$2') // Opening double quote
            .replace(/(\S)"/g, '$1”') // Closing double quote
            .replace(/(\w)'(\w)/g, '$1’$2') // Apostrophe within a word
            .replace(/(^|\s|--|—|\[|\()'(\S)/g, '$1‘$2') // Opening single quote
            .replace(/'/g, '’'); // Closing single quote / apostrophe
    }

    removeAllButtons() {
        const buttons = document.querySelectorAll('.smartify-quotes');
        buttons.forEach(button => button.remove());
        this.activeLeaves.clear();
    }
}

// Bulk Create Module
class BulkCreateModule extends PluginModule {
    constructor(plugin) {
        super(plugin);
        this.id = 'core-bulk-create';
        this.name = 'Bulk Create Notes';
        this.description = 'Detect inactive links and create new notes for them';
        this.activeLeaves = new Set();
    }

    async onEnable() {
        this.addButtonToExistingTabs();
        this.plugin.registerEvent(
            this.app.workspace.on('layout-change', () => {
                this.addButtonToExistingTabs();
            })
        );
    }

    async onDisable() {
        this.removeAllButtons();
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

        const viewActions = view.containerEl.querySelector('.view-actions');
        if (!viewActions) return;

        if (viewActions.querySelector('.bulk-create')) return;

        const button = document.createElement('a');
        button.className = 'clickable-icon view-action bulk-create';
        button.setAttribute('aria-label', 'Create new notes from any inactive links');

        setIcon(button, 'file-stack');

        button.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.bulkCreateNotes(view);
            
            this.app.workspace.getLeavesOfType('file-explorer').forEach(leaf => {
                if (leaf.view && leaf.view.requestSort) {
                    leaf.view.requestSort();
                }
            });
            
            const activeLeaf = this.app.workspace.activeLeaf;
            if (activeLeaf && activeLeaf.view.editor) {
                activeLeaf.view.editor.refresh();
            }
            
            this.app.metadataCache.trigger('changed');
        });

        viewActions.prepend(button);
    }

    async bulkCreateNotes(view) {
        if (!view || view.getViewType() !== 'markdown') return;

        const editor = view.editor;
        if (!editor) return;

        const content = editor.getValue();
        const result = await this.processBulkCreate(content);
    }
    
    async processBulkCreate(content) {
        const linkRegex = /[[^]]+?(?:|[^]]+)?]]/g;
        const matches = content.matchAll(linkRegex);
        
        const createdFiles = [];
        const skippedFiles = [];
        
        for (const match of matches) {
            const linkText = match[1].trim();
            
            if (!linkText) continue;
            
            const existingFile = this.app.metadataCache.getFirstLinkpathDest(linkText, '');
            
            if (!existingFile) {
                try {
                    const filePath = await this.getNewNotePath(linkText);
                    
                    await this.app.vault.create(filePath, '');
                    
                    createdFiles.push(linkText);
                } catch (error) {
                    console.error(`Failed to create note for link: ${linkText}`, error);
                    skippedFiles.push(linkText);
                }
            }
        }
        
        if (createdFiles.length > 0) {
            new Notice(`Created ${createdFiles.length} new note(s): ${createdFiles.join(', ')}`);
        }
        
        if (skippedFiles.length > 0) {
            new Notice(`Failed to create ${skippedFiles.length} note(s): ${skippedFiles.join(', ')}`);
        }
        
        if (createdFiles.length === 0 && skippedFiles.length === 0) {
            new Notice('No inactive links found to create.');
        }
    }
    
    async getNewNotePath(linkText) {
        const newFileLocation = this.app.vault.getConfig('newFileLocation') || 'root';
        const newFileFolderPath = this.app.vault.getConfig('newFileFolderPath') || '';
        
        let folderPath = '';
        
        switch (newFileLocation) {
            case 'current':
                const activeFile = this.app.workspace.getActiveFile();
                if (activeFile) {
                    folderPath = activeFile.parent?.path || '';
                }
                break;
            case 'folder':
                folderPath = newFileFolderPath;
                break;
            case 'root':
            default:
                folderPath = '';
                break;
        }
        
        if (folderPath && !await this.app.vault.adapter.exists(folderPath)) {
            await this.app.vault.createFolder(folderPath);
        }
        
        const fileName = `${linkText}.md`;
        const fullPath = folderPath ? `${folderPath}/${fileName}` : fileName;
        
        let finalPath = fullPath;
        let counter = 1;
        
        while (await this.app.vault.adapter.exists(finalPath)) {
            const baseName = linkText;
            const conflictFileName = `${baseName} ${counter}.md`;
            finalPath = folderPath ? `${folderPath}/${conflictFileName}` : conflictFileName;
            counter++;
        }
        
        return finalPath;
    }

    removeAllButtons() {
        const buttons = document.querySelectorAll('.bulk-create');
        buttons.forEach(button => button.remove());
        this.activeLeaves.clear();
    }
}

// Export all core modules
module.exports = {
    modules: [
        BracketLinkFixModule,
        WhiteCanvasModeModule,
        SmartifyQuotesModule,
        BulkCreateModule
    ]
};

// Dynamic Padding Module
class DynamicPaddingModule extends PluginModule {
    constructor(plugin) {
        super(plugin);
        this.id = 'core-dynamic-padding';
        this.name = 'Dynamic Editor Padding';
        this.description = 'Adds a configurable padding to the bottom of the editor.';
        this.observers = new WeakMap();
        this.paddingPercentage = 50;
    }

    // This extension is registered globally and checks if this module is enabled.
    createScrollFixExtension(EditorView_class) {
        const plugin = this.plugin;
        const moduleId = this.id;

        return EditorView_class.updateListener.of(update => {
            const module = plugin.registry.getModule(moduleId);
            if (!module || !module.enabled || !update.docChanged) {
                return;
            }

            const view = update.view;
            const state = update.state;
            const lastLineNumber = state.doc.lines;
            const cursorLine = state.doc.lineAt(state.selection.main.head).number;

            if (cursorLine === lastLineNumber) {
                const scrollerHeight = view.scrollDOM.clientHeight;
                // Get the live padding percentage from the module instance
                const paddingValue = scrollerHeight * (module.paddingPercentage / 100);

                view.dispatch({
                    effects: EditorView_class.scrollIntoView(state.selection.main.head, {
                        y: "end",
                        yMargin: paddingValue
                    })
                });
            }
        });
    }

    async onEnable() {
        const settings = this.getSettings();
        this.paddingPercentage = settings.paddingPercentage || 50;

        this.app.workspace.getLeavesOfType('markdown').forEach(leaf => this.setupObserverForLeaf(leaf));

        this.plugin.registerEvent(
            this.app.workspace.on('layout-change', () => {
                this.app.workspace.getLeavesOfType('markdown').forEach(leaf => this.setupObserverForLeaf(leaf));
            })
        );
        
        this.plugin.registerEvent(
            this.app.workspace.on('active-leaf-change', (leaf) => {
                if (leaf && leaf.view instanceof MarkdownView) {
                    this.setupObserverForLeaf(leaf);
                }
            })
        );
    }

    async onDisable() {
        // The global extension cannot be disabled, but it checks for module.enabled,
        // so we just need to clean up the padding here.
        this.app.workspace.getLeavesOfType('markdown').forEach(leaf => {
            if (this.observers.has(leaf)) {
                this.observers.get(leaf).disconnect();
                this.observers.delete(leaf);
            }
            this.removePadding(leaf);
        });
    }

    setupObserverForLeaf(leaf) {
        const view = leaf.view;
        if (!view || !(view instanceof MarkdownView)) return;

        // Register the global extension once we have a live editor view
        if (!this.plugin.dynamicPaddingExtensionRegistered) {
            const EditorView_class = view.editor.cm.constructor;
            this.plugin.registerEditorExtension(this.createScrollFixExtension(EditorView_class));
            this.plugin.dynamicPaddingExtensionRegistered = true;
        }

        if (this.observers.has(leaf)) {
            return; // Already set up
        }

        const scroller = view.editor.cm.scrollDOM;
        if (scroller) {
            const observer = new ResizeObserver(() => this.applyPadding(leaf));
            observer.observe(scroller);
            this.observers.set(leaf, observer);
            this.applyPadding(leaf);
        }
    }

    applyPadding(leaf) {
        const view = leaf.view;
        if (view instanceof MarkdownView) {
            const contentEl = view.editor.cm.contentDOM;
            const scrollerEl = view.editor.cm.scrollDOM;
            if (contentEl && scrollerEl) {
                const height = scrollerEl.clientHeight;
                const paddingValue = height * (this.paddingPercentage / 100);
                contentEl.style.paddingBottom = `${paddingValue}px`;
            }
        }
    }
    
    removePadding(leaf) {
        const view = leaf.view;
        if (view instanceof MarkdownView) {
            const contentEl = view.editor.cm.contentDOM;
            if (contentEl && contentEl.style.paddingBottom) {
                contentEl.style.paddingBottom = '';
            }
        }
    }

    updatePaddingPercentage(newValue) {
        this.paddingPercentage = newValue;
        this.app.workspace.getLeavesOfType('markdown').forEach(leaf => {
            this.applyPadding(leaf);
        });
    }

    addSettings(containerEl) {
        const settings = this.getSettings();
        new Setting(containerEl)
            .setName('Dynamic Editor Padding')
            .setDesc('Set the percentage of the editor height to use as bottom padding, allowing you to scroll past the end of the document.')
            .addSlider(slider => slider
                .setLimits(0, 100, 5)
                .setValue(this.paddingPercentage)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    await this.saveSettings({ ...settings, paddingPercentage: value });
                    this.updatePaddingPercentage(value);
                }));
    }
}

// Export all core modules
module.exports = {
    modules: [
        BracketLinkFixModule,
        WhiteCanvasModeModule,
        SmartifyQuotesModule,
        BulkCreateModule,
        DynamicPaddingModule
    ]
};
