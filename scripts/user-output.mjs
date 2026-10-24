import { stripVTControlCharacters } from 'node:util';
import { sortUsers } from '../tgcloud/lib/users-output.js';
import { lastActive, collectionStatus } from '../tgcloud/lib/user-info.js';
export { userInfo, lastActive } from '../tgcloud/lib/user-info.js';

function cell(value) {
  return stripVTControlCharacters(String(value ?? '')).replace(/[\x00-\x1f\x7f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g, ' ').trim();
}
// Emoji markers occupy two terminal columns; variation selectors and combining marks do not.
function width(value) {
  return Array.from(value).reduce((n, char) => n + (/\p{Mark}/u.test(char) ? 0 : /[\p{Extended_Pictographic}\p{Emoji_Presentation}\u1100-\u115f\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\uff01-\uff60]/u.test(char) ? 2 : 1), 0);
}
export function usersTable(rows, now = Date.now(), defaults = []) {
  const header = ['ID', 'FIRST NAME', 'LAST NAME', 'NICK', 'EMAIL', 'LAST ACTIVE', 'TEXTS', 'FAVS'];
  const values = sortUsers(rows).map(row => {
    const age = now - Date.parse(row.data.profileLastSeenAt);
    const activity = lastActive(row.data.profileLastSeenAt, now);
    const marker = age < 3600000 ? '🟢 ' : age < 86400000 ? '🟡 ' : '';
    return [row.id, row.user.first_name, row.user.last_name,
      row.user.username ? '@' + row.user.username : '', row.user.email,
      activity === '-' ? '' : marker + activity, collectionStatus(row.data, defaults),
      row.data.favorites?.length ?? 0].map(cell);
  });
  const widths = header.map((h, i) => values.reduce((max, row) => Math.max(max, width(row[i])), width(h)));
  const line = row => row.map((v, i) => v + ' '.repeat(widths[i] - width(v))).join('  ').trimEnd();
  return [line(header), widths.map(w => '-'.repeat(w)).join('  '), ...values.map(line),
    `\n${rows.length} user(s). Missing fields are blank.`,
    '🟢 <60m; 🟡 1–24h. 📦 default; ✍️ N personal texts; ✂️ reduced; 🌱 awaiting Start.',
  ].join('\n');
}
