## What this changes

<!-- One or two sentences. What is different after this merges? -->

## Why

<!-- Link the issue if there is one: "Closes #12". If there isn't, say what
     prompted the change. -->

## How it was verified

<!-- Not "CI passes" — CI runs on every PR. What did you actually exercise?
     Which asset, which date range, which chart. If you touched research/,
     which test now fails without your change. -->

- [ ] `bun run check` and `bunx tsc --noEmit` clean
- [ ] `bun run build` succeeds
- [ ] `pytest research -q` passes (only if you touched `research/`)
- [ ] Loaded the page and looked at it

## Anything reviewers should push back on

<!-- Shortcuts you took, assumptions you made, parts you are unsure about.
     Saying so here is faster than having it found in review. Delete if none. -->
