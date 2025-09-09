// main.js - Core Plugin Framework
const { Plugin, MarkdownView, WorkspaceLeaf, Setting, PluginSettingTab, setIcon, Notice } = require('obsidian');
const path = require('path');

// Default settings
const DEFAULT_SETTINGS = {
    enabledModules: {},
    moduleSettings: {},
    userModulesFolder: ''
};

// Base class for all plugin modules (exported for user modules)
class PluginModule {
    constructor(plugin) {
        this.plugin = plugin;
        this.app = plugin.app;
        this.enabled = false;
        this.id = this.constructor.name;
        this.name = this.id;
        this.description = '';
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

    getSettings() {
        return this.plugin.settings.moduleSettings[this.id] || {};
    }

    async saveSettings(settings) {
        this.plugin.settings.moduleSettings[this.id] = settings;
        await this.plugin.saveSettings();
    }

    // Method for modules to add their own settings
    addSettings(containerEl) {
        // Override in subclasses to add custom settings
    }
}

// Module Registry - manages all modules
class ModuleRegistry {
    constructor(plugin) {
        this.plugin = plugin;
        this.modules = new Map();
        this.moduleOrder = [];
    }

    register(moduleClass, options = {}) {
        const module = new moduleClass(this.plugin);

        if (options.id) module.id = options.id;
        if (options.name) module.name = options.name;
        if (options.description) module.description = options.description;

        this.modules.set(module.id, module);
        this.moduleOrder.push(module.id);

        return module;
    }

    unregister(moduleId) {
        const module = this.modules.get(moduleId);
        if (module && module.enabled) {
            module.disable();
        }
        this.modules.delete(moduleId);
        const index = this.moduleOrder.indexOf(moduleId);
        if (index > -1) {
            this.moduleOrder.splice(index, 1);
        }
    }

    getModule(moduleId) {
        return this.modules.get(moduleId);
    }

    getAllModules() {
        return this.moduleOrder.map(id => this.modules.get(id));
    }

    async enableModule(moduleId) {
        const module = this.modules.get(moduleId);
        if (module) {
            await module.enable();
            this.plugin.settings.enabledModules[moduleId] = true;
            await this.plugin.saveSettings();
        }
    }

    async disableModule(moduleId) {
        const module = this.modules.get(moduleId);
        if (module) {
            await module.disable();
            this.plugin.settings.enabledModules[moduleId] = false;
            await this.plugin.saveSettings();
        }
    }

