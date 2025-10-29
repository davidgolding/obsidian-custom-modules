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

// Rich Text Formatting Module
class RichTextFormattingModule extends PluginModule {
    constructor(plugin) {
        super(plugin);
        this.id = 'core-rich-text-formatting';
        this.name = 'Rich Text Formatting';
        this.description = 'Apple-style formatting toolbar for markdown editing';
        this.activeLeaves = new Set();
        this.styleEl = null;
        this.cursorMonitorInterval = null;
    }

    async onEnable() {
        // Inject CSS
        this.injectStyles();

        // Add toolbars to existing markdown views
        this.addToolbarToExistingViews();

        // Register events
        this.plugin.registerEvent(
            this.app.workspace.on('layout-change', () => {
                this.addToolbarToExistingViews();
            })
        );

        // Monitor cursor position for context updates
        this.startCursorMonitoring();
    }

    async onDisable() {
        this.removeAllToolbars();
        this.stopCursorMonitoring();

        if (this.styleEl) {
            this.styleEl.remove();
            this.styleEl = null;
        }
    }

    injectStyles() {
        const styleId = 'rich-text-formatting-styles';
        if (document.getElementById(styleId)) return;

        this.styleEl = document.createElement('style');
        this.styleEl.id = styleId;
        this.styleEl.textContent = `
/* Rich Text Formatting Toolbar - Apple-inspired design */
.rtf-toolbar {
    display: flex !important;
    align-items: center !important;
    gap: 4px !important;
    padding: 6px 12px !important;
    background: rgba(255, 255, 255, 0.95) !important;
    border-bottom: 1px solid rgba(0, 0, 0, 0.08) !important;
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, Oxygen, Ubuntu, sans-serif !important;
    backdrop-filter: blur(20px) !important;
    -webkit-backdrop-filter: blur(20px) !important;
    position: relative !important;
    z-index: 10 !important;
}

.theme-dark .rtf-toolbar {
    background: rgba(30, 30, 30, 0.95) !important;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08) !important;
}

.rtf-heading-select {
    padding: 4px 24px 4px 8px !important;
    background-color: rgba(0, 0, 0, 0.04) !important;
    border: 1px solid rgba(0, 0, 0, 0.08) !important;
    border-radius: 6px !important;
    font-size: 12px !important;
    font-weight: 500 !important;
    color: rgba(0, 0, 0, 0.85) !important;
    cursor: pointer !important;
    appearance: none !important;
    -webkit-appearance: none !important;
    -moz-appearance: none !important;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%23666' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E") !important;
    background-repeat: no-repeat !important;
    background-position: right 6px center !important;
    background-size: 10px !important;
    transition: all 0.15s ease !important;
    outline: none !important;
    min-width: 90px !important;
}

.rtf-heading-select option {
    background-color: var(--background-primary) !important;
    background-image: none !important;
    color: var(--text-normal) !important;
}

.theme-dark .rtf-heading-select {
    background-color: rgba(255, 255, 255, 0.06) !important;
    border: 1px solid rgba(255, 255, 255, 0.1) !important;
    color: rgba(255, 255, 255, 0.85) !important;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%23aaa' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E") !important;
}

.rtf-heading-select:hover {
    background: rgba(0, 0, 0, 0.06) !important;
    border-color: rgba(0, 0, 0, 0.12) !important;
}

.theme-dark .rtf-heading-select:hover {
    background: rgba(255, 255, 255, 0.08) !important;
    border-color: rgba(255, 255, 255, 0.15) !important;
}

.rtf-heading-select:focus {
    border-color: rgb(0, 122, 255) !important;
    box-shadow: 0 0 0 3px rgba(0, 122, 255, 0.15) !important;
}

.rtf-separator {
    width: 1px !important;
    height: 20px !important;
    background: rgba(0, 0, 0, 0.1) !important;
    margin: 0 4px !important;
}

.theme-dark .rtf-separator {
    background: rgba(255, 255, 255, 0.15) !important;
}

.rtf-format-btn {
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    width: 28px !important;
    height: 28px !important;
    background: transparent !important;
    border: none !important;
    border-radius: 6px !important;
    cursor: pointer !important;
    color: rgba(0, 0, 0, 0.7) !important;
    transition: all 0.15s ease !important;
    padding: 0 !important;
    position: relative !important;
}

.theme-dark .rtf-format-btn {
    color: rgba(255, 255, 255, 0.7) !important;
}

.rtf-format-btn:hover {
    background: rgba(0, 0, 0, 0.06) !important;
    color: rgba(0, 0, 0, 0.9) !important;
}

.theme-dark .rtf-format-btn:hover {
    background: rgba(255, 255, 255, 0.1) !important;
    color: rgba(255, 255, 255, 0.9) !important;
}

.rtf-format-btn:active {
    transform: scale(0.95) !important;
}

.rtf-format-btn.active {
    background: rgb(0, 122, 255) !important;
    color: white !important;
}

.theme-dark .rtf-format-btn.active {
    background: rgb(10, 132, 255) !important;
}

.rtf-format-btn.active:hover {
    background: rgb(0, 112, 245) !important;
}

.theme-dark .rtf-format-btn.active:hover {
    background: rgb(20, 142, 255) !important;
}

.rtf-format-btn svg {
    width: 16px !important;
    height: 16px !important;
    stroke-width: 2 !important;
}

/* Tooltip */
.rtf-format-btn::after {
    content: attr(aria-label) !important;
    position: absolute !important;
    bottom: -28px !important;
    left: 50% !important;
    transform: translateX(-50%) scale(0.9) !important;
    background: rgba(0, 0, 0, 0.85) !important;
    color: white !important;
    padding: 4px 8px !important;
    border-radius: 4px !important;
    font-size: 11px !important;
    font-weight: 500 !important;
    white-space: nowrap !important;
    opacity: 0 !important;
    pointer-events: none !important;
    transition: all 0.2s ease !important;
    z-index: 1000 !important;
}

.rtf-format-btn:hover::after {
    opacity: 1 !important;
    transform: translateX(-50%) scale(1) !important;
}
`;
        document.head.appendChild(this.styleEl);
    }

