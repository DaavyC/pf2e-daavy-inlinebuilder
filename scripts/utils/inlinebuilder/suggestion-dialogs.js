import { DAMAGE_TABLES, DC_TABLE } from '../../data/tables.js';
import { localize } from '../constants.js';
import {
  ApplicationV2,
  HandlebarsApplicationMixin,
  getInlineBuilderDialogOptions,
  getTemplatePart
} from './application-helpers.js';
import { clampNumber, parseInteger } from './dom-helpers.js';
import { getCreatureLevelFromSheet } from './state.js';

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

export {
  getDefaultDamageFormula,
  getDefaultDC,
  showDamageSuggestionDialog,
  showDCSuggestionDialog
};
