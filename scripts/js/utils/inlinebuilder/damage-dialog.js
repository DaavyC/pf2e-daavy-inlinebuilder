import { DAMAGE_TYPES } from '../../data/tables.js';
import { MODULE_ID } from '../constants.js';
import { appendInputValue } from './dom-helpers.js';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

// Manual damage dialog.
class DamageDialogV2 extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: 'inlinebuilder-damage-dialog',
    classes: ['inlinebuilder', 'pf2e-daavy-inlinebuilder-comfort-dialog'],
    tag: 'div',
    window: {
      title: 'Add Damage',
      icon: 'fas fa-bolt'
    },
    position: { width: 320 },
    actions: {
      add: DamageDialogV2.addDamage
    }
  };

  static PARTS = {
    form: { template: `modules/${MODULE_ID}/templates/damage-dialog.hbs` }
  };

  // Initializes instance state.
  constructor(options = {}) {
    super(options);
    this.targetInput = options.targetInput ?? null;
    this.selectedMode = options.mode === 'persistent' ? 'persistent' : 'normal';
  }

  // Prepares template data.
  async _prepareContext(_options) {
    return {
      damageTypes: DAMAGE_TYPES,
      isPersistent: this.selectedMode === 'persistent'
    };
  }

  // Adds damage to the field.
  static async addDamage(_event, _target) {
    const dialog = this;
    const html = dialog.element;

    const damageInput = html.querySelector('input[name="damage"]');
    const typeSuggest = html.querySelector('select[name="type-suggest"]');
    if (!damageInput) return;

    const formula = damageInput.value.trim().replace(/\s+/g, '');
    const typeSuggestValue = typeSuggest?.value || '';
    if (!formula) {
      ui.notifications.warn('Damage: A damage formula is required.');
      return;
    }
    if (!typeSuggestValue) {
      ui.notifications.warn('Damage: Please select a damage type.');
      return;
    }

    const type = typeSuggestValue;

    const tag = dialog.selectedMode === 'persistent'
      ? `{pd-${formula}-${type}}`
      : `{dmg-${formula}-${type}}`;

    appendInputValue(dialog.targetInput, tag);

    dialog.close();
  }
}

// Opens the damage dialog.
function openDamageDialog(targetInput, mode = 'normal') {
  new DamageDialogV2({
    targetInput,
    mode,
    window: { title: mode === 'persistent' ? 'Add Persistent Damage' : 'Add Damage' }
  }).render(true);
}

export {
  openDamageDialog
};
