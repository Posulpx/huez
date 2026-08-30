#!/usr/bin/env zx
// check-roadmap — ensures every patch/minor/major ships with a ROADMAP update.
// Mirrors google/zx style (see scripts/build.mjs for shell fallback).
import { $, usePowerShell, useBash } from 'zx'
import fs from 'node:fs'

if (process.platform === 'win32') {
  try {
    usePowerShell()
  } catch {}
} else {
  try {
    useBash()
  } catch {}
}

// Returns 0 if ok, 1 if ROADMAP check fails
async function getChangedFiles(refRange) {
  try {
    const out = await $`git diff --name-only ${refRange}`
    return out.stdout
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
  } catch {
    return []
  }
}

async function getPackageVersion(ref) {
  try {
    if (ref === 'HEAD' || ref === 'WORKTREE') {
      const raw = fs.readFileSync('package.json', 'utf8')
      return JSON.parse(raw).version
    }
    const out = await $`git show ${ref}:package.json`
    const j = JSON.parse(out.stdout)
    return j.version
  } catch {
    return null
  }
}

const flagStrict = process.argv.includes('--strict')

// Collect all relevant diffs: commits to be pushed + staged + unstaged
const pushRange = 'origin/master...HEAD'
const pushFiles = await getChangedFiles(pushRange)
const stagedFiles = await getChangedFiles('--cached')
const worktreeFiles = await getChangedFiles('HEAD')

const allFiles = new Set([...pushFiles, ...stagedFiles, ...worktreeFiles])
const hasPackage = [...allFiles].some((f) => f === 'package.json')
const hasRoadmap = [...allFiles].some((f) => f === 'ROADMAP.md')

// Also compare version values
const headVer = await getPackageVersion('HEAD')
const worktreeVer = await getPackageVersion('WORKTREE')
let baseVer = headVer
try {
  const baseOut = await $`git show origin/master:package.json`
  baseVer = JSON.parse(baseOut.stdout).version
} catch {
  // no origin/master yet
  baseVer = headVer
}

const versionChanged =
  worktreeVer !== headVer ||
  (headVer !== baseVer && pushFiles.includes('package.json'))

if (versionChanged || hasPackage) {
  // If package.json changed (or version bumped), ROADMAP must be in the change set
  const roadmapInPush = pushFiles.includes('ROADMAP.md')
  const roadmapInStaged = stagedFiles.includes('ROADMAP.md')
  const roadmapInWorktree = worktreeFiles.includes('ROADMAP.md')
  const roadmapTouched =
    roadmapInPush || roadmapInStaged || roadmapInWorktree || hasRoadmap

  if (!roadmapTouched) {
    console.error('')
    console.error(
      '✗ ROADMAP check failed — package.json version bump without ROADMAP.md update'
    )
    console.error(
      `  base: ${baseVer}  HEAD: ${headVer}  worktree: ${worktreeVer}`
    )
    console.error(
      '  Changed files (push range):',
      pushFiles.join(', ') || '(none)'
    )
    console.error('')
    console.error(
      '  Fix: update ROADMAP.md — add a new ### P<N> entry and, if it closes a milestone, flip that milestone to ✅.'
    )
    console.error(
      '  Tip: use `npm run release:patch|minor|major` (scripts/bump.mjs) which stubs the ROADMAP entry for you.'
    )
    console.error('  Then: git add ROADMAP.md package.json && git commit')
    console.error('')
    process.exit(1)
  }
}

// Also ensure ROADMAP actually mentions the new version (when version changed)
if (versionChanged && worktreeVer) {
  const roadmap = fs.readFileSync('ROADMAP.md', 'utf8')
  if (!roadmap.includes(worktreeVer)) {
    // Not strictly required — warn not fail, unless --strict
    const msg = `⚠ ROADMAP.md does not mention version ${worktreeVer} — add it to the new P<N> entry.`
    if (flagStrict) {
      console.error(`✗ ${msg}`)
      process.exit(1)
    } else {
      console.warn(msg)
    }
  }
}

console.log('✓ roadmap check passed')
if (hasPackage)
  console.log(
    `  package.json touched, ROADMAP.md touched: ${hasRoadmap || pushFiles.includes('ROADMAP.md')}`
  )
if (versionChanged)
  console.log(`  version: ${baseVer} → ${worktreeVer} (HEAD ${headVer})`)
