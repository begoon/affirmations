// IDs are allocated from the user's monotonically increasing database revision.
// They survive edits and index shifts, and are never reused after reset/reseed.
export function ensureTextIds(state, revision) {
  state.textIds ??= state.texts.map((_, i) => `${revision.toString(36)}.${i.toString(36)}`);
}
const targeted = new Set(['favorite', 'unfavorite', 'edit', 'delete', 'confirmDelete']);
const navigation = new Set(['more', 'create', 'all', 'continue', 'cancel', 'start']);
export function callbackData(key, result, revision) {
  if (key === 'reset') return `r:${revision}`;
  const id = targeted.has(key) ? result.state.textIds[result.state.current] : '-';
  return `a:${key}:${id}:${result.state.view === 'favorites' ? 'f' : 'a'}`;
}
export function resolveButton(data, state, revision) {
  if (data.startsWith('r:')) {
    if (data !== `r:${revision}` || state.mode !== 'reset') return { error: 'confirmationExpired' };
    return { action: 'reset' };
  }
  if (!data.startsWith('a:')) return { error: 'unavailable' };
  const parts = data.split(':');
  if (parts.length !== 4) return { error: 'unavailable' };
  const [, action, textId, view] = parts;
  if (targeted.has(action)) {
    const index = state.textIds.indexOf(textId);
    if (index < 0) return { error: 'unavailable' };
    return { action, targetIndex: index, view: view === 'f' ? 'favorites' : 'all' };
  }
  if (!navigation.has(action)) return { error: 'unavailable' };
  return { action, view: view === 'f' ? 'favorites' : 'all' };
}
