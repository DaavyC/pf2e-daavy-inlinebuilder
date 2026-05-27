import { localize } from '../constants.js';
import {
  ApplicationV2,
  HandlebarsApplicationMixin,
  getInlineBuilderDialogOptions,
  getTemplatePart
} from './application-helpers.js';
import { getInputValue } from './dom-helpers.js';
import { showConditionPicker } from './condition-picker.js';

// Comfort edit dialog.
class ComfortEditDialogV2 extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = getInlineBuilderDialogOptions({
    id: 'inlinebuilder-comfort-edit',
    classes: ['pf2e-daavy-inlinebuilder-comfort-dialog'],
    titleKey: 'window.textEditor',
    titleFallback: 'Text Editor',
    icon: 'fas fa-edit',
    width: 520,
    actions: {
      save: ComfortEditDialogV2.saveContent,
      addCondition: ComfortEditDialogV2.addCondition
    }
  });

  static PARTS = getTemplatePart('comfort-edit');

  // Initializes instance state.
  constructor(options = {}) {
    super(options);
    this.initialValue = options.initialValue ?? '';
    this.callback = options.callback ?? null;
  }

  // Prepares template data.
  async _prepareContext(_options) {
    return {
      content: this.initialValue,
      labels: {
        addCondition: localize('tooltips.addCondition', 'Add Condition'),
        save: localize('labels.saveAction', 'Save')
      }
    };
  }

  // Saves edited content.
  static async saveContent(_event, _target) {
    const dialog = this;
    const textarea = dialog.element.querySelector('textarea[name="content"]');

    if (!textarea) return;

    const content = textarea.value;
    dialog.callback?.(content);
    dialog.close();
  }

  // Adds a condition to text.
  static async addCondition(_event, _target) {
    const dialog = this;
    const textarea = dialog.element.querySelector('textarea[name="content"]');

    if (!textarea) return;

    showConditionPicker(textarea);
  }
}

// Opens comfort editing.
async function showComfortEditDialog(targetInput) {
  const initialValue = getInputValue(targetInput);

  return new Promise(resolve => {
    const dialog = new ComfortEditDialogV2({
      initialValue,
      callback: resolve
    });
    dialog.render(true);
  });
}

export {
  showComfortEditDialog
};
