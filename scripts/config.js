const MODULE_ID = "pf2e-daavy-inlinebuilder";
const TOOLBELT_ID = "pf2e-toolbelt";

const MODULE_FLAGS = {
    automaticDamage: "automaticDamage",
    damageAutomationComplete: "damageAutomationComplete",
    damageJobId: "damageJobId",
    processedDamage: "processedDamage",
    processedDamageJobs: "processedDamageJobs",
    sourceMessage: "sourceMessage"
};

const MODULE_PATHS = {
    root: `modules/${MODULE_ID}`,
    scripts: `modules/${MODULE_ID}/scripts`,
    styles: `modules/${MODULE_ID}/styles`,
    templates: `modules/${MODULE_ID}/templates`
};

function localize(path, fallback, data = null) {
    const key = `${MODULE_ID}.${path}`;
    const i18n = globalThis.game?.i18n;
    const value = data && typeof i18n?.format === "function"
        ? i18n.format(key, data)
        : i18n?.localize?.(key);
    return value && value !== key ? value : fallback;
}

export {
    MODULE_FLAGS,
    MODULE_ID,
    MODULE_PATHS,
    TOOLBELT_ID,
    localize
};
