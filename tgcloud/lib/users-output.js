import { lastActive, collectionStatus } from './user-info.js';

function field(value) {
  // Plain text only; keep profile fields on one line and bound each entry's size.
  const text = String(value ?? '').replace(/[\x00-\x1f\x7f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g, ' ');
  return Array.from(text).slice(0, 256).join('').trim();
}
export function formatUser(row, user, defaults, now = Date.now()) {
  const timestamp = Date.parse(row.data.profileLastSeenAt);
  const age = Number.isFinite(timestamp) ? Math.max(0, now - timestamp) : Infinity;
  const activity = lastActive(row.data.profileLastSeenAt, now);
  const marker = age < 3600000 ? '🟢 ' : age < 86400000 ? '🟡 ' : '';
  const text = [
    String(row.id),
    [field(user.first_name), field(user.last_name)].filter(Boolean).join(' '),
    field(user.username ? '@' + user.username : null),
    field(user.email),
    activity === '-' ? '' : marker + activity,
    collectionStatus(row.data, defaults),
    `❤️ ${row.data.favorites?.length ?? 0}`,
  ].filter(Boolean).join(' · ') + (!user.chat ? ' (сохранённый профиль)' : '');
  return text;
}

export function sortUsers(rows) {
  const activeAt = row => {
    const timestamp = Date.parse(row.data.profileLastSeenAt);
    return Number.isFinite(timestamp) ? timestamp : -Infinity;
  };
  return [...rows].sort((a, b) => activeAt(b) - activeAt(a) || a.id - b.id);
}

export function usersSummary(count) {
  return `Всего пользователей: ${count}.\n🟢 — менее 60m; 🟡 — от 1h до 24h. s — секунды, m — минуты, h — часы, d — дни.\n📦 — исходная подборка; ✍️ N — личные тексты; ✂️ — сокращённая; 🌱 — ожидает «Начать»; ❤️ N — избранное.`;
}