    addToolbarToExistingViews() {
        const leaves = this.app.workspace.getLeavesOfType('markdown');

        leaves.forEach(leaf => {
            if (!this.activeLeaves.has(leaf)) {
                this.addToolbarToView(leaf);
                this.activeLeaves.add(leaf);
            }
        });
    }

    addToolbarToView(leaf) {
        const view = leaf.view;
        if (!view || !view.containerEl) return;

        // Check if toolbar already exists
        if (view.containerEl.querySelector('.rtf-toolbar')) return;

        // Insert toolbar at the top of the view content
        const viewContent = view.containerEl.querySelector('.view-content');
        if (!viewContent) return;

        const toolbar = this.createToolbar(view);
        viewContent.prepend(toolbar);

        // Store reference for updates
        toolbar.dataset.leafId = leaf.id;
    }

    createToolbar(view) {
        const toolbar = document.createElement('div');
        toolbar.className = 'rtf-toolbar';

        // Heading select
        const headingSelect = document.createElement('select');
        headingSelect.className = 'rtf-heading-select';
        const headingOptions = [
            { value: 'body', label: 'Body' },
            { value: 'h1', label: 'Heading 1' },
            { value: 'h2', label: 'Heading 2' },
            { value: 'h3', label: 'Heading 3' },
            { value: 'h4', label: 'Heading 4' },
            { value: 'h5', label: 'Heading 5' },
            { value: 'h6', label: 'Heading 6' }
        ];

        headingOptions.forEach(opt => {
            const option = document.createElement('option');
            option.value = opt.value;
            option.textContent = opt.label;
            headingSelect.appendChild(option);
        });

        headingSelect.addEventListener('change', (e) => {
            this.applyHeading(view, e.target.value);
        });

        toolbar.appendChild(headingSelect);
        toolbar.headingSelect = headingSelect;

        // Separator
        const separator = document.createElement('div');
        separator.className = 'rtf-separator';
        toolbar.appendChild(separator);

        // Format buttons
        const formats = [
            { id: 'bold', label: 'Bold', icon: this.getLucideIcon('bold'), format: '**' },
            { id: 'italic', label: 'Italic', icon: this.getLucideIcon('italic'), format: '*' },
            { id: 'code', label: 'Code', icon: this.getLucideIcon('code'), format: '`' },
            { id: 'highlight', label: 'Highlight', icon: this.getLucideIcon('highlighter'), format: '==' },
            { id: 'strikethrough', label: 'Strikethrough', icon: this.getLucideIcon('strikethrough'), format: '~~' },
            { id: 'math', label: 'Math', icon: this.getLucideIcon('function-square'), format: '$' },
            { id: 'comment', label: 'Comment', icon: this.getLucideIcon('message-circle-off'), format: 'comment' }
        ];

        const buttons = {};
        formats.forEach(fmt => {
            const btn = document.createElement('button');
            btn.className = 'rtf-format-btn';
            btn.setAttribute('aria-label', fmt.label);
            btn.innerHTML = fmt.icon;
            btn.addEventListener('click', () => {
                this.applyFormat(view, fmt.id, fmt.format);
            });
            toolbar.appendChild(btn);
            buttons[fmt.id] = btn;
        });

        toolbar.formatButtons = buttons;

        return toolbar;
    }

