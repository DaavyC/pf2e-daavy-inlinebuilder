import { localize } from '../constants.js';

const AUTOMATION_FIELDS = [
  ['sc', () => localize('automation.criticalSuccess', 'Critical Success:'), '#auto-sc', 'autoSc'],
  ['s', () => localize('automation.success', 'Success:'), '#auto-s', 'autoS'],
  ['f', () => localize('automation.failure', 'Failure:'), '#auto-f', 'autoF'],
  ['fc', () => localize('automation.criticalFailure', 'Critical Failure:'), '#auto-fc', 'autoFc']
];

function getAutomationFields() {
  return AUTOMATION_FIELDS.map(([key, label, selector, name]) => [key, label(), selector, name]);
}

function getAutomationResultByLabel() {
  return new Map(getAutomationFields().map(([key, label]) => [label, key]));
}

function getAutomationTemplateFields() {
  return getAutomationFields().map(([, label, selector, name]) => ({
  label: label.replace(/:$/, ''),
  inputId: selector.slice(1),
  name
}));
}

export {
  AUTOMATION_FIELDS,
  getAutomationFields,
  getAutomationResultByLabel,
  getAutomationTemplateFields
};
