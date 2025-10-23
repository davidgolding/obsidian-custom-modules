// Source Note Sorter Module
// Sorts lists of source notes by author or date
const { Setting } = obsidian;

class SourceNoteSorterModule extends PluginModule {
    constructor(plugin) {
        super(plugin);
        this.id = 'source-note-sorter';
        this.name = 'Source Note Sorter';
        this.description = 'Sort lists of source notes by author or date';

        // Default settings
        this.sortMode = 'author'; // 'author' or 'date'
        this.nestedHandling = 'follow-parent'; // 'follow-parent' or 'independent'
    }

    async onEnable() {
        // Load settings
        const settings = this.getSettings();
        this.sortMode = settings.sortMode || 'author';
        this.nestedHandling = settings.nestedHandling || 'follow-parent';

        // Register context menu event
        this.plugin.registerEvent(
            this.app.workspace.on('editor-menu', (menu, editor, view) => {
                // Only show if text is selected
                if (editor.somethingSelected()) {
                    menu.addItem((item) => {
                        item
                            .setTitle('Sort source notes')
                            .setIcon('sort-asc')
                            .onClick(() => {
                                this.sortSourceNotes(editor);
                            });
                    });
                }
            })
        );
    }

    async onDisable() {
        // Cleanup handled by plugin framework
    }

    /**
     * Main sorting function
     */
    sortSourceNotes(editor) {
        const selectedText = editor.getSelection();
        if (!selectedText) return;

        try {
            // Parse the list
            const items = this.parseListItems(selectedText);

            if (items.length === 0) {
                return; // Nothing to sort
            }

            // Sort the items
            const sortedItems = this.sortItems(items, this.sortMode, this.nestedHandling);

            // Reconstruct the list
            const sortedText = this.reconstructList(sortedItems);

            // Replace selection
            editor.replaceSelection(sortedText);
        } catch (error) {
            console.error('Error sorting source notes:', error);
        }
    }

    /**
     * Parse list items from text
     */
    parseListItems(text) {
        const lines = text.split('\n');
        const items = [];
        const stack = [{ children: items, indent: -1 }]; // Root level

        for (const line of lines) {
            if (line.trim() === '') {
                // Preserve empty lines as-is
                items.push({
                    type: 'empty',
                    originalLine: line,
                    indent: 0
                });
                continue;
            }

            // Match list item: (indentation)(marker)(content)
            const match = line.match(/^(\s*)([-*+]|\d+\.)\s+(.*)$/);

            if (!match) {
                // Not a list item, preserve as-is
                items.push({
                    type: 'text',
                    originalLine: line,
                    indent: 0
                });
                continue;
            }

            const [, indentStr, marker, content] = match;
            const indent = indentStr.length;

            // Extract link if present
            const linkMatch = content.match(/\[\[([^\]]+)\]\]/);
            const link = linkMatch ? linkMatch[1] : null;

            // Check if it's a source note
            const sourceInfo = link ? this.extractSourceInfo(link) : null;

            const item = {
                type: 'item',
                indent: indent,
                indentStr: indentStr,
                marker: marker,
                content: content,
                link: link,
                sourceInfo: sourceInfo,
                isSourceNote: sourceInfo !== null,
                originalLine: line,
                children: []
            };

            // Find parent based on indentation
            while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
                stack.pop();
            }

