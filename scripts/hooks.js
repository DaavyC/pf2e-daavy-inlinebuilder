import { MODULE_ID, localize } from "./config.js";
import {
    convertAutomationHtmlToShortText,
    convertAutomationText,
    DAMAGE_TYPES,
    PF2E_CONDITIONS,
    PF2E_CONDITION_MAP,
    PF2E_CONDITION_SET,
    VALUED_CONDITION_SET
} from "./utils.js";

const DAMAGE_TABLES = {
    area: {
        limited: { '-1': '1d6', 0: '1d10', 1: '2d6', 2: '3d6', 3: '4d6', 4: '5d6', 5: '6d6', 6: '7d6', 7: '8d6', 8: '9d6', 9: '10d6', 10: '11d6', 11: '12d6', 12: '13d6', 13: '14d6', 14: '15d6', 15: '16d6', 16: '17d6', 17: '18d6', 18: '19d6', 19: '20d6', 20: '21d6', 21: '22d6', 22: '23d6', 23: '24d6', 24: '25d6' },
        unlimited: { '-1': '1d4', 0: '1d6', 1: '2d4', 2: '2d6', 3: '2d8', 4: '3d6', 5: '2d10', 6: '4d6', 7: '4d6', 8: '5d6', 9: '5d6', 10: '6d6', 11: '6d6', 12: '5d8', 13: '7d6', 14: '4d12', 15: '8d6', 16: '8d6', 17: '8d6', 18: '9d6', 19: '9d6', 20: '6d10', 21: '10d6', 22: '8d8', 23: '11d6', 24: '11d6' }
    },
    strike: {
        extreme: { '-1': '1d6+1', 0: '1d6+3', 1: '1d8+4', 2: '1d12+4', 3: '1d12+8', 4: '2d10+7', 5: '2d12+7', 6: '2d12+10', 7: '2d12+12', 8: '2d12+15', 9: '2d12+17', 10: '2d12+20', 11: '2d12+22', 12: '3d12+19', 13: '3d12+21', 14: '3d12+24', 15: '3d12+26', 16: '3d12+29', 17: '3d12+31', 18: '3d12+34', 19: '4d12+29', 20: '4d12+32', 21: '4d12+34', 22: '4d12+37', 23: '4d12+39', 24: '4d12+42' },
        high: { '-1': '1d4+1', 0: '1d6+2', 1: '1d6+3', 2: '1d10+4', 3: '1d10+6', 4: '2d8+5', 5: '2d8+7', 6: '2d8+9', 7: '2d10+9', 8: '2d10+11', 9: '2d10+13', 10: '2d12+13', 11: '2d12+15', 12: '3d10+14', 13: '3d10+16', 14: '3d10+18', 15: '3d12+17', 16: '3d12+18', 17: '3d12+19', 18: '3d12+20', 19: '4d10+20', 20: '4d10+22', 21: '4d10+24', 22: '4d10+26', 23: '4d12+24', 24: '4d12+26' },
        moderate: { '-1': '1d4', 0: '1d4+2', 1: '1d6+2', 2: '1d8+4', 3: '1d8+6', 4: '2d6+5', 5: '2d6+6', 6: '2d6+8', 7: '2d8+8', 8: '2d8+9', 9: '2d8+11', 10: '2d10+11', 11: '2d10+12', 12: '3d8+12', 13: '3d8+14', 14: '3d8+15', 15: '3d10+14', 16: '3d10+15', 17: '3d10+16', 18: '3d10+17', 19: '4d8+17', 20: '4d8+19', 21: '4d8+20', 22: '4d8+22', 23: '4d10+20', 24: '4d10+22' },
        low: { '-1': '1d4', 0: '1d4+1', 1: '1d4+2', 2: '1d6+3', 3: '1d6+5', 4: '2d4+4', 5: '2d4+6', 6: '2d4+7', 7: '2d6+6', 8: '2d6+8', 9: '2d6+9', 10: '2d6+10', 11: '2d8+10', 12: '3d6+10', 13: '3d6+11', 14: '3d6+13', 15: '3d6+14', 16: '3d6+15', 17: '3d6+16', 18: '3d6+17', 19: '4d6+14', 20: '4d6+15', 21: '4d6+17', 22: '4d6+18', 23: '4d6+19', 24: '4d6+21' }
    }
};

const DC_TABLE = {
    extreme: { '-1': 19, 0: 19, 1: 20, 2: 22, 3: 23, 4: 25, 5: 26, 6: 27, 7: 29, 8: 30, 9: 32, 10: 33, 11: 34, 12: 36, 13: 37, 14: 39, 15: 40, 16: 41, 17: 43, 18: 44, 19: 46, 20: 47, 21: 48, 22: 50, 23: 51, 24: 52 },
    high: { '-1': 16, 0: 16, 1: 17, 2: 18, 3: 20, 4: 21, 5: 22, 6: 24, 7: 25, 8: 26, 9: 28, 10: 29, 11: 30, 12: 32, 13: 33, 14: 34, 15: 36, 16: 37, 17: 38, 18: 40, 19: 41, 20: 42, 21: 44, 22: 45, 23: 46, 24: 48 },
    moderate: { '-1': 13, 0: 13, 1: 14, 2: 15, 3: 17, 4: 18, 5: 19, 6: 21, 7: 22, 8: 23, 9: 25, 10: 26, 11: 27, 12: 29, 13: 30, 14: 31, 15: 33, 16: 34, 17: 35, 18: 37, 19: 38, 20: 39, 21: 41, 22: 42, 23: 43, 24: 45 }
};

