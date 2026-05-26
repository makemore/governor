#!/bin/sh
# Install the gov CLI from the latest GitHub Release.
#
#   curl -fsSL https://raw.githubusercontent.com/makemore/governor/main/install.sh | sh
#
# Honoured env vars:
#   GOV_VERSION   tag to install (default: latest release)
#   GOV_INSTALL_DIR  target directory (default: ~/.local/bin, falls back to /usr/local/bin via sudo)
#
# POSIX sh; relies on curl, tar, uname, mktemp.

set -eu

REPO="makemore/governor"
BIN="gov"

err() { printf 'install: %s\n' "$*" >&2; exit 1; }
info() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }

need() { command -v "$1" >/dev/null 2>&1 || err "missing dependency: $1"; }
need curl
need tar
need uname

uname_s=$(uname -s)
uname_m=$(uname -m)
case "$uname_s" in
  Linux)  os=linux ;;
  Darwin) os=darwin ;;
  *) err "unsupported OS: $uname_s (windows: download from https://github.com/$REPO/releases)" ;;
esac
case "$uname_m" in
  x86_64|amd64) arch=amd64 ;;
  arm64|aarch64) arch=arm64 ;;
  *) err "unsupported arch: $uname_m" ;;
esac

# Resolve version.
version="${GOV_VERSION:-}"
if [ -z "$version" ]; then
  info "resolving latest release"
  version=$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" \
    | sed -n 's/.*"tag_name": *"\([^"]*\)".*/\1/p' | head -n1)
  [ -n "$version" ] || err "could not resolve latest release tag"
fi
case "$version" in v*) ;; *) version="v$version" ;; esac
ver_nopre="${version#v}"

asset="${BIN}_${ver_nopre}_${os}_${arch}.tar.gz"
url="https://github.com/$REPO/releases/download/$version/$asset"

# Decide install dir.
install_dir="${GOV_INSTALL_DIR:-}"
sudo=""
if [ -z "$install_dir" ]; then
  install_dir="$HOME/.local/bin"
  if ! mkdir -p "$install_dir" 2>/dev/null; then
    install_dir="/usr/local/bin"
    sudo="sudo"
  fi
fi
if ! [ -w "$install_dir" ] && [ -z "$sudo" ]; then
  sudo="sudo"
fi

info "downloading $asset"
tmp=$(mktemp -d 2>/dev/null || mktemp -d -t gov-install)
trap 'rm -rf "$tmp"' EXIT INT TERM
curl -fL --progress-bar "$url" -o "$tmp/$asset" \
  || err "download failed: $url"

info "extracting"
tar -xzf "$tmp/$asset" -C "$tmp"
[ -f "$tmp/$BIN" ] || err "archive did not contain expected '$BIN' binary"
chmod +x "$tmp/$BIN"

info "installing to $install_dir/$BIN"
[ -n "$sudo" ] && info "needs sudo to write to $install_dir"
$sudo install -d "$install_dir" 2>/dev/null || $sudo mkdir -p "$install_dir"
$sudo install -m 0755 "$tmp/$BIN" "$install_dir/$BIN"

# PATH check (informational only).
case ":$PATH:" in
  *":$install_dir:"*) ;;
  *) info "note: $install_dir is not on your \$PATH" \
        && info "  add this to your shell rc:  export PATH=\"$install_dir:\$PATH\"" ;;
esac

info "installed: $($install_dir/$BIN --version 2>/dev/null || echo $BIN $version)"
info "next: gov bootstrap --base-url <url> --bootstrap-token <token>"
