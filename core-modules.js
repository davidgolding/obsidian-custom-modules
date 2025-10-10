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

// Title Case Conversion Module
class TitleCaseModule extends PluginModule {
    constructor(plugin) {
        super(plugin);
        this.id = 'core-title-case';
        this.name = 'Title Case Conversion';
        this.description = 'Convert selected text to title case using various style guides (NLP-enhanced)';
        this.styleGuide = 'Chicago';
        this.nlp = null; // Will be loaded on enable

        // Word classification lists based on title-rules.pdf
        this.articles = new Set(['a', 'an', 'the']);

        this.coordinatingConjunctions = new Set(['and', 'but', 'for', 'nor', 'or', 'yet', 'so']);

        this.subordinatingConjunctions = new Set([
            'as', 'if', 'because', 'when', 'whenever', 'while', 'where', 'whereas',
            'although', 'though', 'unless', 'until', 'since', 'after', 'before',
            'that', 'whether', 'once', 'lest', 'provided', 'supposing'
        ]);

        // Prepositions grouped by length
        this.prepositions1 = new Set(['v']);
        this.prepositions2 = new Set(['at', 'by', 'in', 'of', 'on', 'to', 'up']);
        this.prepositions3 = new Set(['for', 'off', 'out', 'via', 'per', 'pro', 'bar', 'qua', 'mid']);
        this.prepositions4 = new Set(['from', 'into', 'unto', 'with', 'amid', 'atop', 'down', 'like', 'near', 'next', 'over', 'past', 'plus', 'sans', 'save', 'than', 'thru']);
        this.prepositions5Plus = new Set([
            'about', 'above', 'across', 'after', 'against', 'along', 'among', 'around',
            'before', 'behind', 'below', 'beneath', 'beside', 'besides', 'between',
            'beyond', 'during', 'except', 'inside', 'outside', 'through', 'throughout',
            'toward', 'towards', 'under', 'underneath', 'unlike', 'until', 'within',
            'without', 'aboard', 'absent', 'across', 'according', 'alongside', 'amidst',
            'amongst', 'around', 'aslant', 'astride', 'barring', 'beside', 'besides',
            'betwixt', 'circa', 'concerning', 'considering', 'despite', 'excluding',
            'failing', 'following', 'given', 'including', 'notwithstanding', 'opposite',
            'pending', 'regarding', 'respecting', 'round', 'saving', 'touching', 'versus'
        ]);

        // NYT specific always-lowercase words
        this.nytLowercaseWords = new Set([
            'a', 'and', 'as', 'at', 'but', 'by', 'en', 'for', 'if', 'in', 'of', 'on',
            'or', 'the', 'to', 'v.', 'vs.', 'via'
        ]);

        // NYT specific always-capitalize words (when short)
        this.nytCapitalizeWords = new Set(['no', 'nor', 'not', 'off', 'out', 'so', 'up']);
    }

    async onEnable() {
        const settings = this.getSettings();
        this.styleGuide = settings.styleGuide || 'Chicago';

        // Load Compromise NLP library
        try {
            const path = require('path');
            const fs = require('fs');
            const compromisePath = path.join(this.plugin.manifest.dir, 'compromise.min.js');

            if (await this.app.vault.adapter.exists(compromisePath)) {
                const compromiseCode = await this.app.vault.adapter.read(compromisePath);
                // Execute compromise in a sandboxed context
                const compromiseModule = { exports: {} };
                const fn = new Function('module', 'exports', compromiseCode);
                fn(compromiseModule, compromiseModule.exports);
                this.nlp = compromiseModule.exports;
                console.log('Compromise NLP loaded successfully');
            } else {
                console.warn('Compromise library not found, falling back to heuristics');
                this.nlp = null;
            }
        } catch (error) {
            console.error('Failed to load Compromise NLP:', error);
            this.nlp = null;
        }

        // Register context menu event
        this.plugin.registerEvent(
            this.app.workspace.on('editor-menu', (menu, editor, view) => {
                // Only show if text is selected
                if (editor.somethingSelected()) {
                    menu.addItem((item) => {
                        item
                            .setTitle('Convert to title case...')
                            .setIcon('heading')
                            .onClick(() => {
                                this.convertSelectionToTitleCase(editor);
                            });
                    });
                }
            })
        );
    }

    async onDisable() {
        // Cleanup handled by plugin framework
    }

    convertSelectionToTitleCase(editor) {
        const selectedText = editor.getSelection();
        if (!selectedText) return;

        const titleCased = this.toTitleCase(selectedText, this.styleGuide);
        editor.replaceSelection(titleCased);
    }

