// user-modules/note-statistics.js
// Example of a more advanced user module with settings

const { PluginModule } = window.CustomModulesAPI;
const { Notice, MarkdownView, Setting } = require('obsidian');

class NoteStatisticsModule extends PluginModule {
    constructor(plugin) {
        super(plugin);
        this.id = 'note-statistics';
        this.name = 'Note Statistics';
        this.description = 'Display word count, character count, and reading time for notes';
        this.statusBarItems = new Map();
    }

    async onEnable() {
        // Get saved settings with defaults
        const settings = this.getSettings();
        this.showWordCount = settings.showWordCount !== false;
        this.showCharCount = settings.showCharCount !== false;
        this.showReadingTime = settings.showReadingTime !== false;
        this.wordsPerMinute = settings.wordsPerMinute || 200;

        // Add status bar items
        this.updateStatusBar();

        // Register for editor changes
        this.plugin.registerEvent(
            this.app.workspace.on('editor-change', () => {
                this.updateStatusBar();
            })
        );

        // Register for active leaf changes
        this.plugin.registerEvent(
            this.app.workspace.on('active-leaf-change', () => {
                this.updateStatusBar();
            })
        );

        // Add command to show detailed statistics
        this.plugin.addCommand({
            id: 'show-note-statistics',
            name: 'Show detailed note statistics',
            callback: () => this.showDetailedStats()
        });
    }

    async onDisable() {
        // Remove all status bar items
        this.statusBarItems.forEach(item => item.remove());
        this.statusBarItems.clear();
    }

    updateStatusBar() {
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!activeView || !activeView.editor) {
            this.hideStatusBar();
            return;
        }

        const content = activeView.editor.getValue();
        const stats = this.calculateStatistics(content);

        // Update or create status bar items
        if (this.showWordCount) {
            this.updateStatusBarItem('words', `${stats.words} words`);
        }

        if (this.showCharCount) {
            this.updateStatusBarItem('chars', `${stats.characters} chars`);
        }

        if (this.showReadingTime) {
            const minutes = Math.ceil(stats.words / this.wordsPerMinute);
            const timeText = minutes === 1 ? '1 min read' : `${minutes} min read`;
            this.updateStatusBarItem('reading', timeText);
        }
    }

    updateStatusBarItem(key, text) {
        let item = this.statusBarItems.get(key);
        if (!item) {
            item = this.plugin.addStatusBarItem();
            this.statusBarItems.set(key, item);
        }
        item.setText(text);
    }

    hideStatusBar() {
        this.statusBarItems.forEach(item => item.setText(''));
    }

    calculateStatistics(content) {
        // Remove code blocks and frontmatter
        const cleanContent = content
            .replace(/^---[\s\S]*?---\n/gm, '') // Remove frontmatter
            .replace(/```[\s\S]*?```/g, '') // Remove code blocks
            .replace(/`[^`]*`/g, ''); // Remove inline code

        // Calculate statistics
        const words = cleanContent
            .split(/\s+/)
            .filter(word => word.length > 0).length;
        
        const characters = cleanContent.length;
        const charactersNoSpaces = cleanContent.replace(/\s/g, '').length;
        const lines = content.split('\n').length;
        const paragraphs = cleanContent
            .split(/\n\n+/)
            .filter(para => para.trim().length > 0).length;

        return {
            words,
            characters,
            charactersNoSpaces,
            lines,
            paragraphs
        };
    }

    showDetailedStats() {
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!activeView || !activeView.editor) {
            new Notice('No active note to analyze');
            return;
        }

        const content = activeView.editor.getValue();
        const stats = this.calculateStatistics(content);
        const readingTime = Math.ceil(stats.words / this.wordsPerMinute);

        const message = `Note Statistics:
        
Words: ${stats.words}
Characters (with spaces): ${stats.characters}
Characters (no spaces): ${stats.charactersNoSpaces}
Lines: ${stats.lines}
Paragraphs: ${stats.paragraphs}
Estimated reading time: ${readingTime} minute${readingTime === 1 ? '' : 's'}`;

        new Notice(message, 5000);
    }

    // Add custom settings for this module
    addSettings(containerEl) {
        const settings = this.getSettings();

        new Setting(containerEl)
            .setName('Show word count')
            .setDesc('Display word count in the status bar')
            .addToggle(toggle => toggle
                .setValue(settings.showWordCount !== false)
                .onChange(async (value) => {
                    const newSettings = { ...settings, showWordCount: value };
                    await this.saveSettings(newSettings);
                    this.showWordCount = value;
                    
                    if (!value && this.statusBarItems.has('words')) {
                        this.statusBarItems.get('words').remove();
                        this.statusBarItems.delete('words');
                    } else {
                        this.updateStatusBar();
                    }
                })
            );

        new Setting(containerEl)
            .setName('Show character count')
            .setDesc('Display character count in the status bar')
            .addToggle(toggle => toggle
                .setValue(settings.showCharCount !== false)
                .onChange(async (value) => {
                    const newSettings = { ...settings, showCharCount: value };
                    await this.saveSettings(newSettings);
                    this.showCharCount = value;
                    
                    if (!value && this.statusBarItems.has('chars')) {
                        this.statusBarItems.get('chars').remove();
                        this.statusBarItems.delete('chars');
                    } else {
                        this.updateStatusBar();
                    }
                })
            );

        new Setting(containerEl)
            .setName('Show reading time')
            .setDesc('Display estimated reading time in the status bar')
            .addToggle(toggle => toggle
                .setValue(settings.showReadingTime !== false)
                .onChange(async (value) => {
                    const newSettings = { ...settings, showReadingTime: value };
                    await this.saveSettings(newSettings);
                    this.showReadingTime = value;
                    
                    if (!value && this.statusBarItems.has('reading')) {
                        this.statusBarItems.get('reading').remove();
                        this.statusBarItems.delete('reading');
                    } else {
                        this.updateStatusBar();
                    }
                })
            );

        new Setting(containerEl)
            .setName('Reading speed (WPM)')
            .setDesc('Words per minute for reading time calculation')
            .addText(text => text
                .setPlaceholder('200')
                .setValue(String(settings.wordsPerMinute || 200))
                .onChange(async (value) => {
                    const wpm = parseInt(value) || 200;
                    const newSettings = { ...settings, wordsPerMinute: wpm };
                    await this.saveSettings(newSettings);
                    this.wordsPerMinute = wpm;
                    this.updateStatusBar();
                })
            );
    }
}

module.exports = NoteStatisticsModule;