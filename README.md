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

Turn on Target Helper and Template Helper in Daavy's Addons to place templates from item cards. Turn on Automations to roll saves and apply each result's conditions and damage to selected targets. A GM must be online, and the sender must own the source actor or be the GM.

Inline Builder applies outcome damage as written. Daavy's Addons applies basic-save multipliers to the item's normal damage. The NPCs only setting can restrict outcome effects to NPCs.

## Settings

| Setting | Effect |
| --- | --- |
| Theme | Choose Default or Light for Inline Builder windows. |

## Installation

In Foundry VTT, open Add-on Modules, choose Install Module, and enter the manifest URL:

<https://github.com/DaavyC/pf2e-daavy-inlinebuilder/releases/latest/download/module.json>

## Compatibility

- Requires Foundry VTT 14.
- Requires Pathfinder Second Edition.
- Requires Daavy's Addons.
