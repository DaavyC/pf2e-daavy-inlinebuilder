import { PF2E_CONDITION_SET, VALUED_CONDITION_SET } from '../../data/tables.js';
import { parseInteger } from './dom-helpers.js';

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

export {
  getConditionTag,
  getConditionTagRegex,
  parseConditionTags,
  removeConditionTag,
  upsertConditionTag
};
