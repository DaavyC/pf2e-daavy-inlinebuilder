import { MODULE_ID, localize } from '../constants.js';
import { queueInlineBuilderEditorInjection } from './editor-injection.js';
import { openInlineBuilderDialog } from './inline-builder-dialog.js';
import { setCurrentNpcActor } from './state.js';

// Processes a rendered sheet.
function handleRenderedSheet(app, html) {
  if (app.actor?.type === 'npc') setCurrentNpcActor(app.actor);
  setTimeout(() => {
    queueInlineBuilderEditorInjection(html);
  }, 150);
}

// Registers Inline Builder hooks.
function registerInlineBuilderHooks() {
  Hooks.on('renderActorSheet', handleRenderedSheet);
  Hooks.on('renderItemSheet', handleRenderedSheet);
  Hooks.on('renderApplicationV2', (app, html) => {
    if (app.actor || app.item) handleRenderedSheet(app, html);
  });

  Hooks.once('ready', () => {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.target instanceof Element) queueInlineBuilderEditorInjection(mutation.target);
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          queueInlineBuilderEditorInjection(node);
        }
      }
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['contenteditable']
    });
    game.inlinebuilder = { open: openInlineBuilderDialog, version: '1.0.25' };
  });
}

// Registers the Inline Builder shortcut.
function registerInlineBuilderKeybinding() {
  game.keybindings.register(MODULE_ID, 'openDialog', {
    name: localize('keybindings.openDialog.name', 'Open Inline Builder'),
    hint: localize('keybindings.openDialog.hint', 'Opens the Inline Builder window'),
    editable: [{ key: 'KeyT', modifiers: ['Control', 'Shift'] }],
    onDown: () => {
      openInlineBuilderDialog();
      return true;
    },
    restricted: false,
    precedence: CONST.KEYBINDING_PRECEDENCE.NORMAL
  });
}

export {
  openInlineBuilderDialog,
  registerInlineBuilderHooks,
  registerInlineBuilderKeybinding
};
