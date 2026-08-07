#!/usr/bin/env bash
# Build static site for https://tawaqqa-salama.github.io/ (no basePath)
set -euo pipefail
cd "$(dirname "$0")/.."
export USER_PAGES=true
export ALLOW_DEMO_MODE=true
export NEXT_PUBLIC_STATIC_EXPORT=true
export NEXT_PUBLIC_USER_PAGES=true
export NEXT_PUBLIC_ALLOW_DEMO_MODE=true

# Route Handlers + middleware غير مدعومة مع output:export
API_TMP=""
MW_TMP=""
restore() {
  if [ -n "$API_TMP" ] && [ -d "$API_TMP" ]; then mv "$API_TMP" app/api; fi
  if [ -n "$MW_TMP" ] && [ -f "$MW_TMP" ]; then mv "$MW_TMP" middleware.ts; fi
}
trap restore EXIT

if [ -d app/api ]; then
  API_TMP=".api-build-tmp-$$"
  mv app/api "$API_TMP"
fi
if [ -f middleware.ts ]; then
  MW_TMP=".middleware-build-tmp-$$.ts"
  mv middleware.ts "$MW_TMP"
fi

npm run build
touch out/.nojekyll
echo "Built to ./out — deploy contents to tawaqqa-salama/tawaqqa-salama.github.io (main)"
echo "ملاحظة: واجهات /api/* و middleware تحتاج نشراً على Node/Vercel (ليست جزءاً من GitHub Pages)."
