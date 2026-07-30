import { ApiError } from './transport';

describe('ApiError', () => {
  test('describes the failed call in its default message', () => {
    const error = new ApiError({ status: 503, path: 'temps/abc', method: 'delete' });

    expect(error.message).toBe('API DELETE temps/abc failed (status 503)');
  });

  test('omits the status when the failure never reached the server', () => {
    const error = new ApiError({ status: undefined, path: 'temps', method: 'get' });

    expect(error.message).toBe('API GET temps failed');
  });
});
