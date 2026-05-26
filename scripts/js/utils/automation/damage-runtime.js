import { DamageDebug } from "../../debug.js";
import * as damageAutomation from "./automation-damage.js";
import * as targetAutomation from "./automation-targets.js";
import { MODULE_ID, TOOLBELT_ID } from "../constants.js";

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

export {
    applyDamageToTarget,
    createDamageMessage,
    getActorHpSnapshot,
    markToolbeltDamageApplied,
    resolveTokenFromTargetUuid
};
