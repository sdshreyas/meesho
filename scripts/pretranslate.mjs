// Pre-translates every UI string + product name into public/i18n/<lang>.json.
// The app still calls the live API first; these files are the offline fallback
// so a live demo keeps working on bad Wi-Fi. Usage: node scripts/pretranslate.mjs
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CATEGORY_KEYS, EN, SELLER_TEXTS } from '../src/i18n/strings.js'
import { PROFILES } from '../src/data/personas.js'
import { LANGUAGES } from '../src/data/languages.js'
import { google } from '../src/i18n/translate.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const products = JSON.parse(readFileSync(join(ROOT, 'src/data/products.json'), 'utf8'))
const texts = [...new Set([
  ...Object.values(EN), ...CATEGORY_KEYS, ...products.map((p) => p.subcategory),
  ...products.map((p) => p.name), ...PROFILES.flatMap((p) => [p.segment, p.blurb]), ...SELLER_TEXTS,
])]
mkdirSync(join(ROOT, 'public/i18n'), { recursive: true })

for (const l of LANGUAGES.filter((x) => x.code !== 'en' && !x.limited)) {
  try {
    const map = await google(texts, l.code)
    writeFileSync(join(ROOT, `public/i18n/${l.code}.json`), JSON.stringify(map))
    console.log(l.code, Object.keys(map).length, '/', texts.length)
  } catch (e) {
    console.log(l.code, 'failed', e.message)
  }
  await new Promise((r) => setTimeout(r, 800))
}
