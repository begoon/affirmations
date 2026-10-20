import { table, integer, json } from 'sdk/db';
export const users = table('users', {
  id: integer('id').primaryKey(),
  revision: integer('revision').notNull().default(0),
  data: json('data').notNull(),
});
