#!/usr/bin/env bash
set -euo pipefail

out="$(mkdir -p "${1:-artifacts/native-release}" && cd "${1:-artifacts/native-release}" && pwd)"
test -f dist/sw.js
pnpm exec cap sync ios
pnpm ios:verify

# CoreSimulator reads the app's Keychain identity from the linked executable.
# Keep this identity local to the simulator. Xcode supplies the device identity
# when a developer signs the separate iPhone build with their own team.
cat > "$out/simulator-entitlements.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>application-identifier</key><string>com.jianlibao.app</string>
  <key>keychain-access-groups</key><array><string>com.jianlibao.app</string></array>
</dict></plist>
PLIST
printf 'OTHER_LDFLAGS[sdk=iphonesimulator*] = $(inherited) -Xlinker -sectcreate -Xlinker __TEXT -Xlinker __entitlements -Xlinker "$(IRONLAW_SIMULATOR_ENTITLEMENTS)"\n' \
  > "$out/Simulator.xcconfig"

xcodebuild_app() {
  local sdk="$1" destination="$2"
  shift 2
  xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Release \
    -sdk "$sdk" -destination "$destination" -derivedDataPath "$out/DerivedData" \
    ARCHS=arm64 ONLY_ACTIVE_ARCH=NO CODE_SIGNING_ALLOWED=NO \
    CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY= "$@" build > "$out/$sdk-build.log" 2>&1 || {
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

xcodebuild_app iphonesimulator 'generic/platform=iOS Simulator' -xcconfig "$out/Simulator.xcconfig" \
  "IRONLAW_SIMULATOR_ENTITLEMENTS=$out/simulator-entitlements.plist"
sim="$out/DerivedData/Build/Products/Release-iphonesimulator/App.app"
check_app "$sim" IOSSIMULATOR
xcrun segedit "$sim/App" -extract __TEXT __entitlements "$out/linked-simulator-entitlements.plist"
cmp "$out/simulator-entitlements.plist" "$out/linked-simulator-entitlements.plist"
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
