import { api, db } from 'sdk';
import { and, eq } from 'sdk/db';
import { users } from '../schema.js';
import { initial, transition } from './flow.js';
import { languages, operatorId } from './content.js';
export async function handle(event, ctx = {}) {
  const callback = !!event.data;
  const message = callback ? event.message : event;
  if (!event.from || event.from.is_bot || message?.chat?.type !== 'private' || message.chat.id !== event.from.id) return;
  const id = event.from.id;
  await db.insert(users).values({ id, revision: 0, data: initial(id) }).onConflictDoNothing({ target: users.id }).run();
  const row = await db.select().from(users).where(eq(users.id, id)).get();
  const t = languages[row.data.language] || languages.ru;
  const update = ctx.update?.update_id;
  if (update !== undefined && update <= row.data.lastUpdate) {
    if (callback) await api.answerCallbackQuery({ callback_query_id: event.id });
    return;
  }
  let action;
  if (callback) {
    const [revision, name] = event.data.split(':');
    if (Number(revision) !== row.revision) { await api.answerCallbackQuery({ callback_query_id: event.id, text: t.stale }); return; }
    action = name;
    await api.answerCallbackQuery({ callback_query_id: event.id });
  }
  const result = transition(row.data, { text: callback ? undefined : event.text, action, userId: id });
  // Claim this revision atomically: concurrent or repeated button presses cannot overwrite it.
  result.state.lastUpdate = update ?? row.data.lastUpdate;
  const revision = row.revision + 1;
  const claimed = await db.update(users).set({ revision, data: result.state })
    .where(and(eq(users.id, id), eq(users.revision, row.revision))).returning().run();
  if (!claimed.length) return;
  if (result.question) {
    try {
      await api.sendMessage({ chat_id: operatorId, text: `${t.operatorHeader}: ${id}${event.from.username ? ' @' + event.from.username : ''}\n\n${result.question}` });
    } catch (error) {
      result.state.mode = 'help'; result.text = t.helpFailed; result.buttons = [['cancel']];
      await db.update(users).set({ data: result.state }).where(and(eq(users.id, id), eq(users.revision, revision))).run();
      console.error('Operator delivery failed', error.code || 'unknown');
    }
  }
  await api.sendMessage({ chat_id: id, text: result.text, reply_markup: {
    inline_keyboard: result.buttons.map(line => line.map(key => ({ text: t[key], callback_data: `${revision}:${key}` }))),
  } });
}
