import { api, db } from 'sdk';
import { gt, asc } from 'sdk/db';
import { users } from '../schema.js';
import { operatorId } from './content.js';
import { userInfo, lastActive } from './user-info.js';

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
    `ID: ${row.id}`,
    `${field(user.first_name)} ${field(user.last_name)}`,
    field(user.username ? '@' + user.username : null),
    `Email: ${field(user.email)}`,
    `Активность: ${age < 3600000 ? '🔴 ' : ''}`,
  ].join(' · ');
  const text = prefix + activity + (!chat ? ' (сохранённый профиль)' : '');
  const entities = age >= 3600000 && age < 86400000
    ? [{ type: 'bold', offset: prefix.length, length: activity.length }] : [];
  return { text, entities };
}

export async function handleUsersCommand(message) {
  const command = message.text?.trim().split(/\s/)[0].split('@')[0];
  if (command !== '/users') return false;
  // Consume this command before support replies or conversation input handling.
  // Non-operators get no response, database reads, profile lookups or state writes.
  if (message.from?.id !== operatorId || message.chat?.id !== operatorId || message.chat?.type !== 'private') return true;
  const send = (text, entities) => api.sendMessage({ chat_id: operatorId, text, entities, link_preview_options: { is_disabled: true } });
  let after = 0, text = '', entities = [];
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
    if (text && text.length + entry.text.length + 1 > 3500) {
      await send(text, entities); text = ''; entities = [];
    }
    const offset = text.length + (text ? 1 : 0);
    entities.push(...entry.entities.map(entity => ({ ...entity, offset: entity.offset + offset })));
    text += (text ? '\n' : '') + entry.text;
  }
  const summary = `Всего пользователей: ${all.length}.\n«-» — нет данных. 🔴 — менее 60m; жирный — от 1h до 24h. s — секунды, m — минуты, h — часы, d — дни.`;
  if (text && text.length + summary.length + 2 > 3500) { await send(text, entities); text = ''; entities = []; }
  await send(text ? `${text}\n\n${summary}` : summary, entities);
  return true;
}
