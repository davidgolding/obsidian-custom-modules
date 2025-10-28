// Ollama Chat Module
// AI chat interface with RAG (Retrieval Augmented Generation) using Ollama
const { ItemView, WorkspaceLeaf, Setting, Notice, TFile, debounce, normalizePath, MarkdownRenderer } = obsidian;

// View type identifier
const VIEW_TYPE_OLLAMA_CHAT = 'ollama-chat-view';

// ============================================================================
// OLLAMA SERVICE - Handles API communication with Ollama
// ============================================================================

class OllamaService {
    constructor(baseUrl = 'http://localhost:11434') {
        this.baseUrl = baseUrl;
        this.abortController = null;
    }

    setBaseUrl(url) {
        this.baseUrl = url;
    }

    async testConnection() {
        try {
            const response = await fetch(`${this.baseUrl}/api/tags`);
            return response.ok;
        } catch (error) {
            console.error('Ollama connection test failed:', error);
            return false;
        }
    }

    async listModels() {
        try {
            const response = await fetch(`${this.baseUrl}/api/tags`);
            if (!response.ok) throw new Error('Failed to fetch models');
            const data = await response.json();
            return data.models || [];
        } catch (error) {
            console.error('Error listing models:', error);
            return [];
        }
    }

    async generateEmbedding(text, model = 'mxbai-embed-large') {
        try {
            // Validate input
            if (!text || typeof text !== 'string' || text.trim().length === 0) {
                return null;
            }

            const trimmedText = text.trim();

            const response = await fetch(`${this.baseUrl}/api/embed`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model, input: trimmedText })
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`Embedding API error (${response.status}):`, errorText);
                throw new Error(`Embedding failed: ${response.statusText}`);
            }

            const data = await response.json();
            const embedding = data.embeddings?.[0] || data.embedding;

            if (!embedding || !Array.isArray(embedding) || embedding.length === 0) {
                console.error('Ollama API returned invalid embedding');
                return null;
            }

            return embedding;
        } catch (error) {
            console.error('Error generating embedding:', error.message);
            return null;
        }
    }

    async *chat(messages, model, options = {}) {
        // Abort any previous request
        if (this.abortController) {
            this.abortController.abort();
        }
        this.abortController = new AbortController();

        try {
            const response = await fetch(`${this.baseUrl}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model,
                    messages,
                    stream: true,
                    options: {
                        temperature: options.temperature ?? 0.7,
                        num_predict: options.maxTokens ?? 2048
                    }
                }),
                signal: this.abortController.signal
            });

            if (!response.ok) {
                throw new Error(`Chat failed: ${response.statusText}`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value);
                const lines = chunk.split('\n').filter(line => line.trim());

                for (const line of lines) {
                    try {
                        const data = JSON.parse(line);
                        if (data.message?.content) {
                            yield data.message.content;
                        }
                        if (data.done) {
                            return;
                        }
                    } catch (e) {
                        // Skip invalid JSON
                    }
                }
            }
        } catch (error) {
            if (error.name === 'AbortError') {
                console.log('Chat request aborted');
            } else {
                console.error('Chat error:', error);
                throw error;
            }
        }
    }

    abortChat() {
        if (this.abortController) {
            this.abortController.abort();
            this.abortController = null;
        }
    }

    async *pullModel(modelName, progressCallback) {
        try {
            const response = await fetch(`${this.baseUrl}/api/pull`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: modelName })
            });

            if (!response.ok) {
                throw new Error(`Failed to pull model: ${response.statusText}`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value);
                const lines = chunk.split('\n').filter(line => line.trim());

                for (const line of lines) {
                    try {
                        const data = JSON.parse(line);

                        // Calculate progress percentage
                        if (data.total && data.completed) {
                            const percent = Math.round((data.completed / data.total) * 100);
                            yield { status: data.status, percent };
                        } else if (data.status) {
                            yield { status: data.status, percent: null };
                        }

                        // Check if complete
                        if (data.status === 'success') {
                            return;
                        }
                    } catch (e) {
                        // Skip invalid JSON
                    }
                }
            }
        } catch (error) {
            console.error('Error pulling model:', error);
            throw error;
        }
    }
}

// ============================================================================
// EMBEDDING MANAGER - Handles vector storage and semantic search
// ============================================================================

class EmbeddingManager {
    constructor(app, vault, ollamaService) {
        this.app = app;
        this.vault = vault;
        this.ollamaService = ollamaService;
        this.embeddings = {};
        this.metadata = {
            model: 'mxbai-embed-large',
            dimension: 1024,
            lastUpdate: Date.now()
        };
        this.embeddingsPath = '.obsidian/.ollama-embeddings.json';
        this.isLoaded = false;
    }

    async load() {
        try {
            // Try vault API first (works for most files)
            const file = this.vault.getAbstractFileByPath(this.embeddingsPath);

            if (file instanceof TFile) {
                const content = await this.vault.read(file);
                const data = JSON.parse(content);
                this.embeddings = data.notes || {};
                this.metadata = data.metadata || this.metadata;
                this.isLoaded = true;
            } else {
                // Fallback to adapter for files in .obsidian directory
                try {
                    const content = await this.vault.adapter.read(this.embeddingsPath);
                    const data = JSON.parse(content);
                    this.embeddings = data.notes || {};
                    this.metadata = data.metadata || this.metadata;
                    this.isLoaded = true;
                } catch (adapterError) {
                    // File doesn't exist yet, start fresh
                    this.isLoaded = true;
                }
            }
        } catch (error) {
            console.error('Error loading embeddings:', error.message);
            this.embeddings = {};
            this.isLoaded = true;
        }
    }

    async save() {
        try {
            const data = JSON.stringify({
                notes: this.embeddings,
                metadata: {
                    ...this.metadata,
                    lastUpdate: Date.now()
                }
            }, null, 2);

            // Use adapter.write for reliable file operations in .obsidian directory
            await this.vault.adapter.write(this.embeddingsPath, data);
        } catch (error) {
            console.error('Error saving embeddings:', error.message);
        }
    }

    async embedNote(file) {
        if (!(file instanceof TFile) || file.extension !== 'md') {
            return false;
        }

        try {
            const content = await this.vault.read(file);

            // Validate content
            if (!content || typeof content !== 'string' || content.trim().length === 0) {
                return false;
            }

            const embedding = await this.ollamaService.generateEmbedding(content.trim(), this.metadata.model);

            if (embedding) {
                this.embeddings[file.path] = {
                    embedding,
                    lastModified: file.stat.mtime,
                    size: file.stat.size
                };
                return true;
            }
        } catch (error) {
            console.error(`Error embedding ${file.path}:`, error.message);
        }
        return false;
    }

    async embedMultipleNotes(files, progressCallback) {
        let processed = 0;
        let successful = 0;

        for (const file of files) {
            const result = await this.embedNote(file);
            if (result) {
                successful++;
            }
            processed++;
            if (progressCallback) {
                progressCallback(processed, files.length, file);
            }
        }

        await this.save();
    }

    shouldReEmbed(file) {
        const existing = this.embeddings[file.path];
        if (!existing) return true;
        return existing.lastModified < file.stat.mtime;
    }

    cosineSimilarity(a, b) {
        if (!a || !b || a.length !== b.length) return 0;

        let dotProduct = 0;
        let normA = 0;
        let normB = 0;

        for (let i = 0; i < a.length; i++) {
            dotProduct += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
        }

        normA = Math.sqrt(normA);
        normB = Math.sqrt(normB);

        if (normA === 0 || normB === 0) return 0;
        return dotProduct / (normA * normB);
    }

    async searchSimilar(query, topK = 5) {
        if (!this.isLoaded) {
            await this.load();
        }

        // Generate query embedding
        const queryEmbedding = await this.ollamaService.generateEmbedding(query, this.metadata.model);
        if (!queryEmbedding) {
            console.error('Failed to generate query embedding');
            return [];
        }

        // Calculate similarities
        const results = [];
        for (const [path, data] of Object.entries(this.embeddings)) {
            const similarity = this.cosineSimilarity(queryEmbedding, data.embedding);
            results.push({ path, similarity });
        }

        // Sort by similarity and return top K
        results.sort((a, b) => b.similarity - a.similarity);
        return results.slice(0, topK);
    }
}

// ============================================================================
// CHAT MANAGER - Manages conversation state and context assembly
// ============================================================================

class ChatManager {
    constructor(app, embeddingManager) {
        this.app = app;
        this.embeddingManager = embeddingManager;
        this.messages = [];
        this.pinnedNotes = new Set();
        this.systemPrompt = "You are a helpful assistant with access to the user's notes. Use the provided context to answer questions accurately.";
    }

    setSystemPrompt(prompt) {
        this.systemPrompt = prompt;
    }

    addMessage(role, content) {
        this.messages.push({ role, content });
    }

    clearHistory() {
        this.messages = [];
    }

    pinNote(path) {
        this.pinnedNotes.add(path);
    }

    unpinNote(path) {
        this.pinnedNotes.delete(path);
    }

    getPinnedNotes() {
        return Array.from(this.pinnedNotes);
    }

    async buildContext(query, topK = 5) {
        const contextParts = [];
        const sources = [];

        // 1. Add pinned notes
        for (const path of this.pinnedNotes) {
            const file = this.app.vault.getAbstractFileByPath(path);
            if (file instanceof TFile) {
                const content = await this.app.vault.read(file);
                contextParts.push(`Note: ${path}\n${content}\n`);
                sources.push({ path, type: 'pinned' });
            }
        }

        // 2. Add semantically similar notes
        const similarNotes = await this.embeddingManager.searchSimilar(query, topK);

        for (const result of similarNotes) {
            // Skip if already pinned
            if (this.pinnedNotes.has(result.path)) {
                continue;
            }

            const file = this.app.vault.getAbstractFileByPath(result.path);
            if (file instanceof TFile) {
                const content = await this.app.vault.read(file);
                contextParts.push(`Note: ${result.path}\n${content}\n`);
                sources.push({
                    path: result.path,
                    type: 'retrieved',
                    similarity: result.similarity
                });
            }
        }

        const context = contextParts.join('\n---\n\n');
        return { context, sources };
    }

    async prepareMessages(userQuery, topK = 5) {
        const { context, sources } = await this.buildContext(userQuery, topK);

        const messages = [
            { role: 'system', content: this.systemPrompt }
        ];

        // Add context if available
        if (context) {
            messages.push({
                role: 'system',
                content: `Here are relevant notes from the vault:\n\n${context}`
            });
        }

        // Add recent conversation history (last 5 exchanges)
        const recentMessages = this.messages.slice(-10);
        messages.push(...recentMessages);

        // Add current query
        messages.push({ role: 'user', content: userQuery });

        return { messages, sources };
    }
}

// ============================================================================
// OLLAMA CHAT VIEW - Custom sidebar panel UI
// ============================================================================

class OllamaChatView extends ItemView {
    constructor(leaf, module) {
        super(leaf);
        this.module = module;
        this.chatManager = null;
        this.currentModel = null;
        this.availableModels = [];
        this.isStreaming = false;
    }

    getViewType() {
        return VIEW_TYPE_OLLAMA_CHAT;
    }

    getDisplayText() {
        return 'Ollama Chat';
    }

    getIcon() {
        return 'message-circle';
    }

    async onOpen() {
        const container = this.containerEl.children[1];
        container.empty();
        container.addClass('ollama-chat-view');

        // Add styles
        this.addStyles();

        // Initialize
        await this.initialize();

        // Build UI
        this.buildUI(container);
    }

    async initialize() {
        const settings = this.module.getSettings();

        this.chatManager = new ChatManager(this.app, this.module.embeddingManager);
        this.chatManager.setSystemPrompt(settings.systemPrompt || this.chatManager.systemPrompt);

        // Load available models
        this.availableModels = await this.module.ollamaService.listModels();
        this.currentModel = settings.defaultChatModel || this.availableModels[0]?.name || 'llama2';
    }

    buildUI(container) {
        // Header
        const header = container.createDiv({ cls: 'ollama-chat-header' });

        const titleDiv = header.createDiv({ cls: 'ollama-chat-title' });
        titleDiv.createSpan({ text: 'Ollama Chat', cls: 'chat-title-text' });

        // Header controls container
        const headerControls = header.createDiv({ cls: 'ollama-header-controls' });

        // Reset button
        const resetButton = headerControls.createDiv({
            cls: 'ollama-reset-button',
            attr: { 'aria-label': 'Clear chat' }
        });
        resetButton.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>';
        resetButton.addEventListener('click', () => this.resetChat());

        // Model selector
        const modelSelect = headerControls.createEl('select', { cls: 'ollama-model-select' });
        for (const model of this.availableModels) {
            const option = modelSelect.createEl('option', {
                value: model.name,
                text: model.name
            });
            if (model.name === this.currentModel) {
                option.selected = true;
            }
        }
        modelSelect.addEventListener('change', (e) => {
            this.currentModel = e.target.value;
        });

        // Pinned notes section
        this.pinnedNotesContainer = container.createDiv({ cls: 'ollama-pinned-notes' });
        this.updatePinnedNotesUI();

        // Chat messages container
        this.messagesContainer = container.createDiv({ cls: 'ollama-chat-messages' });

        // Input area
        const inputContainer = container.createDiv({ cls: 'ollama-chat-input-container' });

        this.inputArea = inputContainer.createEl('textarea', {
            cls: 'ollama-chat-input',
            attr: {
                placeholder: 'Ask about your notes...',
                rows: '2'
            }
        });

        // Auto-resize textarea
        this.inputArea.addEventListener('input', () => {
            this.inputArea.style.height = 'auto';
            this.inputArea.style.height = Math.min(this.inputArea.scrollHeight, 150) + 'px';
        });

        // Send/Stop button
        this.sendButton = inputContainer.createDiv({ cls: 'ollama-send-button' });
        this.sendButton.innerHTML = '↑';
        this.sendButton.addEventListener('click', () => this.handleSendStopClick());

        // Enter to send (Shift+Enter for new line)
        this.inputArea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (!this.isStreaming) {
                    this.sendMessage();
                }
            }
        });
    }

    handleSendStopClick() {
        if (this.isStreaming) {
            this.stopStreaming();
        } else {
            this.sendMessage();
        }
    }

    setSendButtonState(isStreaming) {
        if (isStreaming) {
            // Change to stop button
            this.sendButton.innerHTML = '■';
            this.sendButton.addClass('stop-mode');
            this.sendButton.setAttribute('aria-label', 'Stop generating');
        } else {
            // Change to send button
            this.sendButton.innerHTML = '↑';
            this.sendButton.removeClass('stop-mode');
            this.sendButton.setAttribute('aria-label', 'Send message');
        }
    }

    stopStreaming() {
        this.module.ollamaService.abortChat();
        this.isStreaming = false;
        this.setSendButtonState(false);
    }

    resetChat() {
        // Clear messages UI
        this.messagesContainer.empty();

        // Clear chat history
        if (this.chatManager) {
            this.chatManager.clearHistory();
        }

        // Reset streaming state
        if (this.isStreaming) {
            this.stopStreaming();
        }

        new Notice('Chat cleared');
    }

    updatePinnedNotesUI() {
        this.pinnedNotesContainer.empty();
        const pinnedNotes = this.chatManager.getPinnedNotes();

        if (pinnedNotes.length > 0) {
            this.pinnedNotesContainer.addClass('has-notes');

            const pinnedLabel = this.pinnedNotesContainer.createDiv({ cls: 'pinned-label' });
            pinnedLabel.textContent = 'Pinned:';

            for (const path of pinnedNotes) {
                const chip = this.pinnedNotesContainer.createDiv({ cls: 'pinned-note-chip' });

                const nameSpan = chip.createSpan({ text: path.split('/').pop() });
                nameSpan.addEventListener('click', () => {
                    this.app.workspace.openLinkText(path, '', false);
                });

                const removeBtn = chip.createSpan({ text: '×', cls: 'pinned-remove' });
                removeBtn.addEventListener('click', () => {
                    this.chatManager.unpinNote(path);
                    this.updatePinnedNotesUI();
                });
            }
        } else {
            this.pinnedNotesContainer.removeClass('has-notes');
        }
    }

    async sendMessage() {
        const query = this.inputArea.value.trim();
        if (!query || this.isStreaming) return;

        // Clear input
        this.inputArea.value = '';
        this.inputArea.style.height = 'auto';

        // Add user message to UI
        this.addMessageToUI('user', query);

        // Show loading indicator
        const loadingMsg = this.addMessageToUI('assistant', '');
        const contentEl = loadingMsg.querySelector('.message-content');
        const loadingIndicator = contentEl.createDiv({ cls: 'typing-indicator' });
        loadingIndicator.innerHTML = '<span></span><span></span><span></span>';

        try {
            this.isStreaming = true;
            this.setSendButtonState(true);

            // Prepare context and messages
            const settings = this.module.getSettings();
            const { messages, sources } = await this.chatManager.prepareMessages(
                query,
                settings.retrievalCount || 5
            );

            let fullResponse = '';
            let firstChunk = true;

            // Stream response
            const stream = this.module.ollamaService.chat(messages, this.currentModel, {
                temperature: settings.temperature,
                maxTokens: settings.maxTokens
            });

            for await (const chunk of stream) {
                // Remove loading indicator on first chunk
                if (firstChunk) {
                    loadingIndicator.remove();
                    firstChunk = false;
                }

                fullResponse += chunk;
                // Update with plain text during streaming for performance, add cursor
                contentEl.textContent = fullResponse + '▊';
                this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
            }

            // After streaming is complete, render as markdown (remove cursor)
            contentEl.empty();
            await this.renderMarkdown(fullResponse, contentEl);

            // Add to chat history
            this.chatManager.addMessage('user', query);
            this.chatManager.addMessage('assistant', fullResponse);

            // Add sources
            if (sources.length > 0) {
                this.addSourcesToMessage(loadingMsg, sources);
            }

        } catch (error) {
            // Remove loading indicator if still present
            if (loadingIndicator && loadingIndicator.parentElement) {
                loadingIndicator.remove();
            }
            // Only show error if it wasn't aborted by user
            if (error.name !== 'AbortError') {
                contentEl.textContent = `Error: ${error.message}`;
                console.error('Chat error:', error);
            } else {
                contentEl.textContent = 'Response stopped by user';
            }
        } finally {
            this.isStreaming = false;
            this.setSendButtonState(false);
        }
    }

    addMessageToUI(role, content) {
        const messageEl = this.messagesContainer.createDiv({
            cls: `chat-message chat-message-${role}`
        });

        const bubble = messageEl.createDiv({ cls: 'message-bubble' });
        const contentEl = bubble.createDiv({ cls: 'message-content' });
        contentEl.textContent = content;

        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
        return messageEl;
    }

    addSourcesToMessage(messageEl, sources) {
        const sourcesEl = messageEl.createDiv({ cls: 'message-sources' });
        sourcesEl.createSpan({ text: 'Sources: ', cls: 'sources-label' });

        sources.forEach((source, index) => {
            if (index > 0) sourcesEl.appendText(', ');

            const link = sourcesEl.createEl('a', {
                text: source.path.split('/').pop(),
                cls: 'source-link'
            });
            link.addEventListener('click', (e) => {
                e.preventDefault();
                this.app.workspace.openLinkText(source.path, '', false);
            });

            if (source.type === 'pinned') {
                link.addClass('source-pinned');
            }
        });
    }

    async renderMarkdown(content, containerEl) {
        // Check if content contains markdown indicators
        const hasMarkdown = this.detectMarkdown(content);

        if (hasMarkdown) {
            // Render as markdown
            await MarkdownRenderer.renderMarkdown(
                content,
                containerEl,
                '',
                this
            );
        } else {
            // Render as plain text
            containerEl.textContent = content;
        }
    }

    detectMarkdown(text) {
        // Check for common markdown patterns
        const markdownPatterns = [
            /^#{1,6}\s/m,           // Headers
            /\*\*.*?\*\*/,          // Bold
            /\*.*?\*/,              // Italic
            /_.*?_/,                // Italic underscore
            /`.*?`/,                // Inline code
            /```[\s\S]*?```/,       // Code blocks
            /^\s*[-*+]\s/m,         // Unordered lists
            /^\s*\d+\.\s/m,         // Ordered lists
            /\[.*?\]\(.*?\)/,       // Links
            /^\s*>\s/m,             // Blockquotes
            /\|.*\|.*\|/,           // Tables
        ];

        return markdownPatterns.some(pattern => pattern.test(text));
    }

    addStyles() {
        // Inject CSS for Apple-inspired design
        const styleId = 'ollama-chat-styles';
        if (document.getElementById(styleId)) return;

        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
/* Ollama Chat - Isolated Styles */
.ollama-chat-view {
    display: flex !important;
    flex-direction: column !important;
    height: 100% !important;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, sans-serif !important;
    position: relative !important;
}

/* Hide any external elements that might appear in our view */
.ollama-chat-view .status-bar,
.ollama-chat-view .workspace-leaf-header,
.ollama-chat-view .view-header,
.ollama-chat-view .nav-action-button,
.ollama-chat-view .clickable-icon {
    display: none !important;
}

.ollama-chat-view .ollama-chat-header {
    display: flex !important;
    justify-content: space-between !important;
    align-items: center !important;
    padding: 12px 16px !important;
    border-bottom: 1px solid var(--background-modifier-border) !important;
    background: var(--background-secondary) !important;
}

.ollama-chat-view .ollama-chat-title {
    display: flex !important;
    align-items: center !important;
    gap: 8px !important;
}

.ollama-chat-view .chat-title-text {
    font-weight: 600 !important;
    font-size: 15px !important;
}

.ollama-chat-view .ollama-header-controls {
    display: flex !important;
    align-items: center !important;
    gap: 8px !important;
}

.ollama-chat-view .ollama-reset-button {
    width: 32px !important;
    height: 32px !important;
    border-radius: 6px !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    cursor: pointer !important;
    color: var(--text-muted) !important;
    transition: all 0.2s ease !important;
}

.ollama-chat-view .ollama-reset-button:hover {
    background: var(--background-modifier-hover) !important;
    color: var(--text-normal) !important;
}

.ollama-chat-view .ollama-reset-button:active {
    transform: scale(0.95) !important;
}

.ollama-chat-view .ollama-model-select {
    padding: 6px 12px !important;
    padding-right: 28px !important;
    border-radius: 6px !important;
    border: 1px solid var(--background-modifier-border) !important;
    background: var(--background-primary) !important;
    font-size: 13px !important;
    cursor: pointer !important;
    font-weight: 500 !important;
    appearance: none !important;
    -webkit-appearance: none !important;
    -moz-appearance: none !important;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23666' d='M6 9L1 4h10z'/%3E%3C/svg%3E") !important;
    background-repeat: no-repeat !important;
    background-position: right 8px center !important;
    transition: all 0.2s ease !important;
}

.ollama-chat-view .ollama-model-select:hover {
    border-color: var(--interactive-accent) !important;
    background-color: var(--background-modifier-hover) !important;
}

.ollama-chat-view .ollama-model-select:focus {
    outline: none !important;
    border-color: var(--interactive-accent) !important;
    box-shadow: 0 0 0 2px var(--interactive-accent-hover) !important;
}

.ollama-chat-view .ollama-pinned-notes {
    padding: 8px 16px !important;
    background: var(--background-secondary-alt) !important;
    border-bottom: 1px solid var(--background-modifier-border) !important;
    display: none !important;
    flex-wrap: wrap !important;
    gap: 6px !important;
    align-items: center !important;
}

.ollama-chat-view .ollama-pinned-notes.has-notes {
    display: flex !important;
}

.ollama-chat-view .pinned-label {
    font-size: 12px !important;
    color: var(--text-muted) !important;
    font-weight: 500 !important;
}

.ollama-chat-view .pinned-note-chip {
    display: inline-flex !important;
    align-items: center !important;
    gap: 6px !important;
    padding: 4px 10px !important;
    background: var(--background-primary) !important;
    border-radius: 12px !important;
    font-size: 12px !important;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1) !important;
    cursor: pointer !important;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1) !important;
}

.ollama-chat-view .pinned-note-chip:hover {
    background: var(--background-modifier-hover) !important;
    transform: translateY(-1px) !important;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.15) !important;
}

.ollama-chat-view .pinned-remove {
    color: var(--text-muted) !important;
    font-weight: bold !important;
    cursor: pointer !important;
    padding: 0 2px !important;
}

.ollama-chat-view .pinned-remove:hover {
    color: var(--text-error) !important;
}

.ollama-chat-view .ollama-chat-messages {
    flex: 1 !important;
    overflow-y: auto !important;
    padding: 16px !important;
    display: flex !important;
    flex-direction: column !important;
    gap: 16px !important;
}

.ollama-chat-view .chat-message {
    display: flex !important;
    flex-direction: column !important;
}

.ollama-chat-view .chat-message-user {
    align-items: flex-end !important;
}

.ollama-chat-view .chat-message-assistant {
    align-items: flex-start !important;
}

.ollama-chat-view .message-bubble {
    max-width: 85% !important;
    padding: 10px 14px !important;
    border-radius: 16px !important;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1) !important;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1) !important;
}

.ollama-chat-view .chat-message-user .message-bubble {
    background: var(--interactive-accent) !important;
    color: white !important;
    border-bottom-right-radius: 4px !important;
}

.ollama-chat-view .chat-message-assistant .message-bubble {
    background: var(--background-secondary) !important;
    border-bottom-left-radius: 4px !important;
}

.ollama-chat-view .message-content {
    font-size: 14px !important;
    line-height: 1.5 !important;
    white-space: pre-wrap !important;
    word-wrap: break-word !important;
}

/* Markdown rendering styles */
.ollama-chat-view .message-content h1,
.ollama-chat-view .message-content h2,
.ollama-chat-view .message-content h3,
.ollama-chat-view .message-content h4,
.ollama-chat-view .message-content h5,
.ollama-chat-view .message-content h6 {
    margin: 12px 0 8px 0 !important;
    font-weight: 600 !important;
}

.ollama-chat-view .message-content h1 { font-size: 1.5em !important; }
.ollama-chat-view .message-content h2 { font-size: 1.3em !important; }
.ollama-chat-view .message-content h3 { font-size: 1.1em !important; }

.ollama-chat-view .message-content p {
    margin: 8px 0 !important;
}

.ollama-chat-view .message-content ul,
.ollama-chat-view .message-content ol {
    margin: 8px 0 !important;
    padding-left: 24px !important;
}

.ollama-chat-view .message-content li {
    margin: 4px 0 !important;
}

.ollama-chat-view .message-content code {
    background: rgba(0, 0, 0, 0.1) !important;
    padding: 2px 6px !important;
    border-radius: 3px !important;
    font-family: var(--font-monospace) !important;
    font-size: 0.9em !important;
}

.ollama-chat-view .chat-message-user .message-content code {
    background: rgba(255, 255, 255, 0.2) !important;
}

.ollama-chat-view .message-content pre {
    background: rgba(0, 0, 0, 0.1) !important;
    padding: 12px !important;
    border-radius: 6px !important;
    overflow-x: auto !important;
    margin: 8px 0 !important;
}

.ollama-chat-view .chat-message-user .message-content pre {
    background: rgba(255, 255, 255, 0.2) !important;
}

.ollama-chat-view .message-content pre code {
    background: transparent !important;
    padding: 0 !important;
}

.ollama-chat-view .message-content blockquote {
    border-left: 3px solid var(--text-muted) !important;
    padding-left: 12px !important;
    margin: 8px 0 !important;
    opacity: 0.8 !important;
}

.ollama-chat-view .message-content a {
    color: var(--text-accent) !important;
    text-decoration: underline !important;
}

.ollama-chat-view .chat-message-user .message-content a {
    color: rgba(255, 255, 255, 0.9) !important;
}

.ollama-chat-view .message-content table {
    border-collapse: collapse !important;
    margin: 8px 0 !important;
    width: 100% !important;
}

.ollama-chat-view .message-content th,
.ollama-chat-view .message-content td {
    border: 1px solid var(--background-modifier-border) !important;
    padding: 6px 12px !important;
    text-align: left !important;
}

.ollama-chat-view .message-content th {
    background: rgba(0, 0, 0, 0.05) !important;
    font-weight: 600 !important;
}

.ollama-chat-view .message-content hr {
    border: none !important;
    border-top: 1px solid var(--background-modifier-border) !important;
    margin: 12px 0 !important;
}

/* Typing indicator animation */
.ollama-chat-view .typing-indicator {
    display: flex !important;
    align-items: center !important;
    gap: 4px !important;
    padding: 8px 0 !important;
}

.ollama-chat-view .typing-indicator span {
    width: 8px !important;
    height: 8px !important;
    border-radius: 50% !important;
    background: var(--text-muted) !important;
    opacity: 0.6 !important;
    animation: typing-bounce 1.4s infinite ease-in-out !important;
}

.ollama-chat-view .typing-indicator span:nth-child(1) {
    animation-delay: 0s !important;
}

.ollama-chat-view .typing-indicator span:nth-child(2) {
    animation-delay: 0.2s !important;
}

.ollama-chat-view .typing-indicator span:nth-child(3) {
    animation-delay: 0.4s !important;
}

@keyframes typing-bounce {
    0%, 60%, 100% {
        transform: translateY(0);
        opacity: 0.6;
    }
    30% {
        transform: translateY(-8px);
        opacity: 1;
    }
}

.ollama-chat-view .message-sources {
    margin-top: 8px !important;
    font-size: 12px !important;
    color: var(--text-muted) !important;
    padding: 6px 10px !important;
    background: var(--background-primary-alt) !important;
    border-radius: 8px !important;
}

.ollama-chat-view .sources-label {
    font-weight: 500 !important;
}

.ollama-chat-view .source-link {
    color: var(--text-accent) !important;
    text-decoration: none !important;
    cursor: pointer !important;
}

.ollama-chat-view .source-link:hover {
    text-decoration: underline !important;
}

.ollama-chat-view .source-link.source-pinned {
    font-weight: 600 !important;
}

.ollama-chat-view .ollama-chat-input-container {
    padding: 12px 16px !important;
    border-top: 1px solid var(--background-modifier-border) !important;
    background: var(--background-secondary) !important;
    display: flex !important;
    gap: 8px !important;
    align-items: flex-end !important;
}

.ollama-chat-view .ollama-chat-input {
    flex: 1 !important;
    padding: 8px 12px !important;
    border-radius: 8px !important;
    border: 1px solid var(--background-modifier-border) !important;
    background: var(--background-primary) !important;
    font-size: 14px !important;
    font-family: inherit !important;
    resize: none !important;
    max-height: 150px !important;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1) !important;
}

.ollama-chat-view .ollama-chat-input:focus {
    outline: none !important;
    border-color: var(--interactive-accent) !important;
    box-shadow: 0 0 0 2px var(--interactive-accent-hover) !important;
}

.ollama-chat-view .ollama-send-button {
    width: 36px !important;
    height: 36px !important;
    border-radius: 8px !important;
    background: var(--interactive-accent) !important;
    color: white !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    cursor: pointer !important;
    font-size: 20px !important;
    font-weight: bold !important;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1) !important;
    flex-shrink: 0 !important;
}

.ollama-chat-view .ollama-send-button:hover {
    background: var(--interactive-accent-hover) !important;
    transform: translateY(-1px) !important;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2) !important;
}

.ollama-chat-view .ollama-send-button:active {
    transform: translateY(0) !important;
}

/* Stop button mode */
.ollama-chat-view .ollama-send-button.stop-mode {
    background: var(--text-error) !important;
}

.ollama-chat-view .ollama-send-button.stop-mode:hover {
    background: var(--text-error) !important;
    filter: brightness(1.1) !important;
}

.ollama-chat-view .ollama-send-button.stop-mode:active {
    filter: brightness(0.9) !important;
}
        `;
        document.head.appendChild(style);
    }

    async onClose() {
        // Cleanup if needed
    }
}

// ============================================================================
// OLLAMA CHAT MODULE - Main module class
// ============================================================================

class OllamaChatModule extends PluginModule {
    constructor(plugin) {
        super(plugin);
        this.id = 'ollama-chat';
        this.name = 'Ollama Chat';
        this.description = 'AI chat with RAG using local Ollama models';

        this.ollamaService = null;
        this.embeddingManager = null;
        this.fileWatcherDebounced = null;
    }

    async onEnable() {
        // Load settings
        const settings = this.getSettings();

        // Initialize services
        this.ollamaService = new OllamaService(settings.ollamaUrl || 'http://localhost:11434');
        this.embeddingManager = new EmbeddingManager(
            this.app,
            this.app.vault,
            this.ollamaService
        );

        // Load embeddings
        await this.embeddingManager.load();

        // Apply embedding model from settings (ensures consistency)
        if (settings.embeddingModel) {
            this.embeddingManager.metadata.model = settings.embeddingModel;
        }

        // Register custom view
        this.plugin.registerView(
            VIEW_TYPE_OLLAMA_CHAT,
            (leaf) => new OllamaChatView(leaf, this)
        );

        // Add ribbon icon
        this.plugin.addRibbonIcon('message-circle', 'Open Ollama Chat', () => {
            this.activateView();
        });

        // Add command to pin current note
        this.plugin.addCommand({
            id: 'ollama-chat-pin-note',
            name: 'Pin current note for chat context',
            callback: () => {
                const file = this.app.workspace.getActiveFile();
                if (file) {
                    const view = this.getView();
                    if (view?.chatManager) {
                        view.chatManager.pinNote(file.path);
                        view.updatePinnedNotesUI();
                        new Notice(`Pinned: ${file.basename}`);
                    }
                }
            }
        });

        // Setup file watcher for auto-embedding
        this.setupFileWatcher();

        // Test connection
        const connected = await this.ollamaService.testConnection();
        if (!connected) {
            new Notice('Warning: Cannot connect to Ollama. Make sure Ollama is running at ' + settings.ollamaUrl);
        }

        // Auto-open view
        this.activateView();
    }

    async onDisable() {
        // Save embeddings
        if (this.embeddingManager) {
            await this.embeddingManager.save();
        }

        // Clean up view
        this.app.workspace.detachLeavesOfType(VIEW_TYPE_OLLAMA_CHAT);
    }

    async activateView() {
        const { workspace } = this.app;

        let leaf = null;
        const leaves = workspace.getLeavesOfType(VIEW_TYPE_OLLAMA_CHAT);

        if (leaves.length > 0) {
            // View already exists, reveal it
            leaf = leaves[0];
        } else {
            // Create new leaf in right sidebar
            leaf = workspace.getRightLeaf(false);
            await leaf.setViewState({
                type: VIEW_TYPE_OLLAMA_CHAT,
                active: true
            });
        }

        workspace.revealLeaf(leaf);
    }

    getView() {
        const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_OLLAMA_CHAT);
        if (leaves.length > 0) {
            return leaves[0].view;
        }
        return null;
    }

    setupFileWatcher() {
        // Debounced function to handle file changes
        this.fileWatcherDebounced = debounce(async (file) => {
            if (!(file instanceof TFile) || file.extension !== 'md') return;

            const settings = this.getSettings();
            const autoEmbedFolders = settings.autoEmbedFolders || [];

            // Check if file is in auto-embed folders
            const shouldEmbed = autoEmbedFolders.length === 0 ||
                autoEmbedFolders.some(folder => file.path.startsWith(folder));

            if (shouldEmbed && this.embeddingManager.shouldReEmbed(file)) {
                await this.embeddingManager.embedNote(file);
                await this.embeddingManager.save();
            }
        }, 2000, true);

        // Register events
        this.plugin.registerEvent(
            this.app.vault.on('create', this.fileWatcherDebounced)
        );
        this.plugin.registerEvent(
            this.app.vault.on('modify', this.fileWatcherDebounced)
        );
    }

    async addSettings(containerEl) {
        const settings = this.getSettings();

        new Setting(containerEl)
            .setName('Ollama Server URL')
            .setDesc('URL where Ollama is running')
            .addText(text => text
                .setPlaceholder('http://localhost:11434')
                .setValue(settings.ollamaUrl || 'http://localhost:11434')
                .onChange(async (value) => {
                    await this.saveSettings({ ...settings, ollamaUrl: value });
                    if (this.ollamaService) {
                        this.ollamaService.setBaseUrl(value);
                    }
                }));

        // Fetch available models
        const availableModels = await this.ollamaService.listModels();
        const modelNames = availableModels.map(m => m.name);

        // Model Management Section
        containerEl.createEl('h4', { text: 'Model Management' });

        // Refresh models button
        new Setting(containerEl)
            .setName('Refresh Models')
            .setDesc('Reload the list of available models from Ollama')
            .addButton(button => button
                .setButtonText('Refresh')
                .onClick(async () => {
                    button.setDisabled(true);
                    button.setButtonText('Refreshing...');

                    // Reload settings to refresh the UI
                    const settingsTab = this.plugin.app.setting;
                    if (settingsTab?.activeTab?.display) {
                        settingsTab.activeTab.display();
                    }

                    button.setButtonText('Refreshed!');
                    setTimeout(() => {
                        button.setDisabled(false);
                        button.setButtonText('Refresh');
                    }, 1500);
                }));

        // Pull new model
        let pullModelInput;
        new Setting(containerEl)
            .setName('Pull New Model')
            .setDesc('Download a model from Ollama library (e.g., llama3.2, mistral, codellama)')
            .addText(text => {
                pullModelInput = text;
                text.setPlaceholder('llama3.2')
            })
            .addButton(button => button
                .setButtonText('Pull Model')
                .onClick(async () => {
                    const modelName = pullModelInput.getValue().trim();
                    if (!modelName) {
                        new Notice('Please enter a model name');
                        return;
                    }

                    button.setDisabled(true);
                    button.setButtonText('Pulling...');

                    try {
                        const stream = this.ollamaService.pullModel(modelName);
                        let lastStatus = '';

                        for await (const progress of stream) {
                            if (progress.percent !== null) {
                                button.setButtonText(`${progress.percent}%`);
                            } else if (progress.status && progress.status !== lastStatus) {
                                button.setButtonText(progress.status);
                                lastStatus = progress.status;
                            }
                        }

                        button.setButtonText('Success!');
                        new Notice(`Successfully pulled ${modelName}`);
                        pullModelInput.setValue('');

                        // Refresh the settings display after a delay
                        setTimeout(() => {
                            button.setDisabled(false);
                            button.setButtonText('Pull Model');
                            const settingsTab = this.plugin.app.setting;
                            if (settingsTab?.activeTab?.display) {
                                settingsTab.activeTab.display();
                            }
                        }, 2000);

                    } catch (error) {
                        button.setButtonText('Failed');
                        new Notice(`Failed to pull model: ${error.message}`);
                        setTimeout(() => {
                            button.setDisabled(false);
                            button.setButtonText('Pull Model');
                        }, 2000);
                    }
                }));

        const modelInfo = containerEl.createDiv({ cls: 'setting-item-description' });
        modelInfo.innerHTML = `Available models: <strong>${modelNames.length > 0 ? modelNames.join(', ') : 'None found'}</strong><br>Browse more at <a href="https://ollama.com/library" class="external-link">ollama.com/library</a>`;

        containerEl.createEl('h4', { text: 'Chat Settings' });

        new Setting(containerEl)
            .setName('Default Chat Model')
            .setDesc('Model to use for chat responses')
            .addDropdown(dropdown => {
                // Add available models
                if (modelNames.length > 0) {
                    modelNames.forEach(name => {
                        dropdown.addOption(name, name);
                    });
                } else {
                    dropdown.addOption('', 'No models available');
                }

                // Set current value or default
                const currentModel = settings.defaultChatModel || modelNames[0] || '';
                dropdown.setValue(currentModel);

                dropdown.onChange(async (value) => {
                    await this.saveSettings({ ...settings, defaultChatModel: value });
                });
            });

        new Setting(containerEl)
            .setName('Embedding Model')
            .setDesc('Model to use for generating embeddings (recommended: mxbai-embed-large)')
            .addDropdown(dropdown => {
                // Add available models
                if (modelNames.length > 0) {
                    modelNames.forEach(name => {
                        dropdown.addOption(name, name);
                    });
                } else {
                    dropdown.addOption('', 'No models available');
                }

                // Set current value or default
                const currentModel = settings.embeddingModel || modelNames.find(n => n.includes('embed')) || modelNames[0] || '';
                dropdown.setValue(currentModel);

                dropdown.onChange(async (value) => {
                    await this.saveSettings({ ...settings, embeddingModel: value });
                    if (this.embeddingManager) {
                        this.embeddingManager.metadata.model = value;
                    }
                });
            });

        new Setting(containerEl)
            .setName('Retrieved Notes Count')
            .setDesc('Number of similar notes to retrieve for context')
            .addSlider(slider => slider
                .setLimits(1, 10, 1)
                .setValue(settings.retrievalCount || 5)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    await this.saveSettings({ ...settings, retrievalCount: value });
                }));

        new Setting(containerEl)
            .setName('Temperature')
            .setDesc('Creativity of responses (0 = focused, 2 = creative)')
            .addSlider(slider => slider
                .setLimits(0, 2, 0.1)
                .setValue(settings.temperature || 0.7)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    await this.saveSettings({ ...settings, temperature: value });
                }));

        new Setting(containerEl)
            .setName('Max Response Tokens')
            .setDesc('Maximum length of responses')
            .addText(text => text
                .setPlaceholder('2048')
                .setValue(String(settings.maxTokens || 2048))
                .onChange(async (value) => {
                    const num = parseInt(value);
                    if (!isNaN(num) && num > 0) {
                        await this.saveSettings({ ...settings, maxTokens: num });
                    }
                }));

        new Setting(containerEl)
            .setName('System Prompt')
            .setDesc('Instructions for the AI assistant')
            .addTextArea(text => text
                .setPlaceholder('You are a helpful assistant...')
                .setValue(settings.systemPrompt || "You are a helpful assistant with access to the user's notes. Use the provided context to answer questions accurately.")
                .onChange(async (value) => {
                    await this.saveSettings({ ...settings, systemPrompt: value });
                }));

        // Embedding management
        containerEl.createEl('h4', { text: 'Embedding Management' });

        // Test embedding connection
        new Setting(containerEl)
            .setName('Test Embedding API')
            .setDesc('Test if Ollama can generate embeddings with your current model')
            .addButton(button => button
                .setButtonText('Test Embedding')
                .onClick(async () => {
                    button.setDisabled(true);
                    button.setButtonText('Testing...');

                    try {
                        const testText = 'This is a test note to verify that embeddings are working correctly in Obsidian.';
                        console.log('🧪 Testing embedding API...');
                        console.log('   Text:', testText);
                        console.log('   Model:', settings.embeddingModel || this.embeddingManager.metadata.model);
                        console.log('   Ollama URL:', this.ollamaService.baseUrl);

                        const embedding = await this.ollamaService.generateEmbedding(
                            testText,
                            settings.embeddingModel || this.embeddingManager.metadata.model
                        );

                        if (embedding && Array.isArray(embedding) && embedding.length > 0) {
                            button.setButtonText('✓ Success!');
                            new Notice(`✅ Embedding test successful!\nDimension: ${embedding.length}\nModel: ${settings.embeddingModel || this.embeddingManager.metadata.model}`, 5000);
                            console.log('✅ Embedding test successful!');
                            console.log('   Embedding dimension:', embedding.length);
                            console.log('   First 5 values:', embedding.slice(0, 5));
                        } else {
                            button.setButtonText('✗ Failed');
                            new Notice('❌ Embedding test failed: No embedding generated. Check console for details.', 5000);
                            console.error('❌ Embedding test failed: received', embedding);
                        }
                    } catch (error) {
                        button.setButtonText('✗ Error');
                        new Notice(`❌ Embedding test error: ${error.message}`, 5000);
                        console.error('❌ Embedding test error:', error);
                    }

                    setTimeout(() => {
                        button.setDisabled(false);
                        button.setButtonText('Test Embedding');
                    }, 3000);
                }));

        // Calculate embedding statistics
        const allFiles = this.app.vault.getMarkdownFiles();
        const totalNotes = allFiles.length;
        const embeddedCount = Object.keys(this.embeddingManager?.embeddings || {}).length;
        const needsEmbedding = allFiles.filter(f => this.embeddingManager.shouldReEmbed(f)).length;

        // Status display
        const statusContainer = containerEl.createDiv({ cls: 'ollama-embedding-status' });
        statusContainer.style.cssText = 'padding: 12px; background: var(--background-secondary); border-radius: 8px; margin-bottom: 12px;';

        const statusTitle = statusContainer.createEl('div', { cls: 'setting-item-name' });
        statusTitle.textContent = 'Embedding Status';
        statusTitle.style.marginBottom = '8px';

        const statsGrid = statusContainer.createDiv();
        statsGrid.style.cssText = 'display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; font-size: 13px;';

        const totalStat = statsGrid.createDiv();
        totalStat.innerHTML = `<div style="color: var(--text-muted); margin-bottom: 4px;">Total Notes</div><div style="font-size: 20px; font-weight: 600;">${totalNotes}</div>`;

        const embeddedStat = statsGrid.createDiv();
        embeddedStat.innerHTML = `<div style="color: var(--text-muted); margin-bottom: 4px;">Embedded</div><div style="font-size: 20px; font-weight: 600; color: var(--text-success);">${embeddedCount}</div>`;

        const remainingStat = statsGrid.createDiv();
        remainingStat.innerHTML = `<div style="color: var(--text-muted); margin-bottom: 4px;">Needs Embedding</div><div style="font-size: 20px; font-weight: 600; color: ${needsEmbedding > 0 ? 'var(--text-warning)' : 'var(--text-muted)'};">${needsEmbedding}</div>`;

        // Progress display (initially hidden)
        const progressContainer = statusContainer.createDiv();
        progressContainer.style.cssText = 'margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--background-modifier-border); display: none;';

        const progressText = progressContainer.createDiv();
        progressText.style.cssText = 'font-size: 12px; color: var(--text-muted); margin-bottom: 6px;';

        const progressBar = progressContainer.createDiv();
        progressBar.style.cssText = 'height: 4px; background: var(--background-modifier-border); border-radius: 2px; overflow: hidden;';

        const progressFill = progressBar.createDiv();
        progressFill.style.cssText = 'height: 100%; background: var(--interactive-accent); width: 0%; transition: width 0.3s ease;';

        const currentFileText = progressContainer.createDiv();
        currentFileText.style.cssText = 'font-size: 11px; color: var(--text-faint); margin-top: 6px; font-family: var(--font-monospace); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;';

        // Embed All Notes button
        new Setting(containerEl)
            .setName('Embed All Notes')
            .setDesc('Generate embeddings for all notes in the vault')
            .addButton(button => button
                .setButtonText('Start Embedding')
                .onClick(async () => {
                    button.setDisabled(true);
                    progressContainer.style.display = 'block';

                    const files = this.app.vault.getMarkdownFiles();
                    let count = 0;

                    await this.embeddingManager.embedMultipleNotes(files, (processed, total, currentFile) => {
                        count = processed;
                        const remaining = total - processed;
                        const percent = Math.round((processed / total) * 100);

                        // Update button
                        button.setButtonText(`${processed}/${total}`);

                        // Update progress bar
                        progressFill.style.width = `${percent}%`;

                        // Update text
                        progressText.textContent = `Processing: ${processed} of ${total} (${remaining} remaining)`;

                        // Update current file
                        if (currentFile) {
                            currentFileText.textContent = `Current: ${currentFile.path}`;
                        }

                        // Update stats
                        embeddedStat.innerHTML = `<div style="color: var(--text-muted); margin-bottom: 4px;">Embedded</div><div style="font-size: 20px; font-weight: 600; color: var(--text-success);">${processed}</div>`;
                        remainingStat.innerHTML = `<div style="color: var(--text-muted); margin-bottom: 4px;">Remaining</div><div style="font-size: 20px; font-weight: 600; color: var(--text-warning);">${remaining}</div>`;
                    });

                    button.setButtonText('Complete!');
                    progressText.textContent = `Successfully embedded ${count} notes`;
                    currentFileText.textContent = '';
                    new Notice(`Embedded ${count} notes`);

                    setTimeout(() => {
                        button.setDisabled(false);
                        button.setButtonText('Start Embedding');
                        progressContainer.style.display = 'none';

                        // Update final stats
                        const newEmbeddedCount = Object.keys(this.embeddingManager?.embeddings || {}).length;
                        embeddedStat.innerHTML = `<div style="color: var(--text-muted); margin-bottom: 4px;">Embedded</div><div style="font-size: 20px; font-weight: 600; color: var(--text-success);">${newEmbeddedCount}</div>`;
                        remainingStat.innerHTML = `<div style="color: var(--text-muted); margin-bottom: 4px;">Needs Embedding</div><div style="font-size: 20px; font-weight: 600; color: var(--text-muted);">0</div>`;
                    }, 3000);
                }));
    }
}

// Export the module
module.exports = OllamaChatModule;