    toTitleCase(text, style) {
        // Split into words while preserving punctuation and whitespace
        const tokens = this.tokenize(text);
        const result = [];

        for (let i = 0; i < tokens.length; i++) {
            const token = tokens[i];

            // Skip whitespace and punctuation
            if (!token.word) {
                result.push(token.original);
                continue;
            }

            const word = token.word;
            const lowerWord = word.toLowerCase();
            const isFirst = token.isFirstWord;
            const isLast = token.isLastWord;
            const afterColon = token.afterColon;
            const grammaticalFunction = token.grammaticalFunction;
            const posTag = token.posTag;

            // Apply style-specific rules
            const capitalized = this.applyStyleRules(
                word, lowerWord, isFirst, isLast, afterColon, style, grammaticalFunction, posTag
            );

            result.push(capitalized);
        }

        return result.join('');
    }

    tokenize(text) {
        const tokens = [];
        const regex = /([^\s\-—–]+)/g;
        let match;
        let lastIndex = 0;
        let wordIndex = 0;
        let totalWords = (text.match(regex) || []).length;
        let previousWasColon = false;

        // Use NLP to analyze the entire text if available
        let nlpDoc = null;
        let nlpTerms = [];
        if (this.nlp) {
            try {
                nlpDoc = this.nlp(text);
                nlpTerms = nlpDoc.terms().out('array');
            } catch (error) {
                console.warn('NLP analysis failed, falling back to heuristics:', error);
            }
        }

        let nlpIndex = 0;

        while ((match = regex.exec(text)) !== null) {
            // Add any whitespace/punctuation before this word
            if (match.index > lastIndex) {
                const between = text.substring(lastIndex, match.index);
                tokens.push({ original: between, word: null });
                // Check if it contains a colon
                if (between.includes(':')) {
                    previousWasColon = true;
                }
            }

            // Get POS tag from NLP if available
            let posTag = null;
            let grammaticalFunction = null;
            if (nlpDoc && nlpIndex < nlpTerms.length) {
                try {
                    const term = nlpDoc.terms().eq(nlpIndex);
                    posTag = this.getPOSTag(term);
                    grammaticalFunction = this.determineGrammaticalFunction(match[0], term, posTag);
                } catch (error) {
                    // Silently fall back to heuristics
                }
                nlpIndex++;
            }

            // Add the word
            tokens.push({
                original: match[0],
                word: match[0],
                isFirstWord: wordIndex === 0,
                isLastWord: wordIndex === totalWords - 1,
                afterColon: previousWasColon,
                posTag: posTag,
                grammaticalFunction: grammaticalFunction
            });

            previousWasColon = false;
            wordIndex++;
            lastIndex = regex.lastIndex;
        }

        // Add any remaining text
        if (lastIndex < text.length) {
            tokens.push({ original: text.substring(lastIndex), word: null });
        }

        return tokens;
    }

    getPOSTag(term) {
        // Extract POS tag from Compromise term
        if (term.has('#Verb')) return 'verb';
        if (term.has('#Noun')) return 'noun';
        if (term.has('#Adjective')) return 'adjective';
        if (term.has('#Adverb')) return 'adverb';
        if (term.has('#Preposition')) return 'preposition';
        if (term.has('#Conjunction')) return 'conjunction';
        if (term.has('#Article')) return 'article';
        if (term.has('#Pronoun')) return 'pronoun';
        return null;
    }

    determineGrammaticalFunction(word, term, posTag) {
        const lowerWord = word.toLowerCase();

        // Specific detection for ambiguous words
        if (['in', 'out', 'up', 'on', 'off', 'down', 'by', 'over'].includes(lowerWord)) {
            if (posTag === 'adverb') return 'adverb';
            if (posTag === 'verb') return 'verb';
            if (posTag === 'preposition') return 'preposition';

            // Check if part of phrasal verb
            if (term.has('#PhrasalVerb')) return 'adverb';
        }

        // Letter/acronym detection (e.g., "A to Z")
        if (lowerWord === 'a' && word.length === 1) {
            if (posTag === 'noun' || term.has('#Acronym')) return 'noun';
            if (posTag === 'article') return 'article';
        }

        // Infinitive detection
        if (lowerWord === 'to') {
            // Check if followed by a verb
            const nextTerm = term.next();
            if (nextTerm && nextTerm.has('#Verb')) {
                return 'infinitive';
            }
            if (posTag === 'preposition') return 'preposition';
        }

        // Return the detected POS tag as the function
        return posTag;
    }

