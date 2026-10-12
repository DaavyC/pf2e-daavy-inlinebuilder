# PF2e Daavy's Inline Builder

Create area templates, damage rolls, saving throws, and outcome effects in PF2e descriptions.

---

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/C1I7209LY1)

---

## Features

- Open Inline Builder from a supported description editor or press `Ctrl + Shift + T`. It reads compatible text from the description. If no editor is active, it copies the output to the clipboard.
- Create `@Template` text for burst, cone, square, and line areas.
- Create `@Damage` text with a damage type and traits.
- Create `@Check` text with a save type, DC, basic save, and DC visibility.
- Use NPC level suggestions for DCs and damage.
- Add conditions, damage, and persistent damage to save outcomes.

## Automations

Enable Target Helper and Target Helper Automations in Daavy's Addons settings. Target Helper rolls saves and applies outcome damage to selected targets. Inline Builder adds the conditions and persistent damage configured for each outcome and sends outcome damage to Daavy's Addons to apply.

Daavy's Addons applies its damage multipliers to basic saves. Its permissions and NPC-only setting control outcome automation.

## Settings

| Setting | Effect |
| --- | --- |
| Theme | Choose Default or Light for Inline Builder windows. |

GMs can donate, visit Discord, and submit bug reports or suggestions from the module settings.

## Installation

In Foundry VTT, open Add-on Modules, choose Install Module, and enter the manifest URL:

<https://github.com/DaavyC/pf2e-daavy-inlinebuilder/releases/latest/download/module.json>

## Compatibility

- Requires Foundry VTT 14.
- Requires Pathfinder Second Edition.
- Requires Daavy's Addons for Target Helper automation.
