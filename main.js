import {
  openInlineBuilderDialog,
  registerInlineBuilderHooks,
  registerInlineBuilderKeybinding
} from './scripts/utils/inlinebuilder/index.js';

// Exposes the global builder opener.
window.openInlineBuilder = openInlineBuilderDialog;

// Registers builder hooks and shortcut.
registerInlineBuilderHooks();
Hooks.once('init', registerInlineBuilderKeybinding);
