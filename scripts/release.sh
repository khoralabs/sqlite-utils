#!/usr/bin/env bash
set -euo pipefail

PACKAGE="${PACKAGE:?PACKAGE is required (sqlite-migrate or sqlite-crypto)}"
VERSION="${VERSION:?VERSION is required (e.g. 0.1.0)}"
NPM_TAG="${NPM_TAG:-latest}"
DRY_RUN="${DRY_RUN:-false}"

if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.]+)?(\+[a-zA-Z0-9.]+)?$ ]]; then
  echo "Invalid semver: $VERSION" >&2
  exit 1
fi

case "$PACKAGE" in
  sqlite-migrate | sqlite-crypto) ;;
  *)
    echo "Unknown package: $PACKAGE" >&2
    exit 1
    ;;
esac

root="$(cd "$(dirname "$0")/.." && pwd)"
pkg_dir="$root/packages/$PACKAGE"
pkg_json="$pkg_dir/package.json"
npm_scope="@khoralabs/$PACKAGE"
git_tag="${PACKAGE}-v${VERSION}"

if [ ! -f "$pkg_json" ]; then
  echo "Missing $pkg_json" >&2
  exit 1
fi

cd "$root"

echo "Installing dependencies..."
bun install --frozen-lockfile

echo "Running tests for $PACKAGE..."
bun test "packages/$PACKAGE"

echo "Typechecking..."
bun run typecheck

echo "Setting ${npm_scope} to $VERSION..."
node -e "
  const fs = require('node:fs');
  const path = process.argv[1];
  const version = process.argv[2];
  const pkg = JSON.parse(fs.readFileSync(path, 'utf8'));
  pkg.version = version;
  delete pkg.private;
  fs.writeFileSync(path, JSON.stringify(pkg, null, 2) + '\n');
" "$pkg_json" "$VERSION"

dry_run() {
  [ "$DRY_RUN" = "true" ]
}

revert_package_json() {
  if git ls-files --error-unmatch "$pkg_json" &>/dev/null; then
    git checkout -- "$pkg_json"
  fi
}

cleanup_tarball() {
  if [ -n "${tarball_path:-}" ] && [ -f "$tarball_path" ]; then
    rm -f "$tarball_path"
  fi
}

if ! dry_run; then
  if [ -z "${NPM_TOKEN:-}" ]; then
    echo "NPM_TOKEN is required" >&2
    revert_package_json
    exit 1
  fi
  auth_line="//registry.npmjs.org/:_authToken=${NPM_TOKEN}"
  npmrc_content=$"legacy-peer-deps=true\n${auth_line}\n"
  printf '%s' "$npmrc_content" > "$HOME/.npmrc"
  printf '%s' "$npmrc_content" > "$root/.npmrc"
  echo "npm identity: $(npm whoami)"
fi

publish_args=(--access public --tag "$NPM_TAG" --legacy-peer-deps)
if dry_run; then
  publish_args+=(--dry-run)
fi

echo "Publishing ${npm_scope}@${VERSION} (dist-tag: ${NPM_TAG})..."
trap cleanup_tarball EXIT
cd "$pkg_dir"
tarball_name=$(npm pack --silent)
tarball_path="$pkg_dir/$tarball_name"

publish_output=$(npm publish "$tarball_path" "${publish_args[@]}" 2>&1) || publish_status=$?
echo "$publish_output"

if [ "${publish_status:-0}" -ne 0 ]; then
  echo "::error::npm publish failed for ${npm_scope}" >&2
  revert_package_json
  exit 1
fi

if echo "$publish_output" | grep -q "Skipping workspace.*private"; then
  echo "::error::npm skipped publish because the package is marked private" >&2
  revert_package_json
  exit 1
fi

if ! echo "$publish_output" | grep -qE "^\+ ${npm_scope}@${VERSION}"; then
  echo "::error::npm publish did not report success for ${npm_scope}@${VERSION}" >&2
  revert_package_json
  exit 1
fi

cleanup_tarball
trap - EXIT

if dry_run; then
  echo "Dry run complete; reverting $pkg_json and skipping git tag/push"
  revert_package_json
  exit 0
fi

git config user.name "${GIT_USER_NAME:-github-actions[bot]}"
git config user.email "${GIT_USER_EMAIL:-41898282+github-actions[bot]@users.noreply.github.com}"

git add "$pkg_json"
if git diff --cached --quiet; then
  echo "::error::package.json has no changes to commit; publish may have been skipped" >&2
  exit 1
fi

git commit -m "release ${npm_scope} v${VERSION}"
git tag "$git_tag"
git push origin HEAD
git push origin "$git_tag"

echo "Released ${npm_scope}@${VERSION} (git tag: $git_tag)"
