/**
 * The two checks that must both pass before anything ships: the test suite and
 * a dependency audit.
 *
 * A Node script rather than `vitest run && pnpm audit` because the dev machine
 * is Windows and npm scripts here must not assume a POSIX shell.
 *
 * Each step is one literal command string rather than a command plus an args
 * array. Both binaries are .cmd shims on Windows, which Node 24 will not spawn
 * without a shell, and passing an args array through a shell is deprecated
 * because the arguments get concatenated rather than escaped. Nothing here is
 * built from input, so there is nothing to escape.
 */
import { spawnSync } from 'node:child_process';

const steps = [
  { name: 'vitest', command: 'vitest run' },
  { name: 'audit', command: 'pnpm audit --audit-level moderate' },
];

for (const step of steps) {
  const result = spawnSync(step.command, { stdio: 'inherit', shell: true });
  if (result.error) {
    console.error(`${step.name} could not be started: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`${step.name} failed with exit code ${result.status}`);
    process.exit(result.status ?? 1);
  }
}
