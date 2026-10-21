import { db, EndpointError } from 'sdk';
import { and, eq } from 'sdk/db';
import { users } from '../schema.js';
import { ensureTextIds } from '../lib/buttons.js';

const fail = (message, code) => { throw new EndpointError(message, { code }); };
const conflict = () => fail('Подборка изменилась. Обновите список и повторите действие.', 'CONFLICT');
function snapshot(row) {
  return {
    revision: row.revision,
    needsStart: row.data.new,
    items: row.data.new ? [] : row.data.texts.map((text, i) => ({
      id: row.data.textIds[i], text, favorite: (row.data.favorites || []).includes(i),
    })),
  };
}

export default async function (input, ctx) {
  // The platform verifies init data before invoking endpoints. Never accept a caller ID from input.
  const user = ctx?.initData?.user;
  if (!Number.isSafeInteger(user?.id) || user.id <= 0 || user.is_bot) fail('Откройте приложение из Telegram.', 'AUTH');
  if (!input || !['list', 'favorite', 'edit', 'delete'].includes(input.action)) fail('Неизвестное действие.', 'INVALID');
  let row = await db.select().from(users).where(eq(users.id, user.id)).get();
  if (!row) fail('Отправьте боту /start и нажмите «Начать».', 'START_REQUIRED');
  if (!row.data.textIds) {
    ensureTextIds(row.data, row.revision + 1);
    const migrated = await db.update(users).set({ revision: row.revision + 1, data: row.data })
      .where(and(eq(users.id, user.id), eq(users.revision, row.revision))).returning().run();
    if (!migrated.length) conflict();
    row = { ...row, revision: row.revision + 1 };
  }
  if (input.action === 'list') return snapshot(row);
  if (row.data.new) fail('Отправьте боту /start и нажмите «Начать».', 'START_REQUIRED');
  if (!Number.isSafeInteger(input.revision) || input.revision !== row.revision) conflict();
  const s = row.data;
  const index = typeof input.id === 'string' ? s.textIds.indexOf(input.id) : -1;
  if (index < 0) fail('Этот текст больше недоступен. Обновите список.', 'NOT_FOUND');
  s.favorites ??= [];
  if (input.action === 'favorite') {
    if (typeof input.favorite !== 'boolean') fail('Неверное значение избранного.', 'INVALID');
    s.favorites = s.favorites.filter(i => i !== index);
    if (input.favorite) s.favorites.push(index);
  } else if (input.action === 'edit') {
    const text = typeof input.text === 'string' ? input.text.trim() : '';
    if (!text || text.length > 4000) fail('Введите непустой текст длиной до 4000 символов.', 'INVALID');
    s.texts[index] = text;
    // A pending chat edit must not overwrite the version just saved in the app.
    if (s.current === index && s.mode === 'edit') s.mode = 'main';
  } else {
    s.texts.splice(index, 1);
    s.textIds.splice(index, 1);
    s.favorites = s.favorites.filter(i => i !== index).map(i => i > index ? i - 1 : i);
    if (s.current === index) {
      s.current = -1;
      if (['edit', 'delete'].includes(s.mode)) s.mode = 'main';
    } else if (s.current > index) s.current--;
  }
  s.profileLastSeenAt = new Date().toISOString();
  const revision = row.revision + 1;
  const changed = await db.update(users).set({ revision, data: s })
    .where(and(eq(users.id, user.id), eq(users.revision, row.revision))).returning().run();
  if (!changed.length) conflict();
  return snapshot({ revision, data: s });
}
