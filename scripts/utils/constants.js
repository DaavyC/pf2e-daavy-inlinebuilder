export const MODULE_ID = "pf2e-daavy-inlinebuilder";
export const TOOLBELT_ID = "pf2e-toolbelt";

export function localize(path, fallback, data = null) {
    const key = `${MODULE_ID}.${path}`;
    const i18n = globalThis.game?.i18n;
    const value = data && typeof i18n?.format === "function"
        ? i18n.format(key, data)
        : i18n?.localize?.(key);
    return value && value !== key ? value : fallback;
}
