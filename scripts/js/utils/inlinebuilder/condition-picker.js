import { PF2E_CONDITIONS, PF2E_CONDITION_MAP, VALUED_CONDITION_SET } from '../../data/tables.js';
import { MODULE_ID } from '../constants.js';
import { clampConditionValue, getInputValue, setInputValue } from './dom-helpers.js';
import { parseConditionTags, removeConditionTag, upsertConditionTag } from './condition-tags.js';
import { openDamageDialog } from './damage-dialog.js';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const CONDITION_LABEL_BY_SLUG = new Map(PF2E_CONDITIONS.map(slug => [
  slug,
  slug.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
]));

// Condition picker dialog.
class ConditionPickerDialogV2 extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: 'inlinebuilder-condition-picker',
    classes: ['inlinebuilder', 'pf2e-daavy-inlinebuilder-picker-dialog'],
    tag: 'div',
    window: {
      title: 'Select Condition',
      icon: 'fas fa-list-check'
    },
    position: { width: 480 },
    actions: {
      selectCondition: ConditionPickerDialogV2.selectCondition,
      removeCondition: ConditionPickerDialogV2.removeCondition
    }
  };

  static PARTS = {
    form: { template: `modules/${MODULE_ID}/templates/condition-picker.hbs` }
  };

  // Initializes instance state.
  constructor(options = {}) {
    super(options);
    this.targetInput = options.targetInput ?? null;
    this.initialValue = options.initialValue ?? '';
    this.currentConditions = parseConditionTags(this.initialValue);
  }

  // Prepares template data.
  async _prepareContext(_options) {
    const conditions = PF2E_CONDITIONS
      .map(slug => {
        const isValued = VALUED_CONDITION_SET.has(slug);
        const isActive = this.currentConditions.has(slug);
        const value = this.currentConditions.get(slug) ?? 1;

        let actionClass = '';
        let actionTitle = 'Click to add condition';
        let iconClass = '';
        let iconPath = `systems/pf2e/icons/conditions/${slug}.webp`;
        let label = CONDITION_LABEL_BY_SLUG.get(slug) ?? slug;

        if (slug === 'persistent-damage') {
          actionClass = 'add-action';
          actionTitle = 'Click to add persistent damage';
        } else if (slug === 'damage') {
          actionClass = 'add-action';
          actionTitle = 'Click to add damage';
          iconClass = 'fas fa-bolt';
          iconPath = '';
          label = 'Damage';
        }

        return {
          slug,
          label,
          iconPath,
          iconClass,
          uuid: PF2E_CONDITION_MAP[slug] ?? '',
          isValued,
          isActive,
          value,
          actionClass,
          actionTitle
        };
      });

    return { conditions };
  }

  // Binds events after render.
  _onRender(context, options) {
    super._onRender(context, options);
    const html = this.element;
    const self = this;

    html.querySelectorAll('.cond-btn-card').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        const slug = btn.dataset.cond;

        if (slug === 'persistent-damage') {
          openDamageDialog(self.targetInput, 'persistent');
          return;
        }

        if (slug === 'damage') {
          openDamageDialog(self.targetInput, 'normal');
          return;
        }

        await ConditionPickerDialogV2.selectCondition.call(self, e, btn);
      });

      btn.addEventListener('contextmenu', async (e) => {
        e.preventDefault();
        if (btn.classList.contains('add-action')) return;
        await ConditionPickerDialogV2.removeCondition.call(self, e, btn);
      });
    });

    html.querySelectorAll('.cond-value-input').forEach(input => {
      input.addEventListener('change', (e) => {
        e.stopPropagation();
        const btn = e.target.closest('.cond-btn-card');
        if (!btn) return;

        const slug = btn.dataset.cond;
        const value = clampConditionValue(e.target.value);
        self.currentConditions.set(slug, value);
        btn.classList.add('active');
        self._updateConditionInTarget(slug, value);
      });

      input.addEventListener('click', (e) => {
        e.stopPropagation();
      });
    });
  }

  // Updates the target condition.
  _updateConditionInTarget(slug, value) {
    this._setTargetValue(upsertConditionTag(getInputValue(this.targetInput), slug, value));
  }

  // Removes the target condition.
  _removeConditionFromTarget(slug) {
    this._setTargetValue(removeConditionTag(getInputValue(this.targetInput), slug));
  }

  // Updates the target value.
  _setTargetValue(value) {
    if (!this.targetInput) return;
    setInputValue(this.targetInput, value);
    this.initialValue = value;
  }

  // Updates the card value.
  _setCardValue(target, value) {
    const valueInput = target.querySelector('.cond-value-input');
    if (valueInput) valueInput.value = value;
  }

  // Selects a condition.
  static async selectCondition(_event, target) {
    const dialog = this;

    const slug = target.dataset.cond;
    if (!slug) return;

    const isValued = VALUED_CONDITION_SET.has(slug);
    let value = 1;

    const valueInput = target.querySelector('.cond-value-input');
    if (valueInput && isValued) {
      value = clampConditionValue(valueInput.value);
    }

    if (dialog.currentConditions.has(slug)) {
      value = Math.min(10, (dialog.currentConditions.get(slug) || 1) + 1);
    }

    dialog.currentConditions.set(slug, value);
    target.classList.add('active');
    dialog._setCardValue(target, value);
    dialog._updateConditionInTarget(slug, value);
  }

  // Removes a condition.
  static async removeCondition(_event, target) {
    const dialog = this;

    const slug = target.dataset.cond;
    if (!slug) return;
    if (!dialog.currentConditions.has(slug)) return;

    if (VALUED_CONDITION_SET.has(slug)) {
      const currentValue = dialog.currentConditions.get(slug) || 1;
      const newValue = currentValue - 1;

      if (newValue > 0) {
        dialog.currentConditions.set(slug, newValue);
        dialog._setCardValue(target, newValue);
        dialog._updateConditionInTarget(slug, newValue);
        return;
      }
    }

    dialog.currentConditions.delete(slug);
    target.classList.remove('active');
    dialog._setCardValue(target, 1);
    dialog._removeConditionFromTarget(slug);
  }
}

// Shows the condition picker.
function showConditionPicker(targetInput) {
  const initialValue = getInputValue(targetInput);
  new ConditionPickerDialogV2({ targetInput, initialValue }).render(true);
}

export {
  showConditionPicker
};
