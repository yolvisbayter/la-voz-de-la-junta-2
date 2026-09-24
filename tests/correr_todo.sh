#!/usr/bin/env bash
# Corre todas las verificaciones de La voz de la Junta.
#
#   bash tests/correr_todo.sh          (o: npm test)
#
# Necesita Node 18+ y Python 3. Para las pruebas en navegador, Playwright con Chromium:
#   npm install && npx playwright install chromium
# Si Playwright no está, corre solo las pruebas del backend y lo avisa.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "== 1. Sintaxis"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
cp apps_script/Codigo.gs "$tmp/Codigo.js" && node --check "$tmp/Codigo.js"
node --check panel/voz.js
node -e '
const fs=require("fs");
for (const f of ["index.html","carteles_qr.html"]) {
  const h=fs.readFileSync(f,"utf8");
  const partes=[...h.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
  partes.forEach(s=>new Function(s));
  console.log("  " + f + ": " + partes.length + " script(s) bien formados");
}'
python3 -c 'import json;json.load(open("apps_script/appsscript.json"))'
echo "  ok"

echo "== 2. El panel armado está al día con sus piezas"
cp panel/panel.html "$tmp/panel_antes.html"
python3 panel/build.py
if ! cmp -s "$tmp/panel_antes.html" panel/panel.html; then
  echo "  ERROR: panel/panel.html no estaba al día: alguien editó voz.js, voz.css, voz.html o logos.js sin correr build.py."
  echo "  Ya se regeneró. Súbalo junto con el cambio."
  exit 1
fi
echo "  ok"

echo "== 3. Pruebas"
if node -e 'require("playwright")' 2>/dev/null || NODE_PATH="$(npm root -g)" node -e 'require("playwright")' 2>/dev/null; then
  export NODE_PATH="${NODE_PATH:-$(npm root -g)}"
  node --test tests/*.test.js
else
  echo "  (Playwright no está instalado: solo pruebas del backend. Para todo: npm install && npx playwright install chromium)"
  node --test tests/backend.test.js
fi
