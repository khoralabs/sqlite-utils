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

echo "Setting @khoralabs/$PACKAGE to $VERSION..."
node -e "
  const fs = require('node:fs');
  const path = process.argv[1];
  const version = process.argv[2];
  const pkg = JSON.parse(fs.readFileSync(path, 'utf8'));
  pkg.version = version;
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

if ! dry_run; then
  if [ -z "${NPM_TOKEN:-}" ] && ! npm whoami &>/dev/null; then
    echo "NPM_TOKEN is required (or run npm login locally)" >&2
    revert_package_json
    exit 1
  fi
fi

publish_args=(--access public --tag "$NPM_TAG" --legacy-peer-deps)
if dry_run; then
  publish_args+=(--dry-run)
fi

echo "Publishing @khoralabs/$PACKAGE@${VERSION} (dist-tag: ${NPM_TAG})..."
(cd "$pkg_dir" && npm publish "${publish_args[@]}")

if dry_run; then
  echo "Dry run complete; reverting $pkg_json and skipping git tag/push"
  revert_package_json
  exit 0
fi

git config user.name "${GIT_USER_NAME:-github-actions[bot]}"
git config user.email "${GIT_USER_EMAIL:-41898282+github-actions[bot]@users.noreply.github.com}"

git add "$pkg_json"
git commit -m "release @khoralabs/$PACKAGE v${VERSION}"
git tag "$git_tag"
git push origin HEAD
git push origin "$git_tag"

echo "Released @khoralabs/$PACKAGE@${VERSION} (git tag: $git_tag)"
