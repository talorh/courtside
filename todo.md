# To do

Outstanding tasks only (done items are deleted). Ideas for later are in `docs/spec.md` ("Later, not now").

## 1. Platform

- [ ] Upgrade to Node 26. Node 22 reaches end of life on 30 April 2027; go straight to Node 26, the newest long-term
      support release, rather than 24. Everything that names 22 moves together: `.node-version`, the joiner's `join/Dockerfile`
      (`node:22-alpine`), Workers Builds' build environment for the site, maintenance and joiner Workers, the browser
      suite's Playwright container, `INSTALL.md` and the README, the Documentation's Setting up a computer (and its
      test), and each computer's own Node. A plan first (`docs/plans/`), then staging, then a release.
