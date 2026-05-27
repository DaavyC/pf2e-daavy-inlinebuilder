// Finds the editable area.
function getEditorEditable(editorRef) {
  if (!editorRef) return null;
  if (editorRef.classList?.contains('ProseMirror') || editorRef.getAttribute?.('contenteditable') === 'true') return editorRef;
  return editorRef.querySelector?.('.ProseMirror, [contenteditable="true"], .editor-content')
    ?? editorRef.closest?.('.editor')?.querySelector?.('.ProseMirror, [contenteditable="true"], .editor-content')
    ?? null;
}

// Reads an input value.
function getInputValue(input) {
  return input?.value?.trim?.() ?? '';
}

// Sets an input value.
function setInputValue(input, value) {
  if (!input) return;
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

// Appends text to the input.
function appendInputValue(input, value) {
  const current = getInputValue(input);
  setInputValue(input, current ? `${current} ${value}` : value);
}

// Clamps a number.
function clampNumber(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// Parses a value as integer.
function parseInteger(value, fallback = 0) {
  const number = parseInt(value, 10);
  return Number.isFinite(number) ? number : fallback;
}

// Clamps a condition value.
function clampConditionValue(value) {
  return clampNumber(parseInteger(value, 1), 1, 10);
}

// Normalizes a hook element.
function getHookElement(html) {
  if (html instanceof Element || html instanceof DocumentFragment) return html;
  if (html?.[0] instanceof HTMLElement) return html[0];
  if (typeof html?.querySelector === 'function') return html;
  return null;
}

// Finds the first editor divider.
function findFirstEditorDivider(raw) {
  const htmlMatch = raw.match(/<hr[\s\S]*?\/?>/i);
  const dashMatch = raw.match(/>\s*---\s*</) || raw.match(/(^|\n)\s*---\s*(\n|$)/);
  const matches = [htmlMatch, dashMatch].filter(match => match?.index !== undefined);
  if (matches.length === 0) return null;

  const match = matches.reduce((earliest, current) => current.index < earliest.index ? current : earliest);
  return { index: match.index, text: match[0], isDash: match === dashMatch };
}

// Escapes HTML text.
function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Converts lines to paragraph HTML.
function automationLinesToParagraphHtml(text, converter = line => line) {
  return String(text ?? '').split('\n').map(line => {
    const converted = converter(line);
    const idx = converted.indexOf(': ');
    if (idx >= 0) {
      const label = converted.slice(0, idx + 1);
      const rest = converted.slice(idx + 2);
      return `<p><strong>${label}</strong> ${escapeHtml(rest)}</p>`;
    }
    return `<p>${escapeHtml(converted)}</p>`;
  }).join('');
}

export {
  appendInputValue,
  automationLinesToParagraphHtml,
  clampConditionValue,
  clampNumber,
  findFirstEditorDivider,
  getEditorEditable,
  getHookElement,
  getInputValue,
  parseInteger,
  setInputValue
};
