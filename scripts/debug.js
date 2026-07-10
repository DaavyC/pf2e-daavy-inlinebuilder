import { MODULE_ID, localize } from "./config.js";

const DEBUG_SETTING = "debugAutomation";
let readyLogRegistered = false;

function isDebugEnabled() {
    try {
        return game.settings.get(MODULE_ID, DEBUG_SETTING) === true;
    } catch {
        return false;
    }
}

function registerDebugSettings() {
    if (game.settings.settings.has(`${MODULE_ID}.${DEBUG_SETTING}`)) return;

    game.settings.register(MODULE_ID, DEBUG_SETTING, {
        name: localize("settings.debugAutomation.name", "Debug"),
        hint: localize("settings.debugAutomation.hint", "Don't enable this unless you know what you're doing."),
        scope: "world",
        config: true,
        type: Boolean,
        default: false,
        onChange: (enabled) => {
            if (enabled) console.log(`[${MODULE_ID}] debug enabled`, { module: MODULE_ID });
        }
    });

    if (readyLogRegistered) return;
    readyLogRegistered = true;
    Hooks.once("ready", () => {
        if (isDebugEnabled()) console.log(`[${MODULE_ID}] debug ready`, { module: MODULE_ID });
    });
}

function debugDamage(event, data = {}) {
    if (isDebugEnabled()) console.log(`[${MODULE_ID}] damage:${event}`, data);
}

function getDamageApplicationLogData(application) {
    return {
        uuid: application.uuid,
        id: application.id,
        outcome: application.outcome,
        multiplier: application.multiplier,
        globalKey: application.globalKey
    };
}

export {
    debugDamage,
    getDamageApplicationLogData,
    registerDebugSettings
};
