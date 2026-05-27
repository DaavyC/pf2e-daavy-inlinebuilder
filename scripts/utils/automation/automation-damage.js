import { createDamageSignature, extractDamageSpecs } from "../text-helpers.js";
import { uniqueBy } from "../collection-helpers.js";
import { MODULE_ID } from "../constants.js";

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

export {
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
