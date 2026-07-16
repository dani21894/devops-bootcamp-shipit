# CLAUDE.md — Ship It: Mission Control

Design rationale and the **pinned contracts** for this CI/CD teaching prop. Read `PROMPT.md`
first for the build brief, and `docs/specs/2026-07-11-ship-it-architecture-design.md` for the full
resolved architecture. This file is the durable source of truth once the build starts — keep the
contracts here stable, because the bootcamp slides quote them.

## What this is

A live CI/CD teaching prop for the 2026 DevOps bootcamp. Learners each ship a personal **ship
microsite** through a GitHub Actions pipeline; a green run **launches their ship into a shared
orbit** on the projector ("Mission Control"). It makes the invisible pipeline visible, shared,
and personal — the CI/CD counterpart to the arena prop.

Distinct from its siblings (do not blur them):
- `devops-bootcamp-app` — Three.js Docker-layers scrollytelling. **Match its visual bar.**
- `devops-bootcamp-game` — PixiJS avatar arena. **Match its shared-live-personal interaction.**

## Why it's shaped this way

- **The pipeline is the abstract thing.** CI/CD is YAML + green checks + logs — invisible. The
  prop's whole job is to give the pipeline a *body*: launch phases you watch, a ship that either
  reaches orbit or aborts on its pad.
- **One repo, one growing workflow.** Each learner keeps ONE repo across all four sessions; the
  workflow file *grows* (Pages deploy → build/test gate → secrets/approval → build & ship the board
  container to their own EC2). Four throwaway projects would kill the "watch it mature" payoff.
- **Personal identity in a shared world.** Every ship is customized (callsign, colour, model,
  emblem), so the shared orbit is 60 distinct ships, not 60 identical ones — the reason the arena
  landed.
- **Felt-need spine.** Each session automates last week's manual step; the ship visibly gets
  closer to orbit as the pipeline does more of the work.

## Components

| Component | Built from | Image | Port |
|---|---|---|---|
| `shipit-board` — Mission Control (ws hub + Three.js spectator) | `board/` | `ghcr.io/infratify/shipit-board` | 3000 |

- **`launchpad/` — the learner ship microsite.** **Serverless** (static, `vite build` → GitHub
  Pages; extensible to CF Pages). **No image** — the ship is static-only. Three.js, like `devops-bootcamp-app`.
- **`shipit-board` is dual-role:** the *shared* Mission Control on instructor EC2, **and** the
  artifact each learner **builds + deploys to their own EC2** in the S4 capstone.
- The freed `shipit-launchpad` name is reused for the **forkable learner repo**
  `Infratify/shipit-launchpad` (see Distribution below), not an image.

## PINNED — the 4-session arc (lean: one concept per session)

Slides quote this. Everything else — matrix, artifacts, environments, manual approval, tags,
rollback — is optional **stretch**, never required hands-on.

| Session | The one concept | What the learner sees |
|---|---|---|
| **S1** | a pipeline deploys on `push` | pad lights up — ship live on GitHub Pages |
| **S2** | a **test gate** can block you | systems check — green = go · red = **ABORT** |
| **S3** | **secrets** let your ship report to Mission Control (`$SHIPIT_TOKEN`) | first contact — ship appears live on the shared board |
| **S4** | your pipeline **builds a container and runs it on your server** | LIFTOFF — you deploy your *own* Mission Control to your EC2 |

The ship is serverless S1–S3; **S4's build/deploy artifact is the `board` image**, because the board
is the one thing that genuinely needs a server (the honest container-on-a-server lesson). Learners
already did `docker build` + ECR by hand in the AWS sessions — S4 *automates that in the pipeline*.

## PINNED — pipeline ↔ board event contract

The one integration point. Keep it stable; slides and the reference workflows depend on it.

- **Identity** = the learner's GitHub username (`${{ github.actor }}`), used as `callsign`.
- **Config** the board needs comes from the learner's `ship.config.json`: `color` (hex **or** a
  named-palette colour; sets the ship's hue — every saturated texel takes that hue; greys/blacks stay
  neutral — and drives the UI accent) and `shipModel` (which of the 4 ships the board renders in
  orbit); `shipName` is a cosmetic label, not identity.
- **Transport:** each workflow stage POSTs one event to the board.

```
POST  $BOARD_URL/api/event
Authorization: Bearer $SHIPIT_TOKEN
Content-Type: application/json

{
  "callsign": "octocat",          // GitHub username
  "stage":    "build",            // pad | build | test | clearance | liftoff
  "status":   "passed",           // running | passed | failed | aborted | shipped
  "color":    "#22d3ee",          // hex or a colour name (e.g. "red"); board normalizes → hex, sets the ship's hue
  "shipModel":"fighter",          // from ship.config.json: fighter · interceptor · hauler · scout
  "version":  "v3",               // optional; image/site tag (for rollback demo)
  "siteUrl":  "https://…"         // optional; the live deployed site to link from orbit
}
```

