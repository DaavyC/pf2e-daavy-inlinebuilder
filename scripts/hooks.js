import { MODULE_ID, localize } from "./config.js";
import {
    DAMAGE_TABLES,
    DAMAGE_TYPES,
    DC_TABLE,
    PF2E_CONDITIONS,
    PF2E_CONDITION_MAP,
    PF2E_CONDITION_SET,
    TEMPLATE_CONFIG,
    VALUED_CONDITION_SET
} from "./data/tables.js";
import { convertAutomationHtmlToShortText, convertAutomationText } from "./utils.js";

const domHelpers = (() => {
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

// Finds HTML dividers.
function findHtmlDividers(raw) {
  return [...String(raw ?? '').matchAll(/<hr[\s\S]*?\/?>/gi)];
}

// Finds the last HTML divider.
function findLastHtmlDivider(raw) {
  return findHtmlDividers(raw).at(-1) ?? null;
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

    return {
        appendInputValue,
        automationLinesToParagraphHtml,
        clampConditionValue,
        clampNumber,
        findFirstEditorDivider,
        findHtmlDividers,
        findLastHtmlDivider,
        getEditorEditable,
        getHookElement,
        getInputValue,
        parseInteger,
        setInputValue
    };
})();

const { appendInputValue, automationLinesToParagraphHtml, clampConditionValue, clampNumber, findFirstEditorDivider, findHtmlDividers, findLastHtmlDivider, getEditorEditable, getHookElement, getInputValue, parseInteger, setInputValue } = domHelpers;

const applicationHelpers = (() => {
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

registerInlineBuilderPartials();

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

function getTemplatePart(template) {
  registerInlineBuilderPartials();
  return {
    form: { template: `modules/${MODULE_ID}/templates/${template}.hbs` }
  };
}

    return {
        ApplicationV2,
        HandlebarsApplicationMixin,
        getInlineBuilderDialogOptions,
        getTemplatePart
    };
})();

const { ApplicationV2, HandlebarsApplicationMixin, getInlineBuilderDialogOptions, getTemplatePart } = applicationHelpers;

const inlineBuilderState = (() => {
let currentNpcActor = null;
let activeInlineBuilderDialog = null;

// Gets the current NPC.
function getCurrentNpcActor() {
  return currentNpcActor;
}

// Sets the current NPC.
function setCurrentNpcActor(actor) {
  currentNpcActor = actor;
}

// Gets the sheet level.
function getCreatureLevelFromSheet() {
  return currentNpcActor?.type === 'npc'
    ? currentNpcActor.system?.details?.level?.value ?? null
    : null;
}

// Sets the active dialog.
function setActiveInlineBuilderDialog(dialog) {
  activeInlineBuilderDialog = dialog;
}

// Clears the active dialog.
function clearActiveInlineBuilderDialog(dialog) {
  if (activeInlineBuilderDialog === dialog) activeInlineBuilderDialog = null;
}

    return {
        clearActiveInlineBuilderDialog,
        getCreatureLevelFromSheet,
        getCurrentNpcActor,
        setActiveInlineBuilderDialog,
        setCurrentNpcActor
    };
})();

const { clearActiveInlineBuilderDialog, getCreatureLevelFromSheet, getCurrentNpcActor, setActiveInlineBuilderDialog, setCurrentNpcActor } = inlineBuilderState;

const conditionTags = (() => {
// Reads condition tags.
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

// Builds a condition tag.
function getConditionTag(slug, value) {
  return VALUED_CONDITION_SET.has(slug) ? `{${slug} ${value}}` : `{${slug}}`;
}

// Builds the condition regex.
function getConditionTagRegex(slug) {
  const valuePart = VALUED_CONDITION_SET.has(slug) ? '(?:\\s+\\d+)?' : '';
  return new RegExp(`\\{${slug}${valuePart}\\}`, 'i');
}

// Inserts or updates a condition.
function upsertConditionTag(text, slug, value) {
  const tag = getConditionTag(slug, value);
  const regex = getConditionTagRegex(slug);
  return regex.test(text) ? text.replace(regex, tag) : [text, tag].filter(Boolean).join(' ');
}

// Removes a condition tag.
function removeConditionTag(text, slug) {
  return text.replace(getConditionTagRegex(slug), '').replace(/\s+/g, ' ').trim();
}

    return {
        getConditionTag,
        getConditionTagRegex,
        parseConditionTags,
        removeConditionTag,
        upsertConditionTag
    };
})();

const { getConditionTag, getConditionTagRegex, parseConditionTags, removeConditionTag, upsertConditionTag } = conditionTags;

const automationFields = (() => {
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

    return {
        AUTOMATION_FIELDS,
        getAutomationFields,
        getAutomationResultByLabel,
        getAutomationTemplateFields
    };
})();

const { AUTOMATION_FIELDS, getAutomationFields, getAutomationResultByLabel, getAutomationTemplateFields } = automationFields;

const damageDialog = (() => {
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

    return {
        openDamageDialog
    };
})();

const { openDamageDialog } = damageDialog;

const conditionPicker = (() => {
const CONDITION_LABEL_BY_SLUG = new Map(PF2E_CONDITIONS.map(slug => [
  slug,
  slug.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
]));

// Condition picker dialog.
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

  static PARTS = getTemplatePart('condition-picker');

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

    return {
        showConditionPicker
    };
})();

const { showConditionPicker } = conditionPicker;

const comfortEdit = (() => {
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

    return {
        showComfortEditDialog
    };
})();

const { showComfortEditDialog } = comfortEdit;

const suggestionDialogs = (() => {
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

// Gets a value by level.
function getLeveledTableValue(table, fallback) {
  const level = getCreatureLevelFromSheet();
  if (level === null) return fallback;
  return table[level] || table[String(level)] || fallback;
}

// Calculates initial suggested damage.
function getDefaultDamageFormula() {
  return getLeveledTableValue(DAMAGE_TABLES.area.unlimited, '4d6');
}

// Calculates initial suggested DC.
function getDefaultDC() {
  return getLeveledTableValue(DC_TABLE.moderate, '21');
}

// Opens a level-based dialog.
function renderNpcLevelDialog(DialogClass, mapResult = result => result) {
  if (getCreatureLevelFromSheet() === null) {
    ui.notifications.warn(localize('warnings.noNpcSheet', 'No open NPC sheet found.'));
    return Promise.resolve(null);
  }

  return new Promise(resolve => {
    new DialogClass({ callback: result => resolve(mapResult(result)) }).render(true);
  });
}

// Adjusts the displayed level.
function adjustDisplayedLevel(app, target, selector) {
  const delta = parseInteger(target.dataset.delta, 0);
  if (!delta) return;

  app.currentLevel = clampNumber(app.currentLevel + delta, DMG_SUGGEST_LEVEL_MIN, DMG_SUGGEST_LEVEL_MAX);
  const levelSpan = app.element.querySelector(selector);
  if (levelSpan) levelSpan.textContent = app.currentLevel;
}

// DC suggestion dialog.
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

  static PARTS = getTemplatePart('dc-suggestion');

  // Initializes instance state.
  constructor(options = {}) {
    super(options);
    this.callback = options.callback ?? null;
    this.currentLevel = getCreatureLevelFromSheet() ?? 0;
    this.selectedIntensity = 'moderate';
  }

  // Prepares template data.
  async _prepareContext(_options) {
    return {
      baseLevel: getCreatureLevelFromSheet() ?? 0,
      currentLevel: this.currentLevel,
      levelControlId: 'dc-suggest-level',
      labels: getSuggestionLabels(),
      intensities: getIntensityOptions(['extreme', 'high', 'moderate'])
    };
  }

  // Adjusts the dialog level.
  static async adjustLevel(_event, target) {
    adjustDisplayedLevel(this, target, '#dc-suggest-level');
  }

  // Confirms the suggested DC.
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

// Damage suggestion dialog.
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
      adjustLevel: DamageSuggestionDialogV2.adjustLevel,
      confirm: DamageSuggestionDialogV2.confirmDamage,
      close: DamageSuggestionDialogV2.closeDialog
    }
  });

  static PARTS = getTemplatePart('damage-suggestion');

  // Initializes instance state.
  constructor(options = {}) {
    super(options);
    this.currentStep = 1;
    this.baseLevel = getCreatureLevelFromSheet() ?? 0;
    this.currentLevel = this.baseLevel;
    this.selectedType = null;
    this.selectedSub = null;
    this.callback = options.callback ?? null;
  }

  // Prepares template data.
  async _prepareContext(_options) {
    return {
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

  // Selects the damage type.
  static async selectType(_event, target) {
    const type = target.dataset.type;
    if (!type) return;

    this.selectedType = type;
    this.currentStep = 2;
    this.selectedSub = null;
    await this.close();
    this.render(true);
  }

  // Selects the damage subtype.
  static async selectSub(_event, target) {
    const sub = target.dataset.sub;
    if (!sub) return;

    this.selectedSub = sub;
    await DamageSuggestionDialogV2.confirmDamage.call(this, null, target);
  }

  // Adjusts the dialog level.
  static async adjustLevel(_event, target) {
    adjustDisplayedLevel(this, target, '#dmg-suggest-level');
  }

  // Confirms the suggested damage.
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

  // Closes the dialog.
  static async closeDialog(_event, _target) {
    if (this.callback) {
      this.callback(null);
    }

    await this.close();
  }
}

// Shows the DC suggestion.
async function showDCSuggestionDialog() {
  return renderNpcLevelDialog(DCSuggestionDialogV2, result => result?.dc ?? null);
}

// Shows the damage suggestion.
async function showDamageSuggestionDialog() {
  return renderNpcLevelDialog(DamageSuggestionDialogV2);
}

    return {
        getDefaultDamageFormula,
        getDefaultDC,
        showDamageSuggestionDialog,
        showDCSuggestionDialog
    };
})();

