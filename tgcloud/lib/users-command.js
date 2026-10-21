import { api, db } from 'sdk';
import { gt, asc } from 'sdk/db';
import { users } from '../schema.js';
import { operatorId, seeds } from './content.js';
import { userInfo } from './user-info.js';
import { formatUser, sortUsers, usersSummary } from './users-output.js';

export function userEntry(row, chat, now) {
  return formatUser(row, userInfo(row, chat), seeds.common, now);
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
  for (const row of sortUsers(all)) {
    let chat = null;
    try { chat = await api.getChat({ chat_id: row.id }); }
    catch { /* Fall back to the saved profile. */ }
    const entry = userEntry(row, chat, now);
    if (text && text.length + entry.length + 1 > 3500) {
      await send(text); text = '';
    }
    text += (text ? '\n' : '') + entry;
  }
  const summary = usersSummary(all.length);
  if (text && text.length + summary.length + 2 > 3500) { await send(text); text = ''; }
  await send(text ? `${text}\n\n${summary}` : summary);
  return true;
}
