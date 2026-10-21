export function userInfo(row, chat, lookupError = null) {
  const user = { ...(row.data.telegramUser ?? {}), id: row.id };
  // Prefer current identity fields, keeping the complete getChat response too.
  for (const key of ['first_name', 'last_name', 'username']) {
    if (chat) { delete user[key]; if (chat[key] !== undefined) user[key] = chat[key]; }
  }
  user.email ??= chat?.email ?? null;
  user.chat = chat;
  if (lookupError) user.chat_lookup_error = lookupError;
  return user;
}
export function lastActive(timestamp, now = Date.now()) {
  if (!timestamp) return '-';
  const then = Date.parse(timestamp);
  if (!Number.isFinite(then)) return '-';
  const seconds = Math.max(0, Math.floor((now - then) / 1000));
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

// Compare current contents, not edit history. Count duplicate copies separately.
export function collectionStatus(data, defaults) {
  if (data.new) return '🌱';
  const remaining = new Map();
  for (const text of defaults) remaining.set(text, (remaining.get(text) || 0) + 1);
  let personal = 0;
  const texts = data.texts || [];
  for (const text of texts) {
    const count = remaining.get(text) || 0;
    if (count) remaining.set(text, count - 1);
    else personal++;
  }
  if (personal) return `✍️ ${personal}`;
  return texts.length === defaults.length ? '📦' : '✂️';
}
