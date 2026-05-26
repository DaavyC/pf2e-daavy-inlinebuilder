import { normalizeText } from "../text-helpers.js";
import { MODULE_ID, TOOLBELT_ID } from "../constants.js";
import * as profileAutomation from "./automation-profile.js";

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
    const byUuid = new Map();
    for (const target of targets) {
        if (!target?.uuid || !target.outcome || !target.actor) continue;
        if (byUuid.has(target.uuid)) continue;
        byUuid.set(target.uuid, target);
    }
    return Array.from(byUuid.values());
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
    const records = [];
    const seen = new Set();

    for (const value of rawTargets.concat(apiTargets)) {
        const record = await normalizeTargetRecord(runtime, value);
        if (!record?.uuid || seen.has(record.uuid)) continue;
        seen.add(record.uuid);
        records.push(record);
    }

    return records;
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

export {
    autoRollTargetChecks,
    getToolbeltData,
    hasToolbeltSaveData,
    processMessage
};
