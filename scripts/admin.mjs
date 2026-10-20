import { seedUserId, parseSeed, seededData } from './seed-input.mjs';
import { userInfo, usersTable } from './user-output.mjs';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
process.loadEnvFile('.env');
// Pin the CLI version: its authenticated run API supplies temporary modules without deploying them.
const { runFunction, getFiles } = await import('../node_modules/@tgcloud/cli/src/api/endpoints.js');
const sources = {};
async function scan(dir) {
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const path = `${dir}/${item.name}`;
    if (item.isDirectory()) await scan(path);
    else if (path.endsWith('.js')) sources[path.slice('tgcloud/'.length, -3)] = await readFile(path, 'utf8');
  }
}
await scan('tgcloud');
const mode = process.argv[2];
async function run(code, args = {}) {
  const result = await runFunction(process.env.TGCLOUD_TOKEN, 'endpoints/admin', { ...sources, 'endpoints/admin': code }, args);
  return result.result;
}
async function readUsers() {
  const list = [];
  let after = 0;
  while (true) {
    const batch = await run(`import { api, db } from 'sdk'; import { gt, asc } from 'sdk/db'; import { users } from '../schema.js';
      export default async ({after}) => {
        const rows = await db.select().from(users).where(gt(users.id, after)).orderBy(asc(users.id)).limit(20).all();
        const result = [];
        for (const row of rows) {
          let chat = null, error = null;
          try { chat = await api.getChat({chat_id:row.id}); }
          catch (e) { error = {code:e.code ?? null, message:e.description || 'Chat unavailable'}; }
          result.push({row, chat, error});
        }
        return result;
      };`, { after });
    if (!Array.isArray(batch)) throw Error('Unexpected user data response');
    for (const {row, chat, error} of batch) list.push({...row, user:userInfo(row, chat, error)});
    if (batch.length < 20) return list;
    after = batch.at(-1).row.id;
  }
}
async function readTable(name) {
  const result = [];
  let after = 0;
  while (true) {
    const batch = await run(`import { db } from 'sdk'; import { gt, asc } from 'sdk/db'; import { ${name} as table } from '../schema.js';
      export default async ({after}) => await db.select().from(table).where(gt(table.id, after)).orderBy(asc(table.id)).limit(100).all();`, {after});
    if (!Array.isArray(batch)) throw Error('Unexpected table response');
    result.push(...batch);
    if (batch.length < 100) return result;
    after = batch.at(-1).id;
  }
}
try {
  if (mode === 'list-users') {
    console.log(usersTable(await readUsers()));
  } else if (mode === 'export-data') {
    const startedAt = new Date().toISOString();
    // Use the deployed schema for recovery, rather than any unshipped local changes.
    const deployed = await getFiles(process.env.TGCLOUD_TOKEN);
    const rows = await readUsers();
    const supportMessages = await readTable('supportMessages');
    const supportReplies = await readTable('supportReplies');
    const exportedAt = new Date().toISOString();
    const snapshot = {formatVersion:2, startedAt, exportedAt,
      consistency:'paginated-live-read',
      appId:process.env.TGCLOUD_TOKEN.split(':')[0],
      deployedRevision:deployed.revision, schema:deployed.canonical_modules.schema,
      users:rows, supportMessages, supportReplies};
    if (typeof snapshot.schema !== 'string') throw Error('Missing deployed schema; export aborted');
    await mkdir('exports', { recursive:true, mode:0o700 });
    const file = `exports/snapshot-${exportedAt.replace(/[:.]/g, '-')}.json`;
    await writeFile(file, JSON.stringify(snapshot, null, 2) + '\n', {mode:0o600, flag:'wx'});
    console.log(`Exported ${rows.length} users, ${supportMessages.length} support routes and ${supportReplies.length} reply records to ${file}`);
  } else if (mode === 'seed') {
    const id = seedUserId(process.argv[3], process.env.OPERATOR_ID);
    const file = `data/user_${id}.txt`;
    // Validate the local input before accessing or changing the live account.
    const texts = parseSeed(await readFile(file, 'utf8'));
    const previous = await run(`import { db } from 'sdk'; import { eq } from 'sdk/db'; import { users } from '../schema.js';
      export default async ({id}) => await db.select().from(users).where(eq(users.id, id)).get();`, { id });
    await mkdir('exports', { recursive:true, mode:0o700 });
    const backup = `exports/before-seed-${id}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    await writeFile(backup, JSON.stringify(previous, null, 2) + '\n', {mode:0o600, flag:'wx'});
    const data = seededData(previous?.data, texts);
    const result = await run(`import { db } from 'sdk'; import { eq, and } from 'sdk/db'; import { users } from '../schema.js';
      export default async ({id, revision, data}) => {
        const changed = revision === null
          ? await db.insert(users).values({id, revision:0, data}).onConflictDoNothing({target:users.id}).returning().run()
          : await db.update(users).set({revision:revision+1, data}).where(and(eq(users.id,id),eq(users.revision,revision))).returning().run();
        if (changed.length !== 1) throw Error('Account changed while seeding; retry. No changes applied.');
        const saved = await db.select().from(users).where(eq(users.id,id)).get();
        if (JSON.stringify(saved.data) !== JSON.stringify(data)) throw Error('Seed verification failed');
        return {count:saved.data.texts.length};
      };`, {id, revision:previous?.revision ?? null, data});
    console.log(`Seeded ${id} with ${result.count} texts from ${file}. Backup: ${backup}`);
    console.log('Send /start and tap «Начать». A later /reset restores common texts.');
  } else if (mode === 'setup') {
    const me = await run(`import { api } from 'sdk'; import { languages } from '../lib/content.js';
      export default async () => { const t = languages.ru; const commands = [{command:'start',description:t.commandStart},{command:'favorites',description:t.commandFavorites},{command:'help',description:t.commandHelp},{command:'reset',description:t.commandReset}];
      await api.setMyCommands({commands}); await api.setMyCommands({commands, language_code:'ru'}); return await api.getMe(); };`);
    const html = await readFile('docs/index.html', 'utf8');
    await writeFile('docs/index.html', html.replace(/https:\/\/t\.me\/[A-Za-z0-9_]+/g, `https://t.me/${me.username}`));
    console.log(`Bot configured: https://t.me/${me.username}`);
  } else throw Error('Usage: node scripts/admin.mjs export-data|setup|seed [ID]|list-users');
} catch (error) {
  console.error(error.description || error.message);
  process.exitCode = 1;
}
