import { api, db } from 'sdk';
import { eq, and } from 'sdk/db';
import { supportMessages, supportReplies } from '../schema.js';
import { languages, operatorId } from './content.js';

export async function notifyOperator(user, question) {
  const t = languages.ru;
  // Leave room for the heading and instructions within Telegram's message limit.
  const chunks = [''];
  for (const char of question) {
    if (chunks[chunks.length - 1].length + char.length > 3500) chunks.push('');
    chunks[chunks.length - 1] += char;
  }
  for (const chunk of chunks) {
    const text = `${t.operatorHeader}\n${t.operatorFrom}: ${user.username ? '@' + user.username + ' · ' : ''}ID: ${user.id}\n\n${chunk}\n\n${t.operatorReplyHint}`;
    const sent = await api.sendMessage({ chat_id: operatorId, text });
    await db.insert(supportMessages).values({ id: sent.message_id, operatorId, userId: user.id }).run();
  }
}

export async function handleOperatorReply(message) {
  if (message.from.id !== operatorId || !message.reply_to_message) return false;
  const t = languages.ru;
  const target = await db.select().from(supportMessages)
    .where(and(eq(supportMessages.id, message.reply_to_message.message_id), eq(supportMessages.operatorId, operatorId))).get();
  if (!target) {
    await api.sendMessage({ chat_id: operatorId, text: t.operatorUnknownReply });
    return true;
  }
  const text = message.text?.trim();
  if (!text || text.length > 4000) {
    await api.sendMessage({ chat_id: operatorId, text: t.invalidText });
    return true;
  }
  // Claim the incoming message before sending, without changing either user's affirmation state.
  const claimed = await db.insert(supportReplies).values({ id: message.message_id })
    .onConflictDoNothing({ target: supportReplies.id }).returning().run();
  if (!claimed.length) return true;
  try {
    await api.sendMessage({ chat_id: target.userId, text: `${t.supportAnswer}\n\n${text}` });
  } catch (error) {
    console.error('Support answer delivery failed', error.code || 'unknown');
    await api.sendMessage({ chat_id: operatorId, text: t.operatorReplyFailed });
    return true;
  }
  await api.sendMessage({ chat_id: operatorId, text: t.operatorReplySent });
  return true;
}
