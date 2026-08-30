#!/usr/bin/env zx
// HueZ dev — convenience wrapper for `vite` with zx logging parity.

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
$.verbose = true

await $`npx vite --port 5173 --open`
