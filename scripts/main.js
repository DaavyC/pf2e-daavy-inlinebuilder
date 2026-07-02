import { DamageDebug } from "./debug.js";
import { exposeInlineBuilderApi, registerModuleHooks } from "./hooks.js";
import { registerModuleSettings } from "./settings.js";
import { MODULE_ID, TOOLBELT_ID } from "./config.js";
import { PF2E_CONDITION_MAP, VALUED_CONDITION_SET } from "./data/tables.js";
import {
    createDamageSignature,
    extractAutomationConditions,
    extractDamageSpecs,
    getAutomationLineOutcome,
    normalizeText,
    uniqueBy
} from "./utils.js";

const damageAutomation = (() => {
const BASIC_DAMAGE_MULTIPLIERS = {
    success: "0.5",
    failure: "1",
    criticalFailure: "2"
};

// Marks damage automation complete.
async function completeDamageAutomation(runtime, message, processedDamage = null, processedDamageJobs = null) {
    runtime.damageCompletedSources.add(message.id);
    const update = {
        [`flags.${MODULE_ID}.damageAutomationComplete`]: true
    };
    if (processedDamage) update[`flags.${MODULE_ID}.processedDamage`] = processedDamage;
    if (processedDamageJobs) update[`flags.${MODULE_ID}.processedDamageJobs`] = processedDamageJobs;
    await message.update(update);
}

// Detects potential damage automation.
function hasPotentialDamageAutomation(_sourceMessage, profile) {
    const isBasic = profile.mainCheckConfig?.basic === true;
    return isBasic ? !!profile.mainDamageSpec : profile.damageSpecsByOutcome.size > 0;
}

// Builds damage jobs.
function getDamageJobs(targets, profile) {
    const checkConfig = profile.mainCheckConfig;
    const isBasic = checkConfig?.basic === true;

    if (isBasic) {
        const damage = profile.mainDamageSpec;
        if (!damage) return [];

        const applications = targets
            .map((target) => ({
                ...target,
                multiplier: BASIC_DAMAGE_MULTIPLIERS[target.outcome]
            }))
            .filter((target) => !!target.multiplier);

        if (applications.length === 0) return [];

        return [{
            applications,
            damage,
            inheritSaveVariants: true,
            signature: createDamageSignature(damage)
        }];
    }

    const specsByOutcome = profile.damageSpecsByOutcome;
    const jobsBySignature = new Map();

    for (const target of targets) {
        const specs = specsByOutcome.get(target.outcome) ?? [];
        for (const damage of specs) {
            const signature = createDamageSignature(damage);
            const job = jobsBySignature.get(signature) ?? {
                applications: [],
                damage,
                inheritSaveVariants: false,
                signature
            };
            job.applications.push({ ...target, multiplier: "1" });
            jobsBySignature.set(signature, job);
        }
    }

    return Array.from(jobsBySignature.values()).filter((job) => job.applications.length > 0);
}

// Reads the main save config.
function getMainCheckConfigFromLines(lines) {
    const line = lines.find((value) => /@Check\[/i.test(value));
    if (!line) return null;

    return {
        basic: /\bbasic\s*:\s*true\b/i.test(line)
    };
}

// Reads the main damage spec.
function getMainDamageSpecFromLines(lines) {
    const line = lines.find((value) => /Damage\s*:/i.test(value) && /@Damage\[/i.test(value));
    if (!line) return null;

    return extractDamageSpecs(line).find((damage) => !damage.isPersistent) ?? null;
}

// Creates the processed damage key.
function createDamageProcessedKey(sourceMessage, application, signature) {
    return `${sourceMessage.id}:${application.uuid}:${application.outcome}:${signature}`;
}

// Creates the damage job id.
function createDamageJobId(sourceMessage, job, applications) {
    const targetSignature = applications
        .map((application) => `${application.uuid}:${application.outcome}:${Number(application.multiplier)}`)
        .sort()
        .join(",");
    return `${sourceMessage.id}:${job.signature}:${targetSignature}`;
}

// Removes duplicate applications.
function getUniqueDamageApplications(applications) {
    return uniqueBy(
        applications,
        (application) => application.uuid ? `${application.uuid}:${application.outcome}:${Number(application.multiplier)}` : null,
        (application) => ({ ...application })
    );
}

// Explains the job block reason.
function getDamageJobBlockedReason(runtime, sourceMessageId, jobId, processedDamageJobs) {
    if (processedDamageJobs[jobId]) return "processedDamageJobs";
    if (runtime.damageJobLocks.has(jobId)) return "damageJobLocks";
    if (runtime.hasExistingDamageJobMessage(sourceMessageId, jobId)) return "existingDamageMessage";
    return null;
}

// Creates damage message flavor.
function createDamageFlavor(item, traits) {
    let flavor = `<h4 class="action"><strong>${item.name ?? game.i18n.localize("PF2E.DamageRoll")}</strong></h4>`;
    if (traits.length === 0) return flavor;

    const descriptions = CONFIG.PF2E.traitsDescriptions ?? {};
    flavor += `<div class="tags" data-tooltip-class="pf2e">`;
    for (const trait of traits) {
        const label = game.i18n.localize(CONFIG.PF2E.actionTraits?.[trait] ?? CONFIG.PF2E.damageTraits?.[trait] ?? trait);
        const tooltip = descriptions[trait] ?? "";
        flavor += `<span class="tag" data-trait="${trait}" data-tooltip="${tooltip}">${label}</span>`;
    }
    flavor += `</div><hr>`;
    return flavor;
}

// Creates the damage button key.
function getDamageApplyButtonKey(targetUuid, multiplier) {
    return `${targetUuid}:${Number(multiplier)}`;
}

// Creates the damage click key.
function getDamageApplicationClickKey(runtime, messageId, application) {
    return application.globalKey ?? `${messageId}:${runtime.getDamageApplyButtonKey(application.uuid, application.multiplier)}`;
}

// Creates the global application key.
function createGlobalDamageApplicationKey(damageMessage, application) {
    const sourceId = damageMessage.getFlag?.(MODULE_ID, "sourceMessage") ?? damageMessage.id;
    const signature = damageMessage.getFlag?.(MODULE_ID, "damageSignature") ?? "damage";
    return `${sourceId}:${signature}:${application.uuid}:${application.outcome}:${Number(application.multiplier)}`;
}

    return {
        completeDamageAutomation,
        createDamageFlavor,
        createDamageJobId,
        createDamageProcessedKey,
        createGlobalDamageApplicationKey,
        getDamageApplicationClickKey,
        getDamageApplyButtonKey,
        getDamageJobBlockedReason,
        getDamageJobs,
        getMainCheckConfigFromLines,
        getMainDamageSpecFromLines,
        getUniqueDamageApplications,
        hasPotentialDamageAutomation
    };
})();

const {
    completeDamageAutomation,
    createDamageFlavor,
    createDamageJobId,
    createDamageProcessedKey,
    createGlobalDamageApplicationKey,
    getDamageApplicationClickKey,
    getDamageApplyButtonKey,
    getDamageJobBlockedReason,
    getDamageJobs,
    getMainCheckConfigFromLines,
    getMainDamageSpecFromLines,
    getUniqueDamageApplications,
    hasPotentialDamageAutomation
} = damageAutomation;

const profileAutomation = (() => {
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

    return {
        applyConditionsFromProfile,
        getDescriptionProfile
    };
})();

const {
    applyConditionsFromProfile,
    getDescriptionProfile
} = profileAutomation;

const targetAutomation = (() => {
const OUTCOMES = ["criticalFailure", "failure", "success", "criticalSuccess"];
const OUTCOME_SET = new Set(OUTCOMES);
const CHECK_ROWS_SELECTOR = ".pf2e-toolbelt-target-targetRows:not(.pf2e-toolbelt-target-damage) .target-row";
const ROLL_ALL_SAVES_SELECTOR = ".pf2e-toolbelt-target-rollSaves, [data-action=\"roll-saves\"]";
const ROLL_SAVE_SELECTOR = "[data-action=\"roll-save\"]";
const CLICK_PAUSE = 90;
const POST_ROLL_PROCESS_DELAYS = [40, 160, 360, 800];
const MAX_AUTO_ROLL_PASSES = 30;

const OUTCOME_LABELS = {
    criticalSuccess: ["critical success"],
    success: ["success"],
    failure: ["failure"],
    criticalFailure: ["critical failure"]
};

const NORMALIZED_OUTCOME_LABELS = new Map(
    Object.entries(OUTCOME_LABELS)
        .flatMap(([outcome, labels]) => labels.map((label) => [normalizeText(label), outcome]))
        .sort(([left], [right]) => right.length - left.length)
);

// Rolls pending target saves.
async function autoRollTargetChecks(runtime, message, root = null) {
    if (!message?.id || runtime.autoRollingMessages.has(message.id) || !hasToolbeltSaveData(message)) return;

    let messageRoot = root ?? runtime.getMessageRoot(message.id);
    if (!(messageRoot instanceof HTMLElement)) return;
    if (!messageRoot.querySelector(CHECK_ROWS_SELECTOR) && !messageRoot.querySelector(ROLL_ALL_SAVES_SELECTOR)) return;

    runtime.autoRollingMessages.add(message.id);
    try {
        for (let pass = 0; pass < MAX_AUTO_ROLL_PASSES; pass += 1) {
            messageRoot = runtime.getMessageRoot(message.id) ?? messageRoot;
            if (!(messageRoot instanceof HTMLElement)) break;

            const pending = findPendingCheckRoll(runtime, message, messageRoot);
            if (!pending) break;

            runtime.autoRolledControls.add(pending.key);
            dispatchAutomaticClick(runtime, pending.control);

            if (pending.type === "all") {
                runtime.rollAllInProgress.add(message.id);
                window.setTimeout(() => {
                    runtime.rollAllInProgress.delete(message.id);
                }, 5000);
                break;
            }

            await runtime.wait(CLICK_PAUSE);
        }
    } finally {
        runtime.trimSet(runtime.autoRolledControls, 800);
        runtime.autoRollingMessages.delete(message.id);
        runtime.scheduleProcess(message, runtime.getMessageRoot(message.id), POST_ROLL_PROCESS_DELAYS);
    }
}

// Finds a pending save.
function findPendingCheckRoll(runtime, message, root) {
    const rollAll = runtime.asHTMLElement(root.querySelector(ROLL_ALL_SAVES_SELECTOR));
    const rollAllKey = `${message.id}:roll-all-saves`;
    if (rollAll && !runtime.autoRolledControls.has(rollAllKey) && !rollAll.disabled) {
        return { type: "all", key: rollAllKey, control: rollAll };
    }

    if (runtime.rollAllInProgress.has(message.id)) return null;

    const rows = getCheckRows(root);
    for (const [index, row] of rows.entries()) {
        if (extractOutcome(runtime, row)) continue;

        const control = findSaveControl(runtime, row);
        if (!control || control.disabled) continue;

        const key = createSaveHandledKey(message, row, index);
        if (runtime.autoRolledControls.has(key)) continue;

        return { type: "single", key, control };
    }

    return null;
}

// Dispatches an automatic click.
function dispatchAutomaticClick(runtime, control) {
    runtime.dispatchClick(control, game.user?.settings?.showCheckDialogs === true);
}

// Processes an automation message.
async function processMessage(runtime, message, root = null) {
    if (!message?.id || runtime.processingMessages.has(message.id) || runtime.autoRollingMessages.has(message.id)) return;
    if (runtime.isDamageRollMessage(message) || !hasToolbeltSaveData(message)) return;

    const currentMessage = game.messages.get(message.id) ?? message;
    if (runtime.processingMessages.has(currentMessage.id)) return;

    runtime.processingMessages.add(currentMessage.id);
    try {
        const messageRoot = root ?? runtime.getMessageRoot(currentMessage.id);
        const targets = await extractCompletedCheckTargets(runtime, currentMessage, messageRoot);
        if (targets.length === 0) return;

        const item = await resolveItem(runtime, currentMessage);
        if (!item) return;

        const profile = profileAutomation.getDescriptionProfile(runtime, item);
        if (!profile.description) return;

        const processedTargets = foundry.utils.deepClone(currentMessage.getFlag(MODULE_ID, "processedTargets") ?? {});
        const updates = { ...processedTargets };
        let changed = false;

        for (const target of targets) {
            if (!target.actor || !target.outcome || !target.uuid) continue;

            const key = `${currentMessage.id}:${target.uuid}:${target.outcome}`;
            if (processedTargets[key]) continue;

            await profileAutomation.applyConditionsFromProfile(target.actor, profile, target.outcome);
            updates[key] = true;
            changed = true;
        }

        if (changed) await currentMessage.setFlag(MODULE_ID, "processedTargets", updates);
        await runtime.rollAndApplyDamageFromAction(currentMessage, item, targets, profile);
    } catch (error) {
        console.error(`[${MODULE_ID}] Target Helper automation failed:`, error);
    } finally {
        runtime.processingMessages.delete(currentMessage.id);
    }
}

// Extracts completed save targets.
async function extractCompletedCheckTargets(runtime, message, root = null) {
    const fromFlags = await extractCheckTargetsFromToolbeltFlags(runtime, message, root);
    if (fromFlags.length > 0) return normalizeCompletedTargets(fromFlags);

    if (!(root instanceof HTMLElement)) return [];
    if (hasPendingCheckRolls(runtime, root)) return [];

    return normalizeCompletedTargets(await extractCheckTargetsFromDom(runtime, message, root));
}

// Extracts targets from Toolbelt flags.
async function extractCheckTargetsFromToolbeltFlags(runtime, message, root = null) {
    const data = getToolbeltData(message);
    if (!data || data.type === "damage") return [];

    const saveVariants = Object.values(data.saveVariants ?? {});
    if (saveVariants.length === 0) return [];

    if (root instanceof HTMLElement && hasPendingCheckRolls(runtime, root)) return [];

    const targetRecords = await getToolbeltTargetRecords(runtime, message);
    if (targetRecords.length === 0) return [];

    const targets = [];
    for (const target of targetRecords) {
        if (!target.id || !target.actor) continue;

        for (const variant of saveVariants) {
            const outcome = variant?.saves?.[target.id]?.success;
            if (!OUTCOME_SET.has(outcome)) continue;

            targets.push({
                uuid: target.uuid,
                id: target.id,
                actor: target.actor,
                outcome
            });
            break;
        }
    }

    if (targets.length === 0) return [];
    if (targets.length < targetRecords.length) return [];

    return normalizeCompletedTargets(targets);
}

// Extracts targets from the DOM.
async function extractCheckTargetsFromDom(runtime, message, root) {
    const rows = getCheckRows(root);
    const targets = [];
    const apiTargets = await getToolbeltTargetRecords(runtime, message);

    for (const [index, row] of rows.entries()) {
        const outcome = extractOutcome(runtime, row);
        if (!outcome) continue;

        const target = await resolveTargetForRow(runtime, row, apiTargets, index);
        if (!target?.uuid) continue;

        const actor = target.actor ?? await resolveActorFromTargetUuid(runtime, target.uuid);
        if (!actor) continue;

        targets.push({ uuid: target.uuid, id: target.id, actor, outcome });
    }

    return normalizeCompletedTargets(targets);
}

// Normalizes completed targets.
function normalizeCompletedTargets(targets) {
    return uniqueBy(
        targets.filter((target) => target?.uuid && target.outcome && target.actor),
        (target) => target.uuid
    );
}

// Finds save rows.
function getCheckRows(root) {
    return Array.from(root.querySelectorAll(CHECK_ROWS_SELECTOR));
}

// Detects pending saves.
function hasPendingCheckRolls(runtime, root) {
    return getCheckRows(root).some((row) => !extractOutcome(runtime, row) && !!findSaveControl(runtime, row));
}

// Finds the save control.
function findSaveControl(runtime, row) {
    return runtime.asHTMLElement(row.querySelector(ROLL_SAVE_SELECTOR));
}

// Creates the handled save key.
function createSaveHandledKey(message, row, rowIndex) {
    const targetName = normalizeText(row.querySelector(".target-header .name")?.textContent ?? "");
    return `${message.id}:${rowIndex}:${targetName || "unknown"}:roll-save`;
}

// Extracts the save outcome.
function extractOutcome(runtime, row) {
    const degree = row.querySelector(".degree");
    const candidates = [degree, row].filter(Boolean);

    for (const element of candidates) {
        const outcome = OUTCOMES.find((value) => element.classList?.contains(value));
        if (outcome) return outcome;
    }

    const text = normalizeText(degree?.textContent ?? row.textContent ?? "");
    for (const [label, outcome] of NORMALIZED_OUTCOME_LABELS) {
        if (matchesOutcomeText(text, label)) return outcome;
    }

    return null;
}

// Matches outcome text.
function matchesOutcomeText(text, normalizedLabel) {
    if (normalizedLabel.length <= 2) return text === normalizedLabel;
    return text === normalizedLabel || text.includes(normalizedLabel);
}

// Resolves the row target.
async function resolveTargetForRow(runtime, row, apiTargets, rowIndex) {
    const uuid = extractTargetUuid(row);
    if (uuid) {
        const actor = await resolveActorFromTargetUuid(runtime, uuid);
        const apiTarget = apiTargets.find((target) => target.uuid === uuid);
        return { uuid, id: apiTarget?.id ?? null, actor: actor ?? apiTarget?.actor ?? null };
    }

    const rowName = normalizeText(row.querySelector(".target-header .name")?.textContent ?? "");
    if (rowName) {
        const matches = apiTargets.filter((target) => normalizeText(target.name ?? "") === rowName);
        if (matches.length === 1) return matches[0];
    }

    return apiTargets[rowIndex] ?? null;
}

// Extracts the target UUID.
function extractTargetUuid(row) {
    const targetElement = row.querySelector("[data-target-uuid]") ?? row.closest("[data-target-uuid]");
    const uuid = targetElement?.dataset?.targetUuid ?? row.dataset?.targetUuid ?? row.dataset?.uuid;
    return uuid || null;
}

// Reads Toolbelt data.
function getToolbeltData(message) {
    return message.flags?.[TOOLBELT_ID]?.targetHelper ?? null;
}

// Detects Toolbelt save data.
function hasToolbeltSaveData(message) {
    const data = getToolbeltData(message);
    if (!data || data.type === "damage") return false;
    return Object.values(data.saveVariants ?? {}).some((variant) => !!variant?.statistic);
}

// Reads Toolbelt targets.
async function getToolbeltTargetRecords(runtime, message) {
    const data = getToolbeltData(message);
    const rawTargets = [];
    if (Array.isArray(data?.targets)) rawTargets.push(...data.targets);
    if (Array.isArray(data?.splashTargets)) rawTargets.push(...data.splashTargets);

    const apiTargets = getToolbeltMessageTargets(message);
    const records = await Promise.all(rawTargets.concat(apiTargets).map((value) => normalizeTargetRecord(runtime, value)));
    return uniqueBy(records, (record) => record?.uuid ?? null);
}

// Reads message targets.
function getToolbeltMessageTargets(message) {
    const getMessageTargets = game.toolbelt?.api?.targetHelper?.getMessageTargets;
    if (typeof getMessageTargets !== "function") return [];
    try {
        const targets = getMessageTargets(message);
        return Array.isArray(targets) ? targets.filter(Boolean) : [];
    } catch {
        return [];
    }
}

// Normalizes target records.
async function normalizeTargetRecord(runtime, value) {
    const uuid = typeof value === "string" ? value : value?.uuid;
    if (!uuid) return null;
    const cached = runtime.targetRecordCache.get(uuid);
    if (cached) return cached;

    const document = typeof value === "string" ? await fromUuid(value).catch(() => null) : value;
    const token = document?.documentName === "Token" ? document : null;
    const actor = document?.actor ?? (document?.documentName === "Actor" ? document : null);

    const record = {
        uuid,
        id: token?.id ?? value?.id ?? null,
        name: token?.name ?? value?.name ?? actor?.name ?? "",
        actor
    };

    if (record.actor) runtime.cacheValue(runtime.targetRecordCache, uuid, record);
    return record;
}

// Resolves an actor by UUID.
async function resolveActorFromTargetUuid(runtime, uuid) {
    if (runtime.actorCache.has(uuid)) return runtime.actorCache.get(uuid);

    const document = await fromUuid(uuid).catch(() => null);
    if (!document) return null;
    if (document.actor) {
        return runtime.cacheValue(runtime.actorCache, uuid, document.actor);
    }
    if (document.documentName === "Actor") {
        return runtime.cacheValue(runtime.actorCache, uuid, document);
    }
    if (document.parent?.documentName === "Actor") {
        return runtime.cacheValue(runtime.actorCache, uuid, document.parent);
    }
    return null;
}

// Resolves the message item.
async function resolveItem(runtime, message) {
    if (message.item) return message.item;
    if (message.id && runtime.itemCache.has(message.id)) return runtime.itemCache.get(message.id);

    const candidates = [
        message.flags?.pf2e?.origin?.uuid,
        message.flags?.pf2e?.context?.origin?.item,
        message.flags?.pf2e?.context?.item,
        message.flags?.pf2e?.item,
        message.flags?.[TOOLBELT_ID]?.targetHelper?.item,
        message.flags?.[TOOLBELT_ID]?.item,
        message.flags?.[TOOLBELT_ID]?.origin?.item,
        message.flags?.[TOOLBELT_ID]?.context?.item
    ].filter((value) => typeof value === "string" && value.length > 0);

    for (const uuid of candidates) {
        const item = await fromUuid(uuid).catch(() => null);
        if (item?.documentName === "Item") {
            if (message.id) runtime.cacheValue(runtime.itemCache, message.id, item);
            return item;
        }
    }

    return null;
}

    return {
        autoRollTargetChecks,
        getToolbeltData,
        hasToolbeltSaveData,
        processMessage
    };
})();

const {
    autoRollTargetChecks,
    getToolbeltData,
    hasToolbeltSaveData,
    processMessage
} = targetAutomation;

const damageRuntime = (() => {
async function createDamageMessage(_runtime, sourceMessage, item, job, applications) {
    const DamageRoll = CONFIG.Dice.rolls.find((RollClass) => RollClass.name === "DamageRoll");
    if (!DamageRoll) throw new Error("PF2e DamageRoll class not found.");

    const actor = sourceMessage.actor ?? item.actor ?? null;
    const token = sourceMessage.token ?? actor?.getActiveTokens?.(true, true)?.at(0)?.document ?? null;
    const formula = `${job.damage.formula}[${job.damage.damageType}]`;
    const roll = await new DamageRoll(formula, { actor, item }).evaluate();
    const toolbeltData = targetAutomation.getToolbeltData(sourceMessage) ?? {};
    const targets = applications.map((application) => application.uuid);
    const traits = Array.from(new Set([...(job.damage.traits ?? []), ...(item.system?.traits?.value ?? [])].filter(Boolean)));
    const targetHelper = {
        type: "damage",
        author: toolbeltData.author ?? actor?.uuid ?? null,
        targets,
        splashTargets: [],
        splashIndex: -1,
        applied: {},
        item: item.uuid ?? toolbeltData.item ?? null,
        private: !!toolbeltData.private,
        options: Array.isArray(toolbeltData.options) ? [...toolbeltData.options] : [],
        traits
    };

    if (job.inheritSaveVariants && toolbeltData.saveVariants) {
        targetHelper.saveVariants = foundry.utils.deepClone(toolbeltData.saveVariants);
    }

    const speaker = ChatMessage.getSpeaker({ actor, token });
    const flags = {
        pf2e: {
            context: {
                type: "damage-roll",
                sourceType: "attack",
                actor: actor?.id ?? null,
                token: token?.id ?? null,
                target: null,
                domains: [],
                options: [
                    ...(actor?.getRollOptions?.() ?? []),
                    ...(item.getRollOptions?.("item") ?? []),
                    ...targetHelper.options
                ].filter(Boolean),
                notes: [],
                secret: false,
                rollMode: "roll",
                traits,
                skipDialog: true,
                outcome: null,
                unadjustedOutcome: null
            },
            origin: item.getOriginData?.()
        },
        [TOOLBELT_ID]: {
            targetHelper
        },
        [MODULE_ID]: {
            automaticDamage: true,
            sourceMessage: sourceMessage.id,
            damageJobId: job.jobId,
            damageSignature: job.signature
        }
    };

    return roll.toMessage({
        flavor: damageAutomation.createDamageFlavor(item, traits),
        speaker,
        flags
    });
}

async function applyDamageToTarget(runtime, message, application, rollIndex = 0) {
    if (!message?.id || !application?.uuid) return false;

    let damageApplied = false;
    try {
        const token = await resolveTokenFromTargetUuid(application.uuid);
        const actor = token?.actor ?? application.actor;
        const roll = message.rolls?.at?.(rollIndex);
        const multiplier = Number(application.multiplier);
        if (!actor || !roll || !Number.isFinite(multiplier)) return false;

        const damage = multiplier < 0 ? multiplier * roll.total : roll.alter(multiplier, 0);
        const context = message.flags?.pf2e?.context ?? {};
        const messageRollOptions = [...(context.options ?? [])];
        const originRollOptions = messageRollOptions
            .filter((option) => option.startsWith("self:"))
            .map((option) => option.replace(/^self\b/, "origin"));
        const item = message.item;
        const effectRollOptions = item?.isOfType?.("affliction", "condition", "effect") ? item.getRollOptions("item") : [];

        if (actor.alliance && message.actor) {
            const alliance = actor.alliance === message.actor.alliance ? "ally" : "enemy";
            messageRollOptions.push(`origin:${alliance}`);
        }
        if (!messageRollOptions.some((option) => option.startsWith("target"))) {
            messageRollOptions.push(...(actor.getSelfRollOptions?.("target") ?? []));
        }

        const contextClone = actor.getContextualClone?.(originRollOptions, []) ?? actor;
        const rollOptions = new Set([
            ...messageRollOptions.filter((option) => !/^(?:self|target)(?::|$)/.test(option)),
            ...effectRollOptions,
            ...originRollOptions,
            ...(contextClone.getSelfRollOptions?.() ?? [])
        ]);

        const beforeHp = getActorHpSnapshot(actor);
        DamageDebug.directApplyStart(message, application, rollIndex, beforeHp);
        await contextClone.applyDamage({
            damage,
            token,
            item,
            skipIWR: multiplier <= 0,
            rollOptions,
            shieldBlockRequest: false,
            outcome: context.outcome
        });
        damageApplied = true;
        await markToolbeltDamageApplied(runtime, message, application, token, rollIndex);
        const afterHp = getActorHpSnapshot(actor);
        DamageDebug.directApplyComplete(message, application, rollIndex, beforeHp, afterHp);
        return true;
    } catch (error) {
        DamageDebug.directApplyFailed(message, application, rollIndex, error);
        console.error(`[${MODULE_ID}] Automatic damage application failed:`, error);
        return damageApplied;
    }
}

function getActorHpSnapshot(actor) {
    const hp = actor?.system?.attributes?.hp;
    return hp ? {
        actor: actor.uuid,
        value: hp.value,
        max: hp.max,
        temp: hp.temp
    } : null;
}

async function resolveTokenFromTargetUuid(uuid) {
    const document = await fromUuid(uuid).catch(() => null);
    if (document?.documentName === "Token") return document;
    return document?.token ?? null;
}

async function markToolbeltDamageApplied(runtime, message, application, token, rollIndex) {
    const targetId = application.id ?? token?.id ?? runtime.getTargetIdFromUuid(application.uuid);
    if (!targetId) return;

    const data = foundry.utils.deepClone(targetAutomation.getToolbeltData(message) ?? {});
    data.applied ??= {};
    data.applied[targetId] ??= {};
    data.applied[targetId][rollIndex] = true;
    await message.update({ [`flags.${TOOLBELT_ID}.targetHelper`]: data });
}

    return {
        applyDamageToTarget,
        createDamageMessage,
        getActorHpSnapshot,
        markToolbeltDamageApplied,
        resolveTokenFromTargetUuid
    };
})();

const {
    applyDamageToTarget,
    createDamageMessage,
    getActorHpSnapshot,
    markToolbeltDamageApplied,
    resolveTokenFromTargetUuid
} = damageRuntime;

const damageApplication = (() => {
const APPLY_DAMAGE_SELECTOR = "[data-action=\"target-applyDamage\"]";
const DAMAGE_APPLY_DELAYS = [0, 40, 120, 300, 700, 1400];
const DAMAGE_CLICK_PAUSE = 120;
const DAMAGE_CLAIM_STALE_MS = 10000;
const DAMAGE_LOCK_CONFIRM_PAUSE = 60;

function scheduleApplyDamageMessage(runtime, damageMessage, applications) {
    const uniqueApplications = damageAutomation.getUniqueDamageApplications(applications)
        .map((application) => ({
            ...application,
            globalKey: damageAutomation.createGlobalDamageApplicationKey(damageMessage, application)
        }));

    if (uniqueApplications.length === 0) return;
    runtime.pendingDamageApplications.set(damageMessage.id, uniqueApplications);
    DamageDebug.scheduleApply(damageMessage, uniqueApplications);
    scheduleDamageApply(runtime, damageMessage.id);
}

function scheduleDamageApply(runtime, messageId, delays = DAMAGE_APPLY_DELAYS) {
    if (!messageId) return;
    if (runtime.damageApplyLoops.has(messageId)) {
        DamageDebug.skipApplyLoopRunning(messageId);
        return;
    }

    runtime.damageApplyLoops.add(messageId);
    DamageDebug.startApplyLoop(messageId, delays);
    void runDamageApplyLoop(runtime, messageId, delays);
}

async function runDamageApplyLoop(runtime, messageId, delays) {
    let previousDelay = 0;

    try {
        for (const delay of delays) {
            const waitTime = Math.max(0, delay - previousDelay);
            previousDelay = delay;
            if (waitTime > 0) await runtime.wait(waitTime);

            if (!runtime.pendingDamageApplications.has(messageId)) break;
            DamageDebug.applyLoopTick(messageId, delay);
            await applyPendingDamageMessage(runtime, messageId);
        }
    } finally {
        runtime.damageApplyLoops.delete(messageId);
        DamageDebug.finishApplyLoop(messageId, runtime.pendingDamageApplications.has(messageId));
    }
}

async function applyPendingDamageMessage(runtime, messageId, root = null) {
    if (!messageId) return;
    if (runtime.applyingDamageMessages.has(messageId)) {
        DamageDebug.skipApplyAlreadyRunning(messageId);
        return;
    }

    const applications = runtime.pendingDamageApplications.get(messageId);
    if (!applications?.length) {
        DamageDebug.skipApplyNoPending(messageId);
        return;
    }

    const messageRoot = root ?? runtime.getMessageRoot(messageId) ?? runtime.latestMessageRoots.get(messageId);
    if (!(messageRoot instanceof HTMLElement)) {
        DamageDebug.skipApplyNoRoot(messageId, applications);
        return;
    }

    const buttonIndex = getDamageApplyButtonIndex(messageRoot);
    if (buttonIndex.size === 0) {
        DamageDebug.skipApplyNoButtonIndex(messageId, applications);
    }

    const applyLock = await claimDamageMessageApplyLock(runtime, messageId);
    if (!applyLock) return;

    runtime.applyingDamageMessages.add(messageId);
    try {
        const claimedApplications = await claimPendingDamageApplications(runtime, messageId, applications);
        DamageDebug.applyPendingStart(messageId, claimedApplications, buttonIndex);
        const remaining = [];
        for (const application of claimedApplications) {
            const clickKey = damageAutomation.getDamageApplicationClickKey(runtime, messageId, application);
            if (runtime.damageApplicationClicks.has(clickKey)) {
                DamageDebug.skipClickAlreadyClaimed(messageId, clickKey, application);
                continue;
            }

            const damageMessage = game.messages.get(messageId);
            const button = findApplyDamageButton(buttonIndex, application.uuid, application.multiplier);
            const rollIndex = button ? getDamageRollIndex(button) : 0;
            if (isToolbeltDamageAlreadyApplied(runtime, damageMessage, application, rollIndex)) {
                runtime.damageApplicationClicks.add(clickKey);
                DamageDebug.skipClickToolbeltApplied(messageId, clickKey, application, targetAutomation.getToolbeltData(damageMessage)?.applied);
                continue;
            }

            runtime.damageApplicationClicks.add(clickKey);
            if (button) markDamageButtonsClaimed(messageId, application, button);
            else DamageDebug.buttonNotFound(messageId, application, damageAutomation.getDamageApplyButtonKey(application.uuid, application.multiplier));

            const applied = await damageRuntime.applyDamageToTarget(runtime, damageMessage, application, rollIndex);
            DamageDebug.confirmClickApplied(messageId, clickKey, application, applied);
            if (!applied) {
                await releaseDamageApplicationClaim(runtime, messageId, clickKey);
                remaining.push(application);
                continue;
            }

            await completeDamageApplicationClaim(runtime, messageId, clickKey);
            await runtime.wait(DAMAGE_CLICK_PAUSE);
        }

        runtime.trimSet(runtime.damageApplicationClicks, 1200);
        const unclaimed = applications.filter((application) => !claimedApplications.includes(application));
        if (remaining.length + unclaimed.length > 0) runtime.pendingDamageApplications.set(messageId, remaining.concat(unclaimed));
        else runtime.pendingDamageApplications.delete(messageId);
        DamageDebug.applyPendingComplete(messageId, remaining);
    } finally {
        await completeDamageMessageApplyLock(messageId, applyLock);
        runtime.applyingDamageMessages.delete(messageId);
    }
}

function getDamageApplyButtonIndex(root) {
    const index = new Map();
    const containers = root.querySelectorAll("[data-target-uuid]");

    for (const container of containers) {
        if (container.classList.contains("applied")) continue;
        const targetUuid = container.dataset?.targetUuid;
        if (!targetUuid) continue;

        for (const button of container.querySelectorAll(APPLY_DAMAGE_SELECTOR)) {
            if (!(button instanceof HTMLElement)) continue;
            const key = damageAutomation.getDamageApplyButtonKey(targetUuid, button.dataset?.multiplier);
            if (!index.has(key)) index.set(key, []);
            index.get(key).push(button);
        }
    }

    return index;
}

function findApplyDamageButton(buttonIndex, targetUuid, multiplier) {
    const buttons = buttonIndex.get(damageAutomation.getDamageApplyButtonKey(targetUuid, multiplier)) ?? [];
    return buttons.find((button) => (
        button.isConnected &&
        button.dataset.inlinebuilderDamageApplied !== "true" &&
        !button.closest(".applied")
    )) ?? null;
}

function isToolbeltDamageAlreadyApplied(runtime, message, application, rollIndexOrButton = 0) {
    const data = message ? targetAutomation.getToolbeltData(message) : null;
    const targetId = application.id ?? runtime.getTargetIdFromUuid(application.uuid);
    const rollIndex = rollIndexOrButton instanceof HTMLElement ? getDamageRollIndex(rollIndexOrButton) : Number(rollIndexOrButton ?? 0);
    return !!(targetId && data?.applied?.[targetId]?.[rollIndex]);
}

async function claimDamageMessageApplyLock(runtime, messageId) {
    const message = game.messages.get(messageId);
    if (!message) return null;

    const existing = message.getFlag(MODULE_ID, "damageApplyLock");
    const isStale = existing?.status === "applying" && Date.now() - Number(existing.time ?? 0) > DAMAGE_CLAIM_STALE_MS;
    if (existing?.status === "applying" && existing.owner !== runtime.damageRunId && !isStale) {
        DamageDebug.skipMessageApplyLock(messageId, existing);
        return null;
    }

    const lock = {
        owner: runtime.damageRunId,
        nonce: foundry.utils.randomID(),
        status: "applying",
        time: Date.now()
    };

    await message.setFlag(MODULE_ID, "damageApplyLock", lock);
    await runtime.wait(DAMAGE_LOCK_CONFIRM_PAUSE);

    const current = game.messages.get(messageId)?.getFlag(MODULE_ID, "damageApplyLock");
    const confirmed = current?.owner === lock.owner && current?.nonce === lock.nonce && current?.status === "applying";
    DamageDebug.claimMessageApplyLock(messageId, lock, confirmed, current);
    return confirmed ? lock : null;
}

async function completeDamageMessageApplyLock(messageId, lock) {
    const message = game.messages.get(messageId);
    if (!message || !lock) return;

    const current = foundry.utils.deepClone(message.getFlag(MODULE_ID, "damageApplyLock") ?? {});
    if (current.owner !== lock.owner || current.nonce !== lock.nonce) return;

    current.status = "complete";
    current.time = Date.now();
    await message.setFlag(MODULE_ID, "damageApplyLock", current);
}

async function claimPendingDamageApplications(runtime, messageId, applications) {
    const message = game.messages.get(messageId);
    if (!message || applications.length === 0) return [];

    const claims = getDamageApplicationClaims(message);
    const claimed = [];
    let changed = false;

    for (const application of applications) {
        const key = damageAutomation.getDamageApplicationClickKey(runtime, messageId, application);
        const existing = claims[key];
        if (existing?.status === "applied") {
            runtime.damageApplicationClicks.add(key);
            DamageDebug.skipPersistentClaim(messageId, key, application, existing);
            continue;
        }
        const isStale = existing?.status === "applying" && Date.now() - Number(existing.time ?? 0) > DAMAGE_CLAIM_STALE_MS;
        if (existing?.status === "applying" && existing.owner !== runtime.damageRunId && !isStale) {
            DamageDebug.skipPersistentClaim(messageId, key, application, existing);
            continue;
        }

        claims[key] = {
            owner: runtime.damageRunId,
            status: "applying",
            time: Date.now()
        };
        claimed.push(application);
        changed = true;
    }

    if (changed) {
        await setDamageApplicationClaims(message, claims);
        DamageDebug.claimPersistentApplications(messageId, claimed);
    }

    return claimed;
}

async function completeDamageApplicationClaim(runtime, messageId, key) {
    await updateDamageApplicationClaim(runtime, messageId, key, { status: "applied" });
}

async function releaseDamageApplicationClaim(runtime, messageId, key) {
    const message = game.messages.get(messageId);
    if (!message) return;

    const claims = getDamageApplicationClaims(message);
    if (claims[key]?.owner !== runtime.damageRunId) return;
    delete claims[key];
    await setDamageApplicationClaims(message, claims);
}

async function updateDamageApplicationClaim(runtime, messageId, key, update) {
    const message = game.messages.get(messageId);
    if (!message) return;

    const claims = getDamageApplicationClaims(message);
    if (claims[key]?.owner !== runtime.damageRunId) return;
    claims[key] = {
        ...claims[key],
        ...update,
        time: Date.now()
    };
    await setDamageApplicationClaims(message, claims);
}

function getDamageApplicationClaims(message) {
    return foundry.utils.deepClone(message.getFlag(MODULE_ID, "damageApplicationClaims") ?? {});
}

async function setDamageApplicationClaims(message, claims) {
    await message.setFlag(MODULE_ID, "damageApplicationClaims", claims);
}

function markDamageButtonsClaimed(messageId, application, button) {
    button.dataset.inlinebuilderDamageApplied = "true";

    const rollIndex = getDamageRollIndex(button);
    for (const container of document.querySelectorAll(`[data-message-id="${messageId}"] [data-target-uuid]`)) {
        if (!(container instanceof HTMLElement)) continue;
        if (container.dataset.targetUuid !== application.uuid) continue;
        if (Number(container.dataset.targetRollIndex ?? 0) !== rollIndex) continue;

        for (const control of container.querySelectorAll(APPLY_DAMAGE_SELECTOR)) {
            if (!(control instanceof HTMLElement)) continue;
            if (Number(control.dataset?.multiplier) === Number(application.multiplier)) {
                control.dataset.inlinebuilderDamageApplied = "true";
            }
        }
    }
}

function getDamageRollIndex(button) {
    const container = button.closest("[data-target-uuid]");
    return Number(container?.dataset?.targetRollIndex ?? 0);
}

    return {
        applyPendingDamageMessage,
        claimDamageMessageApplyLock,
        claimPendingDamageApplications,
        completeDamageApplicationClaim,
        completeDamageMessageApplyLock,
        findApplyDamageButton,
        getDamageApplicationClaims,
        getDamageApplyButtonIndex,
        getDamageRollIndex,
        isToolbeltDamageAlreadyApplied,
        markDamageButtonsClaimed,
        releaseDamageApplicationClaim,
        runDamageApplyLoop,
        scheduleApplyDamageMessage,
        scheduleDamageApply,
        setDamageApplicationClaims,
        updateDamageApplicationClaim
    };
})();

const {
    applyPendingDamageMessage,
    claimDamageMessageApplyLock,
    claimPendingDamageApplications,
    completeDamageApplicationClaim,
    completeDamageMessageApplyLock,
    findApplyDamageButton,
    getDamageApplicationClaims,
    getDamageApplyButtonIndex,
    getDamageRollIndex,
    isToolbeltDamageAlreadyApplied,
    markDamageButtonsClaimed,
    releaseDamageApplicationClaim,
    runDamageApplyLoop,
    scheduleApplyDamageMessage,
    scheduleDamageApply,
    setDamageApplicationClaims,
    updateDamageApplicationClaim
} = damageApplication;

const AUTO_ROLL_DELAYS = [0, 90, 220, 520];
const PROCESS_DELAYS = [60, 180, 420, 900, 1600];

class InlineAutomations {
    static instance = null;

    constructor() {
        if (InlineAutomations.instance) return InlineAutomations.instance;
        InlineAutomations.instance = this;
        this.processingMessages = new Set();
        this.autoRollingMessages = new Set();
        this.autoRolledControls = new Set();
        this.autoRollTimers = new Map();
        this.processTimers = new Map();
        this.latestMessageRoots = new Map();
        this.rollAllInProgress = new Set();
        this.damageInProgress = new Set();
        this.damageCompletedKeys = new Set();
        this.damageCompletedSources = new Set();
        this.damageSourceInProgress = new Set();
        this.damageJobLocks = new Set();
        this.damageJobMessages = new Map();
        this.damageApplicationClicks = new Set();
        this.applyingDamageMessages = new Set();
        this.pendingDamageApplications = new Map();
        this.damageApplyLoops = new Set();
        this.damageRunId = foundry.utils.randomID();
        this.actorCache = new Map();
        this.targetRecordCache = new Map();
        this.itemCache = new Map();
        this.descriptionProfileCache = new Map();
    }

    static get() {
        if (!InlineAutomations.instance) InlineAutomations.instance = new InlineAutomations();
        return InlineAutomations.instance;
    }

    registerHooks() {
        Hooks.on("renderChatMessageHTML", (message, html) => {
            const root = this.asHTMLElement(html);
            if (this.queueDamageMessage(message, root)) return;
            this.queueMessage(message, root);
        });

        Hooks.on("createChatMessage", (message) => {
            this.queueMessage(message, this.getMessageRoot(message?.id));
        });

        Hooks.on("updateChatMessage", (message) => {
            this.rollAllInProgress.delete(message.id);
            this.queueMessage(message, this.getMessageRoot(message.id));
        });

        Hooks.on("pf2e-toolbelt.rollSave", ({ message } = {}) => {
            if (message) this.queueMessage(message, this.getMessageRoot(message.id));
        });

        Hooks.on("pf2e-toolbelt.rerollSave", ({ message } = {}) => {
            if (message) this.queueMessage(message, this.getMessageRoot(message.id));
        });
    }

    queueDamageMessage(message, root = null) {
        if (!message?.id || !this.isAutomaticDamageMessage(message)) return false;
        this.rememberMessageRoot(message.id, root);
        DamageDebug.renderMessage(message, root, this.pendingDamageApplications.has(message.id));
        if (this.pendingDamageApplications.has(message.id)) {
            this.scheduleDamageApply(message.id);
        }
        return true;
    }

    queueMessage(message, root = null) {
        if (!message?.id || !this.canUseToolbeltTargetHelper()) return;
        if (this.isDamageRollMessage(message) || !targetAutomation.hasToolbeltSaveData(message)) return;

        this.rememberMessageRoot(message.id, root);
        this.scheduleAutoRoll(message, root);
        this.scheduleProcess(message, root);
    }

    scheduleAutoRoll(message, root = null) {
        this.scheduleMessageTimers(this.autoRollTimers, message, root, AUTO_ROLL_DELAYS, () => {
            const currentMessage = game.messages.get(message.id) ?? message;
            void targetAutomation.autoRollTargetChecks(this, currentMessage, this.getQueuedMessageRoot(message.id, root));
        });
    }

    scheduleProcess(message, root = null, delays = PROCESS_DELAYS) {
        this.scheduleMessageTimers(this.processTimers, message, root, delays, () => {
            const currentMessage = game.messages.get(message.id) ?? message;
            void targetAutomation.processMessage(this, currentMessage, this.getQueuedMessageRoot(message.id, root));
        });
    }

    scheduleMessageTimers(timerMap, message, root, delays, callback) {
        if (!message?.id) return;
        this.rememberMessageRoot(message.id, root);
        this.scheduleTimers(timerMap, message.id, delays, callback);
    }

    scheduleTimers(timerMap, key, delays, callback) {
        if (!key || timerMap.has(key)) return;

        const timers = new Set();
        timerMap.set(key, timers);

        for (const delay of delays) {
            const timer = window.setTimeout(() => {
                timers.delete(timer);
                if (timers.size === 0) timerMap.delete(key);
                callback();
            }, delay);
            timers.add(timer);
        }
    }

    rememberMessageRoot(messageId, root) {
        if (messageId && root instanceof HTMLElement) this.latestMessageRoots.set(messageId, root);
    }

    getQueuedMessageRoot(messageId, fallback = null) {
        return this.getMessageRoot(messageId) ?? this.latestMessageRoots.get(messageId) ?? fallback;
    }

    canUseToolbeltTargetHelper() {
        return (
            game.user === game.users.activeGM &&
            game.modules.get(TOOLBELT_ID)?.active === true &&
            game.toolbelt?.getToolSetting?.("targetHelper", "enabled") === true
        );
    }

    async rollAndApplyDamageFromAction(sourceMessage, item, targets, profile = null) {
        if (!sourceMessage?.id) return false;
        if (this.damageSourceInProgress.has(sourceMessage.id) || this.damageCompletedSources.has(sourceMessage.id)) {
            DamageDebug.skipSourceHandled(
                sourceMessage,
                this.damageSourceInProgress.has(sourceMessage.id),
                this.damageCompletedSources.has(sourceMessage.id)
            );
            return false;
        }

        const descriptionProfile = profile ?? profileAutomation.getDescriptionProfile(this, item);
        if (!descriptionProfile.description || targets.length === 0) return false;

        const currentMessage = game.messages.get(sourceMessage.id) ?? sourceMessage;
        if (currentMessage.getFlag(MODULE_ID, "damageAutomationComplete") === true) {
            this.damageCompletedSources.add(currentMessage.id);
            DamageDebug.skipSourceFlagComplete(currentMessage);
            return false;
        }

        const { processedDamage, processedDamageJobs } = this.getProcessedDamageFlags(currentMessage);
        const jobs = damageAutomation.getDamageJobs(targets, descriptionProfile);
        DamageDebug.evaluateJobs(currentMessage, targets, jobs, processedDamage, processedDamageJobs);
        if (jobs.length === 0) {
            await this.completePotentialDamageAutomation(currentMessage, descriptionProfile, processedDamage, processedDamageJobs);
            DamageDebug.noJobs(currentMessage);
            return false;
        }

        return this.rollRunnableDamageJobs(currentMessage, item, jobs, descriptionProfile, processedDamage, processedDamageJobs);
    }

    async rollRunnableDamageJobs(currentMessage, item, jobs, profile, processedDamage, processedDamageJobs) {
        let rolled = false;

        this.damageSourceInProgress.add(currentMessage.id);
        try {
            const runnableJobs = this.getRunnableDamageJobs(currentMessage, jobs, processedDamage, processedDamageJobs);
            if (runnableJobs.length === 0) {
                await this.completePotentialDamageAutomation(currentMessage, profile, processedDamage, processedDamageJobs);
                return false;
            }

            this.markRunnableDamageJobsProcessed(runnableJobs, processedDamage, processedDamageJobs);
            await damageAutomation.completeDamageAutomation(this, currentMessage, processedDamage, processedDamageJobs);

            for (const job of runnableJobs) {
                rolled = await this.rollDamageJob(currentMessage, item, job) || rolled;
            }
        } finally {
            this.damageSourceInProgress.delete(currentMessage.id);
        }

        return rolled;
    }

    async rollDamageJob(currentMessage, item, job) {
        try {
            DamageDebug.createMessageStart(currentMessage, job);
            const damageMessage = await this.createDamageMessage(currentMessage, item, job, job.applications);
            if (!damageMessage?.id) {
                DamageDebug.createMessageEmpty(currentMessage, job);
                return false;
            }

            this.damageJobMessages.set(job.jobId, damageMessage.id);
            this.trimMap(this.damageJobMessages, 300);
            DamageDebug.createMessageComplete(currentMessage, damageMessage, job);
            this.scheduleApplyDamageMessage(damageMessage, job.applications);
            return true;
        } catch (error) {
            console.error(`[${MODULE_ID}] Automatic damage roll failed:`, error);
            return false;
        } finally {
            this.releaseDamageJob(job);
        }
    }

    getProcessedDamageFlags(message) {
        return {
            processedDamage: foundry.utils.deepClone(message.getFlag(MODULE_ID, "processedDamage") ?? {}),
            processedDamageJobs: foundry.utils.deepClone(message.getFlag(MODULE_ID, "processedDamageJobs") ?? {})
        };
    }

    async completePotentialDamageAutomation(message, profile, processedDamage, processedDamageJobs) {
        if (damageAutomation.hasPotentialDamageAutomation(message, profile)) {
            await damageAutomation.completeDamageAutomation(this, message, processedDamage, processedDamageJobs);
        }
    }

    getRunnableDamageJobs(message, jobs, processedDamage, processedDamageJobs) {
        const runnableJobs = [];

        for (const job of jobs) {
            const applications = job.applications.filter((application) => this.canRunDamageApplication(message, job, application, processedDamage));
            const uniqueApplications = damageAutomation.getUniqueDamageApplications(applications);
            if (uniqueApplications.length === 0) continue;

            const keys = uniqueApplications.map((application) => damageAutomation.createDamageProcessedKey(message, application, job.signature));
            const jobId = damageAutomation.createDamageJobId(message, job, uniqueApplications);
            const blockedReason = damageAutomation.getDamageJobBlockedReason(this, message.id, jobId, processedDamageJobs);
            DamageDebug.candidateJob(message, { ...job, jobId }, applications, uniqueApplications, keys, blockedReason);
            if (blockedReason) continue;

            keys.forEach((key) => this.damageInProgress.add(key));
            this.damageJobLocks.add(jobId);
            runnableJobs.push({ ...job, applications: uniqueApplications, keys, jobId });
        }

        return runnableJobs;
    }

    canRunDamageApplication(message, job, application, processedDamage) {
        if (!application.uuid || !application.outcome) return false;
        const key = damageAutomation.createDamageProcessedKey(message, application, job.signature);
        return !processedDamage[key] && !this.damageInProgress.has(key) && !this.damageCompletedKeys.has(key);
    }

    markRunnableDamageJobsProcessed(jobs, processedDamage, processedDamageJobs) {
        for (const { keys, jobId } of jobs) {
            processedDamageJobs[jobId] = true;
            for (const key of keys) {
                processedDamage[key] = true;
                this.damageCompletedKeys.add(key);
            }
        }
        this.trimSet(this.damageCompletedKeys, 1200);
    }

    releaseDamageJob(job) {
        job.keys.forEach((key) => this.damageInProgress.delete(key));
        this.damageJobLocks.delete(job.jobId);
    }

    hasExistingDamageJobMessage(sourceMessageId, jobId) {
        const cachedId = this.damageJobMessages.get(jobId);
        if (cachedId && game.messages.has(cachedId)) return true;

        return game.messages.contents.some((message) => (
            message.getFlag?.(MODULE_ID, "automaticDamage") === true &&
            message.getFlag?.(MODULE_ID, "sourceMessage") === sourceMessageId &&
            message.getFlag?.(MODULE_ID, "damageJobId") === jobId
        ));
    }

    createDamageMessage(sourceMessage, item, job, applications) {
        return damageRuntime.createDamageMessage(this, sourceMessage, item, job, applications);
    }

    scheduleApplyDamageMessage(damageMessage, applications) {
        damageApplication.scheduleApplyDamageMessage(this, damageMessage, applications);
    }

    scheduleDamageApply(messageId, delays) {
        damageApplication.scheduleDamageApply(this, messageId, delays);
    }

    runDamageApplyLoop(messageId, delays) {
        return damageApplication.runDamageApplyLoop(this, messageId, delays);
    }

    applyPendingDamageMessage(messageId, root = null) {
        return damageApplication.applyPendingDamageMessage(this, messageId, root);
    }

    getDamageApplyButtonIndex(root) {
        return damageApplication.getDamageApplyButtonIndex(root);
    }

    findApplyDamageButton(buttonIndex, targetUuid, multiplier) {
        return damageApplication.findApplyDamageButton(buttonIndex, targetUuid, multiplier);
    }

    isToolbeltDamageAlreadyApplied(message, application, rollIndexOrButton = 0) {
        return damageApplication.isToolbeltDamageAlreadyApplied(this, message, application, rollIndexOrButton);
    }

    claimDamageMessageApplyLock(messageId) {
        return damageApplication.claimDamageMessageApplyLock(this, messageId);
    }

    completeDamageMessageApplyLock(messageId, lock) {
        return damageApplication.completeDamageMessageApplyLock(messageId, lock);
    }

    claimPendingDamageApplications(messageId, applications) {
        return damageApplication.claimPendingDamageApplications(this, messageId, applications);
    }

    completeDamageApplicationClaim(messageId, key) {
        return damageApplication.completeDamageApplicationClaim(this, messageId, key);
    }

    releaseDamageApplicationClaim(messageId, key) {
        return damageApplication.releaseDamageApplicationClaim(this, messageId, key);
    }

    updateDamageApplicationClaim(messageId, key, update) {
        return damageApplication.updateDamageApplicationClaim(this, messageId, key, update);
    }

    getDamageApplicationClaims(message) {
        return damageApplication.getDamageApplicationClaims(message);
    }

    setDamageApplicationClaims(message, claims) {
        return damageApplication.setDamageApplicationClaims(message, claims);
    }

    applyDamageToTarget(message, application, rollIndex = 0) {
        return damageRuntime.applyDamageToTarget(this, message, application, rollIndex);
    }

    getActorHpSnapshot(actor) {
        return damageRuntime.getActorHpSnapshot(actor);
    }

    resolveTokenFromTargetUuid(uuid) {
        return damageRuntime.resolveTokenFromTargetUuid(uuid);
    }

    markToolbeltDamageApplied(message, application, token, rollIndex) {
        return damageRuntime.markToolbeltDamageApplied(this, message, application, token, rollIndex);
    }

    markDamageButtonsClaimed(messageId, application, button) {
        damageApplication.markDamageButtonsClaimed(messageId, application, button);
    }

    getDamageRollIndex(button) {
        return damageApplication.getDamageRollIndex(button);
    }

    getDamageApplyButtonKey(targetUuid, multiplier) {
        return damageAutomation.getDamageApplyButtonKey(targetUuid, multiplier);
    }

    getTargetIdFromUuid(uuid) {
        if (typeof uuid !== "string") return null;
        return uuid.split(".").at(-1) || null;
    }

    isAutomaticDamageMessage(message) {
        return message?.getFlag?.(MODULE_ID, "automaticDamage") === true || message?.flags?.[MODULE_ID]?.automaticDamage === true;
    }

    isDamageRollMessage(message) {
        return (
            this.isAutomaticDamageMessage(message) ||
            targetAutomation.getToolbeltData(message)?.type === "damage" ||
            message?.flags?.pf2e?.context?.type === "damage-roll"
        );
    }

    dispatchClick(control, shiftKey = false) {
        control.dispatchEvent(new MouseEvent("click", {
            bubbles: true,
            cancelable: true,
            shiftKey,
            view: window
        }));
    }

    getMessageRoot(messageId) {
        if (!messageId) return null;
        return this.asHTMLElement(document.querySelector(`[data-message-id="${messageId}"]`));
    }

    asHTMLElement(value) {
        if (value instanceof HTMLElement) return value;
        if (value?.[0] instanceof HTMLElement) return value[0];
        return null;
    }

    wait(ms) {
        return new Promise((resolve) => window.setTimeout(resolve, ms));
    }

    hashString(value) {
        let hash = 0;
        for (let index = 0; index < value.length; index += 1) {
            hash = ((hash << 5) - hash) + value.charCodeAt(index);
            hash |= 0;
        }
        return `${value.length}:${hash}`;
    }

    trimMap(map, limit) {
        while (map.size > limit) map.delete(map.keys().next().value);
    }

    trimSet(set, limit) {
        while (set.size > limit) set.delete(set.values().next().value);
    }

    cacheValue(map, key, value, limit = 300) {
        map.set(key, value);
        this.trimMap(map, limit);
        return value;
    }
}

function registerAutomationHooks() {
    InlineAutomations.get().registerHooks();
}

function initializeModule() {
    exposeInlineBuilderApi();

    Hooks.once("init", () => {
        registerModuleSettings();
        registerModuleHooks(registerAutomationHooks);
    });
}

export {
    initializeModule,
    InlineAutomations,
    registerAutomationHooks,
    completeDamageAutomation,
    createDamageFlavor,
    createDamageJobId,
    createDamageProcessedKey,
    createGlobalDamageApplicationKey,
    getDamageApplicationClickKey,
    getDamageApplyButtonKey,
    getDamageJobBlockedReason,
    getDamageJobs,
    getMainCheckConfigFromLines,
    getMainDamageSpecFromLines,
    getUniqueDamageApplications,
    hasPotentialDamageAutomation
};
