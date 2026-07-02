const PF2E_CONDITION_MAP = {
    "doomed": "Compendium.pf2e.conditionitems.Item.3uh1r86TzbQvosxv",
    "drained": "Compendium.pf2e.conditionitems.Item.4D2KBtexWXa6oUMR",
    "paralyzed": "Compendium.pf2e.conditionitems.Item.6uEgoh53GbXuHpTF",
    "deafened": "Compendium.pf2e.conditionitems.Item.9PR9y0bi4JPKnHPR",
    "controlled": "Compendium.pf2e.conditionitems.Item.9qGBRpbX9NEwtAAr",
    "fascinated": "Compendium.pf2e.conditionitems.Item.AdPVz7rbaVSRxHFg",
    "off-guard": "Compendium.pf2e.conditionitems.Item.AJh5ex99aV6VTggg",
    "stunned": "Compendium.pf2e.conditionitems.Item.dfCMdR4wnpbYNTix",
    "petrified": "Compendium.pf2e.conditionitems.Item.dTwPJuKgBQCMxixg",
    "stupefied": "Compendium.pf2e.conditionitems.Item.e1XGnhKNSQIm5IXg",
    "immobilized": "Compendium.pf2e.conditionitems.Item.eIcWbB5o3pP6OIMe",
    "unconscious": "Compendium.pf2e.conditionitems.Item.fBnFDH2MTzgFijKf",
    "sickened": "Compendium.pf2e.conditionitems.Item.fesd1n5eVhpCSS18",
    "fatigued": "Compendium.pf2e.conditionitems.Item.HL2l2VRSaQHu9lUw",
    "clumsy": "Compendium.pf2e.conditionitems.Item.i3OJZU2nk64Df3xm",
    "prone": "Compendium.pf2e.conditionitems.Item.j91X7x0XSomq8d60",
    "grabbed": "Compendium.pf2e.conditionitems.Item.kWc1fhmv9LBiTuei",
    "persistent-damage": "Compendium.pf2e.conditionitems.Item.lDVqvLKA6eF3Df60",
    "enfeebled": "Compendium.pf2e.conditionitems.Item.MIRkyAjyBeXivMa7",
    "quickened": "Compendium.pf2e.conditionitems.Item.nlCjDvLMf2EkV2dl",
    "fleeing": "Compendium.pf2e.conditionitems.Item.sDPxOjQ9kx2RZE8D",
    "frightened": "Compendium.pf2e.conditionitems.Item.TBSHQspnbcqxsmjL",
    "dazzled": "Compendium.pf2e.conditionitems.Item.TkIyaNPgTZFBCCuh",
    "restrained": "Compendium.pf2e.conditionitems.Item.VcDeM8A5oI6VqhbM",
    "blinded": "Compendium.pf2e.conditionitems.Item.XgEqL1kFApUbl5Z2",
    "slowed": "Compendium.pf2e.conditionitems.Item.xYTAsEpcJE1Ccni3",
    "confused": "Compendium.pf2e.conditionitems.Item.yblD8fOR1J8rDwEQ",
    "invisible": "Compendium.pf2e.conditionitems.Item.zJxUflt9np0q4yML",
    "damage": "Damage"
};
const PF2E_CONDITIONS = Object.keys(PF2E_CONDITION_MAP);
const PF2E_CONDITION_SET = new Set(PF2E_CONDITIONS);
const VALUED_CONDITIONS = ["doomed", "drained", "stunned", "stupefied", "sickened", "clumsy", "enfeebled", "quickened", "frightened", "slowed"];
const VALUED_CONDITION_SET = new Set(VALUED_CONDITIONS);
const DAMAGE_TYPES = ["acid", "bleed", "bludgeoning", "cold", "electricity", "fire", "force", "mental", "piercing", "poison", "slashing", "sonic", "spirit", "vitality", "void"];

const SORTED_DAMAGE_TYPES = [...DAMAGE_TYPES].sort((left, right) => right.length - left.length);
const AUTOMATION_OUTCOME_BY_LABEL = new Map([
    ["critical success", "criticalSuccess"],
    ["success", "success"],
    ["failure", "failure"],
    ["critical failure", "criticalFailure"]
]);

function uniqueBy(values, keyFn, mapFn = (value) => value) {
    const uniqueValues = [];
    const seen = new Set();

    for (const value of values) {
        const key = keyFn(value);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        uniqueValues.push(mapFn(value));
    }

    return uniqueValues;
}

function normalizeText(value) {
    return (value ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim()
        .replace(/\s+/g, " ")
        .toLowerCase();
}

function parseShortDamageTag(content, prefix) {
    if (typeof content !== "string" || !content.toLowerCase().startsWith(prefix)) return null;

    const body = content.slice(prefix.length);
    const lowerBody = body.toLowerCase();
    for (const damageType of SORTED_DAMAGE_TYPES) {
        const suffix = `-${damageType.toLowerCase()}`;
        if (!lowerBody.endsWith(suffix)) continue;

        const formula = body.slice(0, body.length - suffix.length).trim();
        return formula ? { formula, type: damageType } : null;
    }

    return null;
}

function convertAutomationToken(match, inner) {
    const content = inner.trim();
    const persistentDamage = parseShortDamageTag(content, "pd-");
    if (persistentDamage) {
        return `@Damage[${persistentDamage.formula}[persistent,${persistentDamage.type}]]`;
    }

    const damage = parseShortDamageTag(content, "dmg-");
    if (damage) {
        return `@Damage[${damage.formula}[${damage.type}]]`;
    }

    const parts = content.split(/\s+/);
    let label = parts.join(" ");
    if (parts.length > 1 && /^\d+$/.test(parts.at(-1))) {
        const labelParts = parts.slice(0, -1);
        const labelSlug = labelParts.join(" ").toLowerCase().replace(/\s+/g, "-");
        if (PF2E_CONDITION_MAP[labelSlug] && labelSlug !== "damage") label = labelParts.join(" ");
    }

    const slug = label.toLowerCase().replace(/\s+/g, "-");
    const uuid = slug !== "damage" ? PF2E_CONDITION_MAP[slug] : null;
    return uuid ? `@UUID[${uuid}]{${content}}` : match;
}

function convertAutomationText(text) {
    return String(text ?? "").replace(/\{([^}]+)\}/g, convertAutomationToken);
}