    async disableAll() {
        for (const module of this.modules.values()) {
            await module.disable();
        }
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

        new Setting(containerEl)
        .setName('User modules folder')
        .setDesc('Path to your folder for user-created modules, relative to the vault root. Leave blank to use the default "user-modules" folder inside the plugin directory.')
        .addText(text => text
            .setPlaceholder('Example: scripts/modules')
            .setValue(this.plugin.settings.userModulesFolder)
            .onChange(async (value) => {
                this.plugin.settings.userModulesFolder = value.trim();
                await this.plugin.saveSettings();
            }));

        containerEl.createEl('hr');

        // Core modules section
        const coreSection = containerEl.createEl('div', { cls: 'custom-modules-core-section' });
        coreSection.createEl('h3', { text: 'Core Modules' });

        // User modules section
        const userSection = containerEl.createEl('div', { cls: 'custom-modules-user-section' });
        userSection.createEl('h3', { text: 'User Modules' });

        let hasCoreModules = false;
        let hasUserModules = false;

        // Display all registered modules
        for (const module of this.plugin.registry.getAllModules()) {
            const isCore = module.id.startsWith('core-');
            const section = isCore ? coreSection : userSection;

            if (isCore) hasCoreModules = true;
            else hasUserModules = true;

            const moduleContainer = section.createEl('div', { cls: 'custom-module-container' });

            // Main toggle for the module
            new Setting(moduleContainer)
                .setName(module.name)
                .setDesc(module.description)
                .addToggle(toggle => toggle
                    .setValue(this.plugin.settings.enabledModules[module.id] || false)
                    .onChange(async (value) => {
                        if (value) {
                            await this.plugin.registry.enableModule(module.id);
                        } else {
                            await this.plugin.registry.disableModule(module.id);
                        }
                    })
                );

            // Let the module add its own settings
            const moduleSettingsContainer = moduleContainer.createEl('div', { cls: 'custom-module-settings' });
            module.addSettings(moduleSettingsContainer);
        }

        if (!hasCoreModules) {
            coreSection.createEl('p', { text: 'No core modules loaded.', cls: 'setting-item-description' });
        }

        if (!hasUserModules) {
            userSection.createEl('p', { text: 'No user modules found. Add custom modules to the "user-modules" folder in the plugin directory or the path you\'ve entered in "User modules folder."', cls: 'setting-item-description' });
        }

        // Add information about creating custom modules
        containerEl.createEl('hr');
        const infoSection = containerEl.createEl('div', { cls: 'custom-modules-info-section' });
        infoSection.createEl('h3', { text: 'Creating Custom Modules' });
        infoSection.createEl('p', {
            text: 'To create custom modules, add JavaScript files to the "user-modules" folder in this plugin\'s directory or in the path you\'ve entered in "User modules folder." Each module should export a class extending PluginModule.',
            cls: 'setting-item-description'
        });

        // Add reload button
        new Setting(infoSection)
            .setName('Reload User Modules')
            .setDesc('Reload all user modules from the user modules folder')
            .addButton(button => button
                .setButtonText('Reload')
                .onClick(async () => {
                    await this.plugin.loadUserModules();
                    this.display(); // Refresh the settings display
                    new Notice('User modules reloaded');
                })
            );
    }
}

// Main Plugin Class
class CustomModulesPlugin extends Plugin {
    constructor() {
        super(...arguments);
        this.settings = DEFAULT_SETTINGS;
        this.registry = new ModuleRegistry(this);
        // Make obsidian available to the plugin instance
        this.obsidian = require('obsidian');
    }

    async onload() {
        // Set up paths
        const adapter = this.app.vault.adapter;

        //Load settings first, so we know the custom user-modules path
        await this.loadSettings();

        const userModulesPath = this.getUserModulesPath();

        // Ensure user-modules directory exists
        if (!await adapter.exists(userModulesPath)) {
            await adapter.mkdir(userModulesPath);
            // Create a sample module file
            await this.createSampleModule();
        }

        // Load core modules
        await this.loadCoreModules();

        // Load user modules
        await this.loadUserModules();

        // Add settings tab
        this.addSettingTab(new CustomModulesSettingTab(this.app, this));

        // Enable modules based on settings
        this.app.workspace.onLayoutReady(async () => {
            await this.initializeModules();
        });

        // Export PluginModule class for user modules
        window.CustomModulesAPI = {
            PluginModule: PluginModule,
            registry: this.registry
        };
    }

    async onunload() {
        // Disable all modules
        await this.registry.disableAll();

        // Clean up API
        delete window.CustomModulesAPI;
    }

    getUserModulesPath() {
        if (this.settings.userModulesFolder) {
            // Use the user-defined path if it's set
            return this.settings.userModulesFolder;
        }
        // Fallback to the default location inside the plugin folder
        return path.join(this.manifest.dir, 'user-modules');
    }

    /**
     * Executes module code from a string by wrapping it in a function
     * to simulate a CommonJS environment (provides module, exports).
     * @param {string} code The JavaScript code to execute.
     * @param {string} filepath The path of the file for error reporting.
     * @returns {any} The value of module.exports from the executed code.
     */
    executeModuleCode(code, filepath, context = {}) {
        try {
            const module = { exports: {} };
            const exports = module.exports;

            const contextKeys = Object.keys(context);
            const contextValues = Object.values(context);

            const fn = new Function('module', 'exports', ...contextKeys, code);
            fn.call(module.exports, module, exports, ...contextValues);
            return module.exports;
        } catch (error) {
            console.error(`Error executing code from ${filepath}:`, error);
            new Notice(`Error in module: ${path.basename(filepath)}`);
            return null;
        }
    }

