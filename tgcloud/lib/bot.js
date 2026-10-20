import { api, db } from 'sdk';
import { and, eq } from 'sdk/db';
import { users } from '../schema.js';
import { ensureTextIds, resolveButton, callbackData } from './buttons.js';
import { initial, transition } from './flow.js';
import { languages } from './content.js';
import { notifyOperator, handleOperatorReply } from './support.js';
export async function handle(event, ctx = {}) {
  const callback = !!event.data;
  const message = callback ? event.message : event;
  if (!event.from || event.from.is_bot || message?.chat?.type !== 'private' || message.chat.id !== event.from.id) return;
  if (!callback && await handleOperatorReply(event)) return;
  const id = event.from.id;
  await db.insert(users).values({ id, revision: 0, data: initial(id) }).onConflictDoNothing({ target: users.id }).run();
  const row = await db.select().from(users).where(eq(users.id, id)).get();
  const t = languages[row.data.language] || languages.ru;
  const update = ctx.update?.update_id;
  if (update !== undefined && update <= row.data.lastUpdate) {
    if (callback) await api.answerCallbackQuery({ callback_query_id: event.id });
    return;
  }
  ensureTextIds(row.data, row.revision + 1);
  let resolved = {};
  if (callback) {
    resolved = resolveButton(event.data, message, row.data, row.revision);
    if (resolved.error) { await api.answerCallbackQuery({ callback_query_id: event.id, text: t[resolved.error] }); return; }
    await api.answerCallbackQuery({ callback_query_id: event.id });
  }
  const result = transition(row.data, { text: callback ? undefined : event.text, ...resolved, userId: id, revision: row.revision + 1 });
  result.state.telegramUser = { ...event.from };
  result.state.profileFirstSeenAt = row.data.profileFirstSeenAt ?? new Date().toISOString();
  result.state.profileLastSeenAt = new Date().toISOString();
  // Claim this revision atomically: concurrent or repeated button presses cannot overwrite it.
  result.state.lastUpdate = update ?? row.data.lastUpdate;
  const revision = row.revision + 1;
  const claimed = await db.update(users).set({ revision, data: result.state })
    .where(and(eq(users.id, id), eq(users.revision, row.revision))).returning().run();
  if (!claimed.length) return;
  if (result.question) {
    try {
      await notifyOperator(event.from, result.question);
    } catch (error) {
      result.state.mode = 'help'; result.text = t.helpFailed; result.buttons = [['cancel']];
      await db.update(users).set({ data: result.state }).where(and(eq(users.id, id), eq(users.revision, revision))).run();
      console.error('Operator delivery failed', error.code || 'unknown');
    }
  }
  const prefix = result.isAffirmation ? '────────────\n\n' : '';
  const suffix = result.isAffirmation ? '\n\n────────────' : '';
  await api.sendMessage({ chat_id: id, text: prefix + result.text + suffix,
    // Telegram entity offsets use UTF-16 units, matching JavaScript string length.
    ...(result.isAffirmation ? { entities: [{ type: 'bold', offset: prefix.length, length: result.text.length }] } : {}),
    reply_markup: {
    inline_keyboard: result.buttons.map(line => line.map(key => ({ text: t[key], callback_data: callbackData(key, result, revision) }))),
  } });
}
