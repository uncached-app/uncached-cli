import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflowPath = new URL('../.github/workflows/release.yml', import.meta.url);

test('keeps Windows executable filename aligned across package and workflow', async () => {
  const workflow = await readFile(workflowPath, 'utf8');
  const manifest = JSON.parse(await readFile(new URL('../packages/cli-win32-x64/package.json', import.meta.url), 'utf8'));

  assert.equal(manifest.bin.uncached, 'bin/uncached.exe');
  assert.match(workflow, /package: cli-win32-x64[\s\S]*?binary: uncached\.exe/);
  assert.match(workflow, /packages\/\$\{\{ matrix\.package \}\}\/bin\/\$\{\{ matrix\.binary \}\}/);
});

test('private core Cargo fetch keeps deploy key auth without redundant checkout', async () => {
  const workflow = await readFile(workflowPath, 'utf8');
  assert.match(workflow, /uses: webfactory\/ssh-agent@v0\.9\.0/);
  assert.match(workflow, /ssh-private-key: \$\{\{ secrets\.UNCACHED_CORE_DEPLOY_KEY \}\}/);
  assert.match(workflow, /Cargo\.toml/);
  assert.doesNotMatch(workflow, /Checkout pinned private core/);
  assert.doesNotMatch(workflow, /path: \.private-uncached/);

  assert.match(workflow, /github\.event_name == 'pull_request' && github\.event\.pull_request\.head\.repo\.fork/);
  assert.match(workflow, /if \[ -z "\$UNCACHED_CORE_DEPLOY_KEY" \]/);
  assert.match(workflow, /if: startsWith\(github\.ref, 'refs\/tags\/v'\) && github\.event_name == 'push'/g);
  assert.doesNotMatch(workflow, /-----BEGIN [A-Z ]+ PRIVATE KEY-----/);
  assert.doesNotMatch(workflow, /(?:ghp|github_pat|npm_)[A-Za-z0-9_]+/);
});

test('packs and installs root launcher with matching staged platform package before publish', async () => {
  const workflow = await readFile(workflowPath, 'utf8');
  assert.match(workflow, /npm pack --json/);
  assert.match(workflow, /npm install --prefix[\s\S]*root_tarball[\s\S]*platform_tarball/);
  assert.match(workflow, /npx --no-install uncached scan/);
  assert.match(workflow, /const cancelled = run\('N'\)/);
  assert.match(workflow, /const confirmed = run\('y'\)/);
  assert.match(workflow, /was not observed in system Trash/);
  assert.match(workflow, /unrelated fixture was changed/);
  assert.match(workflow, /publish-platform/);
  assert.ok(workflow.indexOf('npx --no-install uncached scan') < workflow.indexOf('publish-platform'));
  assert.doesNotMatch(workflow, /CORE_DEPLOY_KEY_SECRET/);
});

test('keeps core private, immutable, and outside crates.io publication', async () => {
  const workflow = await readFile(workflowPath, 'utf8');
  const cargo = await readFile(new URL('../Cargo.toml', import.meta.url), 'utf8');
  assert.match(cargo, /uncached-core\s*=\s*\{\s*git\s*=\s*"ssh:\/\/git@github\.com\/uncached-app\/uncached-core\.git"/);
  assert.match(cargo, /rev\s*=\s*"[0-9a-f]{40}"/);
  assert.doesNotMatch(cargo, /uncached-core\s*=\s*\{\s*version:/);
  assert.doesNotMatch(workflow, /cargo\s+publish/);
  assert.match(workflow, /UNCACHED_CORE_DEPLOY_KEY/);
  assert.match(workflow, /webfactory\/ssh-agent@v0\.9\.0/);
});
