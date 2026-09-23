#!/usr/bin/env bash
# Build a sideloadable Rakazo APK pointed at the self-hosted server.
#   selfhost-android/build.sh            -> selfhost-android/out/rakazo-selfhosted.apk
# SERVER_URL overrides the default server baked into the app.
set -euo pipefail
cd "$(dirname "$0")/.."
SERVER_URL="${SERVER_URL:-http://10.0.0.2:5173}"

docker build -q -t rakazo-android-build selfhost-android >/dev/null
docker volume create rakazo-android-sdk >/dev/null
docker volume create rakazo-android-gradle >/dev/null

docker run --rm -u 1000:1000 \
  -v "$PWD":/src -w /src \
  -v rakazo-android-sdk:/opt/android-sdk \
  -v rakazo-android-gradle:/opt/gradle-home \
  -e HOME=/opt/gradle-home \
  -e EXPO_PUBLIC_API_URL="$SERVER_URL" \
  -e CI=1 \
  rakazo-android-build bash -euo pipefail -c '
    # Licences are not accepted here: the SDK volume is seeded from an SDK whose
    # licences were already accepted (youtube-feed/vendor/android/sdk).
    test -d "$ANDROID_HOME/licenses" || { echo "SDK volume has no licences; seed it first"; exit 1; }
    # The Expo template caps Gradle at 2g heap / 512m metaspace, which runs
    # out in KSP and lint. User-home gradle.properties overrides the project.
    printf "org.gradle.jvmargs=-Xmx6g -XX:MaxMetaspaceSize=2g\nkotlin.daemon.jvmargs=-Xmx3g\n" \
      > "$GRADLE_USER_HOME/gradle.properties"
    pnpm install --frozen-lockfile --filter "@rakazo/mobile..."
    cd apps/mobile
    pnpm exec expo prebuild --platform android --clean --no-install
    cd android
    ./gradlew --no-daemon assembleRelease -PreactNativeArchitectures=arm64-v8a
  '
mkdir -p selfhost-android/out
cp apps/mobile/android/app/build/outputs/apk/release/app-release.apk selfhost-android/out/rakazo-selfhosted.apk
echo "Built selfhost-android/out/rakazo-selfhosted.apk (server: $SERVER_URL)"
