/**
 * The package's public entry point is the identity boundary: every app imports
 * ApiError from here, so an error raised anywhere in the shared primitives (or
 * in either app's client) satisfies `instanceof ApiError` in shared helpers.
 */
import { ApiError, createFakeBackendKernel, NO_ROUTE } from './index';
import { ApiError as ApiErrorFromModule } from './transport';

describe('api-transport entry point', () => {
  test('exposes one ApiError identity for errors raised inside the package', async () => {
    const backend = createFakeBackendKernel({ store: {}, route: () => NO_ROUTE });

    const error = await backend.get('anything').catch(e => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toBeInstanceOf(ApiErrorFromModule);
    expect(error).toBeInstanceOf(Error);
  });
});