    applyStyleRules(word, lowerWord, isFirst, isLast, afterColon, style, grammaticalFunction, posTag) {
        // Handle hyphenated words
        if (word.includes('-')) {
            return this.handleHyphenatedWord(word, isFirst, isLast, style);
        }

        // Always capitalize first word
        if (isFirst) {
            return this.capitalize(word);
        }

        // Style-specific handling of last word
        const capitalizeLastWord = !['AMA', 'APA', 'Bluebook'].includes(style);
        if (isLast && capitalizeLastWord) {
            return this.capitalize(word);
        }

        // APA: Capitalize first word after colon
        if (afterColon && style === 'APA') {
            return this.capitalize(word);
        }

        // NLP-enhanced rules: Use grammatical function when available
        if (grammaticalFunction) {
            const nlpResult = this.applyNLPAwareRules(word, lowerWord, grammaticalFunction, posTag, style);
            if (nlpResult !== null) {
                return nlpResult;
            }
        }

        // Apply style-specific rules (fallback to heuristics)
        switch (style) {
            case 'AMA':
                return this.applyAMARules(word, lowerWord);
            case 'AP':
                return this.applyAPRules(word, lowerWord);
            case 'APA':
                return this.applyAPARules(word, lowerWord);
            case 'Bluebook':
                return this.applyBluebookRules(word, lowerWord);
            case 'Chicago':
                return this.applyChicagoRules(word, lowerWord);
            case 'MLA':
                return this.applyMLARules(word, lowerWord);
            case 'New York Times':
                return this.applyNYTRules(word, lowerWord);
            case 'Wikipedia':
                return this.applyWikipediaRules(word, lowerWord);
            default:
                return this.capitalize(word);
        }
    }

    applyNLPAwareRules(word, lowerWord, grammaticalFunction, posTag, style) {
        // Handle ambiguous words based on their detected grammatical function

        // Verbs, nouns, adjectives, adverbs, pronouns are always capitalized
        if (['verb', 'noun', 'adjective', 'adverb', 'pronoun'].includes(grammaticalFunction)) {
            return this.capitalize(word);
        }

        // Articles are always lowercased
        if (grammaticalFunction === 'article') {
            return lowerWord;
        }

        // Infinitives: "to" before a verb
        if (grammaticalFunction === 'infinitive') {
            // AP style capitalizes "to" in infinitives, others lowercase it
            return style === 'AP' ? this.capitalize(word) : lowerWord;
        }

        // Conjunctions
        if (grammaticalFunction === 'conjunction') {
            // Coordinating conjunctions handling
            if (this.coordinatingConjunctions.has(lowerWord)) {
                // Chicago capitalizes "yet" and "so"
                if (style === 'Chicago' && ['yet', 'so'].includes(lowerWord)) {
                    return this.capitalize(word);
                }
                // NYT capitalizes "so" and "nor"
                if (style === 'New York Times' && ['so', 'nor'].includes(lowerWord)) {
                    return this.capitalize(word);
                }
                // All styles lowercase other coordinating conjunctions
                return lowerWord;
            }

            // Subordinating conjunctions
            if (this.subordinatingConjunctions.has(lowerWord)) {
                // AMA, Bluebook, Chicago, MLA, Wikipedia capitalize subordinating conjunctions
                if (['AMA', 'Bluebook', 'Chicago', 'MLA', 'Wikipedia'].includes(style)) {
                    // Exception: Chicago always lowercases "as"
                    if (style === 'Chicago' && lowerWord === 'as') {
                        return lowerWord;
                    }
                    return this.capitalize(word);
                }
                // AP, APA, NYT lowercase short subordinating conjunctions
                if (['AP', 'APA', 'New York Times'].includes(style) && word.length <= 3) {
                    return lowerWord;
                }
                return this.capitalize(word);
            }
        }

        // Prepositions: Style-specific rules based on length
        if (grammaticalFunction === 'preposition') {
            return this.applyPrepositionRules(word, lowerWord, style);
        }

        // If we couldn't determine a clear rule, return null to fall back to heuristics
        return null;
    }

