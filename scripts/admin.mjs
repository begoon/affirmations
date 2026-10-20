import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
process.loadEnvFile('.env');
// Pin the CLI version: its authenticated run API supplies temporary modules without deploying them.
const { runFunction } = await import('../node_modules/@tgcloud/cli/src/api/endpoints.js');
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
try {
  if (mode === 'export') {
    const rows = [];
    let after = 0;
    while (true) {
      const batch = await run(`import { db } from 'sdk'; import { gt, asc } from 'sdk/db'; import { users } from '../schema.js';
        export default async ({after}) => await db.select().from(users).where(gt(users.id, after)).orderBy(asc(users.id)).limit(100).all();`, { after });
      if (!Array.isArray(batch)) throw Error('Unexpected export response');
      rows.push(...batch);
      if (batch.length < 100) break;
      after = batch.at(-1).id;
    }
    await mkdir('exports', { recursive: true, mode: 0o700 });
    const file = `exports/users-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    await writeFile(file, JSON.stringify({ formatVersion: 1, exportedAt: new Date().toISOString(), users: rows }, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
    console.log(`Exported ${rows.length} users to ${file}`);
  } else if (mode === 'reseed') {
    const id = 429995878;
    const previous = await run(`import { db } from 'sdk'; import { eq } from 'sdk/db'; import { users } from '../schema.js';
      export default async ({id}) => await db.select().from(users).where(eq(users.id, id)).get();`, { id });
    await mkdir('exports', { recursive: true, mode: 0o700 });
    const backup = `exports/before-reseed-${id}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    await writeFile(backup, JSON.stringify(previous, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
    const result = await run(`import { db } from 'sdk'; import { eq, and } from 'sdk/db'; import { users } from '../schema.js'; import { initial } from '../lib/flow.js';
      export default async ({id, revision, lastUpdate}) => {
        const data = initial(id);
        data.lastUpdate = lastUpdate;
        const changed = revision === null
          ? await db.insert(users).values({id, revision:0, data}).onConflictDoNothing({target:users.id}).returning().run()
          : await db.update(users).set({revision:revision+1, data}).where(and(eq(users.id,id),eq(users.revision,revision))).returning().run();
        if (changed.length !== 1) throw Error('Account changed during reseed; retry.');
        const saved = await db.select().from(users).where(eq(users.id,id)).get();
        if (JSON.stringify(saved.data.texts) !== JSON.stringify(data.texts) || !saved.data.new) throw Error('Reseed verification failed');
        return {count:saved.data.texts.length};
      };`, { id, revision: previous?.revision ?? null, lastUpdate: previous?.data.lastUpdate ?? -1 });
    console.log(`Reseeded ${id} with ${result.count} texts; verified welcome state. Backup: ${backup}`);
  } else if (mode === 'seed') {
    await run(`import { db } from 'sdk'; import { users } from '../schema.js'; import { initial } from '../lib/flow.js'; import { handle } from '../lib/bot.js';
      export default async () => { await db.insert(users).values({id:429995878,revision:0,data:initial(429995878)}).onConflictDoNothing({target:users.id}).run(); return true; };`);
    console.log('Testing account seeded (existing data preserved).');
  } else if (mode === 'setup') {
    const me = await run(`import { api } from 'sdk'; import { languages } from '../lib/content.js';
      export default async () => { const t = languages.ru; const commands = [{command:'start',description:t.commandStart},{command:'favorites',description:t.commandFavorites},{command:'help',description:t.commandHelp},{command:'reset',description:t.commandReset}];
      await api.setMyCommands({commands}); await api.setMyCommands({commands, language_code:'ru'}); return await api.getMe(); };`);
    const html = await readFile('docs/index.html', 'utf8');
    await writeFile('docs/index.html', html.replace(/https:\/\/t\.me\/[A-Za-z0-9_]+/g, `https://t.me/${me.username}`));
    console.log(`Bot configured: https://t.me/${me.username}`);
  } else throw Error('Usage: node scripts/admin.mjs export|setup|seed|reseed');
} catch (error) {
  console.error(error.description || error.message);
  process.exitCode = 1;
}
