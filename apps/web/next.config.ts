import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

// The repo keeps a single .env at its root, shared with the ingester. Next only
// looks in its own directory, so point Node at the real file before anything
// reads process.env. Guarded rather than wrapped in a catch: a missing .env is
// normal in CI, and a malformed one should still throw.
const rootEnv = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '.env');
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // `next dev` otherwise writes its own AGENTS.md and CLAUDE.md into this
  // directory on every run. This repo already has a deliberate CLAUDE.md at its
  // root, and a generated one nested here would be read as project instructions
  // that nobody wrote and that reappear after deletion.
  agentRules: false,
};

export default nextConfig;