    applyPrepositionRules(word, lowerWord, style) {
        const length = word.length;

        switch (style) {
            case 'AMA':
            case 'AP':
            case 'APA':
                // Lowercase prepositions of 3 or fewer letters
                return length <= 3 ? lowerWord : this.capitalize(word);

            case 'Bluebook':
            case 'Chicago':
            case 'Wikipedia':
                // Lowercase prepositions of 4 or fewer letters
                return length <= 4 ? lowerWord : this.capitalize(word);

            case 'MLA':
                // Lowercase ALL prepositions
                return lowerWord;

            case 'New York Times':
                // NYT has explicit word lists
                if (this.nytLowercaseWords.has(lowerWord)) return lowerWord;
                if (this.nytCapitalizeWords.has(lowerWord)) return this.capitalize(word);
                // Capitalize 4+ letter words
                return length >= 4 ? this.capitalize(word) : lowerWord;

            default:
                return this.capitalize(word);
        }
    }

    applyAMARules(word, lowerWord) {
        // Lowercase articles
        if (this.articles.has(lowerWord)) return lowerWord;

        // Lowercase coordinating conjunctions
        if (this.coordinatingConjunctions.has(lowerWord)) return lowerWord;

        // Lowercase prepositions of 3 or fewer letters
        if (this.isPreposition(lowerWord) && word.length <= 3) return lowerWord;

        // Lowercase "to" (infinitives)
        if (lowerWord === 'to') return lowerWord;

        // Capitalize everything else
        return this.capitalize(word);
    }

    applyAPRules(word, lowerWord) {
        // Capitalize all words of 4 or more letters
        if (word.length >= 4) return this.capitalize(word);

        // Lowercase articles
        if (this.articles.has(lowerWord)) return lowerWord;

        // Lowercase conjunctions of 3 letters or fewer
        if (this.coordinatingConjunctions.has(lowerWord) && word.length <= 3) return lowerWord;
        if (this.subordinatingConjunctions.has(lowerWord) && word.length <= 3) return lowerWord;

        // Lowercase prepositions of 3 letters or fewer (but capitalize "to" in infinitives)
        if (this.isPreposition(lowerWord) && word.length <= 3 && lowerWord !== 'to') return lowerWord;

        // Capitalize "to" in infinitives (and other 2-3 letter words not caught above)
        return this.capitalize(word);
    }

    applyAPARules(word, lowerWord) {
        // Capitalize all words of 4 or more letters
        if (word.length >= 4) return this.capitalize(word);

        // Lowercase articles
        if (this.articles.has(lowerWord)) return lowerWord;

        // Lowercase conjunctions of 3 letters or fewer
        if (this.coordinatingConjunctions.has(lowerWord)) return lowerWord;
        if (this.subordinatingConjunctions.has(lowerWord) && word.length <= 3) return lowerWord;

        // Lowercase prepositions of 3 letters or fewer
        if (this.isPreposition(lowerWord) && word.length <= 3) return lowerWord;

        // Capitalize nouns, verbs, adjectives, adverbs, pronouns
        return this.capitalize(word);
    }

    applyBluebookRules(word, lowerWord) {
        // Lowercase articles
        if (this.articles.has(lowerWord)) return lowerWord;

        // Lowercase conjunctions of 4 letters or fewer
        if (this.coordinatingConjunctions.has(lowerWord)) return lowerWord;
        // Note: Bluebook capitalizes subordinating conjunctions like "if"

        // Lowercase prepositions of 4 letters or fewer
        if (this.isPreposition(lowerWord) && word.length <= 4) return lowerWord;

        // Capitalize everything else
        return this.capitalize(word);
    }

    applyChicagoRules(word, lowerWord) {
        // Lowercase articles
        if (this.articles.has(lowerWord)) return lowerWord;

        // Lowercase specific coordinating conjunctions: and, but, for, nor, or
        if (['and', 'but', 'for', 'nor', 'or'].includes(lowerWord)) return lowerWord;

        // Always lowercase "as"
        if (lowerWord === 'as') return lowerWord;

        // Lowercase "to" in infinitives
        if (lowerWord === 'to') return lowerWord;

        // Lowercase prepositions of 4 letters or fewer
        if (this.isPreposition(lowerWord) && word.length <= 4) return lowerWord;

        // Capitalize everything else (including "yet" and "so")
        return this.capitalize(word);
    }

    applyMLARules(word, lowerWord) {
        // Lowercase articles
        if (this.articles.has(lowerWord)) return lowerWord;

        // Lowercase coordinating conjunctions
        if (this.coordinatingConjunctions.has(lowerWord)) return lowerWord;

        // Lowercase ALL prepositions regardless of length
        if (this.isPreposition(lowerWord)) return lowerWord;

        // Lowercase "to" in infinitives
        if (lowerWord === 'to') return lowerWord;

        // Capitalize subordinating conjunctions, nouns, verbs, adjectives, adverbs, pronouns
        return this.capitalize(word);
    }

