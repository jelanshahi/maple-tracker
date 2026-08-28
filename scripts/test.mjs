/**
 * The two checks that must both pass before anything ships: the test suite and
 * a dependency audit.
 *
 * A Node script rather than `vitest run && pnpm run audit` because the dev
 * machine is Windows and npm scripts here must not assume a POSIX shell.
 *
 * Each step is one literal command string rather than a command plus an args
 * array. Both binaries are .cmd shims on Windows, which Node 24 will not spawn
 * without a shell, and passing an args array through a shell is deprecated
 * because the arguments get concatenated rather than escaped. Nothing here is
 * built from input, so there is nothing to escape.
 *
 * Both steps route through pnpm: `pnpm exec` so the script behaves the same
 * whether it is launched by `pnpm test` or run directly, and `pnpm run audit`
 * so the severity threshold lives in package.json and cannot drift from it.
 */
import { spawnSync } from 'node:child_process';

const steps = [
  { name: 'vitest', command: 'pnpm exec vitest run' },
  { name: 'audit', command: 'pnpm run audit' },
];

/** A step can fail three ways, and they need telling apart to be diagnosable. */
function describeFailure(result) {
  if (result.error) return result.error.message;
  if (result.signal) return `killed by ${result.signal}`;
  return `exit code ${result.status}`;
}

for (const step of steps) {
  const result = spawnSync(step.command, { stdio: 'inherit', shell: true });
  if (result.status === 0) continue;
  console.error(`${step.name} failed: ${describeFailure(result)}`);
  process.exit(result.status ?? 1);
}
