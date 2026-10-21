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
  return [
    `ID: ${row.id}`,
    `Имя: ${field(user.first_name)}`,
    `Фамилия: ${field(user.last_name)}`,
    `Ник: ${field(user.username ? '@' + user.username : null)}`,
    `Email: ${field(user.email)}`,
    `Активность: ${lastActive(row.data.profileLastSeenAt, now)}`,
    ...(!chat ? ['Профиль Telegram недоступен; показаны сохранённые данные.'] : []),
  ].join('\n');
}

export async function handleUsersCommand(message) {
  const command = message.text?.trim().split(/\s/)[0].split('@')[0];
  if (command !== '/users') return false;
  // Consume this command before support replies or conversation input handling.
  // Non-operators get no response, database reads, profile lookups or state writes.
  if (message.from?.id !== operatorId || message.chat?.id !== operatorId || message.chat?.type !== 'private') return true;
  const send = text => api.sendMessage({ chat_id: operatorId, text, link_preview_options: { is_disabled: true } });
  let after = 0, total = 0, text = '';
  const now = Date.now();
  while (true) {
    const batch = await db.select().from(users).where(gt(users.id, after)).orderBy(asc(users.id)).limit(20).all();
    for (const row of batch) {
      let chat = null;
      try { chat = await api.getChat({ chat_id: row.id }); }
      catch { /* Listing remains useful for blocked or unavailable profiles. */ }
      const entry = userEntry(row, chat, now);
      if (text && text.length + entry.length + 2 > 3500) { await send(text); text = ''; }
      text += (text ? '\n\n' : '') + entry;
      total++;
    }
    if (batch.length < 20) break;
    after = batch.at(-1).id;
  }
  const summary = `Всего пользователей: ${total}.\n«-» — нет данных. Активность: s — секунды, m — минуты, h — часы, d — дни.`;
  if (text && text.length + summary.length + 2 > 3500) { await send(text); text = ''; }
  await send(text ? `${text}\n\n${summary}` : summary);
  return true;
}
