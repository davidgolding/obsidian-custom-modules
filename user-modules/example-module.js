// Example Custom Module
// This file demonstrates how to create a custom module for the Custom Modules Plugin

// Get the PluginModule base class from the global API
const { PluginModule } = window.CustomModulesAPI;

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
