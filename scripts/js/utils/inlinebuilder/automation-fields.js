const AUTOMATION_FIELDS = [
  ['sc', 'Critical Success:', '#auto-sc', 'autoSc'],
  ['s', 'Success:', '#auto-s', 'autoS'],
  ['f', 'Failure:', '#auto-f', 'autoF'],
  ['fc', 'Critical Failure:', '#auto-fc', 'autoFc']
];

const AUTOMATION_RESULT_BY_LABEL = new Map(AUTOMATION_FIELDS.map(([key, label]) => [label, key]));
const AUTOMATION_TEMPLATE_FIELDS = AUTOMATION_FIELDS.map(([, label, selector, name]) => ({
  label: label.replace(/:$/, ''),
  inputId: selector.slice(1),
  name
}));

export {
  AUTOMATION_FIELDS,
  AUTOMATION_RESULT_BY_LABEL,
  AUTOMATION_TEMPLATE_FIELDS
};