    getLucideIcon(name) {
        const icons = {
            'bold': '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 12h9a4 4 0 0 1 0 8H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h7a4 4 0 0 1 0 8"/></svg>',
            'italic': '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" x2="10" y1="4" y2="4"/><line x1="14" x2="5" y1="20" y2="20"/><line x1="15" x2="9" y1="4" y2="20"/></svg>',
            'code': '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>',
            'highlighter': '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 11-6 6v3h9l3-3"/><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/></svg>',
            'strikethrough': '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4H9a3 3 0 0 0-2.83 4"/><path d="M14 12a4 4 0 0 1 0 8H6"/><line x1="4" x2="20" y1="12" y2="12"/></svg>',
            'function-square': '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><path d="M9 17c2 0 2.8-1 2.8-2.8V10c0-2 1-3.3 3.2-3"/><path d="M9 11.2h5.7"/></svg>',
            'message-circle-off': '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.5 14.9A9 9 0 0 0 9.1 3.5"/><path d="m2 2 20 20"/><path d="M5.6 5.6C3 8.3 2.2 12.5 4 16l-2 6 6-2c3.4 1.8 7.6 1.1 10.3-1.7"/></svg>'
        };
        return icons[name] || '';
    }

    startCursorMonitoring() {
        // Update context every 200ms when cursor might have moved
        this.cursorMonitorInterval = setInterval(() => {
            const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
            if (activeView) {
                this.updateToolbarContext(activeView);
            }
        }, 200);
    }

    stopCursorMonitoring() {
        if (this.cursorMonitorInterval) {
            clearInterval(this.cursorMonitorInterval);
            this.cursorMonitorInterval = null;
        }
    }

