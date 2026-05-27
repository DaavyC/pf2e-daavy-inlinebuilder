import { convertAutomationHtmlToShortText, convertAutomationText } from '../text-helpers.js';
import { localize } from '../constants.js';
import { getAutomationFields, getAutomationResultByLabel } from './automation-fields.js';
import { automationLinesToParagraphHtml, findHtmlDividers, findLastHtmlDivider, getEditorEditable } from './dom-helpers.js';

// Detects existing automations.
function detectExistingAutomations(editorRef) {
  const result = { sc: '', s: '', f: '', fc: '' };
  const automationResultByLabel = getAutomationResultByLabel();
  const editable = getEditorEditable(editorRef);
  if (!editable) return result;
  const html = editable.innerHTML || '';
  const lastDivider = findLastHtmlDivider(html);
  let targetHtml = html;
  if (lastDivider) {
    targetHtml = html.substring(lastDivider.index + lastDivider[0].length);
  }
  const tmp = document.createElement('div');
  tmp.innerHTML = targetHtml;
  tmp.querySelectorAll('p').forEach(p => {
    const strong = p.querySelector('strong');
    if (!strong) return;
    const label = strong.innerText.trim();
    let content = p.innerHTML.replace(strong.outerHTML, '').trim();
    content = convertAutomationHtmlToShortText(content.replace(/^[:\s]+/, ''));
    const resultKey = automationResultByLabel.get(label);
    if (resultKey) result[resultKey] = content;
  });
  return result;
}

// Applies automations to the editor.
function applyAutomationToEditorContent(editorRef, applyText, silent = false) {
  const editable = getEditorEditable(editorRef);
  if (!editable) return false;
  const raw = editable.innerHTML || '';
  const dividers = findHtmlDividers(raw);
  const lastDivider = findLastHtmlDivider(raw);
  if (!applyText.trim()) {
    if (lastDivider) {
      const content = raw.substring(lastDivider.index + lastDivider[0].length).trim();
      if (getAutomationFields().some(([, label]) => content.includes(label)) || dividers.length > 1) {
        editable.innerHTML = raw.substring(0, lastDivider.index).trim();
        editable.dispatchEvent(new Event('input', { bubbles: true }));
        if (!silent) ui.notifications.info(localize('notifications.automationCleared', 'Automation cleared!'));
        return true;
      }
    }
    return false;
  }
  let newContent = (dividers.length > 1 && lastDivider)
    ? raw.substring(0, lastDivider.index + lastDivider[0].length)
    : (raw && raw.trim().length > 0 ? raw + '<hr>' : raw);
  newContent += automationLinesToParagraphHtml(applyText, convertAutomationText);
  editable.innerHTML = newContent;
  editable.dispatchEvent(new Event('input', { bubbles: true }));
  if (!silent) ui.notifications.info(localize('notifications.automationUpdated', 'Automation text updated in description!'));
  return true;
}

export {
  applyAutomationToEditorContent,
  detectExistingAutomations
};