const TEMPLATE_CONFIG = {
    types: [
        { value: 'burst', icon: 'fa-circle', tooltipKey: 'templateTypes.burst' },
        { value: 'cone', icon: 'fa-angle-left', tooltipKey: 'templateTypes.cone' },
        { value: 'square', icon: 'fa-square', tooltipKey: 'templateTypes.square' },
        { value: 'line', icon: 'fa-grip-lines', tooltipKey: 'templateTypes.line' }
    ],
    damageTypes: ['fire', 'cold', 'electricity', 'acid', 'sonic', 'force', 'mental', 'poison', 'bleed', 'spirit', 'vitality', 'void', 'bludgeoning', 'piercing', 'slashing'],
    saveTypes: [
        { value: 'fortitude', icon: 'fa-chess-rook', tooltipKey: 'saveTypes.fortitude' },
        { value: 'reflex', icon: 'fa-person-running', tooltipKey: 'saveTypes.reflex' },
        { value: 'will', icon: 'fa-brain', tooltipKey: 'saveTypes.will' }
    ],
    showDCOptions: [
        { value: 'all', icon: 'fa-users', tooltipKey: 'showDCOptions.all' },
        { value: 'owner', icon: 'fa-user', tooltipKey: 'showDCOptions.owner' },
        { value: 'gm', icon: 'fa-crown', tooltipKey: 'showDCOptions.gm' },
        { value: 'none', icon: 'fa-eye-slash', tooltipKey: 'showDCOptions.none' }
    ],
    traits: [
        { value: 'area-damage', icon: 'fa-burst', tooltipKey: 'traits.areaDamage' },
        { value: 'splash', icon: 'fa-droplet', tooltipKey: 'traits.splash' },
        { value: 'persistent', icon: 'fa-clock', tooltipKey: 'traits.persistent' }
    ]
};


function getEditorEditable(editorRef) {
  if (!editorRef) return null;
  if (editorRef.classList?.contains('ProseMirror') || editorRef.getAttribute?.('contenteditable') === 'true') return editorRef;
  return editorRef.querySelector?.('.ProseMirror, [contenteditable="true"], .editor-content')
    ?? editorRef.closest?.('.editor')?.querySelector?.('.ProseMirror, [contenteditable="true"], .editor-content')
    ?? null;
}

function getInputValue(input) {
  return input?.value?.trim?.() ?? '';
}

