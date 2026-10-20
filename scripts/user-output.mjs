import { stripVTControlCharacters } from 'node:util';

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
function cell(value) {
  return stripVTControlCharacters(String(value ?? '-')).replace(/[\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/g, ' ');
}
export function usersTable(rows, now = Date.now()) {
  const header = ['ID', 'FIRST NAME', 'LAST NAME', 'NICK', 'EMAIL', 'LAST ACTIVE'];
  const values = rows.map(row => [row.id, row.user.first_name, row.user.last_name,
    row.user.username ? '@' + row.user.username : null, row.user.email,
    lastActive(row.data.profileLastSeenAt, now)].map(cell));
  const widths = header.map((h, i) => Math.max(h.length, ...values.map(row => Array.from(row[i]).length)));
  const line = row => row.map((v, i) => v + ' '.repeat(widths[i] - Array.from(v).length)).join('  ').trimEnd();
  return [line(header), widths.map(w => '-'.repeat(w)).join('  '), ...values.map(line), `\n${rows.length} user(s). '-' means unavailable.`].join('\n');
}
