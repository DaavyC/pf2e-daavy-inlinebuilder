import { DamageDebug } from "../../debug.js";
import * as damageAutomation from "./automation-damage.js";
import * as damageRuntime from "./damage-runtime.js";
import * as targetAutomation from "./automation-targets.js";
import { MODULE_ID } from "../constants.js";

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

export {
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
