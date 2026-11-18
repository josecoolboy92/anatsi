#!/bin/sh
# Build the offline Android app (APK) from the web app in the folder above.
# Needs: JDK 17+, Gradle 8.x, Android SDK (platform 35, build-tools 35.0.0). ANDROID_HOME must point to the SDK.
# Release signing uses ../anatsi-release.keystore beside this folder (keep it safe: updates must be signed with the same key).
set -e
cd "$(dirname "$0")"
A=app/src/main/assets
rm -rf "$A" && mkdir -p "$A"
cp -r ../index.html ../css ../js ../vendor ../icons ../manifest.webmanifest ../LICENSE "$A"/
echo "sdk.dir=${ANDROID_HOME}" > local.properties
gradle assembleRelease --no-daemon
ls -la app/build/outputs/apk/release/