            const parent = stack[stack.length - 1];
            parent.children.push(item);
            stack.push(item);
        }

        return items;
    }

    /**
     * Extract surname and date info from source note link
     */
    extractSourceInfo(linkText) {
        // Pattern: "Surname - Work Title (Date)"
        const pattern = /^(.+?)\s*-\s*(.+?)\s*\((.+?)\)\s*$/;
        const match = linkText.match(pattern);

        if (!match) {
            return null; // Not a source note
        }

        const [, surname, workTitle, dateStr] = match;
        const dateInfo = this.parseDate(dateStr);

        return {
            surname: surname.trim(),
            workTitle: workTitle.trim(),
            dateStr: dateStr.trim(),
            ...dateInfo
        };
    }

    /**
     * Parse date from various formats
     */
    parseDate(dateStr) {
        // Remove parentheses if present
        dateStr = dateStr.replace(/[()]/g, '').trim();

        // Handle date ranges: use start year
        if (dateStr.includes('–') || dateStr.includes('-')) {
            const parts = dateStr.split(/[–-]/);
            dateStr = parts[0].trim();
        }

        const monthMap = {
            'jan': 1, 'january': 1,
            'feb': 2, 'february': 2,
            'mar': 3, 'march': 3,
            'apr': 4, 'april': 4,
            'may': 5,
            'jun': 6, 'june': 6,
            'jul': 7, 'july': 7,
            'aug': 8, 'august': 8,
            'sep': 9, 'sept': 9, 'september': 9,
            'oct': 10, 'october': 10,
            'nov': 11, 'november': 11,
            'dec': 12, 'december': 12
        };

        let year = null;
        let month = 0;
        let day = 0;

        // Try to match various formats
        // Format: "1841 Apr 17" or "Apr 17 1841" or "17 Apr 1841"
        const parts = dateStr.split(/\s+/);

        for (const part of parts) {
            const numVal = parseInt(part, 10);

            // Check if it's a year (4 digits)
            if (/^\d{4}$/.test(part)) {
                year = numVal;
            }
            // Check if it's a month name
            else if (monthMap[part.toLowerCase()]) {
                month = monthMap[part.toLowerCase()];
            }
            // Check if it's a day (1-31)
            else if (numVal >= 1 && numVal <= 31) {
                day = numVal;
            }
        }

        // If no year found, try simple year format
        if (!year) {
            const yearMatch = dateStr.match(/\d{4}/);
            if (yearMatch) {
                year = parseInt(yearMatch[0], 10);
            }
        }

        // Create sortable value: year * 10000 + month * 100 + day
        const sortValue = (year || 0) * 10000 + month * 100 + day;

        return {
            year: year,
            month: month,
            day: day,
            sortValue: sortValue
        };
    }

    /**
     * Sort items based on mode and nested handling
     */
    sortItems(items, sortMode, nestedHandling) {
        if (nestedHandling === 'follow-parent') {
            return this.sortTopLevel(items, sortMode);
        } else {
            return this.sortRecursive(items, sortMode);
        }
    }

    /**
     * Sort only top-level items, children follow parents
     */
    sortTopLevel(items, sortMode) {
        // Separate source notes from other items
        const sourceNotes = [];
        const nonSourceNotes = [];
        const positions = new Map(); // Track original positions

        items.forEach((item, index) => {
            if (item.type === 'item' && item.isSourceNote) {
                sourceNotes.push({ item, originalIndex: index });
            } else {
                nonSourceNotes.push({ item, originalIndex: index });
            }
        });

        // Sort source notes
        sourceNotes.sort((a, b) => this.compareItems(a.item, b.item, sortMode));

        // Reconstruct: keep non-source items in original positions
        const result = [];
        let sourceIndex = 0;
        let nonSourceIndex = 0;

        for (let i = 0; i < items.length; i++) {
            const originalItem = items[i];

            if (originalItem.type === 'item' && originalItem.isSourceNote) {
                // Insert next sorted source note
                if (sourceIndex < sourceNotes.length) {
                    result.push(sourceNotes[sourceIndex].item);
                    sourceIndex++;
                }
            } else {
                // Keep non-source in place
                result.push(originalItem);
            }
        }

        return result;
    }

    /**
     * Sort items recursively at each level
     */
    sortRecursive(items, sortMode) {
        // Separate source notes from other items at this level
        const sourceNotes = [];
        const nonSourceNotes = [];

        items.forEach((item, index) => {
            if (item.type === 'item' && item.isSourceNote) {
                // Recursively sort children
                if (item.children && item.children.length > 0) {
                    item.children = this.sortRecursive(item.children, sortMode);
                }
                sourceNotes.push({ item, originalIndex: index });
            } else {
                // Recursively sort children even for non-source items
                if (item.type === 'item' && item.children && item.children.length > 0) {
                    item.children = this.sortRecursive(item.children, sortMode);
                }
                nonSourceNotes.push({ item, originalIndex: index });
            }
        });

        // Sort source notes
        sourceNotes.sort((a, b) => this.compareItems(a.item, b.item, sortMode));

        // Reconstruct: keep non-source items in original positions
        const result = [];
        let sourceIndex = 0;

        for (let i = 0; i < items.length; i++) {
            const originalItem = items[i];

            if (originalItem.type === 'item' && originalItem.isSourceNote) {
                if (sourceIndex < sourceNotes.length) {
                    result.push(sourceNotes[sourceIndex].item);
                    sourceIndex++;
                }
            } else {
                result.push(originalItem);
            }
        }

        return result;
    }

    /**
     * Compare two items for sorting
     */
    compareItems(a, b, sortMode) {
        const aInfo = a.sourceInfo;
        const bInfo = b.sourceInfo;

        if (!aInfo || !bInfo) {
            return 0; // Should not happen for source notes
        }

        if (sortMode === 'author') {
            // Primary: surname
            const surnameCompare = aInfo.surname.localeCompare(bInfo.surname);
            if (surnameCompare !== 0) {
                return surnameCompare;
            }
            // Secondary: date
            return aInfo.sortValue - bInfo.sortValue;
        } else { // date mode
            // Primary: date
            const dateCompare = aInfo.sortValue - bInfo.sortValue;
            if (dateCompare !== 0) {
                return dateCompare;
            }
            // Secondary: surname
            return aInfo.surname.localeCompare(bInfo.surname);
        }
    }

    /**
     * Reconstruct list from sorted items
     */
    reconstructList(items) {
        const lines = [];

        const processItem = (item) => {
            if (item.type === 'empty' || item.type === 'text') {
                lines.push(item.originalLine);
            } else if (item.type === 'item') {
                lines.push(item.originalLine);

                // Process children
                if (item.children && item.children.length > 0) {
                    item.children.forEach(child => processItem(child));
                }
            }
        };

        items.forEach(item => processItem(item));

        return lines.join('\n');
    }

    /**
     * Add settings UI
     */
    addSettings(containerEl) {
        const settings = this.getSettings();

        new Setting(containerEl)
            .setName('Sort Mode')
            .setDesc('Choose how to sort source notes')
            .addDropdown(dropdown => dropdown
                .addOption('author', 'By Author (then by date)')
                .addOption('date', 'By Date (then by author)')
                .setValue(settings.sortMode || 'author')
                .onChange(async (value) => {
                    this.sortMode = value;
                    await this.saveSettings({ ...settings, sortMode: value });
                })
            );

        new Setting(containerEl)
            .setName('Nested Item Handling')
            .setDesc('How to handle nested list items during sorting')
            .addDropdown(dropdown => dropdown
                .addOption('follow-parent', 'Children follow parent')
                .addOption('independent', 'Sort each level independently')
                .setValue(settings.nestedHandling || 'follow-parent')
                .onChange(async (value) => {
                    this.nestedHandling = value;
                    await this.saveSettings({ ...settings, nestedHandling: value });
                })
            );
    }
}

// Export the module
module.exports = SourceNoteSorterModule;
