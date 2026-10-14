import { MODULE_ID, DAMAGE_TABLES, DC_TABLE, TEMPLATE_CONFIG, DAMAGE_TYPES, PF2E_CONDITIONS, PF2E_CONDITION_MAP, PF2E_CONDITION_SET, VALUED_CONDITION_SET, INLINEBUILDER_LEVEL_CONTROL_PARTIAL, INLINEBUILDER_ICON_SEGMENT_PARTIAL, INLINEBUILDER_DAMAGE_TYPE_SELECT_PARTIAL, MAIN_TEMPLATE_PART, CONDITION_LABEL_BY_SLUG, DMG_SUGGEST_LEVEL_MIN, DMG_SUGGEST_LEVEL_MAX, AUTOMATION_FIELDS } from "./constants.js";
import {
    convertAutomationHtmlToShortText,
    convertAutomationText,
    localize,
    i18nKey,
    getElement
} from "./utils.js";
import { applyTheme } from "./settings.js";

const proseMirrorViews = new WeakMap();

function registerProseMirrorViews() {
  return Hooks.on('createProseMirrorEditor', (_uuid, plugins) => {
    plugins.inlineBuilder = new foundry.prosemirror.Plugin({
      view: view => {
        proseMirrorViews.set(view.dom, view);
        return { destroy: () => proseMirrorViews.delete(view.dom) };
      }
    });
  });
}

function getEditorEditable(editorRef) {
  if (!editorRef) return null;
  if (editorRef.classList?.contains('ProseMirror') || editorRef.getAttribute?.('contenteditable') === 'true') return editorRef;
  return editorRef.querySelector?.('.ProseMirror, [contenteditable="true"], .editor-content')
    ?? editorRef.closest?.('.editor')?.querySelector?.('.ProseMirror, [contenteditable="true"], .editor-content')
    ?? null;
}

function editorHtml(editable) {
  const view = proseMirrorViews.get(editable);
  return view ? foundry.prosemirror.dom.serializeString(view.state.doc.content) : editable.innerHTML;
}

function writeEditorHtml(editable, html) {
  const view = proseMirrorViews.get(editable);
  if (view) {
    const content = foundry.prosemirror.dom.parseString(html).content;
    view.dispatch(view.state.tr.replaceWith(0, view.state.doc.content.size, content));
  } else {
    editable.innerHTML = html;
    editable.dispatchEvent(new Event('input', { bubbles: true }));
  }
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
      return `<p><strong>${escapeHtml(label)}</strong> ${escapeHtml(rest)}</p>`;
    }
    return `<p>${escapeHtml(converted)}</p>`;
  }).join('');
}


const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
function registerInlineBuilderPartials() {
  Handlebars.registerPartial('inlinebuilderLevelControl', INLINEBUILDER_LEVEL_CONTROL_PARTIAL);
  Handlebars.registerPartial('inlinebuilderIconSegment', INLINEBUILDER_ICON_SEGMENT_PARTIAL);
  Handlebars.registerPartial('inlinebuilderDamageTypeSelect', INLINEBUILDER_DAMAGE_TYPE_SELECT_PARTIAL);
}

function getInlineBuilderDialogOptions({
  id,
  classes = [],
  tag = 'div',
  titleKey,
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
      title: i18nKey(titleKey),
      icon,
      ...window
    },
    position: { width },
    actions
  };
}

registerInlineBuilderPartials();

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


function getAutomationFields() {
  return AUTOMATION_FIELDS.map(([key, labelKey, selector, name]) => [key, localize(labelKey), selector, name]);
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
        damage: localize('labels.damage'),
        formulaOnly: localize('labels.formulaOnly'),
        type: localize('labels.type'),
        damageType: localize('labels.damageTypeLower'),
        selectPlaceholder: localize('labels.selectPlaceholder'),
        add: localize('labels.add')
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
      ui.notifications.warn(localize('warnings.damageFormulaRequired'));
      return;
    }
    if (!typeSuggestValue) {
      ui.notifications.warn(localize('warnings.damageTypeRequired'));
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
    window: { title: mode === 'persistent' ? localize('window.addPersistentDamage') : localize('window.addDamage') }
  }).render(true);
}


