import { getHookElement } from './dom-helpers.js';
import { openInlineBuilderDialog } from './inline-builder-dialog.js';

let editorInjectionFrame = null;
const pendingEditorInjectionRoots = new Set();

// Schedules editor injection.
function queueInlineBuilderEditorInjection(root) {
  const element = getHookElement(root) ?? root;
  if (!(element instanceof Element || element instanceof DocumentFragment)) return;

  pendingEditorInjectionRoots.add(element);
  if (editorInjectionFrame !== null) return;

  editorInjectionFrame = window.requestAnimationFrame(() => {
    editorInjectionFrame = null;
    const roots = Array.from(pendingEditorInjectionRoots);
    pendingEditorInjectionRoots.clear();
    roots.forEach(injectInlineBuilderEditorButton);
  });
}

// Injects the editor button.
function injectInlineBuilderEditorButton(container) {
  const root = getHookElement(container) ?? container;
  if (!root) return;

  const editors = new Set();
  if (root.matches?.('.editor')) editors.add(root);
  root.closest?.('.editor') && editors.add(root.closest('.editor'));
  root.querySelectorAll?.('.editor').forEach(editor => editors.add(editor));

  editors.forEach(editor => {
    editor.querySelectorAll('.editor-menu .inlinebuilder-editor-btn, menu.editor-menu .inlinebuilder-editor-btn')
      .forEach(button => button.closest('li')?.remove() ?? button.remove());

    if (!canShowInlineBuilderEditorButton(editor)) {
      editor.querySelector(':scope > .inlinebuilder-editor-btn')?.remove();
      editor.classList.remove('inlinebuilder-editor-host');
      return;
    }

    if (editor.querySelector(':scope > .inlinebuilder-editor-btn')) return;

    editor.classList.add('inlinebuilder-editor-host');

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'inlinebuilder-editor-btn';
    btn.setAttribute('data-tooltip', 'Inline Builder');
    btn.innerHTML = '<i class="fa-solid fa-wand-sparkles fa-fw"></i>';

    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      const editorContainer = this.closest('.editor');
      openInlineBuilderDialog(editorContainer);
    });

    editor.appendChild(btn);
  });
}

// Validates button visibility.
function canShowInlineBuilderEditorButton(editor) {
  if (!(editor instanceof HTMLElement)) return false;
  if (editor.closest('#chat, #chat-form, #chat-controls, #chat-log, #sidebar, .chat-sidebar')) return false;
  return !!editor.querySelector('.ProseMirror[contenteditable]:not([contenteditable="false"]), [contenteditable]:not([contenteditable="false"])');
}

export {
  queueInlineBuilderEditorInjection
};
