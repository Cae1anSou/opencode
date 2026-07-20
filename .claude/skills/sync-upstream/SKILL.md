---
name: sync-upstream
description: Sync this Scholar CLI fork with its upstream (sst/opencode). Use whenever the user asks to sync/merge/pull/update from upstream, mentions "upstream", "sst/opencode", or wants the fork brought up to date — even if they just say "sync git" or "update from opencode" without naming this skill. This is specific to the Scholar CLI fork repo (github.com/Cae1anSou/scholar-cli) and assumes its known, documented conflict patterns (README.md, 15 pruned upstream packages, five custom-orchestration insertion points) — do not use this for generic git merge tasks in other repos.
tools: Bash, Read, Edit, Grep
---

# Sync with upstream (sst/opencode)

This fork deliberately diverged from upstream in two ways that make every sync produce the same, predictable conflicts: the root `README.md` was replaced with Scholar CLI's own content (see `docs/specs/UPSTREAM_SYNC_AND_RELEASE.md`, "仓库合并记录"), and 15 upstream packages irrelevant to the CLI were physically deleted (see `docs/adr/ADR-019-prune-unused-upstream-packages.md`). Because the conflicts are known in advance, most of the sync is mechanical and already automated in `script/sync-upstream.ts`. Your job is to run that script, then do the parts it can't: resolve any conflict outside its known patterns using documented intent (not guesswork), verify the result actually works, and get explicit sign-off before pushing.

Before doing anything, confirm you're in the right repo — `git remote get-url origin` should point at `Cae1anSou/scholar-cli` (or `Cae1anSou/opencode`, the pre-rename name, if not yet updated locally). If it doesn't, stop and tell the user this skill doesn't apply here.

## Step 1: Run the automated part

```sh
bun run sync-upstream
```

This fetches `upstream`, merges `upstream/dev`, and handles the two known conflict categories itself: `README.md` (always resolved to keep this fork's version) and anything under the 15 pruned package paths (`packages/app`, `desktop`, `web`, `console`, `stats`, `enterprise`, `slack`, `storybook`, `session-ui`, `identity`, `client`, `function`, `httpapi-codegen`, `sdk-next`, `containers`, plus `infra/`, `sst.config.ts`, `sst-env.d.ts`) — both actual merge conflicts there and the sneakier case where upstream adds a brand-new file under one of those paths, which doesn't trigger a git conflict at all and would otherwise resurrect silently. If nothing else goes wrong, the script also runs `bun install`, `bun run typecheck`, the `packages/scholar` test suite, and the host regression suite (`test/agent`, `test/session`, `test/tool`), and finishes by printing a reminder of what's left for you.

If the script's output ends with a green checkmark and no list of files, skip to Step 3 — there was nothing for you to resolve by hand.

## Step 2: Resolve what the script left for you

The script only stops for conflicts outside its two known patterns. In practice that almost always means one or more of the five places where our custom orchestration layer is spliced into upstream files — this repo makes very few edits to upstream code, so the odds of a stray, undocumented conflict are low, but treat it as a real possibility, not a sure thing.

Read `docs/specs/UPSTREAM_SYNC_AND_RELEASE.md`'s "合并面清单" (merge-surface checklist) section before touching any conflicted file — it names each insertion point and *why* it exists, which matters more than the diff itself for getting the resolution right:

- `packages/opencode/src/tool/registry.ts` — four paired insertion sites for registering the Scholar tools (an import line, a `yield*` init line, an `Effect.all` key/value entry, a builtin-array entry), all identifiable by scholar tool names in the code.
- `packages/opencode/src/session/prompt.ts` — two sites: the import, and where `ScholarContext.system()` gets folded into the system-prompt assembly (an `Effect.all` entry plus a spread in the resulting array).
- `packages/opencode/src/agent/agent.ts` — two sites: the prompt-file imports, and where the `reader`/`writer`/`checker`/`synthesizer` subagent definitions sit inside the `agents` record.
- `packages/opencode/package.json` — one `devDependencies` line.

The reasoning that should guide every resolution here: **keep both sides' intent, don't pick one wholesale.** If upstream refactored the file around where an insertion point used to live (say, moved where the system prompt gets assembled), don't just take "ours" or "theirs" — find the new location that serves the same purpose (the checklist entry above explains what each site is *for*, not just where it used to be) and re-insert our piece there. If a conflict doesn't match anything in the checklist at all, read the diff carefully, understand what upstream actually changed, and reconcile it the same way you would for any merge conflict in a codebase you're newly acquainted with — the checklist is a map of the known cases, not an exhaustive list of every possible conflict.

After resolving and `git add`-ing the affected files, re-run `bun run sync-upstream` — the script detects the completed merge and continues from validation (install/typecheck/tests) rather than trying to merge again.

## Step 3: Manual smoke test

The automated tests confirm nothing broke; they don't confirm the product still does its job. Dispatch a real search-and-read: search for a real paper (e.g. via `scholar_search`), download it, and dispatch the `reader` subagent on it. Confirm it produces a reading note under `.research/notes/`. This is the cheapest way to catch a regression in the actual orchestration path (tool registration, subagent definitions, context injection) that a passing test suite could still miss.

## Step 4: Record the result

Append a new dated entry to the "回归基线" (regression baseline) section at the bottom of `docs/specs/UPSTREAM_SYNC_AND_RELEASE.md`, following the format of the existing entries: date, what was tested, pass/fail counts, and anything noteworthy (a flaky test, a conflict that didn't fit the checklist and how you resolved it, an upstream change that shifted an insertion point). This log is what makes the next sync faster — if an insertion point moves, the next person doing this should be able to tell from this log rather than rediscovering it from scratch.

## Step 5: Confirm before pushing

Do not push. Show the user a summary of what synced (upstream commit range, whether any manual conflict resolution was needed and what it was, test results) and ask whether to push. A past push is not standing approval for this one — ask every time. Only run `git push origin dev` after they say yes.