class ConditionPickerDialogV2 extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = getInlineBuilderDialogOptions({
    id: 'inlinebuilder-condition-picker',
    classes: ['pf2e-daavy-inlinebuilder-picker-dialog'],
    titleKey: 'window.selectCondition',
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
        let actionTitle = localize('tooltips.clickAddCondition');
        let iconClass = '';
        let iconPath = `systems/pf2e/icons/conditions/${slug}.webp`;
        let label = CONDITION_LABEL_BY_SLUG.get(slug) ?? slug;

        if (slug === 'persistent-damage') {
          actionClass = 'add-action';
          actionTitle = localize('tooltips.clickAddPersistentDamage');
        } else if (slug === 'damage') {
          actionClass = 'add-action';
          actionTitle = localize('tooltips.clickAddDamage');
          iconClass = 'fas fa-bolt';
          iconPath = '';
          label = localize('labels.damage');
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
  }

  _setCardValue(target, value) {
    const valueLabel = target.querySelector('.cond-value');
    if (valueLabel) valueLabel.textContent = String(value);
  }

  static async selectCondition(_event, target) {
    const dialog = this;

    const slug = target.dataset.cond;
    if (!slug) return;

    let value = 1;

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
        addCondition: localize('tooltips.addCondition'),
        save: localize('labels.saveAction')
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
    dialog.addEventListener('close', () => resolve(undefined), { once: true });
    dialog.render(true);
  });
}


function getSuggestionLabels() {
  return {
    level: localize('labels.level'),
    creatureLevel: localize('labels.creatureLevel'),
    intensity: localize('labels.intensity'),
    dcCategory: localize('labels.dcCategory'),
    type: localize('labels.type'),
    damageProfile: localize('labels.damageProfile'),
    area: localize('labels.area'),
    strike: localize('labels.strike'),
    damageCategory: localize('labels.damageCategory'),
    unlimited: localize('labels.unlimited'),
    limited: localize('labels.limited'),
    extreme: localize('labels.extreme'),
    high: localize('labels.high'),
    moderate: localize('labels.moderate'),
    low: localize('labels.low')
  };
}

function getIntensityOptions(values) {
  const labels = getSuggestionLabels();
  return values.map(value => ({ value, label: labels[value] ?? value }));
}

function getLeveledTableValue(table, fallback) {
  const level = getCreatureLevelFromSheet();
  if (level === null) return fallback;
  return table[level] ?? fallback;
}

function getDefaultDamageFormula() {
  return getLeveledTableValue(DAMAGE_TABLES.area.unlimited, '4d6');
}

function getDefaultDC() {
  return getLeveledTableValue(DC_TABLE.moderate, '21');
}