function setInputValue(input, value) {
  if (!input) return;
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function appendInputValue(input, value) {
  const current = getInputValue(input);
  setInputValue(input, current ? `${current} ${value}` : value);
}

function clampNumber(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function parseInteger(value, fallback = 0) {
  const number = parseInt(value, 10);
  return Number.isFinite(number) ? number : fallback;
}

function clampConditionValue(value) {
  return clampNumber(parseInteger(value, 1), 1, 10);
}

function getHookElement(html) {
  if (html instanceof Element || html instanceof DocumentFragment) return html;
  if (html?.[0] instanceof HTMLElement) return html[0];
  if (typeof html?.querySelector === 'function') return html;
  return null;
}

function findFirstEditorDivider(raw) {
  const htmlMatch = raw.match(/<hr[\s\S]*?\/?>/i);
  const dashMatch = raw.match(/>\s*---\s*</) || raw.match(/(^|\n)\s*---\s*(\n|$)/);
  const matches = [htmlMatch, dashMatch].filter(match => match?.index !== undefined);
  if (matches.length === 0) return null;

  const match = matches.reduce((earliest, current) => current.index < earliest.index ? current : earliest);
  return { index: match.index, text: match[0], isDash: match === dashMatch };
}

function findHtmlDividers(raw) {
  return [...String(raw ?? '').matchAll(/<hr[\s\S]*?\/?>/gi)];
}

function findLastHtmlDivider(raw) {
  return findHtmlDividers(raw).at(-1) ?? null;
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

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


const foundryApplicationApi = globalThis.foundry?.applications?.api ?? {};
const ApplicationV2 = foundryApplicationApi.ApplicationV2 ?? class {};
const HandlebarsApplicationMixin = foundryApplicationApi.HandlebarsApplicationMixin ?? ((BaseApplication) => BaseApplication);
const INLINEBUILDER_LEVEL_CONTROL_PARTIAL = `
<div class="inlinebuilder-row">
  <div class="inlinebuilder-label">
    <label>{{labels.level}}</label>
    <span>{{labels.creatureLevel}}</span>
  </div>
  <div class="inlinebuilder-control dmg-level-row">
    <button type="button" class="dmg-level-btn" data-action="adjustLevel" data-delta="-1">&minus;</button>
    <span id="{{levelControlId}}" class="dmg-level-value">{{currentLevel}}</span>
    <button type="button" class="dmg-level-btn" data-action="adjustLevel" data-delta="1">+</button>
  </div>
</div>`;
const INLINEBUILDER_ICON_SEGMENT_PARTIAL = `
{{#each options}}
<button type="button" class="icon-btn {{../buttonClass}}{{#if (eq this.value ../activeValue)}} active{{/if}}" data-value="{{this.value}}" data-tooltip="{{this.tooltip}}">
  <i class="fas {{this.icon}}"></i>
</button>
{{/each}}`;
const INLINEBUILDER_DAMAGE_TYPE_SELECT_PARTIAL = `
<select{{#if damageTypeSelect.id}} id="{{damageTypeSelect.id}}"{{/if}} name="{{damageTypeSelect.name}}">
  <option value="">{{labels.selectPlaceholder}}</option>
  {{#each damageTypes}}
  <option value="{{this}}">{{this}}</option>
  {{/each}}
</select>`;

function registerInlineBuilderPartials() {
  if (globalThis.Handlebars?.registerPartial) {
    globalThis.Handlebars.registerPartial('inlinebuilderLevelControl', INLINEBUILDER_LEVEL_CONTROL_PARTIAL);
    globalThis.Handlebars.registerPartial('inlinebuilderIconSegment', INLINEBUILDER_ICON_SEGMENT_PARTIAL);
    globalThis.Handlebars.registerPartial('inlinebuilderDamageTypeSelect', INLINEBUILDER_DAMAGE_TYPE_SELECT_PARTIAL);
  }
}

function getInlineBuilderDialogOptions({
  id,
  classes = [],
  tag = 'div',
  titleKey,
  titleFallback,
  icon,
  width,
  actions = {},
  window = {}
}) {
  return {
    id,
    classes: ['inlinebuilder', ...classes],
    tag,
    window: {
      title: localize(titleKey, titleFallback),
      icon,
      ...window
    },
    position: { width },
    actions
  };
}

registerInlineBuilderPartials();

const MAIN_TEMPLATE_PART = {
  form: { template: `modules/${MODULE_ID}/templates/main.hbs` }
};


let currentNpcActor = null;

function setCurrentNpcActor(actor) {
  currentNpcActor = actor;
}

function getCreatureLevelFromSheet() {
  return currentNpcActor?.type === 'npc'
    ? currentNpcActor.system?.details?.level?.value ?? null
    : null;
}

function parseConditionTags(text) {
  const conditions = new Map();
  if (!text) return conditions;

  for (const match of text.matchAll(/\{([^}]+)\}/g)) {
    const content = match[1].trim();
    if (content.startsWith('dmg-') || content.startsWith('pd-')) continue;

    const parts = content.split(/\s+/);
    const slug = parts[0].toLowerCase();
    const value = parts.length > 1 ? parseInteger(parts[1], 1) : 1;

    if (PF2E_CONDITION_SET.has(slug)) {
      conditions.set(slug, value);
    }
  }
  return conditions;
}

function getConditionTag(slug, value) {
  return VALUED_CONDITION_SET.has(slug) ? `{${slug} ${value}}` : `{${slug}}`;
}

function getConditionTagRegex(slug) {
  const valuePart = VALUED_CONDITION_SET.has(slug) ? '(?:\\s+\\d+)?' : '';
  return new RegExp(`\\{${slug}${valuePart}\\}`, 'i');
}

function upsertConditionTag(text, slug, value) {
  const tag = getConditionTag(slug, value);
  const regex = getConditionTagRegex(slug);
  return regex.test(text) ? text.replace(regex, tag) : [text, tag].filter(Boolean).join(' ');
}

function removeConditionTag(text, slug) {
  return text.replace(getConditionTagRegex(slug), '').replace(/\s+/g, ' ').trim();
}


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

  static PARTS = MAIN_TEMPLATE_PART;

  constructor(options = {}) {
    super(options);
    this.targetInput = options.targetInput ?? null;
    this.selectedMode = options.mode === 'persistent' ? 'persistent' : 'normal';
  }

  async _prepareContext(_options) {
    return {
      damageDialogTemplate: true,
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

function openDamageDialog(targetInput, mode = 'normal') {
  new DamageDialogV2({
    targetInput,
    mode,
    window: { title: mode === 'persistent' ? localize('window.addPersistentDamage', 'Add Persistent Damage') : localize('window.addDamage', 'Add Damage') }
  }).render(true);
}


const CONDITION_LABEL_BY_SLUG = new Map(PF2E_CONDITIONS.map(slug => [
  slug,
  slug.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
]));

class ConditionPickerDialogV2 extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = getInlineBuilderDialogOptions({
    id: 'inlinebuilder-condition-picker',
    classes: ['pf2e-daavy-inlinebuilder-picker-dialog'],
    titleKey: 'window.selectCondition',
    titleFallback: 'Select Condition',
    icon: 'fas fa-list-check',
    width: 480,
    actions: {
      selectCondition: ConditionPickerDialogV2.selectCondition,
      removeCondition: ConditionPickerDialogV2.removeCondition
    }
  });

  static PARTS = MAIN_TEMPLATE_PART;

  constructor(options = {}) {
    super(options);
    this.targetInput = options.targetInput ?? null;
    this.initialValue = options.initialValue ?? '';
    this.currentConditions = parseConditionTags(this.initialValue);
  }

  async _prepareContext(_options) {
    const conditions = PF2E_CONDITIONS
      .map(slug => {
        const isValued = VALUED_CONDITION_SET.has(slug);
        const isActive = this.currentConditions.has(slug);
        const value = this.currentConditions.get(slug) ?? 1;

        let actionClass = '';
        let actionTitle = localize('tooltips.clickAddCondition', 'Click to add condition');
        let iconClass = '';
        let iconPath = `systems/pf2e/icons/conditions/${slug}.webp`;
        let label = CONDITION_LABEL_BY_SLUG.get(slug) ?? slug;

        if (slug === 'persistent-damage') {
          actionClass = 'add-action';
          actionTitle = localize('tooltips.clickAddPersistentDamage', 'Click to add persistent damage');
        } else if (slug === 'damage') {
          actionClass = 'add-action';
          actionTitle = localize('tooltips.clickAddDamage', 'Click to add damage');
          iconClass = 'fas fa-bolt';
          iconPath = '';
          label = localize('labels.damage', 'Damage');
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

    return { conditionPickerTemplate: true, conditions };
  }

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

  _updateConditionInTarget(slug, value) {
    this._setTargetValue(upsertConditionTag(getInputValue(this.targetInput), slug, value));
  }

  _removeConditionFromTarget(slug) {
    this._setTargetValue(removeConditionTag(getInputValue(this.targetInput), slug));
  }

  _setTargetValue(value) {
    if (!this.targetInput) return;
    setInputValue(this.targetInput, value);
    this.initialValue = value;
  }

  _setCardValue(target, value) {
    const valueInput = target.querySelector('.cond-value-input');
    if (valueInput) valueInput.value = value;
  }

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

function showConditionPicker(targetInput) {
  const initialValue = getInputValue(targetInput);
  new ConditionPickerDialogV2({ targetInput, initialValue }).render(true);
}


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

  static PARTS = MAIN_TEMPLATE_PART;

  constructor(options = {}) {
    super(options);
    this.initialValue = options.initialValue ?? '';
    this.callback = options.callback ?? null;
  }

  async _prepareContext(_options) {
    return {
      comfortEditTemplate: true,
      content: this.initialValue,
      labels: {
        addCondition: localize('tooltips.addCondition', 'Add Condition'),
        save: localize('labels.saveAction', 'Save')
      }
    };
  }

  static async saveContent(_event, _target) {
    const dialog = this;
    const textarea = dialog.element.querySelector('textarea[name="content"]');

    if (!textarea) return;

    const content = textarea.value;
    dialog.callback?.(content);
    dialog.close();
  }

  static async addCondition(_event, _target) {
    const dialog = this;
    const textarea = dialog.element.querySelector('textarea[name="content"]');

    if (!textarea) return;

    showConditionPicker(textarea);
  }
}

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


const DMG_SUGGEST_LEVEL_MIN = -1;
const DMG_SUGGEST_LEVEL_MAX = 24;

function getSuggestionLabels() {
  return {
    level: localize('labels.level', 'Level'),
    creatureLevel: localize('labels.creatureLevel', 'Creature level'),
    intensity: localize('labels.intensity', 'Intensity'),
    dcCategory: localize('labels.dcCategory', 'DC category'),
    type: localize('labels.type', 'Type'),
    damageProfile: localize('labels.damageProfile', 'Damage profile'),
    area: localize('labels.area', 'Area'),
    strike: localize('labels.strike', 'Strike'),
    damageCategory: localize('labels.damageCategory', 'Damage category'),
    unlimited: localize('labels.unlimited', 'Unlimited'),
    limited: localize('labels.limited', 'Limited'),
    extreme: localize('labels.extreme', 'Extreme'),
    high: localize('labels.high', 'High'),
    moderate: localize('labels.moderate', 'Moderate'),
    low: localize('labels.low', 'Low')
  };
}

function getIntensityOptions(values) {
  const labels = getSuggestionLabels();
  return values.map(value => ({ value, label: labels[value] ?? value }));
}

function getLeveledTableValue(table, fallback) {
  const level = getCreatureLevelFromSheet();
  if (level === null) return fallback;
  return table[level] || table[String(level)] || fallback;
}

function getDefaultDamageFormula() {
  return getLeveledTableValue(DAMAGE_TABLES.area.unlimited, '4d6');
}

function getDefaultDC() {
  return getLeveledTableValue(DC_TABLE.moderate, '21');
}

function renderNpcLevelDialog(DialogClass, mapResult = result => result) {
  if (getCreatureLevelFromSheet() === null) {
    ui.notifications.warn(localize('warnings.noNpcSheet', 'No open NPC sheet found.'));
    return Promise.resolve(null);
  }

  return new Promise(resolve => {
    new DialogClass({ callback: result => resolve(mapResult(result)) }).render(true);
  });
}

function adjustDisplayedLevel(app, target, selector) {
  const delta = parseInteger(target.dataset.delta, 0);
  if (!delta) return;

  app.currentLevel = clampNumber(app.currentLevel + delta, DMG_SUGGEST_LEVEL_MIN, DMG_SUGGEST_LEVEL_MAX);
  const levelSpan = app.element.querySelector(selector);
  if (levelSpan) levelSpan.textContent = app.currentLevel;
}

class DCSuggestionDialogV2 extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = getInlineBuilderDialogOptions({
    id: 'inlinebuilder-dc-suggestion',
    titleKey: 'window.dcSuggestion',
    titleFallback: 'DC Suggestion',
    icon: 'fas fa-shield-alt',
    width: 320,
    actions: {
      adjustLevel: DCSuggestionDialogV2.adjustLevel,
      confirmDC: DCSuggestionDialogV2.confirmDC
    }
  });

  static PARTS = MAIN_TEMPLATE_PART;

  constructor(options = {}) {
    super(options);
    this.callback = options.callback ?? null;
    this.currentLevel = getCreatureLevelFromSheet() ?? 0;
    this.selectedIntensity = 'moderate';
  }

  async _prepareContext(_options) {
    return {
      dcSuggestionTemplate: true,
      baseLevel: getCreatureLevelFromSheet() ?? 0,
      currentLevel: this.currentLevel,
      levelControlId: 'dc-suggest-level',
      labels: getSuggestionLabels(),
      intensities: getIntensityOptions(['extreme', 'high', 'moderate'])
    };
  }

  static async adjustLevel(_event, target) {
    adjustDisplayedLevel(this, target, '#dc-suggest-level');
  }

  static async confirmDC(_event, target) {
    const app = this;
    const level = app.currentLevel;
    const intensity = target?.dataset?.intensity ?? app.selectedIntensity;
    const table = DC_TABLE[intensity];
    const dc = table[level] ?? table[String(level)];

    if (!dc) {
      ui.notifications.warn(localize('warnings.dcNotFound', 'DC not found for this level.'));
      return;
    }

    app.callback?.({ intensity, level, dc });
    app.close();
  }
}

class DamageSuggestionDialogV2 extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = getInlineBuilderDialogOptions({
    id: 'inlinebuilder-damage-suggestion',
    titleKey: 'window.damageSuggestion',
    titleFallback: 'Damage Suggestion',
    icon: 'fas fa-dragon',
    width: 320,
    actions: {
      selectType: DamageSuggestionDialogV2.selectType,
      selectSub: DamageSuggestionDialogV2.selectSub,
      adjustLevel: DamageSuggestionDialogV2.adjustLevel
    }
  });

  static PARTS = MAIN_TEMPLATE_PART;

  constructor(options = {}) {
    super(options);
    this.currentStep = 1;
    this.baseLevel = getCreatureLevelFromSheet() ?? 0;
    this.currentLevel = this.baseLevel;
    this.selectedType = null;
    this.selectedSub = null;
    this.callback = options.callback ?? null;
  }

  async _prepareContext(_options) {
    return {
      damageSuggestionTemplate: true,
      baseLevel: this.baseLevel,
      currentLevel: this.currentLevel,
      levelControlId: 'dmg-suggest-level',
      showStep1: this.currentStep === 1,
      showStep2: this.currentStep === 2,
      isArea: this.selectedType === 'area',
      isStrike: this.selectedType === 'strike',
      labels: getSuggestionLabels()
    };
  }

  static async selectType(_event, target) {
    const type = target.dataset.type;
    if (!type) return;

    this.selectedType = type;
    this.currentStep = 2;
    this.selectedSub = null;
    await this.close();
    this.render(true);
  }

  static async selectSub(_event, target) {
    const sub = target.dataset.sub;
    if (!sub) return;

    this.selectedSub = sub;
    await DamageSuggestionDialogV2.confirmDamage.call(this, null, target);
  }

  static async adjustLevel(_event, target) {
    adjustDisplayedLevel(this, target, '#dmg-suggest-level');
  }

  static async confirmDamage(_event, _target) {
    if (!this.selectedType || !this.selectedSub) {
      ui.notifications.warn(localize('warnings.damageTypeIntensityRequired', 'Please select a damage type and intensity.'));
      return;
    }

    const table = DAMAGE_TABLES[this.selectedType]?.[this.selectedSub];
    if (!table) {
      ui.notifications.warn(localize('warnings.damageTableNotFound', 'Damage table not found.'));
      return;
    }

    const formula = table[this.currentLevel] || table[String(this.currentLevel)];
    if (!formula) {
      ui.notifications.warn(localize('warnings.formulaNotFound', 'Formula not found for this level.'));
      return;
    }

    if (this.callback) {
      this.callback(formula);
    }

    await this.close();
  }

}

async function showDCSuggestionDialog() {
  return renderNpcLevelDialog(DCSuggestionDialogV2, result => result?.dc ?? null);
}

async function showDamageSuggestionDialog() {
  return renderNpcLevelDialog(DamageSuggestionDialogV2);
}


function generateTemplateString(type, distance) {
  if (!type || !distance) return null;
  return `@Template[type:${type}|distance:${distance}]`;
}

function generateDamageString(formula, damageType, traits = []) {
  if (!formula || !damageType) return null;
  const traitsPart = traits.length > 0 ? `|traits:${traits.join(',')}` : '';
  return `@Damage[${formula}[${damageType}]${traitsPart}]`;
}

function generateCheckString(saveType, dc, basic = true, showDC = 'all') {
  if (!saveType || !dc) return null;
  const basicPart = basic ? '|basic:true' : '';
  return `@Check[type:${saveType}|dc:${dc}${basicPart}|showDC:${showDC}]`;
}

function parseDescriptionBlock(text) {
  const out = { template: null, check: null, damage: null };
  if (!text) return out;

  const templateLabel = escapeRegExp(localize('description.template', 'Template:'));
  const savingThrowLabel = escapeRegExp(localize('description.savingThrow', 'Saving Throw:'));
  const damageLabel = escapeRegExp(localize('description.damage', 'Damage:'));

  const templateMatch = text.match(new RegExp(`(?:Template:|${templateLabel})\\s*@Template\\[type:(\\w+)\\|distance:(\\d+)\\]`, 'i'));
  if (templateMatch) {
    out.template = { type: templateMatch[1], distance: parseInteger(templateMatch[2]) };
  }

  const checkMatch = text.match(new RegExp(`(?:Saving Throw:|${savingThrowLabel})\\s*@Check\\[type:(\\w+)\\|dc:(\\d+)(?:\\|basic:(true|false))?\\|showDC:(\\w+)\\]`, 'i'));
  if (checkMatch) {
    out.check = {
      saveType: checkMatch[1],
      dc: parseInteger(checkMatch[2]),
      basic: checkMatch[3] === 'true',
      showDC: checkMatch[4]
    };
  }

  const damageMatch = text.match(new RegExp(`(?:Damage:|${damageLabel})\\s*@Damage\\[([^[]+)\\[(\\w+)\\](?:\\|traits:([^\\]]*))?\\]`, 'i'));
  if (out.check?.basic === true && damageMatch) {
    const traits = damageMatch[3]
      ? damageMatch[3].split(',').map(trait => trait.trim()).filter(Boolean)
      : [];
    out.damage = { formula: damageMatch[1], damageType: damageMatch[2], traits };
  }

  return out;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}


function detectExistingAutomations(editorRef) {
  const result = { sc: '', s: '', f: '', fc: '' };
  const automationResultByLabel = getAutomationResultByLabel();
  const editable = getEditorEditable(editorRef);
  if (!editable) return result;
  const html = editable.innerHTML || '';
  const lastDivider = findLastHtmlDivider(html);
  let targetHtml = html;
  if (lastDivider) {
    targetHtml = html.substring(lastDivider.index + lastDivider[0].length);
  }
  const tmp = document.createElement('div');
  tmp.innerHTML = targetHtml;
  tmp.querySelectorAll('p').forEach(p => {
    const strong = p.querySelector('strong');
    if (!strong) return;
    const label = strong.innerText.trim();
    let content = p.innerHTML.replace(strong.outerHTML, '').trim();
    content = convertAutomationHtmlToShortText(content.replace(/^[:\s]+/, ''));
    const resultKey = automationResultByLabel.get(label);
    if (resultKey) result[resultKey] = content;
  });
  return result;
}

function applyAutomationToEditorContent(editorRef, applyText, silent = false) {
  const editable = getEditorEditable(editorRef);
  if (!editable) return false;
  const raw = editable.innerHTML || '';
  const dividers = findHtmlDividers(raw);
  const lastDivider = findLastHtmlDivider(raw);
  if (!applyText.trim()) {
    if (lastDivider) {
      const content = raw.substring(lastDivider.index + lastDivider[0].length).trim();
      if (getAutomationFields().some(([, label]) => content.includes(label)) || dividers.length > 1) {
        editable.innerHTML = raw.substring(0, lastDivider.index).trim();
        editable.dispatchEvent(new Event('input', { bubbles: true }));
        if (!silent) ui.notifications.info(localize('notifications.automationCleared', 'Automation cleared!'));
        return true;
      }
    }
    return false;
  }
  let newContent = (dividers.length > 1 && lastDivider)
    ? raw.substring(0, lastDivider.index + lastDivider[0].length)
    : (raw && raw.trim().length > 0 ? raw + '<hr>' : raw);
  newContent += automationLinesToParagraphHtml(applyText, convertAutomationText);
  editable.innerHTML = newContent;
  editable.dispatchEvent(new Event('input', { bubbles: true }));
  if (!silent) ui.notifications.info(localize('notifications.automationUpdated', 'Automation text updated in description!'));
  return true;
}


function localizeOption(option) {
  const fallback = option.tooltip ?? option.value;
  return { ...option, tooltip: option.tooltipKey ? localize(option.tooltipKey, fallback) : fallback };
}

function getInlineBuilderLabels() {
  return {
    sectionsAria: localize('labels.sectionsAria', 'Inline Builder sections'),
    areaTemplate: localize('labels.areaTemplate', 'Area Template'),
    damage: localize('labels.damage', 'Damage'),
    savingThrow: localize('labels.savingThrow', 'Saving Throw'),
    automations: localize('labels.automations', 'Automations'),
    templateType: localize('labels.templateType', 'Template Type'),
    areaShape: localize('labels.areaShape', 'Area shape'),
    distance: localize('labels.distance', 'Distance'),
    rangeInUnits: localize('labels.rangeInUnits', 'Range in units'),
    decreaseDistance: localize('tooltips.decreaseDistance', 'Decrease (-5, Shift: -10)'),
    increaseDistance: localize('tooltips.increaseDistance', 'Increase (+5, Shift: +10)'),
    resetDistance: localize('tooltips.resetDistance', 'Reset (0)'),
    formula: localize('labels.formula', 'Formula'),
    damageExpression: localize('labels.damageExpression', 'Damage expression'),
    suggestBasedOnLevel: localize('tooltips.suggestBasedOnLevel', 'Suggest based on level'),
    damageType: localize('labels.damageType', 'Damage Type'),
    selectType: localize('labels.selectType', 'Select a type'),
    selectPlaceholder: localize('labels.selectPlaceholder', '-- Select --'),
    traits: localize('labels.traits', 'Traits'),
    characteristics: localize('labels.characteristics', 'Characteristics'),
    save: localize('labels.save', 'Save'),
    checkType: localize('labels.checkType', 'Check type'),
    dc: localize('labels.dc', 'DC'),
    difficultyClass: localize('labels.difficultyClass', 'Difficulty class'),
    basic: localize('labels.basic', 'Basic'),
    standardSave: localize('labels.standardSave', 'Standard save'),
    basicSave: localize('tooltips.basicSave', 'Basic save'),
    showAs: localize('labels.showAs', 'Show As'),
    chatVisibility: localize('labels.chatVisibility', 'Chat visibility'),
    addCondition: localize('tooltips.addCondition', 'Add Condition'),
    textEditor: localize('tooltips.textEditor', 'Text Editor'),
    apply: localize('labels.apply', 'Apply')
  };
}

class InlineBuilderDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = getInlineBuilderDialogOptions({
    id: 'inlinebuilder-dialog',
    titleKey: 'window.inlineBuilder',
    titleFallback: 'Inline Builder',
    icon: 'fas fa-pen',
    width: 520,
    window: {
      resizable: false,
      minimizable: true
    },
    actions: { insertAll: InlineBuilderDialog.insertAll }
  });

  static PARTS = MAIN_TEMPLATE_PART;

  activeSections = new Set(['template']);
  selectedTemplateType = null;
  selectedSaveType = null;
  selectedShowDC = 'all';
  selectedTraits = new Set();

  constructor(options = {}) {
    super(options);
    this.editorRef = options.editorRef ?? null;
  }

  async _prepareContext(_options) {
    return {
      mainTemplate: true,
      labels: getInlineBuilderLabels(),
      templateTypes: TEMPLATE_CONFIG.types.map(localizeOption),
      damageTypes: TEMPLATE_CONFIG.damageTypes,
      damageTypeSelect: { id: 'damage-type', name: 'damageType' },
      saveTypes: TEMPLATE_CONFIG.saveTypes.map(localizeOption),
      showDCOptions: TEMPLATE_CONFIG.showDCOptions.map(localizeOption),
      traits: TEMPLATE_CONFIG.traits.map(localizeOption),
      automationFields: getAutomationTemplateFields(),
      defaultDamage: getDefaultDamageFormula(),
      defaultDC: getDefaultDC()
    };
  }

  _fitToContent() {
    if (!this.element) return;
    this.element.style.width = '520px';
    this.element.style.removeProperty('height');
    const content = this.element.querySelector('.window-content');
    content?.style.removeProperty('height');
    content?.style.removeProperty('max-height');
  }

  _onRender(context, options) {
    super._onRender(context, options);
    this._bindSectionToggles();
    this._bindSegmentButtons();
    this._bindAuxiliaryButtons();
    this._hydrateFromEditor();
    this._syncBasicSaveState();
    this._fitToContent();
  }

  _setInput(selector, value) {
    const input = this.element.querySelector(selector);
    if (input) input.value = value;
  }

  _showSection(section) {
    this.activeSections.add(section);
    this.element.querySelector(`.inlinebuilder-toggle[data-section="${section}"]`)?.classList.add('active');
    this.element.querySelector(`fieldset[data-section="${section}"]`)?.style.setProperty('display', 'block');
  }

  _hideSection(section) {
    this.activeSections.delete(section);
    this.element.querySelector(`.inlinebuilder-toggle[data-section="${section}"]`)?.classList.remove('active');
    this.element.querySelector(`fieldset[data-section="${section}"]`)?.style.setProperty('display', 'none');
  }

  _syncBasicSaveState() {
    const basicSaveInput = this.element.querySelector('#basic-save');
    if (!basicSaveInput) return;

    const damageActive = this.activeSections.has('damage');
    basicSaveInput.checked = damageActive;
    basicSaveInput.disabled = !damageActive;
  }

  _bindSectionToggles() {
    this.element.querySelectorAll('.inlinebuilder-toggle').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const section = btn.dataset.section;
        if (btn.classList.contains('active')) {
          this._hideSection(section);
        } else {
          this._showSection(section);
        }
        this._syncBasicSaveState();
        this._fitToContent();
      });
    });

    this.element.querySelector('#basic-save')?.addEventListener('change', (event) => {
      if (!event.currentTarget.checked) this._hideSection('damage');
      this._syncBasicSaveState();
      this._fitToContent();
    });
  }

  _bindSegment(selector, setter) {
    this.element.querySelectorAll(selector).forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        this.element.querySelectorAll(selector).forEach(button => button.classList.remove('active'));
        btn.classList.add('active');
        setter(btn.dataset.value);
      });
    });
  }

  _bindSegmentButtons() {
    this._bindSegment('.template-type-btn', value => { this.selectedTemplateType = value; });
    this._bindSegment('.save-type-btn', value => { this.selectedSaveType = value; });
    this._bindSegment('.show-dc-btn', value => { this.selectedShowDC = value; });

    this.element.querySelectorAll('.trait-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const trait = btn.dataset.value;
        if (btn.classList.contains('active')) {
          btn.classList.remove('active');
          this.selectedTraits.delete(trait);
        } else {
          btn.classList.add('active');
          this.selectedTraits.add(trait);
        }
      });
    });
  }

  _bindAuxiliaryButtons() {
    const distanceInput = this.element.querySelector('#template-distance');
    const adjustDistance = (event, delta) => {
      event.preventDefault();
      const amount = event.shiftKey ? 10 : 5;
      const current = parseInteger(distanceInput?.value, 0);
      setInputValue(distanceInput, Math.max(0, current + (delta * amount)));
    };

    this.element.querySelectorAll('.add-condition').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const targetInput = this.element.querySelector(btn.dataset.target);
        showConditionPicker(targetInput);
      });
    });

    this.element.querySelectorAll('.comfort-edit').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        const targetInput = this.element.querySelector(btn.dataset.target);
        const content = await showComfortEditDialog(targetInput);
        if (content !== undefined) setInputValue(targetInput, content);
      });
    });

    this.element.querySelector('#distance-increase')?.addEventListener('click', e => adjustDistance(e, 1));
    this.element.querySelector('#distance-decrease')?.addEventListener('click', e => adjustDistance(e, -1));
    this.element.querySelector('#distance-reset')?.addEventListener('click', (e) => {
      e.preventDefault();
      setInputValue(distanceInput, 0);
    });

    this.element.querySelector('#suggest-damage-btn')?.addEventListener('click', async (e) => {
      e.preventDefault();
      const formula = await showDamageSuggestionDialog();
      if (formula) this._setInput('#damage-formula', formula);
    });

    this.element.querySelector('#suggest-dc-btn')?.addEventListener('click', async (e) => {
      e.preventDefault();
      const dc = await showDCSuggestionDialog();
      if (dc) setInputValue(this.element.querySelector('#dc-value'), dc);
    });
  }

  _hydrateFromEditor() {
    if (!this.editorRef) return;

    const parsed = parseDescriptionBlock(InlineBuilderDialog._getContentAboveFirstHR(this.editorRef));

    if (parsed.template) {
      this._showSection('template');
      this.selectedTemplateType = parsed.template.type;
      this._setInput('#template-distance', parsed.template.distance);
      this.element.querySelector(`.template-type-btn[data-value="${parsed.template.type}"]`)?.classList.add('active');
    }

    if (parsed.check) {
      this._showSection('check');
      this.selectedSaveType = parsed.check.saveType;
      this.selectedShowDC = parsed.check.showDC;
      this._setInput('#dc-value', parsed.check.dc);
      const basicCheck = this.element.querySelector('#basic-save');
      if (basicCheck) basicCheck.checked = parsed.check.basic;
      this.element.querySelector(`.save-type-btn[data-value="${parsed.check.saveType}"]`)?.classList.add('active');
      this.element.querySelector(`.show-dc-btn[data-value="${parsed.check.showDC}"]`)?.classList.add('active');
    }

    if (parsed.damage) {
      this._showSection('damage');
      this._setInput('#damage-formula', parsed.damage.formula);
      this._setInput('#damage-type', parsed.damage.damageType);
      parsed.damage.traits.forEach(trait => {
        this.selectedTraits.add(trait);
        this.element.querySelector(`.trait-btn[data-value="${trait}"]`)?.classList.add('active');
      });
    }

    const existingAutomation = detectExistingAutomations(this.editorRef);
    for (const [key, , selector] of getAutomationFields()) {
      if (existingAutomation[key]) this._setInput(selector, existingAutomation[key]);
    }
    if (getAutomationFields().some(([key]) => existingAutomation[key])) {
      this._showSection('automation');
    }
  }

  static _getContentAboveFirstHR(editorRef) {
    const editable = getEditorEditable(editorRef);
    if (!editable) return '';
    const raw = editable.innerHTML || '';
    const divider = findFirstEditorDivider(raw);
    const aboveHtml = raw.slice(0, divider?.index ?? raw.length).trim();
    if (!aboveHtml) return '';
    const div = document.createElement('div');
    div.innerHTML = aboveHtml;
    return (div.textContent || div.innerText || '').trim();
  }

  static _applyToEditorContent(editorRef, applyText) {
    const editable = getEditorEditable(editorRef);
    if (!editable) { return false; }
    const raw = editable.innerHTML || '';
    const divider = findFirstEditorDivider(raw);
    const fromHrOnward = divider
      ? (divider.isDash ? '<hr>' + raw.slice(divider.index + divider.text.length).trim() : raw.slice(divider.index).trim())
      : raw;
    const applyHtml = automationLinesToParagraphHtml(applyText);
    const newContent = applyHtml + (fromHrOnward.startsWith('<hr') ? fromHrOnward : '<hr>' + fromHrOnward);
    editable.innerHTML = newContent;
    editable.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }

  static insertAll(_event, target) {
    const app = this;
    const form = target.closest('.inlinebuilder-content');
    const lines = [];
    const autoLines = [];
    let basicSaveEnabled = false;

    if (app.activeSections.has('template')) {
      const type = app.selectedTemplateType;
      const distanceVal = form.querySelector('#template-distance')?.value;
      const distance = parseInteger(distanceVal, NaN);
      if (!type) {
        ui.notifications.warn(localize('warnings.areaTypeRequired', 'Area Template: Please select a type (Burst, Cone, Square, or Line).'));
        return;
      }
      if (!Number.isFinite(distance) || distance <= 0) {
        ui.notifications.warn(localize('warnings.areaDistanceRequired', 'Area Template: Distance must be greater than 0.'));
        return;
      }
      const str = generateTemplateString(type, distance);
      if (str) lines.push(`${localize('description.template', 'Template:')} ${str}`);
    }

    if (app.activeSections.has('check')) {
      const saveType = app.selectedSaveType;
      const dcVal = form.querySelector('#dc-value')?.value;
      const dc = parseInteger(dcVal, NaN);
      const basic = form.querySelector('#basic-save')?.checked ?? true;
      basicSaveEnabled = basic;
      const showDC = app.selectedShowDC;
      if (!saveType) {
        ui.notifications.warn(localize('warnings.saveTypeRequired', 'Saving Throw: Please select a save (Fortitude, Reflex, or Will).'));
        return;
      }
      if (!Number.isFinite(dc) || dc <= 0) {
        ui.notifications.warn(localize('warnings.dcRequired', 'Saving Throw: DC value must be greater than 0.'));
        return;
      }
      const str = generateCheckString(saveType, String(dc), basic, showDC);
      if (str) lines.push(`${localize('description.savingThrow', 'Saving Throw:')} ${str}`);
    }

    if (app.activeSections.has('damage') && basicSaveEnabled) {
      const formula = (form.querySelector('#damage-formula')?.value ?? '').trim();
      const damageType = form.querySelector('#damage-type')?.value ?? '';
      const traits = Array.from(app.selectedTraits);
      if (!formula) {
        ui.notifications.warn(localize('warnings.damageFormulaRequired', 'Damage: A damage formula is required.'));
        return;
      }
      if (!damageType) {
        ui.notifications.warn(localize('warnings.damageTypeRequiredSelect', 'Damage: Please select a damage type (do not use "-- Select --").'));
        return;
      }
      const str = generateDamageString(formula, damageType, traits);
      if (str) lines.push(`${localize('description.damage', 'Damage:')} ${str}`);
    }

    if (app.activeSections.has('automation')) {
      for (const [, label, selector] of getAutomationFields()) {
        const value = getInputValue(form.querySelector(selector));
        if (value) autoLines.push(`${label} ${value}`);
      }
    }

    if (lines.length === 0 && autoLines.length === 0) {
      ui.notifications.warn(localize('warnings.sectionRequired', 'Please select at least one section and fill in the fields.'));
      return;
    }

    const applyText = lines.join('\n');
    if (app.editorRef) {
      const ok = lines.length > 0 ? InlineBuilderDialog._applyToEditorContent(app.editorRef, applyText) : true;
      if (ok) {
        if (app.activeSections.has('automation')) applyAutomationToEditorContent(app.editorRef, autoLines.join('\n'), true);
        else applyAutomationToEditorContent(app.editorRef, '', true);
        app.close();
        ui.notifications.info(localize('notifications.applied', 'Applied to description!'));
        return;
      }
    }
    navigator.clipboard.writeText([applyText, autoLines.join('\n')].filter(Boolean).join('\n')).then(() => {
      ui.notifications.info(localize('notifications.copiedNoEditor', 'Copied! (no active editor)'));
      app.close();
    }).catch(() => {
      ui.notifications.error(localize('notifications.copyFailed', 'Failed to copy.'));
    });
  }
}

function openInlineBuilderDialog(editorRef = null) {
  new InlineBuilderDialog({ editorRef }).render(true);
}


let editorInjectionFrame = null;
const pendingEditorInjectionRoots = new Set();

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
    btn.setAttribute('data-tooltip', localize('window.inlineBuilder', 'Inline Builder'));
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

function canShowInlineBuilderEditorButton(editor) {
  if (!(editor instanceof HTMLElement)) return false;
  if (editor.closest('#chat, #chat-form, #chat-controls, #chat-log, #sidebar, .chat-sidebar')) return false;
  return !!editor.querySelector('.ProseMirror[contenteditable]:not([contenteditable="false"]), [contenteditable]:not([contenteditable="false"])');
}


function handleRenderedSheet(app, html) {
  if (app.actor?.type === 'npc') setCurrentNpcActor(app.actor);
  setTimeout(() => {
    queueInlineBuilderEditorInjection(html);
  }, 150);
}

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
    game.inlinebuilder = { open: openInlineBuilderDialog };
  });
}

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


function exposeInlineBuilderApi() {
    window.openInlineBuilder = openInlineBuilderDialog;
}

export {
    exposeInlineBuilderApi,
    registerInlineBuilderHooks,
    registerInlineBuilderKeybinding
};