- `$BOARD_URL` is a **public** repo/environment **variable**.
- `$SHIPIT_TOKEN` is the **secret** taught in CI/CD 3 — a ship with no/late token can't report to
  Mission Control (the "unauthorized" lesson). Do NOT accept unauthenticated events in prod mode.
  The POST-to-board step is *added to the workflow in S3*; before that, the learner's payoff is the
  Actions run + the live Pages URL, not the shared board.
- The board keeps an ephemeral roster and broadcasts it to spectators over WebSocket (arena
  pattern). No persistence required beyond the current cohort's session.

## PINNED — learner-facing contract

Frozen — slides quote these verbatim.

- **Config file** learners edit: `ship.config.json` → `{ shipName, color, shipModel, emblem }`.
  - `shipName` non-empty ≤ 24 chars · `color` hex `/^#[0-9a-fA-F]{6}$/` **or** a named-palette colour
    (`red · orange · amber · yellow · lime · green · emerald · teal · cyan · sky · blue · indigo ·
    violet · purple · fuchsia · pink · rose · white · gray/grey · black`), resolved to hex everywhere
    (recolours the ship — sets its hue to `color`; every saturated texel takes that hue, greys/blacks
    stay neutral — and drives the UI accent) · `shipModel` ∈ `fighter · interceptor · hauler · scout` · `emblem` ∈
    `comet · bolt · star · ring · delta · phoenix`. `callsign` is **not** in config — it's the GitHub
    username, injected via `VITE_CALLSIGN` at build.
  - The ship is one of four low-poly spaceships (Quaternius, CC0), hue-set by `color`; the site and
    board both render whichever `shipModel` the learner picked.
- **The S2 fitness gate** is a config **validation** check (not a unit test): `npm test` →
  `node scripts/preflight.mjs` validates `ship.config.json` and **exits non-zero (ABORT)** on a bad
  config (unparseable, bad hex, unknown emblem, over-long name). Teaches the *exit-code gate* (a
  DevOps skill), not test authoring (a developer skill).
- **Reference workflows** live as the `cicd1..4` **answer-key branches** on `Infratify/shipit-launchpad`
  (each = the full correct state at that session's end); slides lift the `deploy.yml` from them.
- **Per-session commands** (kelas-taip-bersama): fork → author `deploy.yml` step-by-step per session →
  `git push` → watch. Full list in the spec §7.
- **Slides drift note:** the bootcamp slides repo (`~/repo/slides-devops-bootcamp`) quotes the two
  PINNED contracts above verbatim — it is a separate repo and is **not** updated by changes here;
  update it by hand whenever these contracts change.

## PINNED — learner distribution (fork, not template)

- Learners **fork** `Infratify/shipit-launchpad`. Branches: **`main`** = payload only
  (`ship/` + `ship.config.json` + `preflight`, **no workflow, no `board/`**); **`cicd1..4`** = answer
  keys (`board/` enters at `cicd4`).
- **The learner authors the workflow** — `.github/workflows/deploy.yml` is NOT shipped; they write
  it, it grows one job per session. That is the lesson.
- **Discipline rule (load-bearing):** upstream `main` must never gain a workflow or re-touch
  `ship.config.json` after release, so learner **sync-fork** stays conflict-free.

## Conventions

- Node 20, ESM. Fail loud. No CDN (vendor/bundle). Theme-aware. WebGL + reduced-motion fallbacks.
- **One test only: the config-validation pre-flight gate** (`npm test` → `node scripts/preflight.mjs`,
  exit-code = ABORT). Dev-time unit tests use Node's built-in `node --test`. **No `vitest`, no Playwright.**
- Multi-arch (`amd64`/`arm64`) GHCR publish for `shipit-board` on a `v*` tag; image public before class.
- `launchpad` stays beginner-simple; `board` carries the Three.js spectacle.

## Bootcamp integration (context; the arc itself lives in the slides repo)

`~/repo/slides-devops-bootcamp` → `outlines/2026/cicd1..4.md` + `slides/2026/cicd1..4/`. The
`$SHIPIT_TOKEN` is the CI/CD 3 secret; the **S4 deploy has the learner's pipeline build the `board`
image, push it to their GHCR, and deploy it to their own EC2 (from AWS 2) via SSM** — with a
rollback demo (redeploy the previous tag) as stretch. The instructor's shared board runs on
instructor infra.
