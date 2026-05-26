import { MODULE_ID } from "../constants.js";
import { PF2E_CONDITION_MAP, VALUED_CONDITION_SET } from "../../data/tables.js";
import {
    getMainCheckConfigFromLines,
    getMainDamageSpecFromLines
} from "./automation-damage.js";
import {
    extractAutomationConditions,
    extractDamageSpecs,
    getAutomationLineOutcome
} from "../text-helpers.js";


// Applies profile conditions.
async function applyConditionsFromProfile(actor, profile, degree) {
    if (!profile?.description) return false;

    let applied = false;
    const conditions = profile.conditionsByOutcome.get(degree) ?? [];

    for (const condition of conditions) {
        const didApply = await applyCondition(actor, condition);
        applied = didApply || applied;
    }

    return applied;
}

// Builds the description profile.
function getDescriptionProfile(runtime, item) {
    const description = item?.system?.description?.value || "";
    const cacheKey = `${item?.uuid ?? item?.id ?? "item"}:${runtime.hashString(description)}`;
    const cached = runtime.descriptionProfileCache.get(cacheKey);
    if (cached) return cached;

    const { mainLines, automationLines } = getDescriptionRegions(description);
    const conditionsByOutcome = new Map();
    const damageSpecsByOutcome = new Map();

    for (const line of automationLines) {
        const outcome = getAutomationLineOutcome(line);
        if (!outcome) continue;

        const conditions = extractAutomationConditions(line);
        if (conditions.length > 0) conditionsByOutcome.set(outcome, conditions);

        const damageSpecs = extractDamageSpecs(line).filter((damage) => !damage.isPersistent);
        if (damageSpecs.length > 0) damageSpecsByOutcome.set(outcome, damageSpecs);
    }

    const profile = {
        description,
        mainLines,
        automationLines,
        conditionsByOutcome,
        damageSpecsByOutcome,
        mainCheckConfig: getMainCheckConfigFromLines(mainLines),
        mainDamageSpec: getMainDamageSpecFromLines(mainLines)
    };

    runtime.descriptionProfileCache.set(cacheKey, profile);
    runtime.trimMap(runtime.descriptionProfileCache, 100);

    return profile;
}

// Splits description regions.
function getDescriptionRegions(description) {
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = description;
    const hrs = Array.from(tempDiv.querySelectorAll("hr"));
    if (hrs.length === 0) {
        const lines = getLinesFromHtml(tempDiv.innerHTML);
        return { mainLines: lines, automationLines: lines };
    }

    return {
        mainLines: getLinesFromHtml(getSiblingHtml(tempDiv.firstChild, hrs[0])),
        automationLines: getLinesFromHtml(getSiblingHtml(hrs.at(-1).nextSibling))
    };
}

// Extracts lines from HTML.
function getLinesFromHtml(source) {
    const textDiv = document.createElement("div");
    textDiv.innerHTML = source
        .replace(/<\/p>|<br\s*\/?>|<\/div>|<\/li>/gi, "\n")
        .replace(/<hr[\s\S]*?>/gi, "\n");

    return (textDiv.textContent || textDiv.innerText || "")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
}

// Extracts HTML between elements.
function getSiblingHtml(startNode, stopNode = null) {
    let html = "";
    let current = startNode;
    while (current && current !== stopNode) {
        if (current.nodeType === Node.ELEMENT_NODE) html += current.outerHTML;
        else html += current.textContent ?? "";
        current = current.nextSibling;
    }
    return html;
}

// Applies one condition.
async function applyCondition(actor, conditionObj) {
    if (!actor || !conditionObj) return false;

    if (conditionObj.isPersistent) {
        try {
            const condition = game.pf2e.ConditionManager.getCondition("persistent-damage");
            if (!condition) return false;

            const source = condition.toObject();
            source.system.persistent = {
                formula: conditionObj.formula,
                damageType: conditionObj.damageType,
                dc: 15
            };
            await actor.createEmbeddedDocuments("Item", [source]);
            return true;
        } catch (err) {
            console.error(`[${MODULE_ID}] Error applying persistent damage:`, err);
            return false;
        }
    }

    const conditionName = conditionObj.name;
    if (!PF2E_CONDITION_MAP[conditionName]) return false;

    try {
        if (VALUED_CONDITION_SET.has(conditionName)) {
            return await applyValuedCondition(actor, conditionName, conditionObj.value);
        }

        if (hasActiveCondition(actor, conditionName)) return true;

        if (typeof actor.increaseCondition === "function") {
            await actor.increaseCondition(conditionName);
            return true;
        }

        if (typeof actor.toggleCondition === "function") {
            await actor.toggleCondition(conditionName, { active: true });
            return true;
        }
    } catch (error) {
        console.error(`[${MODULE_ID}] Error applying condition:`, error);
    }

    return false;
}

// Applies a valued condition.
async function applyValuedCondition(actor, conditionName, rawValue) {
    const requestedValue = Math.max(1, Number.parseInt(rawValue ?? 1, 10) || 1);
    const existing = getExistingCondition(actor, conditionName);

    if (existing) {
        const currentValue = getConditionValue(existing);
        const nextValue = Math.max(currentValue ?? 0, requestedValue);
        if (currentValue === nextValue) return true;

        if (typeof game.pf2e?.ConditionManager?.updateConditionValue === "function") {
            await game.pf2e.ConditionManager.updateConditionValue(existing.id, actor, nextValue);
            return true;
        }
    }

    if (typeof actor.increaseCondition === "function") {
        await actor.increaseCondition(conditionName, { value: requestedValue });
        return true;
    }

    return false;
}

// Checks active conditions.
function hasActiveCondition(actor, conditionName) {
    if (typeof actor.hasCondition === "function" && actor.hasCondition(conditionName)) return true;
    return !!getExistingCondition(actor, conditionName);
}

// Finds an existing condition.
function getExistingCondition(actor, conditionName) {
    if (!actor || !conditionName) return null;

    const direct = typeof actor.getCondition === "function" ? actor.getCondition(conditionName) : null;
    if (direct) return direct;

    const bySlug = actor.conditions?.bySlug;
    if (typeof bySlug === "function") {
        const matches = bySlug.call(actor.conditions, conditionName, { temporary: false });
        if (Array.isArray(matches) && matches.length > 0) {
            return matches.find((condition) => !condition.isLocked) ?? matches[0];
        }
    }

    const itemTypes = actor.itemTypes?.condition;
    if (Array.isArray(itemTypes)) {
        return itemTypes.find((condition) => condition.slug === conditionName && !condition.isLocked)
            ?? itemTypes.find((condition) => condition.slug === conditionName)
            ?? null;
    }

    return null;
}

// Reads the condition value.
function getConditionValue(condition) {
    const value = condition?.value ?? condition?.system?.value?.value ?? condition?._source?.system?.value?.value;
    return typeof value === "number" ? value : null;
}

export {
    applyConditionsFromProfile,
    getDescriptionProfile
};
