import { DamageDebug, registerDebugSettings } from "./debug.js";
import * as damageApplication from "./utils/automation/damage-application.js";
import * as damageAutomation from "./utils/automation/automation-damage.js";
import * as damageRuntime from "./utils/automation/damage-runtime.js";
import * as profileAutomation from "./utils/automation/automation-profile.js";
import * as targetAutomation from "./utils/automation/automation-targets.js";
import { MODULE_ID, TOOLBELT_ID } from "./utils/constants.js";

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

Hooks.once("init", () => {
    registerDebugSettings();
    InlineAutomations.get().registerHooks();
});

export { InlineAutomations };
