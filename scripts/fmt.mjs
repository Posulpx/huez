#!/usr/bin/env zx
// HueZ fmt — wrapper around prettier (zx style: https://github.com/google/zx)
// Usage: zx scripts/fmt.mjs [--check]
//   --check  → prettier --check .  (CI)
//   (default) → prettier --write .

import { $, usePowerShell, useBash } from 'zx'

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

const check = process.argv.includes('--check')

try {
  if (check) await $`npx prettier --check .`
  else await $`npx prettier --write .`
  console.log(check ? '✓ fmt:check passed' : '✓ formatted')
} catch (e) {
  if (check) {
    console.error('✗ fmt:check failed — run `npm run fmt` locally')
  }
  throw e
}
