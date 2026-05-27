import { MODULE_ID, localize } from '../constants.js';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
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

export {
  ApplicationV2,
  HandlebarsApplicationMixin,
  getInlineBuilderDialogOptions,
  getTemplatePart
};
