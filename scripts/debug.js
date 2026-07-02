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
            if (enabled) logDebug("debug enabled", { module: MODULE_ID });
        }
    });

    if (!readyLogRegistered) {
        readyLogRegistered = true;
        Hooks.once("ready", () => {
            if (isDebugEnabled()) logDebug("debug ready", { module: MODULE_ID });
        });
    }
}

function logDebug(event, data = {}) {
    console.log(`[${MODULE_ID}] ${event}`, data);
}

function debugDamage(event, data = {}) {
    if (!isDebugEnabled()) return;
    logDebug(`damage:${event}`, data);
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

const DamageDebug = {
    applyLoopTick(messageId, delay) {
        debugDamage("apply loop tick", { damageMessage: messageId, delay });
    },

    applyPendingComplete(messageId, remaining) {
        debugDamage("apply pending complete", {
            damageMessage: messageId,
            remaining: remaining.map(getDamageApplicationLogData)
        });
    },

    applyPendingStart(messageId, applications, buttonIndex) {
        debugDamage("apply pending start", {
            damageMessage: messageId,
            pending: applications.map(getDamageApplicationLogData),
            indexedKeys: Array.from(buttonIndex.keys())
        });
    },

    buttonNotFound(messageId, application, expectedKey) {
        debugDamage("button not found", {
            damageMessage: messageId,
            application: getDamageApplicationLogData(application),
            expectedKey
        });
    },

    candidateJob(sourceMessage, job, applications, uniqueApplications, keys, blockedReason) {
        debugDamage("candidate damage job", {
            sourceMessage: sourceMessage.id,
            jobId: job.jobId,
            signature: job.signature,
            rawApplications: applications.length,
            uniqueApplications: uniqueApplications.map(getDamageApplicationLogData),
            keys,
            blockedReason
        });
    },

    createMessageComplete(sourceMessage, damageMessage, job) {
        debugDamage("create damage message complete", {
            sourceMessage: sourceMessage.id,
            damageMessage: damageMessage.id,
            jobId: job.jobId
        });
    },

    createMessageEmpty(sourceMessage, job) {
        debugDamage("create damage message returned empty", {
            sourceMessage: sourceMessage.id,
            jobId: job.jobId
        });
    },

    createMessageStart(sourceMessage, job) {
        debugDamage("create damage message start", {
            sourceMessage: sourceMessage.id,
            jobId: job.jobId,
            signature: job.signature,
            applications: job.applications.map(getDamageApplicationLogData)
        });
    },

    directApplyStart(message, application, rollIndex, beforeHp) {
        debugDamage("direct apply start", {
            damageMessage: message.id,
            application: getDamageApplicationLogData(application),
            rollIndex,
            beforeHp
        });
    },

    directApplyComplete(message, application, rollIndex, beforeHp, afterHp) {
        debugDamage("direct apply complete", {
            damageMessage: message.id,
            application: getDamageApplicationLogData(application),
            rollIndex,
            beforeHp,
            afterHp,
            appliedKeys: Object.keys(message.flags?.["pf2e-toolbelt"]?.targetHelper?.applied ?? {})
        });
    },

    directApplyFailed(message, application, rollIndex, error) {
        debugDamage("direct apply failed", {
            damageMessage: message?.id,
            application: getDamageApplicationLogData(application),
            rollIndex,
            error: error?.message ?? String(error)
        });
    },

    confirmClickApplied(messageId, clickKey, application, confirmed) {
        debugDamage("confirm damage click applied", {
            damageMessage: messageId,
            clickKey,
            application: getDamageApplicationLogData(application),
            confirmed
        });
    },

    claimMessageApplyLock(messageId, lock, confirmed, current) {
        debugDamage("claim damage message apply lock", {
            damageMessage: messageId,
            lock,
            confirmed,
            current
        });
    },

    claimPersistentApplications(messageId, applications) {
        debugDamage("claim persistent damage applications", {
            damageMessage: messageId,
            applications: applications.map(getDamageApplicationLogData)
        });
    },

    skipPersistentClaim(messageId, clickKey, application, claim) {
        debugDamage("skip persistent damage claim", {
            damageMessage: messageId,
            clickKey,
            application: getDamageApplicationLogData(application),
            claim
        });
    },

    skipMessageApplyLock(messageId, lock) {
        debugDamage("skip damage message apply lock", {
            damageMessage: messageId,
            lock
        });
    },

    evaluateJobs(message, targets, jobs, processedDamage, processedDamageJobs) {
        debugDamage("evaluate damage jobs", {
            sourceMessage: message.id,
            targetCount: targets.length,
            jobCount: jobs.length,
            processedDamageCount: Object.keys(processedDamage).length,
            processedJobCount: Object.keys(processedDamageJobs).length
        });
    },

    finishApplyLoop(messageId, stillPending) {
        debugDamage("finish apply loop", { damageMessage: messageId, stillPending });
    },

    noJobs(message) {
        debugDamage("no damage jobs", { sourceMessage: message.id });
    },

    renderMessage(message, root, hasPendingApplications) {
        debugDamage("render damage message", {
            messageId: message.id,
            sourceMessage: message.getFlag?.(MODULE_ID, "sourceMessage"),
            damageJobId: message.getFlag?.(MODULE_ID, "damageJobId"),
            hasPendingApplications,
            hasRoot: root instanceof HTMLElement
        });
    },

    scheduleApply(damageMessage, applications) {
        debugDamage("schedule damage apply", {
            damageMessage: damageMessage.id,
            sourceMessage: damageMessage.getFlag?.(MODULE_ID, "sourceMessage"),
            damageJobId: damageMessage.getFlag?.(MODULE_ID, "damageJobId"),
            applications: applications.map(getDamageApplicationLogData)
        });
    },

    skipApplyAlreadyRunning(messageId) {
        debugDamage("skip apply already running", { damageMessage: messageId });
    },

    skipApplyLoopRunning(messageId) {
        debugDamage("skip apply loop already running", { damageMessage: messageId });
    },

    skipApplyNoButtonIndex(messageId, applications) {
        debugDamage("skip apply no button index", {
            damageMessage: messageId,
            pendingCount: applications.length
        });
    },

    skipApplyNoPending(messageId) {
        debugDamage("skip apply no pending applications", { damageMessage: messageId });
    },

    skipApplyNoRoot(messageId, applications) {
        debugDamage("skip apply no message root", {
            damageMessage: messageId,
            pendingCount: applications.length
        });
    },

    skipClickAlreadyClaimed(messageId, clickKey, application) {
        debugDamage("skip click already claimed", {
            damageMessage: messageId,
            clickKey,
            application: getDamageApplicationLogData(application)
        });
    },

    skipClickToolbeltApplied(messageId, clickKey, application, toolbeltApplied) {
        debugDamage("skip click toolbelt already applied", {
            damageMessage: messageId,
            clickKey,
            application: getDamageApplicationLogData(application),
            toolbeltApplied
        });
    },

    skipSourceFlagComplete(message) {
        debugDamage("skip source flag complete", { sourceMessage: message.id });
    },

    skipSourceHandled(sourceMessage, inProgress, completed) {
        debugDamage("skip source already handled/in progress", {
            sourceMessage: sourceMessage.id,
            inProgress,
            completed
        });
    },

    startApplyLoop(messageId, delays) {
        debugDamage("start apply loop", { damageMessage: messageId, delays });
    }
};

export {
    DamageDebug,
    registerDebugSettings
};
