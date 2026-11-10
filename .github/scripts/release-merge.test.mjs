import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { isReleaseMerge, releaseValidated } from './release-merge.mjs'

const repository = 'mia-riezebos/discord-wrapped'
const sha = 'a'.repeat(40)
const pr = (overrides = {}) => ({
  merged_at: '2026-10-20T00:00:00Z',
  merge_commit_sha: sha,
  number: 80,
  base: { ref: 'main', repo: { full_name: repository } },
  head: { ref: 'changeset-release/main', sha: 'b'.repeat(40), repo: { full_name: repository } },
  ...overrides,
})

test('a merged version pull request from this repository is a release', () => {
  assert.equal(isReleaseMerge([pr()], { sha, repository }), true)
})

test('ordinary merges, forks, other commits and unmerged pull requests are not releases', () => {
  assert.equal(isReleaseMerge([pr({ head: { ref: 'feature', repo: { full_name: repository } } })], { sha, repository }), false)
  assert.equal(isReleaseMerge([pr({ head: { ref: 'changeset-release/main', repo: { full_name: 'someone/fork' } } })], { sha, repository }), false)
  assert.equal(isReleaseMerge([pr({ merge_commit_sha: 'b'.repeat(40) })], { sha, repository }), false)
  assert.equal(isReleaseMerge([pr({ merged_at: null })], { sha, repository }), false)
  assert.equal(isReleaseMerge([pr({ base: { ref: 'staging', repo: { full_name: repository } } })], { sha, repository }), false)
  assert.equal(isReleaseMerge([pr({ base: { ref: 'main', repo: { full_name: 'someone/fork' } } })], { sha, repository }), false)
  assert.equal(isReleaseMerge([], { sha, repository }), false)
})

test('only successful CI for the release PR head authorizes reuse after the PR merges', () => {
  const pullRequest = pr()
  const run = {
    event: 'pull_request',
    path: '.github/workflows/ci.yml',
    head_sha: pullRequest.head.sha,
    head_branch: pullRequest.head.ref,
    head_repository: { full_name: repository },
    // GitHub empties this list when the PR merges (ditherette #484).
    pull_requests: [],
    status: 'completed',
    conclusion: 'success',
  }

  assert.equal(releaseValidated([run], pullRequest), true)
  assert.equal(releaseValidated([{ ...run, path: `${run.path}@refs/pull/80/merge` }], pullRequest), true)
  for (const overrides of [
    { event: 'push' },
    { head_branch: 'feature' },
    { head_repository: { full_name: 'someone/fork' } },
    { head_repository: null },
    { path: '.github/workflows/release.yml' },
    { head_sha: 'c'.repeat(40) },
    { status: 'in_progress' },
    { conclusion: 'failure' },
    { conclusion: 'skipped' },
  ]) {
    assert.equal(releaseValidated([{ ...run, ...overrides }], pullRequest), false, JSON.stringify(overrides))
  }
  assert.equal(releaseValidated([], pullRequest), false)
})

test('validation fetches a squash-merged PR head and falls back for mismatches, retries and lookup errors', (t) => {
  const temporary = mkdtempSync(join(tmpdir(), 'wrapped-release-'))
  t.after(() => rmSync(temporary, { recursive: true, force: true }))
  const remote = join(temporary, 'remote')
  const checkout = join(temporary, 'checkout')
  const output = join(temporary, 'output')
  const script = fileURLToPath(new URL('./release-merge.mjs', import.meta.url))
  const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  git(temporary, 'init', '--initial-branch=main', remote)
  git(remote, 'config', 'user.name', 'Release test')
  git(remote, 'config', 'user.email', 'release@example.com')
  git(remote, 'commit', '--allow-empty', '-m', 'Initial')
  git(remote, 'checkout', '-b', 'changeset-release/main')
  writeFileSync(join(remote, 'version'), '1.0.0\n')
  git(remote, 'add', 'version')
  git(remote, 'commit', '-m', 'Version')
  const head = git(remote, 'rev-parse', 'HEAD')
  git(remote, 'update-ref', 'refs/pull/80/head', head)
  git(remote, 'checkout', 'main')
  git(remote, 'merge', '--squash', 'changeset-release/main')
  git(remote, 'commit', '-m', 'Release')
  const merge = git(remote, 'rev-parse', 'HEAD')
  git(remote, 'branch', '-D', 'changeset-release/main')
  git(temporary, 'clone', '--depth=1', '--branch=main', `file://${remote}`, checkout)
  assert.throws(() => git(checkout, 'rev-parse', `${head}^{tree}`))

  const pullRequest = pr({ merge_commit_sha: merge, head: { ...pr().head, sha: head } })
  const workflowRun = {
    event: 'pull_request', path: '.github/workflows/ci.yml', head_sha: head,
    head_branch: pullRequest.head.ref, head_repository: { full_name: repository },
    pull_requests: [], status: 'completed', conclusion: 'success',
  }
  const gh = join(temporary, 'gh')
  writeFileSync(gh, `#!/usr/bin/env node
if (process.env.LOOKUP_FAILURE) process.exit(1)
const expected = 'repos/${repository}/actions/workflows/ci.yml/runs?event=pull_request&head_sha=${head}&status=success&per_page=100'
if (process.argv[2] !== 'api' || process.argv[3] !== expected) process.exit(2)
console.log(process.env.WORKFLOW_RUNS)
`)
  chmodSync(gh, 0o755)
  const validate = (expected, { env = {}, pulls = [[pullRequest]], target = merge } = {}) => {
    writeFileSync(output, '')
    const result = spawnSync(process.execPath, [script, target, repository, 'validated'], {
      cwd: checkout, encoding: 'utf8', input: JSON.stringify(pulls),
      env: {
        ...process.env, PATH: `${temporary}:${process.env.PATH}`,
        GITHUB_EVENT_NAME: 'push', GITHUB_REF: 'refs/heads/main', GITHUB_OUTPUT: output,
        WORKFLOW_RUNS: JSON.stringify({ workflow_runs: [workflowRun] }), ...env,
      },
    })
    assert.equal(result.status, 0, result.stderr)
    assert.equal(result.stdout, `validated=${expected}\n`)
    assert.equal(readFileSync(output, 'utf8'), `validated=${expected}\n`)
    return result
  }

  validate(true)
  validate(false, { env: { GITHUB_EVENT_NAME: 'workflow_dispatch' } })
  validate(false, { env: { GITHUB_REF: 'refs/heads/staging' } })
  validate(false, { pulls: [] })
  validate(false, { pulls: [[{ ...pullRequest, merged_at: null }]] })
  validate(false, { env: { WORKFLOW_RUNS: '{"workflow_runs":[]}' } })
  assert.match(validate(false, { env: { LOOKUP_FAILURE: 'true' } }).stderr, /::warning::/)
  assert.match(validate(false, { env: { WORKFLOW_RUNS: 'invalid JSON' } }).stderr, /::warning::/)
  git(remote, 'update-ref', '-d', 'refs/pull/80/head')
  assert.match(validate(false).stderr, /::warning::/)
  git(remote, 'update-ref', 'refs/pull/80/head', head)
  // A squash conflict resolution or another edit must require fresh checks.
  writeFileSync(join(remote, 'version'), '1.0.1\n')
  git(remote, 'commit', '-am', 'Different merged tree')
  const differentMerge = git(remote, 'rev-parse', 'HEAD')
  git(checkout, 'fetch', 'origin', 'main')
  validate(false, { target: differentMerge, pulls: [[{ ...pullRequest, merge_commit_sha: differentMerge }]] })
})
