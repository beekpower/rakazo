#!/usr/bin/env bash
# Build the self-hosted APK on GitHub Actions instead of this machine, then
# download it, check it, and copy it to the synced Drive folder.
#
# The fork's "fork Android APK" workflow (on its main branch) checks out this
# branch as pushed to the fork, so push first.
#
#   selfhost-android/ci-build.sh             -> selfhost-android/out/rakazo-selfhosted.apk
# SERVER_URL overrides the default server baked into the app; DRIVE_DIR the copy target.
set -euo pipefail
cd "$(dirname "$0")/.."
FORK="${FORK:-beekpower/rakazo}"
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
SERVER_URL="${SERVER_URL:-http://10.0.0.2:5173}"
DRIVE_DIR="${DRIVE_DIR:-$HOME/Drive}"
sha="$(git rev-parse HEAD)"

remote="$(git ls-remote "git@github.com:${FORK}.git" "refs/heads/${BRANCH}" | cut -f1)"
[ "$remote" = "$sha" ] || { echo "the fork's ${BRANCH} is ${remote:0:7}, not ${sha:0:7}; push it first" >&2; exit 1; }

started="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
gh workflow run fork-android-apk.yml --repo "$FORK" --ref main -f ref="$BRANCH" -f server_url="$SERVER_URL"
run=""
for _ in $(seq 1 30); do
  run="$(gh run list --repo "$FORK" --workflow fork-android-apk.yml --event workflow_dispatch --limit 5 \
    --json databaseId,createdAt --jq "[.[] | select(.createdAt >= \"${started}\")][0].databaseId // empty")"
  [ -n "$run" ] && break
  sleep 5
done
[ -n "$run" ] || { echo "the APK build did not start" >&2; exit 1; }
echo "==> waiting for APK build run ${run}"
gh run watch --repo "$FORK" "$run" --exit-status --interval 30 >/dev/null

out="selfhost-android/out"
rm -rf "$out/ci" && mkdir -p "$out/ci"
gh run download --repo "$FORK" "$run" -n rakazo-selfhosted-apk -D "$out/ci"
built="$(cat "$out/ci/SOURCE_COMMIT")"
[ "$built" = "$sha" ] || { echo "the run built ${built:0:7}, expected ${sha:0:7}" >&2; exit 1; }
cp "$out/ci/app-release.apk" "$out/rakazo-selfhosted.apk"
echo "==> built ${sha:0:7}: $out/rakazo-selfhosted.apk"
if [ -d "$DRIVE_DIR" ]; then
  cp "$out/rakazo-selfhosted.apk" "$DRIVE_DIR/rakazo-selfhosted.apk"
  echo "==> copied to $DRIVE_DIR"
fi
