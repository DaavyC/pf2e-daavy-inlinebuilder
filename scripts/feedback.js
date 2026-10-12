import { FEEDBACK_ACTIONS_CLASS, FEEDBACK_URL, MODULE_ID, SETTINGS_CLASSES, SUPPORT_LINKS } from "./constants.js";
import { getDocument, getElement, i18nKey, localize } from "./utils.js";

const { DialogV2 } = foundry.applications.api;

function feedbackSubmission(form) {
    const formData = new FormData(form);
    const category = String(formData.get("category") ?? "").trim();
    const message = String(formData.get("message") ?? "").trim();
    if (!["Bug", "Suggestion"].includes(category) || !message || message.length > 3000) return null;
    const module = game.modules.get(MODULE_ID);
    return {
        message, category,
        moduleName: module.title,
        moduleVersion: module.version,
        foundryVersion: game.version,
        systemId: game.system.id,
        systemVersion: game.system.version
    };
}

async function submitFeedback(_event, button, dialog) {
    if (!game.user.isGM || button.disabled) return;
    const submission = feedbackSubmission(button.form);
    if (!submission) return ui.notifications.warn(localize("Feedback.Invalid"));
    button.disabled = true;
    try {
        const response = await fetch(FEEDBACK_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(submission)
        });
        if (!response.ok) throw new Error(`Feedback request failed with status ${response.status}.`);
        ui.notifications.info(localize("Feedback.Success"));
        await dialog.close();
    } catch (error) {
        console.error(`${MODULE_ID} | Unable to send feedback.`, error);
        ui.notifications.error(localize("Feedback.Error"));
    } finally {
        button.disabled = false;
    }
}

async function showFeedbackForm() {
    new DialogV2({
        id: "inlinebuilder-feedback",
        classes: ["inlinebuilder", "inlinebuilder-feedback-dialog"],
        window: { title: i18nKey("Feedback.MenuLabel"), icon: "fa-solid fa-comment-dots" },
        position: { width: 500 },
        form: { closeOnSubmit: false },
        content: await foundry.applications.handlebars.renderTemplate(`modules/${MODULE_ID}/templates/feedback.hbs`),
        buttons: [
            {
                action: "cancel", class: "inlinebuilder-feedback-cancel", icon: "fa-solid fa-xmark",
                label: i18nKey("Feedback.Cancel"), callback: (_event, _button, dialog) => dialog.close()
            },
            {
                action: "submit", class: "inlinebuilder-feedback-send", default: true,
                icon: "fa-solid fa-paper-plane", label: i18nKey("Feedback.Send"), callback: submitFeedback
            }
        ]
    }).render({ force: true });
}

function supportButtons(documentRef) {
    return SUPPORT_LINKS.map(({ className, icon, labelKey, url }) => {
        const button = documentRef.createElement("button");
        const symbol = documentRef.createElement("i");
        symbol.className = icon;
        button.type = "button";
        button.className = className;
        button.append(symbol, ` ${localize(labelKey)}`);
        button.addEventListener("click", url
            ? () => documentRef.defaultView.open(url, "_blank", "noopener,noreferrer")
            : showFeedbackForm);
        if (!url) button.title = localize("Feedback.MenuHint");
        return button;
    });
}

export function injectFeedbackButton(renderedHtml) {
    const container = getElement(renderedHtml);
    if (!container || !game.user.isGM || container.querySelector(`.${FEEDBACK_ACTIONS_CLASS}`)) return;
    const firstGroup = container.querySelector(`.${SETTINGS_CLASSES.GROUP}`);
    if (!firstGroup) return;
    const documentRef = getDocument(container);
    const actions = documentRef.createElement("div");
    actions.className = FEEDBACK_ACTIONS_CLASS;
    actions.append(...supportButtons(documentRef));
    firstGroup.before(actions);
}
