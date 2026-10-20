import { table, integer, json } from 'sdk/db';
export const users = table('users', {
  id: integer('id').primaryKey(),
  revision: integer('revision').notNull().default(0),
  data: json('data').notNull(),
});

// Message IDs are scoped to the configured operator's private chat.
export const supportMessages = table('support_messages', {
  id: integer('id').primaryKey(),
  operatorId: integer('operator_id').notNull(),
  userId: integer('user_id').notNull(),
});
export const supportReplies = table('support_replies', {
  id: integer('id').primaryKey(),
});