    updateToolbarContext(view) {
        const toolbar = view.containerEl.querySelector('.rtf-toolbar');
        if (!toolbar) return;

        const editor = view.editor;
        if (!editor) return;

        // Get cursor position
        const cursor = editor.getCursor();
        const line = editor.getLine(cursor.line);

        // Update heading select
        const headingMatch = line.match(/^(#{1,6})\s/);
        if (headingMatch) {
            const level = headingMatch[1].length;
            toolbar.headingSelect.value = `h${level}`;
        } else {
            toolbar.headingSelect.value = 'body';
        }

        // Get text around cursor for format detection
        const selection = editor.getSelection();
        const textToCheck = selection || this.getWordAtCursor(editor, cursor);

        // Update format button states
        const formats = {
            'bold': /\*\*.*\*\*/,
            'italic': /\*.*\*|_.*_/,
            'code': /`.*`/,
            'highlight': /==.*==/,
            'strikethrough': /~~.*~~/,
            'math': /\$.*\$/,
            'comment': /<!--.*-->/
        };

        Object.keys(formats).forEach(formatId => {
            const btn = toolbar.formatButtons?.[formatId];
            if (btn) {
                const isActive = this.isFormatActive(editor, cursor, formatId);
                btn.classList.toggle('active', isActive);
            }
        });
    }

    getWordAtCursor(editor, cursor) {
        const line = editor.getLine(cursor.line);
        const pos = cursor.ch;

        let start = pos;
        let end = pos;

        // Expand to word boundaries
        while (start > 0 && !/\s/.test(line[start - 1])) start--;
        while (end < line.length && !/\s/.test(line[end])) end++;

        return line.substring(start, end);
    }

    isFormatActive(editor, cursor, formatId) {
        const line = editor.getLine(cursor.line);
        const ch = cursor.ch;

        // Special handling for bold/italic to avoid conflicts
        if (formatId === 'bold') {
            // Check for ** markers, but also check for *** (bold+italic)
            const boldPattern = /\*\*\*([^*]+)\*\*\*|\*\*([^*]+)\*\*/g;
            let match;
            while ((match = boldPattern.exec(line)) !== null) {
                const start = match.index;
                const end = start + match[0].length;
                if (ch >= start && ch <= end) {
                    return true;
                }
            }
            return false;
        }

        if (formatId === 'italic') {
            // For italic, we need to be careful not to match inside bold
            // Check for *** (bold+italic), ** (bold only), or * (italic only)
            const boldItalicPattern = /\*\*\*([^*]+)\*\*\*/g;
            const boldPattern = /\*\*([^*]+)\*\*/g;
            const italicPattern = /(?<!\*)\*([^*]+)\*(?!\*)|_([^_]+)_/g;

            // First check if we're in bold+italic
            let match;
            while ((match = boldItalicPattern.exec(line)) !== null) {
                const start = match.index;
                const end = start + match[0].length;
                if (ch >= start && ch <= end) {
                    return true; // In bold+italic, italic is active
                }
            }

            // Reset pattern and check we're not in bold-only
            boldPattern.lastIndex = 0;
            while ((match = boldPattern.exec(line)) !== null) {
                const start = match.index;
                const end = start + match[0].length;
                if (ch >= start && ch <= end) {
                    return false; // In bold-only, italic is NOT active
                }
            }

            // Check for italic-only (but use simpler pattern since lookbehind isn't universally supported)
            // We'll manually verify the match isn't inside bold
            const simpleItalicPattern = /\*([^*]+)\*|_([^_]+)_/g;
            while ((match = simpleItalicPattern.exec(line)) !== null) {
                const start = match.index;
                const end = start + match[0].length;
                if (ch >= start && ch <= end) {
                    // Double-check this isn't inside bold markers
                    const charBefore = start > 0 ? line[start - 1] : '';
                    const charAfter = end < line.length ? line[end] : '';
                    if (charBefore === '*' || charAfter === '*') {
                        continue; // Skip, this is inside bold markers
                    }
                    return true;
                }
            }
            return false;
        }

        // For other formats, use standard pattern matching
        const patterns = {
            'code': /`([^`]+)`/g,
            'highlight': /==(.*?)==/g,
            'strikethrough': /~~(.*?)~~/g,
            'math': /\$\$([^$]+)\$\$|\$([^$]+)\$/g,
            'comment': /<!--(.*?)-->/g
        };

        const pattern = patterns[formatId];
        if (!pattern) return false;

        let match;
        while ((match = pattern.exec(line)) !== null) {
            const start = match.index;
            const end = start + match[0].length;
            if (ch >= start && ch <= end) {
                return true;
            }
        }

        return false;
    }

    applyHeading(view, level) {
        const editor = view.editor;
        if (!editor) return;

        const cursor = editor.getCursor();
        const line = editor.getLine(cursor.line);

        // Remove existing heading markers
        const cleanLine = line.replace(/^#{1,6}\s/, '');

        // Apply new heading
        let newLine;
        if (level === 'body') {
            newLine = cleanLine;
        } else {
            const headingLevel = parseInt(level.replace('h', ''));
            newLine = '#'.repeat(headingLevel) + ' ' + cleanLine;
        }

        editor.setLine(cursor.line, newLine);
    }

    applyFormat(view, formatId, format) {
        const editor = view.editor;
        if (!editor) return;

        if (formatId === 'comment') {
            this.applyCommentFormat(editor);
            return;
        }

        if (formatId === 'math') {
            this.applyMathFormat(editor);
            return;
        }

        // Handle simple wrap formats with proper toggle detection
        const selection = editor.getSelection();

        if (selection) {
            // User has selected text - save positions
            const from = editor.getCursor('from');
            const to = editor.getCursor('to');

            // Get the full line to check surrounding text
            const fromLine = editor.getLine(from.line);
            const toLine = editor.getLine(to.line);

            // Check if format markers exist IMMEDIATELY adjacent to the selection
            const formatLen = format.length;
            const beforeText = fromLine.substring(Math.max(0, from.ch - formatLen), from.ch);
            const afterText = toLine.substring(to.ch, Math.min(toLine.length, to.ch + formatLen));

            if (beforeText === format && afterText === format) {
                // Format exists immediately around selection - remove it
                if (from.line === to.line) {
                    // Single line selection
                    const newLine = fromLine.substring(0, from.ch - formatLen) +
                                  selection +
                                  fromLine.substring(to.ch + formatLen);
                    editor.setLine(from.line, newLine);

                    // Restore selection to the text content (without markers)
                    // Use setTimeout to ensure the line update completes first
                    setTimeout(() => {
                        editor.setSelection(
                            { line: from.line, ch: from.ch - formatLen },
                            { line: to.line, ch: to.ch - formatLen }
                        );
                    }, 0);
                } else {
                    // Multi-line selection - remove start marker from first line
                    const newFromLine = fromLine.substring(0, from.ch - formatLen) +
                                       fromLine.substring(from.ch);
                    editor.setLine(from.line, newFromLine);

                    // Remove end marker from last line
                    const newToLine = toLine.substring(0, to.ch) +
                                     toLine.substring(to.ch + formatLen);
                    editor.setLine(to.line, newToLine);

                    // Restore selection
                    setTimeout(() => {
                        editor.setSelection(
                            { line: from.line, ch: from.ch - formatLen },
                            { line: to.line, ch: to.ch - formatLen }
                        );
                    }, 0);
                }
            } else {
                // Format doesn't exist - add it
                const newFrom = { line: from.line, ch: from.ch + formatLen };
                const newTo = { line: to.line, ch: to.ch + formatLen };

                editor.replaceSelection(format + selection + format);

                // Restore selection to just the content (without markers)
                setTimeout(() => {
                    editor.setSelection(newFrom, newTo);
                }, 0);
            }
        } else {
            // No selection - check if cursor is inside formatted text
            const cursor = editor.getCursor();
            const line = editor.getLine(cursor.line);
            const formatLen = format.length;

            // Try to find format markers around cursor
            let removeStart = -1;
            let removeEnd = -1;

            // Search backwards for opening marker
            for (let i = cursor.ch - formatLen; i >= 0; i--) {
                const chunk = line.substring(i, i + formatLen);
                if (chunk === format) {
                    // Check if there's a closing marker after cursor
                    for (let j = cursor.ch; j <= line.length - formatLen; j++) {
                        const endChunk = line.substring(j, j + formatLen);
                        if (endChunk === format) {
                            removeStart = i;
                            removeEnd = j;
                            break;
                        }
                    }
                    if (removeStart !== -1) break;
                }
            }

            if (removeStart !== -1 && removeEnd !== -1) {
                // Cursor is inside formatted text - remove markers
                const newLine = line.substring(0, removeStart) +
                              line.substring(removeStart + formatLen, removeEnd) +
                              line.substring(removeEnd + formatLen);
                editor.setLine(cursor.line, newLine);
                // Adjust cursor position
                const newCh = cursor.ch <= removeStart ? cursor.ch :
                            cursor.ch <= removeEnd ? cursor.ch - formatLen :
                            cursor.ch - (formatLen * 2);
                editor.setCursor({ line: cursor.line, ch: newCh });
            } else {
                // No formatting found - insert markers at cursor
                editor.replaceSelection(format + format);
                const newCursor = editor.getCursor();
                editor.setCursor({ line: newCursor.line, ch: newCursor.ch - formatLen });
            }
        }
    }

    applyCommentFormat(editor) {
        const selection = editor.getSelection();
        const openMarker = '<!-- ';
        const closeMarker = ' -->';

        if (selection) {
            // User has selected text
            const from = editor.getCursor('from');
            const to = editor.getCursor('to');

            const fromLine = editor.getLine(from.line);
            const toLine = editor.getLine(to.line);

            // Check if comment markers exist IMMEDIATELY adjacent to the selection
            const beforeText = fromLine.substring(Math.max(0, from.ch - openMarker.length), from.ch);
            const afterText = toLine.substring(to.ch, Math.min(toLine.length, to.ch + closeMarker.length));

            if (beforeText === openMarker && afterText === closeMarker) {
                // Comment exists immediately around selection - remove it
                if (from.line === to.line) {
                    // Single line
                    const newLine = fromLine.substring(0, from.ch - openMarker.length) +
                                  selection +
                                  fromLine.substring(to.ch + closeMarker.length);
                    editor.setLine(from.line, newLine);

                    setTimeout(() => {
                        editor.setSelection(
                            { line: from.line, ch: from.ch - openMarker.length },
                            { line: to.line, ch: to.ch - openMarker.length }
                        );
                    }, 0);
                } else {
                    // Multi-line
                    const newFromLine = fromLine.substring(0, from.ch - openMarker.length) +
                                       fromLine.substring(from.ch);
                    editor.setLine(from.line, newFromLine);

                    const newToLine = toLine.substring(0, to.ch) +
                                     toLine.substring(to.ch + closeMarker.length);
                    editor.setLine(to.line, newToLine);

                    setTimeout(() => {
                        editor.setSelection(
                            { line: from.line, ch: from.ch - openMarker.length },
                            { line: to.line, ch: to.ch - openMarker.length }
                        );
                    }, 0);
                }
            } else {
                // Add comment
                const newFrom = { line: from.line, ch: from.ch + openMarker.length };
                const newTo = { line: to.line, ch: to.ch + openMarker.length };

                editor.replaceSelection(openMarker + selection + closeMarker);

                setTimeout(() => {
                    editor.setSelection(newFrom, newTo);
                }, 0);
            }
        } else {
            // No selection - check if cursor is inside a comment
            const cursor = editor.getCursor();
            const line = editor.getLine(cursor.line);

            // Try to find comment markers around cursor
            let removeStart = -1;
            let removeEnd = -1;

            // Search for <!-- before cursor
            const beforeCursor = line.substring(0, cursor.ch);
            const afterCursor = line.substring(cursor.ch);
            const openIdx = beforeCursor.lastIndexOf(openMarker);
            const closeIdx = afterCursor.indexOf(closeMarker);

            if (openIdx !== -1 && closeIdx !== -1) {
                removeStart = openIdx;
                removeEnd = cursor.ch + closeIdx;
                // Remove the markers
                const newLine = line.substring(0, removeStart) +
                              line.substring(removeStart + openMarker.length, removeEnd) +
                              line.substring(removeEnd + closeMarker.length);
                editor.setLine(cursor.line, newLine);
                editor.setCursor({ line: cursor.line, ch: cursor.ch - openMarker.length });
            } else {
                // Insert comment markers
                editor.replaceSelection(openMarker + closeMarker);
                const newCursor = editor.getCursor();
                editor.setCursor({ line: newCursor.line, ch: newCursor.ch - closeMarker.length });
            }
        }
    }

    applyMathFormat(editor) {
        const selection = editor.getSelection();
        // Smart toggle: use $$ if selection contains newlines, else use $
        const hasNewlines = selection && selection.includes('\n');
        const format = hasNewlines ? '$$' : '$';

        if (selection) {
            // User has selected text
            const from = editor.getCursor('from');
            const to = editor.getCursor('to');

            const fromLine = editor.getLine(from.line);
            const toLine = editor.getLine(to.line);

            // Check if math markers exist IMMEDIATELY adjacent to the selection
            const formatLen = format.length;
            const beforeText = fromLine.substring(Math.max(0, from.ch - formatLen), from.ch);
            const afterText = toLine.substring(to.ch, Math.min(toLine.length, to.ch + formatLen));

            if (beforeText === format && afterText === format) {
                // Math format exists immediately around selection - remove it
                if (from.line === to.line) {
                    // Single line
                    const newLine = fromLine.substring(0, from.ch - formatLen) +
                                  selection +
                                  fromLine.substring(to.ch + formatLen);
                    editor.setLine(from.line, newLine);

                    setTimeout(() => {
                        editor.setSelection(
                            { line: from.line, ch: from.ch - formatLen },
                            { line: to.line, ch: to.ch - formatLen }
                        );
                    }, 0);
                } else {
                    // Multi-line
                    const newFromLine = fromLine.substring(0, from.ch - formatLen) +
                                       fromLine.substring(from.ch);
                    editor.setLine(from.line, newFromLine);

                    const newToLine = toLine.substring(0, to.ch) +
                                     toLine.substring(to.ch + formatLen);
                    editor.setLine(to.line, newToLine);

                    setTimeout(() => {
                        editor.setSelection(
                            { line: from.line, ch: from.ch - formatLen },
                            { line: to.line, ch: to.ch - formatLen }
                        );
                    }, 0);
                }
            } else {
                // Add math format
                const newFrom = { line: from.line, ch: from.ch + formatLen };
                const newTo = { line: to.line, ch: to.ch + formatLen };

                editor.replaceSelection(format + selection + format);

                setTimeout(() => {
                    editor.setSelection(newFrom, newTo);
                }, 0);
            }
        } else {
            // No selection - check if cursor is inside math format
            const cursor = editor.getCursor();
            const line = editor.getLine(cursor.line);

            // Try both $ and $$ formats
            const formats = ['$$', '$'];
            let removed = false;

            for (const fmt of formats) {
                const formatLen = fmt.length;
                let removeStart = -1;
                let removeEnd = -1;

                // Search backwards for opening marker
                for (let i = cursor.ch - formatLen; i >= 0; i--) {
                    const chunk = line.substring(i, i + formatLen);
                    if (chunk === fmt) {
                        // Check if there's a closing marker after cursor
                        for (let j = cursor.ch; j <= line.length - formatLen; j++) {
                            const endChunk = line.substring(j, j + formatLen);
                            if (endChunk === fmt) {
                                removeStart = i;
                                removeEnd = j;
                                break;
                            }
                        }
                        if (removeStart !== -1) break;
                    }
                }

                if (removeStart !== -1 && removeEnd !== -1) {
                    // Remove the markers
                    const newLine = line.substring(0, removeStart) +
                                  line.substring(removeStart + formatLen, removeEnd) +
                                  line.substring(removeEnd + formatLen);
                    editor.setLine(cursor.line, newLine);
                    const newCh = cursor.ch <= removeStart ? cursor.ch :
                                cursor.ch <= removeEnd ? cursor.ch - formatLen :
                                cursor.ch - (formatLen * 2);
                    editor.setCursor({ line: cursor.line, ch: newCh });
                    removed = true;
                    break;
                }
            }

            if (!removed) {
                // No math format found - insert markers
                const defaultFormat = '$';
                editor.replaceSelection(defaultFormat + defaultFormat);
                const newCursor = editor.getCursor();
                editor.setCursor({ line: newCursor.line, ch: newCursor.ch - defaultFormat.length });
            }
        }
    }

    removeAllToolbars() {
        const toolbars = document.querySelectorAll('.rtf-toolbar');
        toolbars.forEach(toolbar => toolbar.remove());
        this.activeLeaves.clear();
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
        TitleCaseModule,
        RichTextFormattingModule
    ]
};
