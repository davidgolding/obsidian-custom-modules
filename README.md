# Custom Modules

A modular plugin that allows for personally crafted elements to be implemented similarly to core plugins. Intended for developers wanting to quick-test a function or narrow feature without assembling a dedicated plugin architecture around it.

## Key Features

- **Modular Architecture**
    - Base `PluginModule` class: All features inherit from this, making it easy to add new modules.
    - Isolated functionality: Each feature is completely self-contained.
    - Easy extension: Just create a new class extending `PluginModule`.
- **Settings Panel**
    - Clean settings interface with toggle switches.
    - Real-time enable-disable without restarting Obsidian.
    - Persistent settings storage.
    - Easy to add new settings for future features.
- **Current Modules**
    - Bracket Link Fix: Makes sure Obsidian doesn't style regular brackets like external links.
    - White Canvas Mode: Allows the note canvas to have a white background while the rest of the interface remains in dark mode.
    - Smartify Quotes: Provides a button that detects straight quotes in the active note and converts them to proper apostrophes and quotation marks.
    - Bulk Create Notes: Detects inactive internal links in the active note and creates new note files for them.

## How to Add New Features

To add a new feature, simply:

1. **Create a new module class**:

```javascript
class MyNewFeatureModule extends PluginModule {
    async onEnable() {
        // Enable logic here
    }
    
    async onDisable() {
        // Cleanup logic here
    }
}
```

2. **Add it to the main plugin**:

```javascript
// In onload()
this.modules.myNewFeature = new MyNewFeatureModule(this);

// In DEFAULT_SETTINGS
const DEFAULT_SETTINGS = {
    bracketLinkFix: true,
    whiteCanvasMode: true,
    smartifyQuotes: true,
    bulkCreate: true,
    myNewFeature: false  // Add this
};
```

3. **Add setting to the settings tab**:

```javascript
// In CustomModulesSettingTab.display()
new Setting(containerEl)
    .setName('My New Feature')
    .setDesc('Description of what it does')
    .addToggle(toggle => toggle
        .setValue(this.plugin.settings.myNewFeature)
        .onChange(async (value) => {
            this.plugin.settings.myNewFeature = value;
            await this.plugin.saveSettings();
            await this.plugin.toggleModule('myNewFeature', value);
        })
    );
```

## Usage

1. Edit `main.js` to build your custom module functions
2. Restart Obsidian
3. Go to Settings → Custom Modules to enable/disable the new module
4. Each feature can be toggled independently in real-time

The architecture is now set up for easy expansion of future personal productivity features.