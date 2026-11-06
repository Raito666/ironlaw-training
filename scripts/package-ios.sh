#!/usr/bin/env bash
set -euo pipefail

out="$(mkdir -p "${1:-artifacts/native-release}" && cd "${1:-artifacts/native-release}" && pwd)"
test -f dist/sw.js
pnpm exec cap sync ios
pnpm ios:verify

xcodebuild_app() {
  local sdk="$1" destination="$2"
  xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Release \
    -sdk "$sdk" -destination "$destination" -derivedDataPath "$out/DerivedData" \
    ARCHS=arm64 ONLY_ACTIVE_ARCH=NO CODE_SIGNING_ALLOWED=NO \
    CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY= build > "$out/$sdk-build.log" 2>&1 || {
      tail -n 65 "$out/$sdk-build.log"
      return 1
    }
}

check_app() {
  local app="$1" platform="$2"
  test -f "$app/Assets.car"
  test -d "$app/Base.lproj/LaunchScreen.storyboardc"
  test -f "$app/zh-Hans.lproj/InfoPlist.strings"
  test ! -d "$app/_CodeSignature"
  test ! -f "$app/embedded.mobileprovision"
  cmp dist/index.html "$app/public/index.html"
  cmp dist/sw.js "$app/public/sw.js"
  xcrun vtool -show-build "$app/App" | tee "$out/$platform-platform.txt"
  grep -Eq "platform +$platform([[:space:]]*)$" "$out/$platform-platform.txt"
  test "$(xcrun lipo -archs "$app/App")" = arm64
}

xcodebuild_app iphonesimulator 'generic/platform=iOS Simulator'
sim="$out/DerivedData/Build/Products/Release-iphonesimulator/App.app"
check_app "$sim" IOSSIMULATOR
ditto -c -k --sequesterRsrc --keepParent "$sim" "$out/ironlaw-ios-simulator-arm64.zip"

xcodebuild_app iphoneos 'generic/platform=iOS'
device="$out/DerivedData/Build/Products/Release-iphoneos/App.app"
check_app "$device" IOS
test ! -e "$out/Payload"
mkdir "$out/Payload"
ditto "$device" "$out/Payload/App.app"
ditto -c -k --keepParent "$out/Payload" "$out/ironlaw-ios-unsigned.ipa"

if [[ "${IRONLAW_SIMULATOR_SMOKE:-0}" == 1 ]]; then
  python3 -B scripts/ci/release-ios-smoke.py "$sim" "$out" || \
    echo 'Simulator smoke did not reach readiness. Read simulator-evidence.json.'
fi
(cd "$out" && shasum -a 256 ironlaw-ios-simulator-arm64.zip ironlaw-ios-unsigned.ipa > ios-SHA256SUMS.txt)
