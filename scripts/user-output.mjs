import { stripVTControlCharacters } from 'node:util';

import { userInfo, lastActive } from '../tgcloud/lib/user-info.js';
export { userInfo, lastActive };

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
