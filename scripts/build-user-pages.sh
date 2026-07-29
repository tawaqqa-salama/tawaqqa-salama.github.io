#!/usr/bin/env bash
# Build static site for https://tawaqqa-salama.github.io/ (no basePath)
set -euo pipefail
cd "$(dirname "$0")/.."
export USER_PAGES=true
npm run build
touch out/.nojekyll
echo "Built to ./out — deploy contents to tawaqqa-salama/tawaqqa-salama.github.io (main)"