function renderNpcLevelDialog(DialogClass, mapResult = result => result) {
  if (getCreatureLevelFromSheet() === null) {
    ui.notifications.warn(localize('warnings.noNpcSheet'));
    return Promise.resolve(null);
  }

  return new Promise(resolve => {
    const dialog = new DialogClass({ callback: result => resolve(mapResult(result)) });
    dialog.addEventListener('close', () => resolve(null), { once: true });
    dialog.render(true);
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
    const dc = table[level];

    if (!dc) {
      ui.notifications.warn(localize('warnings.dcNotFound'));
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
    await this.render(true);
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
      ui.notifications.warn(localize('warnings.damageTypeIntensityRequired'));
      return;
    }

    const table = DAMAGE_TABLES[this.selectedType]?.[this.selectedSub];
    if (!table) {
      ui.notifications.warn(localize('warnings.damageTableNotFound'));
      return;
    }

    const formula = table[this.currentLevel];
    if (!formula) {
      ui.notifications.warn(localize('warnings.formulaNotFound'));
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

  const templateLabel = escapeRegExp(localize('description.template'));
  const savingThrowLabel = escapeRegExp(localize('description.savingThrow'));
  const damageLabel = escapeRegExp(localize('description.damage'));

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
  if (damageMatch) {
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
  const html = editorHtml(editable);
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
    const label = strong.textContent.trim();
    const paragraph = p.cloneNode(true);
    paragraph.querySelector('strong').remove();
    let content = paragraph.textContent.trim();
    content = convertAutomationHtmlToShortText(content.replace(/^[:\s]+/, ''));
    const resultKey = automationResultByLabel.get(label);
    if (resultKey) result[resultKey] = content;
  });
  return result;
}

function applyAutomationToEditorContent(editorRef, applyText) {
  const editable = getEditorEditable(editorRef);
  if (!editable) return false;
  const raw = editorHtml(editable);
  const newContent = updatedAutomationHtml(raw, applyText);
  if (newContent === raw) return false;
  writeEditorHtml(editable, newContent);
  return true;
}

function updatedAutomationHtml(raw, applyText) {
  const divider = findLastHtmlDivider(raw);
  const section = document.createElement('div');
  section.innerHTML = divider ? raw.slice(divider.index + divider[0].length) : raw;
  const automationParagraphs = [...section.querySelectorAll('p')].filter(paragraph => {
    const label = paragraph.querySelector('strong')?.textContent.trim();
    return getAutomationFields().some(([, expected]) => expected === label);
  });
  const automationHtml = applyText.trim() ? automationLinesToParagraphHtml(applyText, convertAutomationText) : '';
  if (!automationParagraphs.length) return automationHtml ? [raw, automationHtml].filter(Boolean).join('<hr>') : raw;
  automationParagraphs.forEach(paragraph => paragraph.remove());
  const beforeSection = divider ? raw.slice(0, divider.index).trim() : '';
  return [beforeSection, section.innerHTML.trim(), automationHtml].filter(Boolean).join('<hr>');
}


function localizeOption(option) {
  const fallback = option.tooltip ?? option.value;
  return { ...option, tooltip: option.tooltipKey ? localize(option.tooltipKey, fallback) : fallback };
}

function getInlineBuilderLabels() {
  return {
    sectionsAria: localize('labels.sectionsAria'),
    areaTemplate: localize('labels.areaTemplate'),
    damage: localize('labels.damage'),
    savingThrow: localize('labels.savingThrow'),
    automations: localize('labels.automations'),
    templateType: localize('labels.templateType'),
    distance: localize('labels.distance'),
    decreaseDistance: localize('tooltips.decreaseDistance'),
    increaseDistance: localize('tooltips.increaseDistance'),
    resetDistance: localize('tooltips.resetDistance'),
    formula: localize('labels.formula'),
    suggestBasedOnLevel: localize('tooltips.suggestBasedOnLevel'),
    damageType: localize('labels.damageType'),
    selectPlaceholder: localize('labels.selectPlaceholder'),
    traits: localize('labels.traits'),
    save: localize('labels.save'),
    dc: localize('labels.dc'),
    basic: localize('labels.basic'),
    basicSave: localize('tooltips.basicSave'),
    showAs: localize('labels.showAs'),
    addCondition: localize('tooltips.addCondition'),
    textEditor: localize('tooltips.textEditor'),
    apply: localize('labels.apply')
  };
}

class InlineBuilderDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = getInlineBuilderDialogOptions({
    id: 'inlinebuilder-dialog',
    titleKey: 'window.inlineBuilder',
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
    const raw = editorHtml(editable);
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
    const raw = editorHtml(editable);
    const divider = findFirstEditorDivider(raw);
    const fromHrOnward = divider
      ? (divider.isDash ? '<hr>' + raw.slice(divider.index + divider.text.length).trim() : raw.slice(divider.index).trim())
      : raw;
    const applyHtml = automationLinesToParagraphHtml(applyText);
    const newContent = applyHtml + (fromHrOnward.startsWith('<hr') ? fromHrOnward : '<hr>' + fromHrOnward);
    writeEditorHtml(editable, newContent);
    return true;
  }

  static async insertAll(_event, target) {
    try {
      const form = target.closest('.inlinebuilder-content');
      const lines = builderLines(this, form);
      const autoLines = this.activeSections.has('automation')
        ? getAutomationFields().map(([, label, selector]) => {
          const content = getInputValue(form.querySelector(selector));
          return content ? `${label} ${content}` : '';
        }).filter(Boolean)
        : [];
      if (!lines.length && !autoLines.length) throw new InvalidBuilderInput('warnings.sectionRequired');
      await applyBuilderOutput(this, lines, autoLines);
    } catch (error) {
      if (!(error instanceof InvalidBuilderInput)) throw error;
      ui.notifications.warn(localize(error.message));
    }
  }

}

class InvalidBuilderInput extends Error {}

function builderTemplateLine(app, form) {
  if (!app.activeSections.has('template')) return '';
  const distance = parseInteger(form.querySelector('#template-distance').value, NaN);
  if (!app.selectedTemplateType) throw new InvalidBuilderInput('warnings.areaTypeRequired');
  if (!Number.isFinite(distance) || distance <= 0) throw new InvalidBuilderInput('warnings.areaDistanceRequired');
  return `${localize('description.template')} ${generateTemplateString(app.selectedTemplateType, distance)}`;
}

function builderCheckLine(app, form) {
  if (!app.activeSections.has('check')) return '';
  const dc = parseInteger(form.querySelector('#dc-value').value, NaN);
  if (!app.selectedSaveType) throw new InvalidBuilderInput('warnings.saveTypeRequired');
  if (!Number.isFinite(dc) || dc <= 0) throw new InvalidBuilderInput('warnings.dcRequired');
  const basic = form.querySelector('#basic-save').checked;
  return `${localize('description.savingThrow')} ${generateCheckString(app.selectedSaveType, dc, basic, app.selectedShowDC)}`;
}

function builderDamageLine(app, form) {
  if (!app.activeSections.has('damage')) return '';
  const formula = form.querySelector('#damage-formula').value.trim();
  const damageType = form.querySelector('#damage-type').value;
  if (!formula) throw new InvalidBuilderInput('warnings.damageFormulaRequired');
  if (!damageType) throw new InvalidBuilderInput('warnings.damageTypeRequired');
  return `${localize('description.damage')} ${generateDamageString(formula, damageType, [...app.selectedTraits])}`;
}

function builderLines(app, form) {
  return [builderTemplateLine(app, form), builderCheckLine(app, form), builderDamageLine(app, form)].filter(Boolean);
}

async function applyBuilderOutput(app, lines, autoLines) {
  const applyText = lines.join('\n');
  if (app.editorRef && (!lines.length || InlineBuilderDialog._applyToEditorContent(app.editorRef, applyText))) {
    applyAutomationToEditorContent(app.editorRef, autoLines.join('\n'));
    await app.close();
    ui.notifications.info(localize('notifications.applied'));
    return;
  }
  try {
    await navigator.clipboard.writeText([...lines, ...autoLines].join('\n'));
  } catch (error) {
    ui.notifications.error(localize('notifications.copyFailed'));
    throw error;
  }
  ui.notifications.info(localize('notifications.copiedNoEditor'));
  await app.close();
}

function openInlineBuilderDialog(editorRef = null) {
  new InlineBuilderDialog({ editorRef }).render(true);
}


let editorInjectionFrame = null;
const pendingEditorInjectionRoots = new Set();

function queueInlineBuilderEditorInjection(root) {
  const element = getElement(root) ?? root;
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
  const root = getElement(container) ?? container;
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
    btn.setAttribute('data-tooltip', localize('window.inlineBuilder'));
    btn.innerHTML = '<i class="fa-solid fa-wand-sparkles fa-fw"></i>';

    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      const editorContainer = this.closest('.editor');
      openInlineBuilderDialog(editorContainer);
    });

    editor.appendChild(btn);
    applyTheme(btn);
  });
}

function canShowInlineBuilderEditorButton(editor) {
  if (!(editor instanceof HTMLElement)) return false;
  if (editor.closest('#chat-message, #chat-notifications, #chat, #chat-form, #chat-controls, #chat-log, #sidebar, .chat-sidebar')) return false;
  return !!editor.querySelector('.ProseMirror[contenteditable]:not([contenteditable="false"]), [contenteditable]:not([contenteditable="false"])');
}


function handleRenderedSheet(app, html) {
  if (app.actor?.type === 'npc') setCurrentNpcActor(app.actor);
  setTimeout(() => {
    queueInlineBuilderEditorInjection(html);
  }, 150);
}

function registerInlineBuilderHooks() {
  registerProseMirrorViews();
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
    name: localize('keybindings.openDialog.name'),
    hint: localize('keybindings.openDialog.hint'),
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
