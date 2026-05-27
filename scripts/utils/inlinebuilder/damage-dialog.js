import { DAMAGE_TYPES } from '../../data/tables.js';
import { localize } from '../constants.js';
import {
  ApplicationV2,
  HandlebarsApplicationMixin,
  getInlineBuilderDialogOptions,
  getTemplatePart
} from './application-helpers.js';
import { appendInputValue } from './dom-helpers.js';

// Manual damage dialog.
class DamageDialogV2 extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = getInlineBuilderDialogOptions({
    id: 'inlinebuilder-damage-dialog',
    classes: ['pf2e-daavy-inlinebuilder-comfort-dialog'],
    titleKey: 'window.addDamage',
    titleFallback: 'Add Damage',
    icon: 'fas fa-bolt',
    width: 320,
    actions: {
      add: DamageDialogV2.addDamage
    }
  });

  static PARTS = getTemplatePart('damage-dialog');

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
      damageTypeSelect: { name: 'type-suggest' },
      isPersistent: this.selectedMode === 'persistent',
      labels: {
        damage: localize('labels.damage', 'Damage'),
        formulaOnly: localize('labels.formulaOnly', 'Formula only'),
        type: localize('labels.type', 'Type'),
        damageType: localize('labels.damageTypeLower', 'Damage type'),
        selectPlaceholder: localize('labels.selectPlaceholder', '-- Select --'),
        add: localize('labels.add', 'Add')
      }
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
      ui.notifications.warn(localize('warnings.damageFormulaRequired', 'Damage: A damage formula is required.'));
      return;
    }
    if (!typeSuggestValue) {
      ui.notifications.warn(localize('warnings.damageTypeRequired', 'Damage: Please select a damage type.'));
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
    window: { title: mode === 'persistent' ? localize('window.addPersistentDamage', 'Add Persistent Damage') : localize('window.addDamage', 'Add Damage') }
  }).render(true);
}

export {
  openDamageDialog
};
