/**
 * fix-encoding.mjs
 * Corrige strings com encoding Latin-1/Windows-1252 interpretadas como UTF-8 garbled
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs'
import { join, extname } from 'path'

const FIXES = [
  ['Ã\u00A1', '\u00E1'], ['Ã\u00A9', '\u00E9'], ['Ã\u00AD', '\u00ED'], ['Ã\u00B3', '\u00F3'], ['Ã\u00BA', '\u00FA'],
  ['Ã\u00A0', '\u00E0'], ['Ã\u00A2', '\u00E2'], ['Ã\u00A3', '\u00E3'], ['Ã\u00A7', '\u00E7'], ['Ã\u00A8', '\u00E8'],
  ['Ã\u00AA', '\u00EA'], ['Ã\u00AC', '\u00EC'], ['Ã\u00AE', '\u00EE'], ['Ã\u00B2', '\u00F2'], ['Ã\u00B4', '\u00F4'],
  ['Ã\u00B5', '\u00F5'], ['Ã\u00B9', '\u00F9'], ['Ã\u00BB', '\u00FB'], ['Ã\u00BC', '\u00FC'], ['Ã\u00B6', '\u00F6'],
  ['Ã\u0089', '\u00C9'], ['Ã\u2014', '\u00D3'], ['Ã\u00DA', '\u00DA'], ['Ã\u0081', '\u00C1'], ['Ã\u2020', '\u00C7'],
  ['Ã\u20AC', '\u00C0'], ['Ã\u201A', '\u00C2'], ['\u00C3\u0192', '\u00C3'], ['Ã\u2022', '\u00D5'],
  ['\u00E2\u20AC\u2122', "\u2019"], ['\u00E2\u20AC\u0153', '\u201C'], ['\u00E2\u20AC\u009D', '\u201D'],
  ['\u00E2\u20AC\u201C', '\u2014'], ['\u00E2\u20AC\u201C', '\u2013'],
]

const SKIP_DIRS = new Set(['node_modules', '.next', '.git', 'dist', 'build', '.turbo', 'coverage', 'scripts'])
const EXTENSIONS = new Set(['.ts', '.tsx', '.jsx', '.js', '.css', '.json', '.md'])

function walkDir(dir) {
  const results = []
  try {
    for (const entry of readdirSync(dir)) {
      if (SKIP_DIRS.has(entry)) continue
      const full = join(dir, entry)
      const stat = statSync(full)
      if (stat.isDirectory()) results.push(...walkDir(full))
      else if (EXTENSIONS.has(extname(full))) results.push(full)
    }
  } catch (e) {}
  return results
}

function fixContent(content) {
  let fixed = content
  for (const [from, to] of FIXES) {
    if (fixed.includes(from)) fixed = fixed.split(from).join(to)
  }
  return fixed
}

const ROOT = process.cwd()
const files = walkDir(ROOT)
let fixedFiles = 0

for (const file of files) {
  try {
    const content = readFileSync(file, 'utf8')
    const fixed = fixContent(content)
    if (fixed !== content) {
      writeFileSync(file, fixed, 'utf8')
      fixedFiles++
      console.log('FIXED: ' + file.replace(ROOT, '').replace(/\\/g, '/'))
    }
  } catch (e) {
    // skip binary files
  }
}

console.log('\n=== ENCODING FIX COMPLETO ===')
console.log('Arquivos verificados: ' + files.length)
console.log('Arquivos corrigidos : ' + fixedFiles)