    async loadCoreModules() {
        try {
            const coreModulesPath = path.join(this.manifest.dir, 'core-modules.js');
            if (await this.app.vault.adapter.exists(coreModulesPath)) {
                const coreModulesContent = await this.app.vault.adapter.read(coreModulesPath);
                // Add PluginModule to the context
                const coreModules = this.executeModuleCode(coreModulesContent, coreModulesPath, { obsidian: this.obsidian, PluginModule });

                if (coreModules && coreModules.modules && Array.isArray(coreModules.modules)) {
                    for (const ModuleClass of coreModules.modules) {
                        this.registry.register(ModuleClass);
                    }
                }
            }
        } catch (error) {
            console.error('Failed to load core modules:', error);
        }
    }

    async loadUserModules() {
        // Clear existing user modules
        const userModuleIds = Array.from(this.registry.modules.keys()).filter(id => !id.startsWith('core-'));
        for (const id of userModuleIds) {
            this.registry.unregister(id);
        }

        try {
            const adapter = this.app.vault.adapter;
            const userModulesPath = this.getUserModulesPath();

            if (!await adapter.exists(userModulesPath)) {
                return; // Folder doesn't exist, nothing to load
            }

            const files = await adapter.list(userModulesPath);
            const jsFiles = files.files.filter(f => f.endsWith('.js'));

            for (const file of jsFiles) {
                try {
                    const moduleContent = await adapter.read(file);
                    const userModule = this.executeModuleCode(moduleContent, file, { obsidian: this.obsidian, PluginModule });

                    if (!userModule) continue; // Skip if execution failed

                    // Register the module class
                    if (userModule.default) {
                        this.registry.register(userModule.default);
                    } else if (typeof userModule === 'function') {
                        this.registry.register(userModule);
                    } else if (userModule.module) {
                        this.registry.register(userModule.module);
                    }
                } catch (error) {
                    console.error(`Failed to load user module ${file}:`, error);
                    new Notice(`Failed to load module: ${path.basename(file)}`);
                }
            }
        } catch (error) {
            console.error('Failed to load user modules:', error);
        }
    }

    async createSampleModule() {
        const sampleCode = `// Example Custom Module
// This file demonstrates how to create a custom module for the Custom Modules Plugin
const { Notice, Setting } = obsidian;

class ExampleModule extends PluginModule {
    constructor(plugin) {
        super(plugin);
        this.id = 'example-module';
        this.name = 'Example Module';
        this.description = 'A sample module showing how to create custom functionality';
    }

    async onEnable() {
        // This runs when the module is enabled
        console.log('Example Module enabled!');

        // Example: Add a command
        this.plugin.addCommand({
            id: 'example-command',
            name: 'Example Module: Show Notice',
            callback: () => {
                new Notice('Hello from Example Module!');
            }
        });
    }

    async onDisable() {
        // This runs when the module is disabled
        console.log('Example Module disabled!');

        // Clean up any resources, event listeners, etc.
    }

    // Optional: Add custom settings for this module
    addSettings(containerEl) {
        const { Setting } = require('obsidian');

        const settings = this.getSettings();

        new Setting(containerEl)
            .setName('Example Setting')
            .setDesc('This is an example setting for the module')
            .addText(text => text
                .setPlaceholder('Enter value')
                .setValue(settings.exampleValue || '')
                .onChange(async (value) => {
                    await this.saveSettings({ ...settings, exampleValue: value });
                })
            );
    }
}

// Export the module class
module.exports = ExampleModule;
`;

        const userModulesPath = this.getUserModulesPath();
        const examplePath = path.join(userModulesPath, 'example-module.js');
        await this.app.vault.adapter.write(examplePath, sampleCode);
    }

    async initializeModules() {
        for (const [moduleId, isEnabled] of Object.entries(this.settings.enabledModules)) {
            if (isEnabled) {
                const module = this.registry.getModule(moduleId);
                if (module) {
                    await module.enable();
                }
            }
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