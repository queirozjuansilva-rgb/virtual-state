// Copia o worker do MapLibre para public/ (ver src/components/map/geo-map.tsx).
// O MapLibre resolve o worker relativo ao próprio módulo, caminho que o
// bundler do Next não serve. Roda no postinstall; o arquivo não é versionado.
import { copyFileSync, mkdirSync, readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"

const require = createRequire(import.meta.url)
const pkgPath = require.resolve("maplibre-gl/package.json")
const { version } = JSON.parse(readFileSync(pkgPath, "utf8"))
const src = join(dirname(pkgPath), "dist", "maplibre-gl-worker.mjs")
const destDir = join(process.cwd(), "public", "vendor")
mkdirSync(destDir, { recursive: true })
copyFileSync(src, join(destDir, "maplibre-gl-worker.mjs"))
console.log(`maplibre-gl ${version}: worker copiado para public/vendor/`)