function convertAutomationHtmlToShortText(content) {
    return String(content ?? "")
        .replace(/@UUID\[[^\]]+\]\{([^}]+)\}/g, (_match, inner) => `{${inner}}`)
        .replace(/@Damage\[([^[]+)\[persistent,([^\]]+)\]\]/ig, (_match, formula, type) => `{pd-${formula.trim()}-${type.trim()}}`)
        .replace(/@Damage\[([^[]+)\[([^\]]+)\]\]/ig, (match, formula, type) => {
            if (type.toLowerCase().includes("persistent")) return match;
            return `{dmg-${formula.trim()}-${type.trim()}}`;
        });
}

function getShortDamageTags(text, prefix) {
    const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`\\{${escapedPrefix}([^-{}]+)-([^{}]+)\\}`, "ig");
    return Array.from(String(text ?? "").matchAll(regex), (match) => ({
        formula: match[1].trim(),
        damageType: match[2].trim()
    }));
}

function getAutomationLineOutcome(line) {
    const idx = String(line ?? "").indexOf(":");
    if (idx < 0) return null;

    return AUTOMATION_OUTCOME_BY_LABEL.get(normalizeText(String(line).slice(0, idx))) ?? null;
}

function extractDamageSpecs(text) {
    const specs = [];

    for (const damageMatch of String(text ?? "").matchAll(/@Damage\[([^[]+)\[([^\]]+)\](?:\|traits:([^\]]*))?\]/ig)) {
        const formula = damageMatch[1].trim();
        const damageType = damageMatch[2].trim();
        const traits = damageMatch[3] ? damageMatch[3].split(",").map((trait) => trait.trim()).filter(Boolean) : [];
        specs.push({
            formula,
            damageType,
            traits,
            isPersistent: damageType.toLowerCase().startsWith("persistent")
        });
    }

    for (const shortDamage of getShortDamageTags(text, "dmg-")) {
        specs.push({
            formula: shortDamage.formula,
            damageType: shortDamage.damageType,
            traits: [],
            isPersistent: false
        });
    }

    return specs;
}

function createDamageSignature(damage) {
    return [
        damage.formula,
        damage.damageType,
        ...(damage.traits ?? [])
    ].map((value) => normalizeText(value)).join("|");
}

function parseConditionTag(tag) {
    const parts = String(tag ?? "").trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return null;

    const last = parts.at(-1);
    const value = /^\d+$/.test(last) ? Number.parseInt(parts.pop(), 10) : null;
    const slug = parts.join("-").replace(/[^a-z0-9-]/g, "");

    if (!slug || slug === "persistent-damage" || slug === "damage" || !PF2E_CONDITION_SET.has(slug)) return null;
    return { name: slug, value };
}

function extractAutomationConditions(line) {
    const idx = String(line ?? "").indexOf(":");
    if (idx < 0) return [];

    const conditionText = String(line).slice(idx + 1).trim();
    const foundConditions = [];
    const seen = new Set();

    function addUniquePersistentDamage(formula, damageType) {
        const key = `pd:${formula}:${damageType}`;
        if (seen.has(key)) return;
        seen.add(key);
        foundConditions.push({
            isPersistent: true,
            formula,
            damageType
        });
    }

    function addUniqueCondition(tag) {
        const condition = parseConditionTag(tag);
        if (!condition) return;

        const key = `condition:${condition.name}:${condition.value ?? ""}`;
        if (seen.has(key)) return;

        seen.add(key);
        foundConditions.push(condition);
    }

    for (const persistentMatch of conditionText.matchAll(/@Damage\[([^[]+)\[persistent,([^\]]+)\]\]/ig)) {
        addUniquePersistentDamage(persistentMatch[1].trim(), persistentMatch[2].trim());
    }

    for (const persistentDamage of getShortDamageTags(conditionText, "pd-")) {
        addUniquePersistentDamage(persistentDamage.formula, persistentDamage.damageType);
    }

    const textWithoutUuidTags = conditionText.replace(/@UUID\[[^\]]+\]\{([^}]+)\}/ig, (_match, inner) => {
        addUniqueCondition(inner);
        return "";
    });

    for (const tagMatch of textWithoutUuidTags.matchAll(/\{([^}]+)\}/g)) {
        const tag = tagMatch[1].trim();
        const lowerTag = tag.toLowerCase();
        if (lowerTag.startsWith("pd-") || lowerTag.startsWith("dmg-")) continue;
        addUniqueCondition(tag);
    }

    return foundConditions;
}

export {
    DAMAGE_TYPES,
    PF2E_CONDITIONS,
    PF2E_CONDITION_MAP,
    PF2E_CONDITION_SET,
    VALUED_CONDITION_SET,
    convertAutomationHtmlToShortText,
    convertAutomationText,
    createDamageSignature,
    extractAutomationConditions,
    extractDamageSpecs,
    getAutomationLineOutcome,
    normalizeText,
    parseShortDamageTag,
    uniqueBy
};
