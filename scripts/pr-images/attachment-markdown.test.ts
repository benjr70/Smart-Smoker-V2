/**
 * Unit tests for the pure attachment helpers. These decide which URL ends up
 * under which caption in a human's PR description, so an off-by-one here mislabels
 * the evidence rather than crashing — hence the positional-pairing tests.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractAttachmentUrls,
  uploadsComplete,
  captionFromFilename,
  pairShots,
  formatShots,
} from './attachment-markdown.ts';

describe('extractAttachmentUrls', () => {
  it('reads the image markdown GitHub writes back', () => {
    const markdown =
      '![frontend-01-settings](https://github.com/user-attachments/assets/aaa-111)\n';
    assert.deepEqual(extractAttachmentUrls(markdown), [
      'https://github.com/user-attachments/assets/aaa-111',
    ]);
  });

  it('keeps document order across several uploads', () => {
    const markdown = [
      '![one](https://github.com/user-attachments/assets/aaa)',
      '![two](https://github.com/user-attachments/assets/bbb)',
      '![three](https://github.com/user-attachments/assets/ccc)',
    ].join('\n');
    assert.deepEqual(extractAttachmentUrls(markdown), [
      'https://github.com/user-attachments/assets/aaa',
      'https://github.com/user-attachments/assets/bbb',
      'https://github.com/user-attachments/assets/ccc',
    ]);
  });

  it('handles the raw <img> shape and dedupes repeats', () => {
    const markdown =
      '<img width="600" src="https://github.com/user-attachments/assets/aaa" />\n' +
      '![again](https://github.com/user-attachments/assets/aaa)';
    assert.deepEqual(extractAttachmentUrls(markdown), [
      'https://github.com/user-attachments/assets/aaa',
    ]);
  });

  it('ignores unrelated links and pre-upload placeholder text', () => {
    const markdown =
      'see https://github.com/benjr70/Smart-Smoker-V2/pull/440 and ![Uploading shot.png…]()';
    assert.deepEqual(extractAttachmentUrls(markdown), []);
  });

  it('does not swallow the closing paren or quote', () => {
    const markdown = '![x](https://github.com/user-attachments/assets/aaa)';
    assert.deepEqual(extractAttachmentUrls(markdown), [
      'https://github.com/user-attachments/assets/aaa',
    ]);
  });
});

describe('uploadsComplete', () => {
  it('is false while GitHub is still uploading', () => {
    const inFlight =
      '![one](https://github.com/user-attachments/assets/aaa)\n![Uploading two.png…]()';
    assert.equal(uploadsComplete(inFlight, 2), false);
  });

  it('is true once every file has a URL', () => {
    const done =
      '![one](https://github.com/user-attachments/assets/aaa)\n![two](https://github.com/user-attachments/assets/bbb)';
    assert.equal(uploadsComplete(done, 2), true);
  });
});

describe('captionFromFilename', () => {
  it('strips path, extension, surface prefix and ordering digits', () => {
    assert.equal(
      captionFromFilename('/tmp/verify-pr/440/frontend-02-settings-page.png'),
      'Settings page'
    );
  });

  it('marks smoker shots so a reviewer knows which app they are looking at', () => {
    assert.equal(captionFromFilename('smoker-01-smoke-screen.png'), 'Smoke screen (smoker app)');
  });

  it('falls back to the stem when there is no slug', () => {
    assert.equal(captionFromFilename('shot.png'), 'Shot');
  });

  it('handles underscores and mixed separators', () => {
    assert.equal(captionFromFilename('frontend_03_review_card.png'), 'Review card');
  });
});

describe('pairShots', () => {
  it('pairs positionally and reports nothing missing on a clean run', () => {
    const { shots, missing } = pairShots(
      ['frontend-01-a-screen.png', 'smoker-02-b-screen.png'],
      [
        'https://github.com/user-attachments/assets/aaa',
        'https://github.com/user-attachments/assets/bbb',
      ]
    );
    assert.equal(missing, 0);
    assert.deepEqual(shots, [
      {
        caption: 'A screen',
        url: 'https://github.com/user-attachments/assets/aaa',
      },
      {
        caption: 'B screen (smoker app)',
        url: 'https://github.com/user-attachments/assets/bbb',
      },
    ]);
  });

  it('reports a short upload instead of mislabelling the rest', () => {
    const { shots, missing } = pairShots(
      ['a-one.png', 'b-two.png', 'c-three.png'],
      ['https://github.com/user-attachments/assets/aaa']
    );
    assert.equal(missing, 2);
    assert.equal(shots.length, 1);
    assert.equal(shots[0].caption, 'A one');
  });
});

describe('formatShots', () => {
  it('emits the caption<TAB>url contract the injector reads', () => {
    const out = formatShots([
      { caption: 'Settings page', url: 'https://github.com/user-attachments/assets/aaa' },
      { caption: 'Smoke screen', url: 'https://github.com/user-attachments/assets/bbb' },
    ]);
    assert.equal(
      out,
      'Settings page\thttps://github.com/user-attachments/assets/aaa\n' +
        'Smoke screen\thttps://github.com/user-attachments/assets/bbb'
    );
  });

  it('never emits a caption containing a tab', () => {
    const out = formatShots([
      { caption: 'a\tb', url: 'https://github.com/user-attachments/assets/aaa' },
    ]);
    assert.equal(out.split('\t').length, 2);
  });
});
