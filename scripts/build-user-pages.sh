#!/usr/bin/env bash
# Build static site for https://tawaqqa-salama.github.io/ (no basePath)
set -euo pipefail
cd "$(dirname "$0")/.."
export USER_PAGES=true

# Route Handlers غير مدعومة مع output:export — نخفيها أثناء البناء الثابت فقط
API_TMP=""
if [ -d app/api ]; then
  API_TMP=".api-build-tmp-$$"
  mv app/api "$API_TMP"
  restore_api() { mv "$API_TMP" app/api; }
  trap restore_api EXIT
fi

npm run build
touch out/.nojekyll
echo "Built to ./out — deploy contents to tawaqqa-salama/tawaqqa-salama.github.io (main)"
echo "ملاحظة: واجهات /api/* (ZATCA، الامتثال، WhatsApp، التصدير) تحتاج نشراً على Node/Vercel (ليست جزءاً من GitHub Pages)."
