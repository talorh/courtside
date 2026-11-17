# Pinned, so a rebuild changes only the repository's own files: node:26-alpine (Node 26.13.1, Alpine 3.24.4) by its
# multi-arch digest, and Alpine 3.24's ffmpeg by version. Moving either: docs/runbooks/cloudflare-setup.md §7.
FROM docker.io/library/node:26-alpine@sha256:6bd9ab43c0ec0190ca7b2d193906cb8b7edf6e7f4afa43ddeccd6452710bffb5
RUN apk add --no-cache ffmpeg=8.1.3-r0
WORKDIR /app
COPY server.mjs jobs.mjs join.mjs pipeline.mjs test-a.mp4 test-b.mp4 ./
EXPOSE 8080
CMD ["node", "server.mjs"]
