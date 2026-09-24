#!/bin/bash
# Audit evaluateManifold unification
set -e

PROJECT_ROOT="$(dirname "$0")/.."
SHADERS_DIR="$PROJECT_ROOT/src/webgpu/shaders"

echo "=== evaluateManifold Unification Audit ==="
echo ""

# Count definitions
RESULTS=$(grep -rn 'fn evaluateManifold' "$SHADERS_DIR" 2>/dev/null || true)
COUNT=$(echo "$RESULTS" | grep -c 'fn evaluateManifold' 2>/dev/null || echo 0)

if [ "$COUNT" -eq 1 ]; then
  FILE=$(echo "$RESULTS" | head -1 | cut -d: -f1)
  echo "✅ Exactly 1 definition found: $FILE"
  exit 0
elif [ "$COUNT" -eq 0 ]; then
  echo "❌ No evaluateManifold definitions found in shaders/"
  exit 1
else
  echo "❌ ${COUNT} definitions found (expected 1):"
  echo ""
  echo "$RESULTS"
  exit 1
fi
