import { convertAutomationHtmlToShortText, convertAutomationText } from '../text-helpers.js';
import { AUTOMATION_FIELDS, AUTOMATION_RESULT_BY_LABEL } from './automation-fields.js';
import { automationLinesToParagraphHtml, getEditorEditable } from './dom-helpers.js';

// Detects existing automations.
function detectExistingAutomations(editorRef) {
  const result = { sc: '', s: '', f: '', fc: '' };
  const editable = getEditorEditable(editorRef);
  if (!editable) return result;
  const html = editable.innerHTML || '';
  const hrRegex = /<hr[\s\S]*?\/?>/gi;
  const matches = [...html.matchAll(hrRegex)];
  let targetHtml = html;
  if (matches.length > 0) {
    const lastMatch = matches[matches.length - 1];
    targetHtml = html.substring(lastMatch.index + lastMatch[0].length);
  }
  const tmp = document.createElement('div');
  tmp.innerHTML = targetHtml;
  tmp.querySelectorAll('p').forEach(p => {
    const strong = p.querySelector('strong');
    if (!strong) return;
    const label = strong.innerText.trim();
    let content = p.innerHTML.replace(strong.outerHTML, '').trim();
    content = convertAutomationHtmlToShortText(content.replace(/^[:\s]+/, ''));
    const resultKey = AUTOMATION_RESULT_BY_LABEL.get(label);
    if (resultKey) result[resultKey] = content;
  });
  return result;
}

// Applies automations to the editor.
function applyAutomationToEditorContent(editorRef, applyText, silent = false) {
  const editable = getEditorEditable(editorRef);
  if (!editable) return false;
  const raw = editable.innerHTML || '';
  const hrRegex = /<hr[\s\S]*?\/?>/gi;
  const matches = [...raw.matchAll(hrRegex)];
  if (!applyText.trim()) {
    if (matches.length > 0) {
      const lastMatch = matches[matches.length - 1];
      const content = raw.substring(lastMatch.index + lastMatch[0].length).trim();
      if (AUTOMATION_FIELDS.some(([, label]) => content.includes(label)) || matches.length > 1) {
        editable.innerHTML = raw.substring(0, lastMatch.index).trim();
        editable.dispatchEvent(new Event('input', { bubbles: true }));
        if (!silent) ui.notifications.info('Automation cleared!');
        return true;
      }
    }
    return false;
  }
  let newContent = (matches.length > 1) ? raw.substring(0, matches[matches.length - 1].index + matches[matches.length - 1][0].length) : (raw && raw.trim().length > 0 ? raw + '<hr>' : raw);
  newContent += automationLinesToParagraphHtml(applyText, convertAutomationText);
  editable.innerHTML = newContent;
  editable.dispatchEvent(new Event('input', { bubbles: true }));
  if (!silent) ui.notifications.info('Automation text updated in description!');
  return true;
}

export {
  applyAutomationToEditorContent,
  detectExistingAutomations
};
