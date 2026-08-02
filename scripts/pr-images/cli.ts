#!/usr/bin/env node
/**
 * pr-images CLI — put local screenshots on GitHub's attachment CDN so the
 * verify-pr harness can embed them in a PR description.
 *
 *   tsx cli.ts login                      # one-time, headful, on the box desktop
 *   tsx cli.ts status                     # is the stored session still good?
 *   tsx cli.ts upload --pr 440 a.png b.png
 *
 * `upload` prints one `caption<TAB>url` line per image on stdout — the exact
 * contract `scripts/verify-pr/inject-screenshots.sh` reads. Progress goes to
 * stderr so stdout stays machine-parseable (same split as stack-runner).
 *
 * Exit codes are the harness's routing table:
 *   0  done (URLs on stdout)
 *   2  usage error
 *   3  precondition missing (headful browser with no desktop session)
 *   4  no GitHub session in the profile / it expired — run `login` again
 *   5  the upload did not return a URL for every file
 */
import { parseArgs } from './cli-args.ts';
import {
  defaultProfileDir,
  openProfile,
  isLoggedIn,
  waitForLogin,
  uploadToPr,
  NotLoggedInError,
} from './github-upload.ts';
import { pairShots, formatShots } from './attachment-markdown.ts';

const log = (msg: string): void => {
  process.stderr.write(`[pr-images] ${msg}\n`);
};

const EXIT_USAGE = 2;
const EXIT_PRECONDITION = 3;
const EXIT_LOGGED_OUT = 4;
const EXIT_UPLOAD_INCOMPLETE = 5;

/** Login is interactive: give the human 10 minutes for password + 2FA. */
const LOGIN_TIMEOUT_MS = 600_000;

async function main(argv: string[]): Promise<number> {
  let args;
  try {
    args = parseArgs(argv);
  } catch (err) {
    log((err as Error).message);
    return EXIT_USAGE;
  }

  const profileDir = args.profileDir ?? defaultProfileDir();
  // Login must be visible; the others run headless unless asked otherwise.
  const headless = args.command === 'login' ? false : !args.headful;

  let context;
  try {
    context = await openProfile({ profileDir, headless, log });
  } catch (err) {
    log((err as Error).message);
    return EXIT_PRECONDITION;
  }

  try {
    switch (args.command) {
      case 'login': {
        const ok = await waitForLogin(context, LOGIN_TIMEOUT_MS, log);
        if (!ok) {
          log('timed out waiting for sign-in');
          return EXIT_LOGGED_OUT;
        }
        process.stdout.write(`github-session: logged-in (profile ${profileDir})\n`);
        return 0;
      }

      case 'status': {
        const ok = await isLoggedIn(context);
        process.stdout.write(
          `github-session: ${ok ? 'logged-in' : 'logged-out'} (profile ${profileDir})\n`
        );
        return ok ? 0 : EXIT_LOGGED_OUT;
      }

      case 'upload': {
        const urls = await uploadToPr({
          context,
          repo: args.repo,
          prNumber: args.prNumber!,
          files: args.files,
          timeoutMs: args.timeoutMs,
          log,
        });

        const { shots, missing } = pairShots(args.files, urls);
        if (shots.length > 0) {
          process.stdout.write(formatShots(shots) + '\n');
        }
        if (missing > 0) {
          log(`${missing} file(s) got no attachment URL — reporting incomplete`);
          return EXIT_UPLOAD_INCOMPLETE;
        }
        return 0;
      }
    }
  } catch (err) {
    if (err instanceof NotLoggedInError) {
      log(err.message);
      return EXIT_LOGGED_OUT;
    }
    log(`upload failed: ${(err as Error).message}`);
    return EXIT_UPLOAD_INCOMPLETE;
  } finally {
    await context.close();
  }

  return 0;
}

main(process.argv.slice(2)).then(
  code => process.exit(code),
  err => {
    log(`unexpected: ${err instanceof Error ? err.stack : String(err)}`);
    process.exit(1);
  }
);
