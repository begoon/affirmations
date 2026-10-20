import { spawnSync } from 'node:child_process';
process.loadEnvFile('.env');
function cloud(args, recoverSnapshot = false) {
  const r = spawnSync(process.execPath, ['node_modules/@tgcloud/cli/bin/tgcloud.js', ...args], { encoding: 'utf8' });
  process.stdout.write(r.stdout || ''); process.stderr.write(r.stderr || '');
  if (r.status === 0) return;
  // CLI 0.2.0 can fail writing its snapshot after a successful upload. Fetch the authoritative state.
  if (recoverSnapshot && r.stderr?.includes('writeSnapshotFile') && r.stderr.includes('ERR_INVALID_ARG_TYPE')) {
    console.log('Recovering local snapshot after CLI upload error.');
    cloud(['fetch']);
    return;
  }
  throw Error(`tgcloud ${args[0]} failed`);
}
try {
  cloud(['push'], true);
  cloud(['migrate', '--safe']);
  cloud(['webhook', 'sync']);
  const setup = spawnSync(process.execPath, ['scripts/admin.mjs', 'setup'], { stdio: 'inherit' });
  if (setup.status !== 0) throw Error('Command setup failed');
} catch (error) { console.error(error.message); process.exitCode = 1; }