const { getDefaultDamageFormula, getDefaultDC, showDamageSuggestionDialog, showDCSuggestionDialog } = suggestionDialogs;

const descriptionLines = (() => {
// Generates the template line.
function generateTemplateString(type, distance) {
  if (!type || !distance) return null;
  return `@Template[type:${type}|distance:${distance}]`;
}

// Generates the damage line.
function generateDamageString(formula, damageType, traits = []) {
  if (!formula || !damageType) return null;
  const traitsPart = traits.length > 0 ? `|traits:${traits.join(',')}` : '';
  return `@Damage[${formula}[${damageType}]${traitsPart}]`;
}

// Generates the save line.
function generateCheckString(saveType, dc, basic = true, showDC = 'all') {
  if (!saveType || !dc) return null;
  const basicPart = basic ? '|basic:true' : '';
  return `@Check[type:${saveType}|dc:${dc}${basicPart}|showDC:${showDC}]`;
}

// Reads the existing description block.
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

    return {
        generateCheckString,
        generateDamageString,
        generateTemplateString,
        parseDescriptionBlock
    };
})();

const { generateCheckString, generateDamageString, generateTemplateString, parseDescriptionBlock } = descriptionLines;

const automationEditor = (() => {
// Detects existing automations.
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

// Applies automations to the editor.
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

    return {
        applyAutomationToEditorContent,
        detectExistingAutomations
    };
})();

