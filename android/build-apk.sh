#!/usr/bin/env bash
# Build and sign the Android APK.
# Needs: Python 3, esbuild, JDK 11+, Android SDK platform 35 (android.jar) and build-tools.
#   ANDROID_JAR=/path/to/platforms/android-35/android.jar
#   BUILD_TOOLS=/path/to/build-tools/35.0.0
#   KEYSTORE=/path/to/your.jks  KEYSTORE_PASS=...   (keep the same key to update installed copies)
set -euo pipefail
cd "$(dirname "$0")"
: "${ANDROID_JAR:?set ANDROID_JAR}" "${BUILD_TOOLS:?set BUILD_TOOLS}" "${KEYSTORE:?set KEYSTORE}" "${KEYSTORE_PASS:?set KEYSTORE_PASS}"
VERSION=$(grep -o 'versionName="[^"]*"' AndroidManifest.xml | cut -d'"' -f2)
python3 ../build/build.py
rm -rf assets build && mkdir -p assets build/classes build/dex
cp -r ../www-dist assets/www
"$BUILD_TOOLS/aapt2" compile --dir res -o build/res.zip
"$BUILD_TOOLS/aapt2" link -o build/base.apk -I "$ANDROID_JAR" --manifest AndroidManifest.xml -A assets \
  -0 woff2 -0 wasm -0 bcmap build/res.zip --min-sdk-version 28 --target-sdk-version 35
javac -source 11 -target 11 -nowarn -cp "$ANDROID_JAR" -d build/classes $(find src -name "*.java")
"$BUILD_TOOLS/d8" --release --min-api 28 --lib "$ANDROID_JAR" --output build/dex $(find build/classes -name "*.class")
cp build/base.apk build/unsigned.apk
(cd build/dex && zip -q ../unsigned.apk classes.dex)
"$BUILD_TOOLS/zipalign" -f -p 4 build/unsigned.apk build/aligned.apk
"$BUILD_TOOLS/apksigner" sign --ks "$KEYSTORE" --ks-pass "pass:$KEYSTORE_PASS" --out "build/liubai-$VERSION.apk" build/aligned.apk
echo "built android/build/liubai-$VERSION.apk"
