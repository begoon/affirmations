// IDs are allocated from the user's monotonically increasing database revision.
// They survive edits and index shifts, and are never reused after reset/reseed.
export function ensureTextIds(state, revision) {
  state.legacyButtons ??= true;
  state.textIds ??= state.texts.map((_, i) => `${revision.toString(36)}.${i.toString(36)}`);
  state.legacyMessages ??= state.legacyButtons
    ? state.texts.map((text, i) => ({ text, id: state.textIds[i] }))
    : [];
}
const targeted = new Set(['favorite', 'unfavorite', 'edit', 'delete', 'confirmDelete']);
const navigation = new Set(['more', 'create', 'all', 'continue', 'cancel', 'start']);
export function callbackData(key, result, revision) {
  if (key === 'reset') return `r:${revision}`;
  const id = targeted.has(key) ? result.state.textIds[result.state.current] : '-';
  return `a:${key}:${id}:${result.state.view === 'favorites' ? 'f' : 'a'}`;
}
export function resolveButton(data, message, state, revision) {
  let action, textId, view;
  if (data.startsWith('r:')) {
    if (data !== `r:${revision}` || state.mode !== 'reset') return { error: 'confirmationExpired' };
    return { action: 'reset' };
  }
  if (data.startsWith('a:')) {
    const parts = data.split(':');
    if (parts.length !== 4) return { error: 'unavailable' };
    [, action, textId, view] = parts;
  } else {
    // Pre-upgrade messages have only a revision. Resolve their visible text only
    // when it matches exactly one surviving text, never by the current index.
    const parts = data.split(':');
    if (parts.length !== 2 || !/^\d+$/.test(parts[0])) return { error: 'unavailable' };
    action = parts[1];
    if (action === 'reset') {
      return Number(parts[0]) === revision && state.mode === 'reset'
        ? { action } : { error: 'confirmationExpired' };
    }
    if (targeted.has(action)) {
      if (!state.legacyButtons || action === 'confirmDelete') return { error: 'unavailable' };
      const visible = (message.text || '').replace(/^────────────\n\n/, '').replace(/\n\n────────────$/, '');
      const matches = state.legacyMessages.filter(item => item.text === visible);
      if (matches.length !== 1) return { error: 'unavailable' };
      textId = matches[0].id;
    }
    view = 'a';
  }
  if (targeted.has(action)) {
    const index = state.textIds.indexOf(textId);
    if (index < 0) return { error: 'unavailable' };
    return { action, targetIndex: index, view: view === 'f' ? 'favorites' : 'all' };
  }
  if (!navigation.has(action)) return { error: 'unavailable' };
  return { action, view: view === 'f' ? 'favorites' : 'all' };
}
