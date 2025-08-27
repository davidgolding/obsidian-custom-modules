# Custom Modules Plugin - Developer Guide

## Overview

The Custom Modules Plugin provides a framework for creating and managing custom functionality in Obsidian. It separates core modules (that ship with the plugin) from user modules (that you create), ensuring your custom modules are never overwritten during plugin updates.

## File Structure

```
your-vault/.obsidian/plugins/custom-modules/
├── main.js                 # Core plugin framework (DO NOT EDIT)
├── core-modules.js         # Built-in modules (DO NOT EDIT)
├── manifest.json          # Plugin manifest (DO NOT EDIT)
├── user-modules/          # Your custom modules go here
│   ├── example-module.js  # Sample module (can be deleted)
│   └── your-module.js     # Your custom modules
└── data.json             # Plugin settings (auto-generated)
```

## Creating Custom Modules

### Basic Module Structure

Create a new `.js` file in the `user-modules` folder:

```javascript
// user-modules/my-custom-module.js

// Access the API
const { PluginModule } = window.CustomModulesAPI;
const { Notice } = require('obsidian');

class MyCustomModule extends PluginModule {
    constructor(plugin) {
        super(plugin);
        this.id = 'my-custom-module';           // Unique identifier
        this.name = 'My Custom Module';         // Display name
        this.description = 'What this module does'; // Description
    }

    async onEnable() {
        // Called when module is enabled
        console.log('Module enabled!');
        
        // Add commands, events, UI elements, etc.
        this.plugin.addCommand({
            id: 'my-command',
            name: 'My Custom Command',
            callback: () => {
                new Notice('Hello from my module!');
            }
        });
    }

    async onDisable() {
        // Called when module is disabled
        // Clean up resources, remove UI elements, etc.
        console.log('Module disabled!');
    }
}

// Export your module
module.exports = MyCustomModule;
```

### Module with Settings

```javascript
class AdvancedModule extends PluginModule {
    constructor(plugin) {
        super(plugin);
        this.id = 'advanced-module';
        this.name = 'Advanced Module';
        this.description = 'Module with custom settings';
    }

    async onEnable() {
        // Load settings
        const settings = this.getSettings();
        this.myOption = settings.myOption || 'default value';
        
        // Use the settings
        console.log('Option value:', this.myOption);
    }

    // Add custom settings UI
    addSettings(containerEl) {
        const { Setting } = require('obsidian');
        const settings = this.getSettings();
        
        new Setting(containerEl)
            .setName('My Option')
            .setDesc('Description of this option')
            .addText(text => text
                .setValue(settings.myOption || '')
                .onChange(async (value) => {
                    // Save the setting
                    await this.saveSettings({ 
                        ...settings, 
                        myOption: value 
                    });
                    this.myOption = value;
                })
            );
    }
}
```

## Available APIs

### Base Properties and Methods

Every module has access to:

- `this.plugin` - The main plugin instance
- `this.app` - The Obsidian app instance
- `this.id` - Module identifier
- `this.name` - Module display name
- `this.description` - Module description
- `this.enabled` - Whether module is currently enabled

### Helper Methods

- `getSettings()` - Get saved settings for this module
- `saveSettings(settings)` - Save settings for this module
- `addSettings(containerEl)` - Override to add custom settings UI

### Obsidian APIs

You can use all Obsidian APIs through `this.app` and `this.plugin`:

```javascript
// Access workspace
const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);

// Register events
this.plugin.registerEvent(
    this.app.workspace.on('file-open', (file) => {
        console.log('File opened:', file.name);
    })
);

// Add commands
this.plugin.addCommand({
    id: 'my-command',
    name: 'My Command',
    callback: () => { /* ... */ }
});

// Add status bar items
const statusBarItem = this.plugin.addStatusBarItem();
statusBarItem.setText('Status');

// Add ribbon icons
this.plugin.addRibbonIcon('dice', 'Tooltip', () => {
    new Notice('Ribbon clicked!');
});
```

## Module Lifecycle

1. **Registration**: When the plugin loads, it scans the `user-modules` folder and registers all modules
2. **Initialization**: Modules are initialized based on saved settings
3. **Enable**: When enabled, the module's `onEnable()` method is called
4. **Running**: Module functionality is active
5. **Disable**: When disabled, the module's `onDisable()` method is called

## Best Practices

### 1. Unique IDs
Always use unique module IDs to avoid conflicts:
```javascript
this.id = 'your-username-module-name';
```

### 2. Clean Up Resources
Always clean up in `onDisable()`:
```javascript
async onDisable() {
    // Remove UI elements
    if (this.buttonEl) this.buttonEl.remove();
    
    // Clear intervals/timeouts
    if (this.intervalId) clearInterval(this.intervalId);
    
    // Disconnect observers
    if (this.observer) this.observer.disconnect();
}
```

### 3. Error Handling
Wrap risky operations in try-catch:
```javascript
async onEnable() {
    try {
        await this.riskyOperation();
    } catch (error) {
        console.error('Module error:', error);
        new Notice(`Error in ${this.name}: ${error.message}`);
    }
}
```

### 4. Performance
- Debounce frequent operations
- Use observers instead of polling
- Clean up event listeners when disabled

## Updating the Plugin

When the main plugin is updated:
1. Your `user-modules` folder is preserved
2. Your module settings are preserved
3. Only `main.js` and `core-modules.js` are updated

## Troubleshooting

### Module Not Appearing
- Ensure the file is in the `user-modules` folder
- Check for JavaScript syntax errors in the console (Ctrl+Shift+I)
- Try the "Reload User Modules" button in settings

### Module Crashes
- Check the developer console for errors
- Ensure all required Obsidian modules are imported
- Verify the module exports correctly

### Settings Not Saving
- Make sure to use `this.saveSettings()` method
- Settings are stored per module ID, so keep IDs consistent

## Examples

The plugin includes several examples:
1. `example-module.js` - Basic module structure
2. `note-statistics.js` - Advanced module with settings and status bar
3. Core modules in `core-modules.js` - Reference implementations

## Support

For issues or questions:
1. Check the developer console for errors
2. Review the example modules
3. Ensure you're using the latest plugin version
4. Report issues on the plugin's GitHub repository

Remember: Never edit `main.js` or `core-modules.js` directly - these files will be overwritten during updates!