# pr-images — screenshots into a PR description

Uploads local PNGs to GitHub's attachment CDN and prints their URLs, so
`/verify-pr` can post a **UI screenshot tour** into the description of any PR
that changes UI.

## Why a browser and not `gh`

GitHub has **no public API for comment attachments**. Dropping an image into a
comment box posts it to `/upload/policies/assets`, which is authenticated by
**browser session cookies** — a PAT cannot call it, and `gh` declined to add the
feature for exactly that reason ([cli/cli#1895][gh-issue]). Every tool that
produces a real `github.com/user-attachments/assets/...` URL drives a logged-in
browser. So does this one: it opens the PR, drops the files into the comment
box, reads the markdown GitHub writes back, clears the box, and **never posts
the comment**.

[gh-issue]: https://github.com/cli/cli/issues/1895

The alternatives were rejected deliberately: release assets and an orphan
`pr-screenshots` branch both work with a plain token, but neither produces the
native attachment URLs, and both leave repo litter (a release tag or committed
binaries) that outlives the PR.

## The session profile

The harness's own Chrome (`scripts/verify-pr/chrome-mcp-wrapper.sh`) gets a
**fresh throwaway user-data-dir every run**, on purpose — it must never carry
state between verification rounds. So the uploader keeps a **separate persistent
profile** that holds one thing: a GitHub login.

```
${XDG_CONFIG_HOME:-~/.config}/verify-pr/github-upload-profile
```

Override with `PR_IMAGES_PROFILE_DIR` or `--profile <dir>`.

**One-time setup, on the box's desktop session** (needs `DISPLAY`):

```bash
cd scripts/pr-images
npm install --legacy-peer-deps
npm run login          # a real Chrome window opens; sign in, 2FA included
```

The session belongs to whichever account signs in — attachments and the PR-body
edit are attributed to it. Use the same bot/human account the daemon's `gh` is
authenticated as.

## Commands

```bash
tsx cli.ts login                          # interactive, headful, 10-minute budget
tsx cli.ts status                         # is the stored session still valid?
tsx cli.ts upload --pr 440 a.png b.png    # → caption<TAB>url lines on stdout
```

`upload` flags: `--repo owner/name` (default `benjr70/Smart-Smoker-V2`),
`--profile <dir>`, `--timeout <ms>` (default 120000), `--headful` (debugging —
uploads run headless).

Stdout is the machine contract consumed by
`scripts/verify-pr/inject-screenshots.sh`; all progress goes to stderr.

```
Settings page	https://github.com/user-attachments/assets/aaa-111
Smoke screen (smoker app)	https://github.com/user-attachments/assets/bbb-222
```

Captions come from the filenames, so the harness names its shots
`<surface>-NN-<slug>.png` — `frontend-02-settings-page.png` becomes "Settings
page", and a `smoker-` prefix is labelled "(smoker app)".

## Exit codes

| Code | Meaning                                                           |
| ---- | ----------------------------------------------------------------- |
| 0    | done — URLs on stdout                                             |
| 2    | usage error                                                       |
| 3    | precondition missing (headful browser with no desktop session)    |
| 4    | **no GitHub session / it expired** — run `login` again on the box |
| 5    | GitHub returned fewer URLs than files                             |

Exit 4 is the one to watch: cookies expire, and when they do the daemon keeps
verifying PRs normally but silently stops posting screenshots. `/verify-pr`
turns a 4 into a visible line in its round evidence comment
(`screenshots: SKIPPED — GitHub upload session expired`) rather than failing the
round, because a missing screenshot is not a verification failure.

## Layout

| File                     | What                                                      |
| ------------------------ | --------------------------------------------------------- |
| `cli.ts`                 | wiring + exit-code routing                                |
| `cli-args.ts`            | argument parsing (pure, tested)                           |
| `attachment-markdown.ts` | URL extraction, captions, pairing (pure, tested)          |
| `github-upload.ts`       | the browser: profile, session check, the comment-box flow |

```bash
npm test        # tsx --test *.test.ts
npm run typecheck
```

The browser module is the thin imperative shell — its selectors are a fallback
list because GitHub's editor markup moves. If uploads start failing with "no
element matched", the selector list in `github-upload.ts` is the place to look.
