import { STATIC_CORS_ORIGINS, resolveCorsOrigins } from './cors-origins';

describe('resolveCorsOrigins', () => {
  it('allowlists exactly the known deployment origins when nothing extra is configured', () => {
    expect(resolveCorsOrigins({})).toEqual([...STATIC_CORS_ORIGINS]);
  });

  it('treats an empty CORS_EXTRA_ORIGINS as nothing extra', () => {
    expect(resolveCorsOrigins({ CORS_EXTRA_ORIGINS: '' })).toEqual([
      ...STATIC_CORS_ORIGINS,
    ]);
  });

  it('keeps the production and dev cloud origins allowlisted', () => {
    const origins = resolveCorsOrigins({});

    expect(origins).toContain('https://smokecloud.tail74646.ts.net');
    expect(origins).toContain(
      'https://smart-smoker-dev-cloud.tail74646.ts.net',
    );
    expect(origins).toContain('http://localhost:8080');
    expect(origins).toContain('http://localhost:3000');
  });

  it('appends an extra origin so a hermetic per-PR UI can call the API', () => {
    const origins = resolveCorsOrigins({
      CORS_EXTRA_ORIGINS: 'http://localhost:20013',
    });

    expect(origins).toContain('http://localhost:20013');
    expect(origins).toEqual([...STATIC_CORS_ORIGINS, 'http://localhost:20013']);
  });

  it('accepts a comma-separated list, ignoring whitespace and empty entries', () => {
    const origins = resolveCorsOrigins({
      CORS_EXTRA_ORIGINS: 'http://localhost:20013, http://localhost:20010,,  ',
    });

    expect(origins).toEqual([
      ...STATIC_CORS_ORIGINS,
      'http://localhost:20013',
      'http://localhost:20010',
    ]);
  });

  it('never lists an origin twice', () => {
    const origins = resolveCorsOrigins({
      CORS_EXTRA_ORIGINS:
        'http://localhost:3000,http://localhost:20013,http://localhost:20013',
    });

    expect(origins).toEqual([...STATIC_CORS_ORIGINS, 'http://localhost:20013']);
    expect(new Set(origins).size).toBe(origins.length);
  });
});
