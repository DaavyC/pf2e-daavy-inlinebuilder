# 🛠️ PF2e Daavy's Inline Builder

A **Foundry VTT** module for **Pathfinder Second Edition** that helps build PF2e inline text for actions, spells, hazards, and NPC abilities.

---

## ✨ Core Features

- **📝 Editor Button** — Opens the builder from supported description editors.
- **🎯 Area Templates** — Creates `@Template` text for burst, cone, square, and line areas.
- **🔥 Damage Builder** — Creates `@Damage` text with type and traits.
- **🛡️ Saving Throws** — Creates `@Check` text with save type, DC, basic save, and visibility.
- **🔁 Existing Text** — Reads compatible descriptions and pre-fills the builder.
- **📋 Clipboard Fallback** — Copies the output when no editor is available.
- **⌨️ Shortcut** — Opens the builder with `Ctrl + Shift + T`.

---

## 🧩 PF2e Helpers

- **📊 DC Suggestions** — Suggests DCs by level and intensity.
- **⚔️ Damage Suggestions** — Suggests area or strike damage by level.
- **🏷️ Condition Picker** — Adds PF2e condition tags to automation fields.
- **✍️ Comfort Editor** — Opens a larger editor for automation text.
- **🔗 Short Tags** — Converts `{frightened 1}`, `{dmg-2d6-fire}`, and `{pd-1d6-fire}` into PF2e inline links.

---

## 🤖 Automation

Works with **PF2e Toolbelt Target Helper** when it is active and enabled.

- Rolls pending target saves.
- Applies result-based automation text.
- Creates and applies automatic damage rolls.
- Applies persistent damage conditions.
- Includes optional automation debug logs.

---

## 🧪 Compatibility

- **Foundry VTT**: 14.
- **System**: PF2e 8.1.2+.
- **Optional**: PF2e Toolbelt for target-helper automation.

---

## 📦 Installation

Use this manifest URL in Foundry:

```text
https://github.com/DaavyC/pf2e-daavy-inlinebuilder/raw/main/module.json
```

---

## Credits

- **[PF2e Toolbelt](https://github.com/reonZ/pf2e-toolbelt)** by ReonZ

---

> This module was built for personal use with AI-assisted development.
