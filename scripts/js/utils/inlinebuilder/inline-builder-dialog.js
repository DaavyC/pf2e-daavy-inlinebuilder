import { TEMPLATE_CONFIG } from '../../data/tables.js';
import { MODULE_ID } from '../constants.js';
import { applyAutomationToEditorContent, detectExistingAutomations } from './automation-editor.js';
import { AUTOMATION_FIELDS, AUTOMATION_TEMPLATE_FIELDS } from './automation-fields.js';
import {
  automationLinesToParagraphHtml,
  findFirstEditorDivider,
  getEditorEditable,
  getInputValue,
  parseInteger,
  setInputValue
} from './dom-helpers.js';
import { showComfortEditDialog } from './comfort-edit.js';
import { showConditionPicker } from './condition-picker.js';
import {
  getDefaultDamageFormula,
  getDefaultDC,
  showDamageSuggestionDialog,
  showDCSuggestionDialog
} from './suggestion-dialogs.js';
import { clearActiveInlineBuilderDialog, setActiveInlineBuilderDialog } from './state.js';
import {
  generateCheckString,
  generateDamageString,
  generateTemplateString,
  parseDescriptionBlock
} from './description-lines.js';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

// Main Inline Builder dialog.
class InlineBuilderDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: 'inlinebuilder-dialog',
    classes: ['inlinebuilder'],
    tag: 'div',
    window: {
      title: 'Inline Builder',
      icon: 'fas fa-pen',
      resizable: false,
      minimizable: true
    },
    position: { width: 520 },
    actions: { insertAll: InlineBuilderDialog.insertAll }
  };

  static PARTS = {
    form: { template: `modules/${MODULE_ID}/templates/main.hbs` }
  };

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
      templateTypes: TEMPLATE_CONFIG.types,
      damageTypes: TEMPLATE_CONFIG.damageTypes,
      saveTypes: TEMPLATE_CONFIG.saveTypes,
      showDCOptions: TEMPLATE_CONFIG.showDCOptions,
      traits: TEMPLATE_CONFIG.traits,
      automationFields: AUTOMATION_TEMPLATE_FIELDS,
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
    for (const [key, , selector] of AUTOMATION_FIELDS) {
      if (existingAutomation[key]) this._setInput(selector, existingAutomation[key]);
    }
    if (AUTOMATION_FIELDS.some(([key]) => existingAutomation[key])) {
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
        ui.notifications.warn('Area Template: Please select a type (Burst, Cone, Square, or Line).');
        return;
      }
      if (!Number.isFinite(distance) || distance <= 0) {
        ui.notifications.warn('Area Template: Distance must be greater than 0.');
        return;
      }
      const str = generateTemplateString(type, distance);
      if (str) lines.push('Template: ' + str);
    }

    if (app.activeSections.has('check')) {
      const saveType = app.selectedSaveType;
      const dcVal = form.querySelector('#dc-value')?.value;
      const dc = parseInteger(dcVal, NaN);
      const basic = form.querySelector('#basic-save')?.checked ?? true;
      basicSaveEnabled = basic;
      const showDC = app.selectedShowDC;
      if (!saveType) {
        ui.notifications.warn('Saving Throw: Please select a save (Fortitude, Reflex, or Will).');
        return;
      }
      if (!Number.isFinite(dc) || dc <= 0) {
        ui.notifications.warn('Saving Throw: DC value must be greater than 0.');
        return;
      }
      const str = generateCheckString(saveType, String(dc), basic, showDC);
      if (str) lines.push('Saving Throw: ' + str);
    }

    if (app.activeSections.has('damage') && basicSaveEnabled) {
      const formula = (form.querySelector('#damage-formula')?.value ?? '').trim();
      const damageType = form.querySelector('#damage-type')?.value ?? '';
      const traits = Array.from(app.selectedTraits);
      if (!formula) {
        ui.notifications.warn('Damage: A damage formula is required.');
        return;
      }
      if (!damageType) {
        ui.notifications.warn('Damage: Please select a damage type (do not use "-- Select --").');
        return;
      }
      const str = generateDamageString(formula, damageType, traits);
      if (str) lines.push('Damage: ' + str);
    }

    if (app.activeSections.has('automation')) {
      for (const [, label, selector] of AUTOMATION_FIELDS) {
        const value = getInputValue(form.querySelector(selector));
        if (value) autoLines.push(`${label} ${value}`);
      }
    }

    if (lines.length === 0 && autoLines.length === 0) {
      ui.notifications.warn('Please select at least one section and fill in the fields.');
      return;
    }

    const applyText = lines.join('\n');
    if (app.editorRef) {
      const ok = lines.length > 0 ? InlineBuilderDialog._applyToEditorContent(app.editorRef, applyText) : true;
      if (ok) {
        if (app.activeSections.has('automation')) applyAutomationToEditorContent(app.editorRef, autoLines.join('\n'), true);
        else applyAutomationToEditorContent(app.editorRef, '', true);
        app.close();
        ui.notifications.info('Applied to description!');
        return;
      }
    }
    navigator.clipboard.writeText([applyText, autoLines.join('\n')].filter(Boolean).join('\n')).then(() => {
      ui.notifications.info('Copied! (no active editor)');
      app.close();
    }).catch(() => {
      ui.notifications.error('Failed to copy.');
    });
  }
}

// Opens the main dialog.
function openInlineBuilderDialog(editorRef = null) {
  const dialog = new InlineBuilderDialog({ editorRef });
  setActiveInlineBuilderDialog(dialog);
  dialog.render(true);
}

export {
  openInlineBuilderDialog
};
