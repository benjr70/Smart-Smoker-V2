# Security Policy

## Supported versions

This project is maintained as a personal showcase project. Only the latest
release on the `master` branch receives fixes; older tags are not patched.

## Reporting a vulnerability

**Please do not open a public issue for a security problem.**

Report it through GitHub's private vulnerability reporting instead:

1. Go to the repository's **Security** tab.
2. Choose **Report a vulnerability**.
3. Describe the issue, the affected component (backend, device service,
   frontend, smoker app, or infrastructure), and how to reproduce it.

That channel is private between you and the maintainer, and it is the only
supported way to make a report — there is no security e-mail address.

## What to expect

This is a spare-time project, so a first response may take a few days. When a
report is confirmed, the fix ships in a normal release and the advisory is
published from the same Security tab. Please give the maintainer a reasonable
chance to release a fix before disclosing publicly.

## Deployment note

The infrastructure under `infra/` describes the maintainer's own reference
deployment (see [infra/README.md](infra/README.md)). If you self-host, you are
responsible for your own secrets, network exposure and VAPID keys; the committed
configuration is illustrative, not a hardened production baseline.
