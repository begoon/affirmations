import { api, db } from 'sdk';
import { gt, asc } from 'sdk/db';
import { users } from '../schema.js';
import { operatorId, seeds } from './content.js';
import { userInfo, lastActive, collectionStatus } from './user-info.js';

function field(value) {
  // Plain text only; keep profile fields on one line and bound each entry's size.
  const text = String(value ?? '-').replace(/[\x00-\x1f\x7f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g, ' ');
  return Array.from(text).slice(0, 256).join('') || '-';
}
export function userEntry(row, chat, now) {
  const user = userInfo(row, chat);
  const timestamp = Date.parse(row.data.profileLastSeenAt);
  const age = Number.isFinite(timestamp) ? Math.max(0, now - timestamp) : Infinity;
  const activity = lastActive(row.data.profileLastSeenAt, now);
  const prefix = [
    String(row.id),
    `${field(user.first_name)} ${field(user.last_name)}`,
    field(user.username ? '@' + user.username : null),
    field(user.email),
    age < 3600000 ? '🟢 ' : age < 86400000 ? '🟡 ' : '',
  ].join(' · ');
  const text = prefix + activity + ' · ' + collectionStatus(row.data, seeds.common) + (!chat ? ' (сохранённый профиль)' : '');
  return text;
}

export async function handleUsersCommand(message) {
  const command = message.text?.trim().split(/\s/)[0].split('@')[0];
  if (command !== '/users') return false;
  // Consume this command before support replies or conversation input handling.
  // Non-operators get no response, database reads, profile lookups or state writes.
  if (message.from?.id !== operatorId || message.chat?.id !== operatorId || message.chat?.type !== 'private') return true;
  const send = text => api.sendMessage({ chat_id: operatorId, text, link_preview_options: { is_disabled: true } });
  let after = 0, text = '';
  const all = [];
  const now = Date.now();
  while (true) {
    const batch = await db.select().from(users).where(gt(users.id, after)).orderBy(asc(users.id)).limit(20).all();
    all.push(...batch);
    if (batch.length < 20) break;
    after = batch.at(-1).id;
  }
  const activeAt = row => {
    const timestamp = Date.parse(row.data.profileLastSeenAt);
    return Number.isFinite(timestamp) ? timestamp : -Infinity;
  };
  all.sort((a, b) => activeAt(b) - activeAt(a) || a.id - b.id);
  for (const row of all) {
    let chat = null;
    try { chat = await api.getChat({ chat_id: row.id }); }
    catch { /* Fall back to the saved profile. */ }
    const entry = userEntry(row, chat, now);
    if (text && text.length + entry.length + 1 > 3500) {
      await send(text); text = '';
    }
    text += (text ? '\n' : '') + entry;
  }
  const summary = `Всего пользователей: ${all.length}.\n«-» — нет данных. 🟢 — менее 60m; 🟡 — от 1h до 24h. s — секунды, m — минуты, h — часы, d — дни.\n📦 — исходная подборка; ✍️ N — личные тексты; ✂️ — сокращённая; 🌱 — ожидает «Начать».`;
  if (text && text.length + summary.length + 2 > 3500) { await send(text); text = ''; }
  await send(text ? `${text}\n\n${summary}` : summary);
  return true;
}