const { applyAutomationToEditorContent, detectExistingAutomations } = automationEditor;

const inlineBuilderDialog = (() => {
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

// Main Inline Builder dialog.
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

  static PARTS = getTemplatePart('main');

  activeSections = new Set(['template']);
  selectedTemplateType = null;
  selectedSaveType = null;
  selectedShowDC = 'all';
  selectedTraits = new Set();

  // Initializes instance state.
  constructor(options = {}) {
    super(options);
    this.editorRef = options.editorRef ?? null;
  }

  // Clears state on close.
  async _onClose(options) {
    await super._onClose?.(options);
    clearActiveInlineBuilderDialog(this);
  }

  // Prepares template data.
  async _prepareContext(_options) {
    return {
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

  // Fits the dialog height.
  _fitToContent() {
    if (!this.element) return;
    this.element.style.width = '520px';
    this.element.style.removeProperty('height');
    const content = this.element.querySelector('.window-content');
    content?.style.removeProperty('height');
    content?.style.removeProperty('max-height');
  }

  // Binds events after render.
  _onRender(context, options) {
    super._onRender(context, options);
    this._bindSectionToggles();
    this._bindSegmentButtons();
    this._bindAuxiliaryButtons();
    this._hydrateFromEditor();
    this._syncBasicSaveState();
    this._fitToContent();
  }

  // Sets a field value.
  _setInput(selector, value) {
    const input = this.element.querySelector(selector);
    if (input) input.value = value;
  }

  // Shows a section.
  _showSection(section) {
    this.activeSections.add(section);
    this.element.querySelector(`.inlinebuilder-toggle[data-section="${section}"]`)?.classList.add('active');
    this.element.querySelector(`fieldset[data-section="${section}"]`)?.style.setProperty('display', 'block');
  }

  // Hides a section.
  _hideSection(section) {
    this.activeSections.delete(section);
    this.element.querySelector(`.inlinebuilder-toggle[data-section="${section}"]`)?.classList.remove('active');
    this.element.querySelector(`fieldset[data-section="${section}"]`)?.style.setProperty('display', 'none');
  }

  // Syncs the basic save.
  _syncBasicSaveState() {
    const basicSaveInput = this.element.querySelector('#basic-save');
    if (!basicSaveInput) return;

    const damageActive = this.activeSections.has('damage');
    basicSaveInput.checked = damageActive;
    basicSaveInput.disabled = !damageActive;
  }

  // Binds section toggles.
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

  // Binds segmented buttons.
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

  // Binds form segments.
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

  // Binds auxiliary buttons.
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

  // Hydrates data from the editor.
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

  // Reads content above the first divider.
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

  // Applies content to the editor.
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

  // Inserts all generated lines.
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

// Opens the main dialog.
function openInlineBuilderDialog(editorRef = null) {
  const dialog = new InlineBuilderDialog({ editorRef });
  setActiveInlineBuilderDialog(dialog);
  dialog.render(true);
}

    return {
        openInlineBuilderDialog
    };
})();

const { openInlineBuilderDialog } = inlineBuilderDialog;

const editorInjection = (() => {
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

// Validates button visibility.
function canShowInlineBuilderEditorButton(editor) {
  if (!(editor instanceof HTMLElement)) return false;
  if (editor.closest('#chat, #chat-form, #chat-controls, #chat-log, #sidebar, .chat-sidebar')) return false;
  return !!editor.querySelector('.ProseMirror[contenteditable]:not([contenteditable="false"]), [contenteditable]:not([contenteditable="false"])');
}

    return {
        queueInlineBuilderEditorInjection
    };
})();

const { queueInlineBuilderEditorInjection } = editorInjection;

const inlineBuilderHooks = (() => {
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

    return {
        openInlineBuilderDialog,
        registerInlineBuilderHooks,
        registerInlineBuilderKeybinding
    };
})();

const { registerInlineBuilderHooks, registerInlineBuilderKeybinding } = inlineBuilderHooks;

function exposeInlineBuilderApi() {
    window.openInlineBuilder = openInlineBuilderDialog;
}

function registerModuleHooks(registerFeatureHooks = null) {
    registerInlineBuilderKeybinding();
    registerInlineBuilderHooks();
    if (typeof registerFeatureHooks === "function") registerFeatureHooks();
}

export {
    exposeInlineBuilderApi,
    registerModuleHooks,
    generateCheckString,
    generateDamageString,
    generateTemplateString,
    parseDescriptionBlock
};
