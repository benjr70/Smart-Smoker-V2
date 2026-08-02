/**
 * Pure helpers for the GitHub attachment flow.
 *
 * When you drop files into a GitHub comment box, GitHub uploads them and writes
 * markdown back into the textarea, one image per file, in the order the files
 * were handed over. The uploader never posts that comment — it reads the URLs
 * back out of the textarea and clears it. Everything about reading those URLs
 * and turning them into a caption list for the PR body is pure, so it lives
 * here with tests; only the browser driving lives in github-upload.ts.
 */

/** GitHub's CDN host for comment attachments since 2023. */
const ATTACHMENT_RE = /https:\/\/github\.com\/user-attachments\/assets\/[A-Za-z0-9._-]+/g;

/**
 * Every attachment URL in the textarea's markdown, in document order, deduped.
 * Matches all three shapes GitHub writes: `![alt](url)` for images,
 * `[name](url)` for other files, and a raw `<img src="url">`.
 */
export function extractAttachmentUrls(markdown: string): string[] {
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const match of markdown.matchAll(ATTACHMENT_RE)) {
    // Trailing `)` / `"` are excluded by the character class already.
    const url = match[0];
    if (!seen.has(url)) {
      seen.add(url);
      urls.push(url);
    }
  }
  return urls;
}

/** True once the textarea holds at least `expected` distinct attachment URLs. */
export function uploadsComplete(markdown: string, expected: number): boolean {
  return extractAttachmentUrls(markdown).length >= expected;
}

/**
 * A human caption from a screenshot filename.
 *
 * The harness names its tour shots `<surface>-NN-<slug>.png`
 * (`frontend-02-settings-page.png`), so strip the directory, the extension, the
 * ordering digits and the separators, then sentence-case what's left. A name
 * that carries no slug falls back to the bare stem so a caption is never empty.
 */
export function captionFromFilename(filePath: string): string {
  const base = filePath.split('/').pop() ?? filePath;
  const stem = base.replace(/\.[A-Za-z0-9]+$/, '');

  const surfaceMatch = /^(frontend|smoker)[-_]/i.exec(stem);
  const surface = surfaceMatch ? surfaceMatch[1].toLowerCase() : undefined;

  let slug = stem;
  if (surface) slug = slug.slice(surfaceMatch![0].length);
  slug = slug.replace(/^\d+[-_]?/, '');
  slug = slug.replace(/[-_]+/g, ' ').trim();

  if (slug.length === 0) slug = stem.replace(/[-_]+/g, ' ').trim();

  const sentence = slug.charAt(0).toUpperCase() + slug.slice(1);
  return surface === 'smoker' ? `${sentence} (smoker app)` : sentence;
}

export interface CaptionedShot {
  caption: string;
  url: string;
}

/**
 * Pair the uploaded files with the URLs GitHub handed back, positionally.
 *
 * GitHub preserves input order, but a partial upload (one file rejected for
 * size/type) would silently shift every later caption onto the wrong image — so
 * a count mismatch is reported rather than zipped over.
 */
export function pairShots(
  files: string[],
  urls: string[]
): { shots: CaptionedShot[]; missing: number } {
  const count = Math.min(files.length, urls.length);
  const shots: CaptionedShot[] = [];
  for (let i = 0; i < count; i++) {
    shots.push({ caption: captionFromFilename(files[i]), url: urls[i] });
  }
  return { shots, missing: files.length - count };
}

/**
 * The `caption<TAB>url` stdout contract consumed by
 * `scripts/verify-pr/inject-screenshots.sh`. A tab in a caption would break
 * that contract, so tabs collapse to spaces.
 */
export function formatShots(shots: CaptionedShot[]): string {
  return shots.map(({ caption, url }) => `${caption.replace(/\t/g, ' ')}\t${url}`).join('\n');
}
