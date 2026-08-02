/**
 * The browser side of the uploader — the only impure module in this package.
 *
 * GitHub has no public API for comment attachments: the web UI posts them to a
 * cookie-authenticated endpoint (`/upload/policies/assets`) that a PAT cannot
 * call, which is why `gh` has no such command. The one supported way to get a
 * real `github.com/user-attachments/assets/...` URL is to do what a human does
 * — drop the files into a comment box in a logged-in browser and read the
 * markdown GitHub writes back. That is exactly what this module does, and it
 * never posts the comment.
 *
 * Session: a dedicated PERSISTENT Chrome profile, separate from the harness's
 * per-run throwaway profile (`scripts/verify-pr/chrome-mcp-wrapper.sh` gives
 * every verification round a fresh user-data-dir on purpose, so it can never
 * hold a login). A human runs `login` once on the box; every later `upload`
 * reuses those cookies until they expire.
 */
import { chromium, type BrowserContext, type Page } from 'playwright-core';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { extractAttachmentUrls, uploadsComplete } from './attachment-markdown.ts';

/** Where the logged-in GitHub session lives, unless overridden. */
export function defaultProfileDir(env: NodeJS.ProcessEnv = process.env): string {
  if (env.PR_IMAGES_PROFILE_DIR) return env.PR_IMAGES_PROFILE_DIR;
  const configHome = env.XDG_CONFIG_HOME || join(homedir(), '.config');
  return join(configHome, 'verify-pr', 'github-upload-profile');
}

/** Cookies that only exist for a signed-in github.com session. */
const SESSION_COOKIES = ['user_session', 'dotcom_user'];

export type Logger = (msg: string) => void;

export interface OpenOptions {
  profileDir: string;
  headless: boolean;
  log?: Logger;
}

export async function openProfile({
  profileDir,
  headless,
  log = () => {},
}: OpenOptions): Promise<BrowserContext> {
  if (!headless && !process.env.DISPLAY) {
    throw new Error(
      'headful browser requested with no DISPLAY — run this on the box desktop session'
    );
  }
  log(`opening Chrome profile ${profileDir} (headless=${headless})`);
  return chromium.launchPersistentContext(profileDir, {
    channel: 'chrome',
    headless,
    args: ['--no-first-run', '--no-default-browser-check'],
  });
}

/** True when the profile still holds a usable github.com session. */
export async function isLoggedIn(context: BrowserContext): Promise<boolean> {
  const cookies = await context.cookies('https://github.com');
  return cookies.some(c => SESSION_COOKIES.includes(c.name) && c.value.length > 0);
}

/**
 * Interactive one-time login. Opens github.com/login on the box's desktop and
 * waits for the human to finish (password + 2FA + any device verification),
 * then leaves the cookies in the persistent profile.
 */
export async function waitForLogin(
  context: BrowserContext,
  timeoutMs: number,
  log: Logger = () => {}
): Promise<boolean> {
  const page = await context.newPage();
  await page.goto('https://github.com/login', { waitUntil: 'domcontentloaded' });
  log('sign in to GitHub in the browser window that just opened…');

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isLoggedIn(context)) {
      log('session cookie present — login complete');
      await page.goto('https://github.com', { waitUntil: 'domcontentloaded' });
      return true;
    }
    await page.waitForTimeout(2_000);
  }
  return false;
}

/** Comment-box selectors, most specific first — GitHub's editor markup moves. */
const TEXTAREA_SELECTORS = [
  'textarea[name="comment[body]"]',
  'textarea#new_comment_field',
  'textarea[aria-label*="omment" i]',
  'form textarea',
];

const FILE_INPUT_SELECTORS = [
  'input.manual-file-chooser',
  'input[type="file"][accept*="image" i]',
  'input[type="file"]',
];

async function firstAttached(page: Page, selectors: string[], timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  let lastError = '';
  while (Date.now() < deadline) {
    for (const selector of selectors) {
      const locator = page.locator(selector).last();
      if ((await locator.count()) > 0) return locator;
      lastError = selector;
    }
    await page.waitForTimeout(500);
  }
  throw new Error(`no element matched any of [${selectors.join(', ')}] (last tried ${lastError})`);
}

export interface UploadOptions {
  context: BrowserContext;
  repo: string;
  prNumber: number;
  files: string[];
  timeoutMs: number;
  log?: Logger;
}

export class NotLoggedInError extends Error {}

/**
 * Uploads `files` through the PR's comment box and returns the attachment URLs
 * GitHub wrote back, in input order. The comment box is cleared afterwards, on
 * every exit path — an abandoned draft would show up under the PR as "unsaved
 * comment" for the account that owns the session.
 */
export async function uploadToPr({
  context,
  repo,
  prNumber,
  files,
  timeoutMs,
  log = () => {},
}: UploadOptions): Promise<string[]> {
  if (!(await isLoggedIn(context))) {
    throw new NotLoggedInError(
      'the upload profile has no github.com session — run `npm run login` in scripts/pr-images on the box desktop'
    );
  }

  const page = await context.newPage();
  const url = `https://github.com/${repo}/pull/${prNumber}`;
  log(`opening ${url}`);
  await page.goto(url, { waitUntil: 'domcontentloaded' });

  // A logged-out session silently redirects to the sign-in page for private
  // repos and hides the comment box on public ones — treat both as expired.
  if (page.url().includes('/login')) {
    throw new NotLoggedInError('github.com redirected to the sign-in page');
  }

  const textarea = await firstAttached(page, TEXTAREA_SELECTORS, 30_000);
  const fileInput = await firstAttached(page, FILE_INPUT_SELECTORS, 30_000);

  try {
    log(`attaching ${files.length} file(s) to the comment box`);
    await fileInput.setInputFiles(files);

    const deadline = Date.now() + timeoutMs;
    let markdown = '';
    while (Date.now() < deadline) {
      markdown = await textarea.inputValue();
      if (uploadsComplete(markdown, files.length)) break;
      await page.waitForTimeout(1_000);
    }

    const urls = extractAttachmentUrls(markdown);
    log(`GitHub returned ${urls.length}/${files.length} attachment URL(s)`);
    return urls;
  } finally {
    // Clear the draft whatever happened, then close the page.
    try {
      await textarea.fill('');
    } catch {
      /* the box may be gone if the page navigated — nothing to clear */
    }
    await page.close();
  }
}
