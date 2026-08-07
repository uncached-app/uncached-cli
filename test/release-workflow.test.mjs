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

test('private core checkout explicitly receives deploy key without weakening release gates', async () => {
  const workflow = await readFile(workflowPath, 'utf8');
  const privateCheckout = workflow.match(
    /- name: Checkout pinned private core[\s\S]*?(?=\n      - name:|\n  publish-|$)/,
  )?.[0];

  assert.ok(privateCheckout, 'private core checkout step must exist');
  assert.match(privateCheckout, /uses: actions\/checkout@v4/);
  assert.match(privateCheckout, /ssh-key: \$\{\{ secrets\.UNCACHED_CORE_DEPLOY_KEY \}\}/);
  assert.match(privateCheckout, /persist-credentials: false/);

  assert.match(workflow, /github\.event_name == 'pull_request' && github\.event\.pull_request\.head\.repo\.fork/);
  assert.match(workflow, /if \[ -z "\$UNCACHED_CORE_DEPLOY_KEY" \]/);
  assert.match(workflow, /if: startsWith\(github\.ref, 'refs\/tags\/v'\) && github\.event_name == 'push'/g);
  assert.doesNotMatch(workflow, /-----BEGIN [A-Z ]+ PRIVATE KEY-----/);
  assert.doesNotMatch(workflow, /(?:ghp|github_pat|npm_)[A-Za-z0-9_]+/);
});
