import { parseInteger } from './dom-helpers.js';
import { localize } from '../constants.js';

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

export {
  generateCheckString,
  generateDamageString,
  generateTemplateString,
  parseDescriptionBlock
};
