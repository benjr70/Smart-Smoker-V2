import { resolveRendererUrl } from './rendererUrl';

describe('resolveRendererUrl', () => {
  it('uses the renderer URL the launcher exported', () => {
    expect(resolveRendererUrl({ SMOKER_RENDERER_URL: 'http://127.0.0.1:41080' })).toBe(
      'http://127.0.0.1:41080'
    );
  });

  it('falls back to the shipping default when no override is set', () => {
    expect(resolveRendererUrl({})).toBe('http://localhost:8080');
  });

  it('treats an empty or blank override as unset', () => {
    expect(resolveRendererUrl({ SMOKER_RENDERER_URL: '' })).toBe('http://localhost:8080');
    expect(resolveRendererUrl({ SMOKER_RENDERER_URL: '   ' })).toBe('http://localhost:8080');
  });

  it('ignores stray whitespace around a real override', () => {
    expect(resolveRendererUrl({ SMOKER_RENDERER_URL: '  http://box:41080  ' })).toBe(
      'http://box:41080'
    );
  });
});
