#!/usr/bin/env bash
# Сборка APK: статический экспорт интерфейса Next.js -> assets/www -> gradle assembleRelease.
# Использование: APK_SITE_URL=https://ваш-сайт ./scripts/build-apk.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export JAVA_HOME="${JAVA_HOME:-/app/.android-tools/jdk}"
export ANDROID_HOME="${ANDROID_HOME:-/app/.android-tools/sdk}"
export PATH="$JAVA_HOME/bin:/app/.android-tools/gradle/bin:$PATH"
export APK_SITE_URL="${APK_SITE_URL:-https://3000-${E2B_SANDBOX_ID:-izezw3gzjucoa2fuyvs6d}.e2b.app}"
VERSION="${APK_VERSION:-1.2}"

echo "==> Site URL: $APK_SITE_URL"
WORK="$ROOT/.apk-export"
rm -rf "$WORK" && mkdir -p "$WORK"
cp -r "$ROOT/src" "$ROOT/public" "$ROOT/package.json" "$ROOT/tsconfig.json" "$ROOT/postcss.config.mjs" "$WORK/"
rm -rf "$WORK/src/app/api" "$WORK/src/app/share" "$WORK/src/proxy.ts" "$WORK/public/download"
cat > "$WORK/next.config.ts" <<'CFG'
import type { NextConfig } from "next";
const nextConfig: NextConfig = { output: "export", images: { unoptimized: true }, trailingSlash: false, typescript: { ignoreBuildErrors: true } };
export default nextConfig;
CFG
echo "==> Exporting static UI"
(cd "$WORK" && NEXT_TELEMETRY_DISABLED=1 npx next build >/tmp/apk-export.log 2>&1) || { tail -40 /tmp/apk-export.log; rm -rf "$WORK"; exit 1; }
ASSETS="$ROOT/android/app/src/main/assets/www"
rm -rf "$ASSETS" && mkdir -p "$ASSETS"
cp -r "$WORK/out/." "$ASSETS/"
echo "==> Assets: $(find "$ASSETS" -type f | wc -l) files"
rm -rf "$WORK"

echo "==> Building APK"
cd "$ROOT/android"
gradle --no-daemon -q assembleRelease >/tmp/apk-gradle.log 2>&1 || { tail -60 /tmp/apk-gradle.log; exit 1; }
OUT="$ROOT/public/download/volna-${VERSION}.apk"
mkdir -p "$ROOT/public/download"
cp app/build/outputs/apk/release/app-release.apk "$OUT"
ls -la "$OUT"
echo "==> Done: $OUT"
