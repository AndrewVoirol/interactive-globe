#!/bin/bash
TARGET="$1"
LATEST=$(ls -t /Users/andrewvoirol/.gemini/antigravity/brain/78e92e8a-54e7-4524-a97e-718f515be051/.system_generated/steps/*/media_0.webp | head -n 1)
if [ -z "$LATEST" ]; then
  echo "Error: No media_0.webp found"
  exit 1
fi
dwebp "$LATEST" -o "screenshots/$TARGET.png"
echo "Saved screenshots/$TARGET.png from $LATEST"
