#!/usr/bin/env node
import { chromium, Browser, Page } from 'playwright';
import { mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

interface SmokeOptions {
  frontendUrl: string;
  backendUrl: string;
  deviceServiceUrl?: string;
  artifactDir: string;
  timeoutMs: number;
}

interface CheckResult {
  name: string;
  ok: boolean;
  detail?: string;
  durationMs: number;
}

const ANSI = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  reset: '\x1b[0m',
};

const args = process.argv.slice(2);

function arg(name: string, fallback?: string): string | undefined {
  const idx = args.findIndex(a => a === `--${name}`);
  if (idx >= 0 && idx + 1 < args.length) return args[idx + 1];
  const eq = args.find(a => a.startsWith(`--${name}=`));
  if (eq) return eq.split('=')[1];
  return fallback;
}

const options: SmokeOptions = {
  frontendUrl:
    arg('frontend', process.env.SMOKE_FRONTEND_URL) ?? 'http://localhost:3000',
  backendUrl:
    arg('backend', process.env.SMOKE_BACKEND_URL) ?? 'http://localhost:3001',
  deviceServiceUrl: arg('device', process.env.SMOKE_DEVICE_URL),
  artifactDir:
    arg('artifacts', process.env.SMOKE_ARTIFACT_DIR) ??
    join(process.cwd(), 'smoke-artifacts'),
  timeoutMs: Number(arg('timeout', process.env.SMOKE_TIMEOUT_MS) ?? '30000'),
};

async function probeHealth(url: string): Promise<CheckResult> {
  const start = Date.now();
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), options.timeoutMs);
    const res = await fetch(`${url}/api/health`, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) {
      return {
        name: `health ${url}`,
        ok: false,
        detail: `HTTP ${res.status}`,
        durationMs: Date.now() - start,
      };
    }
    const body = (await res.json()) as { status?: string };
    return {
      name: `health ${url}`,
      ok: body.status === 'ok',
      detail: `status=${body.status}`,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    return {
      name: `health ${url}`,
      ok: false,
      detail: (err as Error).message,
      durationMs: Date.now() - start,
    };
  }
}

async function probeReady(url: string): Promise<CheckResult> {
  const start = Date.now();
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), options.timeoutMs);
    const res = await fetch(`${url}/api/ready`, { signal: ctrl.signal });
    clearTimeout(t);
    return {
      name: `ready ${url}`,
      ok: res.ok,
      detail: `HTTP ${res.status}`,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    return {
      name: `ready ${url}`,
      ok: false,
      detail: (err as Error).message,
      durationMs: Date.now() - start,
    };
  }
}

async function probeFrontend(
  browser: Browser,
  url: string,
  artifactDir: string,
): Promise<CheckResult> {
  const start = Date.now();
  let page: Page | null = null;
  try {
    page = await browser.newPage();
    const response = await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: options.timeoutMs,
    });
    const status = response?.status() ?? 0;
    if (status < 200 || status >= 400) {
      await page.screenshot({ path: join(artifactDir, 'frontend-fail.png') });
      return {
        name: `frontend ${url}`,
        ok: false,
        detail: `HTTP ${status}`,
        durationMs: Date.now() - start,
      };
    }
    await page.screenshot({ path: join(artifactDir, 'frontend-ok.png') });
    const title = await page.title();
    return {
      name: `frontend ${url}`,
      ok: true,
      detail: `title="${title}"`,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    if (page) {
      try {
        await page.screenshot({
          path: join(artifactDir, 'frontend-error.png'),
        });
      } catch {
        /* ignore */
      }
    }
    return {
      name: `frontend ${url}`,
      ok: false,
      detail: (err as Error).message,
      durationMs: Date.now() - start,
    };
  } finally {
    if (page) await page.close();
  }
}

function format(check: CheckResult): string {
  const tag = check.ok
    ? `${ANSI.green}PASS${ANSI.reset}`
    : `${ANSI.red}FAIL${ANSI.reset}`;
  const detail = check.detail ? ` — ${check.detail}` : '';
  return `  [${tag}] ${check.name} (${check.durationMs}ms)${detail}`;
}

async function main(): Promise<number> {
  if (!existsSync(options.artifactDir)) {
    mkdirSync(options.artifactDir, { recursive: true });
  }

  console.log(`${ANSI.yellow}smoke: starting${ANSI.reset}`);
  console.log(`  frontend: ${options.frontendUrl}`);
  console.log(`  backend:  ${options.backendUrl}`);
  if (options.deviceServiceUrl) {
    console.log(`  device:   ${options.deviceServiceUrl}`);
  }
  console.log(`  artifacts: ${options.artifactDir}`);

  const checks: CheckResult[] = [];

  checks.push(await probeHealth(options.backendUrl));
  checks.push(await probeReady(options.backendUrl));
  if (options.deviceServiceUrl) {
    checks.push(await probeHealth(options.deviceServiceUrl));
    checks.push(await probeReady(options.deviceServiceUrl));
  }

  let browser: Browser | null = null;
  try {
    browser = await chromium.launch();
    checks.push(
      await probeFrontend(browser, options.frontendUrl, options.artifactDir),
    );
  } catch (err) {
    checks.push({
      name: `browser launch`,
      ok: false,
      detail: (err as Error).message,
      durationMs: 0,
    });
  } finally {
    if (browser) await browser.close();
  }

  console.log(`\n${ANSI.yellow}smoke: results${ANSI.reset}`);
  for (const c of checks) console.log(format(c));

  const failed = checks.filter(c => !c.ok);
  if (failed.length === 0) {
    console.log(`\n${ANSI.green}smoke: PASS${ANSI.reset} (${checks.length}/${checks.length})`);
    return 0;
  }
  console.log(
    `\n${ANSI.red}smoke: FAIL${ANSI.reset} (${failed.length}/${checks.length} failed)`,
  );
  return 1;
}

main()
  .then(code => process.exit(code))
  .catch(err => {
    console.error(`${ANSI.red}smoke: unexpected error${ANSI.reset}`, err);
    process.exit(2);
  });