    applyNYTRules(word, lowerWord) {
        // Capitalize all words of 4 or more letters
        if (word.length >= 4) return this.capitalize(word);

        // Capitalize specific short words
        if (this.nytCapitalizeWords.has(lowerWord)) return this.capitalize(word);

        // Lowercase specific words
        if (this.nytLowercaseWords.has(lowerWord)) return lowerWord;
        if (lowerWord === 'v.' || lowerWord === 'vs.') return lowerWord;

        // Capitalize everything else (nouns, pronouns, verbs)
        return this.capitalize(word);
    }

    applyWikipediaRules(word, lowerWord) {
        // Lowercase articles
        if (this.articles.has(lowerWord)) return lowerWord;

        // Lowercase coordinating conjunctions
        if (this.coordinatingConjunctions.has(lowerWord)) return lowerWord;

        // Lowercase prepositions of 4 letters or fewer
        if (this.isPreposition(lowerWord) && word.length <= 4) return lowerWord;

        // Lowercase "to" in infinitives
        if (lowerWord === 'to') return lowerWord;

        // Capitalize subordinating conjunctions, nouns, verbs, adjectives, adverbs, pronouns
        // Capitalize prepositions of 5 or more letters
        return this.capitalize(word);
    }

    isPreposition(lowerWord) {
        return this.prepositions1.has(lowerWord) ||
               this.prepositions2.has(lowerWord) ||
               this.prepositions3.has(lowerWord) ||
               this.prepositions4.has(lowerWord) ||
               this.prepositions5Plus.has(lowerWord);
    }

    handleHyphenatedWord(word, isFirst, isLast, style) {
        const parts = word.split('-');
        const capitalizedParts = parts.map((part, index) => {
            const lowerPart = part.toLowerCase();

            // First part is always capitalized if it's the first word
            if (index === 0 && isFirst) {
                return this.capitalize(part);
            }

            // Style-specific hyphenation rules
            switch (style) {
                case 'AMA':
                    // Capitalize both parts
                    return this.capitalize(part);

                case 'Chicago':
                    // Capitalize first element and subsequent words that are not articles, prepositions, or coordinating conjunctions
                    if (index === 0) return this.capitalize(part);
                    if (this.articles.has(lowerPart)) return lowerPart;
                    if (this.coordinatingConjunctions.has(lowerPart)) return lowerPart;
                    if (this.isPreposition(lowerPart)) return lowerPart;
                    return this.capitalize(part);

                case 'APA':
                    // Capitalize the second part of hyphenated major words
                    if (index === 0) return this.capitalize(part);
                    return this.capitalize(part);

                case 'MLA':
                    // Capitalize principal words that follow hyphens
                    if (this.articles.has(lowerPart)) return lowerPart;
                    if (this.coordinatingConjunctions.has(lowerPart)) return lowerPart;
                    if (this.isPreposition(lowerPart)) return lowerPart;
                    return this.capitalize(part);

                default:
                    // Default: capitalize all parts
                    return this.capitalize(part);
            }
        });

        return capitalizedParts.join('-');
    }

    capitalize(word) {
        if (!word) return word;
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    }

    addSettings(containerEl) {
        const settings = this.getSettings();

        new Setting(containerEl)
            .setName('Title Case Style')
            .setDesc('Select the style guide to use for title case conversion')
            .addDropdown(dropdown => dropdown
                .addOption('AMA', 'AMA (American Medical Association)')
                .addOption('AP', 'AP (Associated Press)')
                .addOption('APA', 'APA (American Psychological Association)')
                .addOption('Bluebook', 'Bluebook (Legal Citation)')
                .addOption('Chicago', 'Chicago Manual of Style')
                .addOption('MLA', 'MLA (Modern Language Association)')
                .addOption('New York Times', 'New York Times')
                .addOption('Wikipedia', 'Wikipedia')
                .setValue(settings.styleGuide || 'Chicago')
                .onChange(async (value) => {
                    this.styleGuide = value;
                    await this.saveSettings({ ...settings, styleGuide: value });
                })
            );
    }
}

// Export all core modules
module.exports = {
    modules: [
        BracketLinkFixModule,
        WhiteCanvasModeModule,
        SmartifyQuotesModule,
        BulkCreateModule,
        DynamicPaddingModule,
        TitleCaseModule
    ]
};
