#!/bin/sh
# Docker for the cf CLI on this computer, where docker is podman: cf builds container images with `docker build
# --provenance=false -f -` (the Dockerfile on stdin), and podman's build takes neither the flag nor a Dockerfile from a
# socket, so the flag is dropped and the Dockerfile is written to a file on the way through. Everything else passes as
# it is. Used by scripts/join.mjs (`--path-to-docker`).
set -e
tmp=""
args=""
prev=""
for a in "$@"; do
	case "$a" in
		--provenance*) prev="$a"; continue ;;
	esac
	if [ "$prev" = "-f" ] && [ "$a" = "-" ]; then
		tmp=$(mktemp)
		cat > "$tmp"
		a="$tmp"
	fi
	args="$args \"$(printf '%s' "$a" | sed 's/"/\\"/g')\""
	prev="$a"
done
eval podman "$args"
status=$?
[ -n "$tmp" ] && rm -f "$tmp"
exit $status
