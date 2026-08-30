#!/usr/bin/env zx
// bump — version bump + ROADMAP stub (habit enforcement).
// Usage: zx scripts/bump.mjs [patch|minor|major] [--dry-run] [--title="..."]
//   npm run release:patch  → patch
//   npm run release:minor  → minor
//   npm run release:major  → major
// Never hand-edit package.json version — use this script so ROADMAP stays in sync.
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

$.verbose = false

function parseArgs() {
  const args = process.argv.slice(2)
  let level = 'patch'
  let dryRun = false
  let title = null
  for (const a of args) {
    if (['patch', 'minor', 'major'].includes(a)) level = a
    else if (a === '--dry-run') dryRun = true
    else if (a.startsWith('--title=')) title = a.slice(8).replace(/^"|"$/g, '')
  }
  // npm passes extra args after --, also check env
  if (process.env.npm_config_title) title = process.env.npm_config_title
  return { level, dryRun, title }
}

function bumpVersion(v, level) {
  const m = v.match(/^(\d+)\.(\d+)\.(\d+)(.*)$/)
  if (!m) throw new Error(`Invalid semver: ${v}`)
  let [, maj, min, pat, rest] = m
  maj = Number(maj)
  min = Number(min)
  pat = Number(pat)
  if (level === 'major') return `${maj + 1}.0.0${rest}`
  if (level === 'minor') return `${maj}.${min + 1}.0${rest}`
  return `${maj}.${min}.${pat + 1}${rest}`
}

function nextPNumber(roadmap) {
  const re = /^### P(\d+)\s+—/gm
  let n = -1
  let m
  while ((m = re.exec(roadmap))) n = Math.max(n, Number(m[1]))
  return n + 1
}

const { level, dryRun, title } = parseArgs()

const pkgRaw = fs.readFileSync('package.json', 'utf8')
const pkg = JSON.parse(pkgRaw)
const oldVer = pkg.version
const newVer = bumpVersion(oldVer, level)

console.log(`Bump ${level}: ${oldVer} → ${newVer}${dryRun ? ' (dry-run)' : ''}`)

// 1) package.json
if (!dryRun) {
  pkg.version = newVer
  fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n')
  console.log('✓ package.json updated')
} else {
  console.log(`  would write package.json version ${newVer}`)
}

// 2) ROADMAP.md — insert new P entry stub before "## Known Limitations"
const roadmapPath = 'ROADMAP.md'
let roadmap = fs.readFileSync(roadmapPath, 'utf8')
const pNum = nextPNumber(roadmap)
const pTitle = title || `<title>`
const today = new Date().toISOString().slice(0, 10)
const stub = [
  `### P${pNum} — ${pTitle} 🚧`,
  `- \`${level}\` bump \`${oldVer} → ${newVer}\` via \`scripts/bump.mjs ${level}\` (${today}).`,
  `- TODO: fill scope, files, and verification (\`npm run check\`, \`npm run build\`, manual).`,
  `- TODO: update ## Milestones if this closes one (flip to ✅).`,
  ``,
].join('\n')

if (roadmap.includes('## Known Limitations')) {
  roadmap = roadmap.replace(
    '## Known Limitations',
    `${stub}## Known Limitations`
  )
} else {
  roadmap = roadmap.trimEnd() + '\n\n' + stub + '\n'
}

if (!dryRun) {
  fs.writeFileSync(roadmapPath, roadmap)
  console.log(
    `✓ ROADMAP.md stub P${pNum} inserted (edit the TODOs, then commit)`
  )
} else {
  console.log(`  would insert into ROADMAP.md:\n${stub}`)
}

if (!dryRun) {
  console.log('')
  console.log('Next steps:')
  console.log(`  1. Edit ROADMAP.md — replace P${pNum} TODOs with real notes.`)
  console.log(
    `  2. git add package.json ROADMAP.md && git commit -m "chore(release): ${level} ${newVer} — P${pNum} ${pTitle}"`
  )
  console.log(`  3. git push  # pre-push will run check-roadmap.mjs`)
  console.log(`  Or: npm run check:roadmap`)
}
