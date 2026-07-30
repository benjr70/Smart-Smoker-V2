/**
 * Base-URL wiring of the production client: which origin the transport is bound
 * to. Reading the cloud URL out of the environment belongs to the client (the
 * app-specific edge), not to the shared transport adapter, so this pins that the
 * client hands the baked-in URL to the shared factory. The transport itself is
 * mocked at the package boundary so the assertion is about URLs, not HTTP.
 */
import { createHttpTransport } from 'api-transport/src';
import { createProductionApiClient } from './client';

jest.mock('api-transport/src', () => ({
  createHttpTransport: jest.fn(),
}));

jest.mock('./socketEventAdapter', () => ({
  createSocketEventPort: jest.fn(() => ({ subscribe: jest.fn() })),
}));

const mockCreateHttpTransport = createHttpTransport as jest.Mock;

describe('createProductionApiClient — transport base URL', () => {
  const originalCloudUrl = process.env.REACT_APP_CLOUD_URL;

  beforeEach(() => {
    mockCreateHttpTransport.mockReset();
    mockCreateHttpTransport.mockReturnValue({
      get: jest.fn(),
      post: jest.fn(),
      put: jest.fn(),
      delete: jest.fn(),
    });
  });

  afterEach(() => {
    if (originalCloudUrl === undefined) {
      delete process.env.REACT_APP_CLOUD_URL;
    } else {
      process.env.REACT_APP_CLOUD_URL = originalCloudUrl;
    }
  });

  it('binds the transport to the cloud URL baked into the bundle', () => {
    process.env.REACT_APP_CLOUD_URL = 'http://localhost:20011/api/';

    createProductionApiClient();

    expect(mockCreateHttpTransport).toHaveBeenCalledWith(
      'http://localhost:20011/api/',
      expect.anything()
    );
  });

  it('binds the transport to no base URL when none was baked in (same-origin)', () => {
    delete process.env.REACT_APP_CLOUD_URL;

    createProductionApiClient();

    expect(mockCreateHttpTransport).toHaveBeenCalledWith(undefined, expect.anything());
  });

  it('opts the transport into mapping an empty-body 200 to null', () => {
    // The frontend treats "no current resource" as `null` everywhere (hooks and
    // components branch on it), so the empty body a NestJS `null` return
    // produces must never surface as `''`.
    createProductionApiClient();

    expect(mockCreateHttpTransport.mock.calls[0][1]).toEqual({ emptyBodyAsNull: true });
  });
});
