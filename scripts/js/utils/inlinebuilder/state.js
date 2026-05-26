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

export {
  clearActiveInlineBuilderDialog,
  getCreatureLevelFromSheet,
  getCurrentNpcActor,
  setActiveInlineBuilderDialog,
  setCurrentNpcActor
};
