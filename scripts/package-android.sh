#!/usr/bin/env bash
set -euo pipefail

out="$(mkdir -p "${1:-artifacts/native-release}" && cd "${1:-artifacts/native-release}" && pwd)"
sdk="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-}}"
test -n "$sdk"
test -d "$sdk/platforms/android-36"
test -f dist/sw.js
pnpm exec cap sync android
printf 'sdk.dir=%s\n' "$sdk" > android/local.properties
(
  cd android
  bash ./gradlew :app:assembleRelease --no-daemon --console=plain
) > "$out/android-build.log" 2>&1 || {
  tail -n 70 "$out/android-build.log"
  exit 1
}
build_tools="$sdk/build-tools/36.0.0"
unsigned=android/app/build/outputs/apk/release/app-release-unsigned.apk
test -f "$unsigned"
"$build_tools/zipalign" -f -P 16 4 "$unsigned" "$out/ironlaw-android-aligned.apk"
"$build_tools/zipalign" -c -P 16 4 "$out/ironlaw-android-aligned.apk"
"$build_tools/aapt" dump badging "$out/ironlaw-android-aligned.apk" > "$out/android-badging.txt"
grep -q "name='com.jianlibao.app'" "$out/android-badging.txt"
grep -q "versionName='0.4.0'" "$out/android-badging.txt"
cp "$build_tools/lib/apksigner.jar" "$out/apksigner.jar"
(cd "$out" && shasum -a 256 ironlaw-android-aligned.apk apksigner.jar > android-SHA256SUMS.txt)
