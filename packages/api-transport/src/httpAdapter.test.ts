/**
 * axios is the system boundary here, so it is the one thing mocked: every
 * assertion is about how the adapter drives it and how it shapes what comes
 * back. The mocked module's `create` delegates lazily to `mockCreate` so the
 * factory (hoisted above these declarations) never reads it too early.
 */
import { createHttpTransport } from './httpAdapter';
import { ApiError } from './transport';

const mockInstance = {
  get: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
  delete: jest.fn(),
};
const mockCreate = jest.fn();

jest.mock('axios', () => ({
  __esModule: true,
  default: { create: (...args: unknown[]) => mockCreate(...args) },
  create: (...args: unknown[]) => mockCreate(...args),
}));

describe('httpAdapter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreate.mockReturnValue(mockInstance);
  });

  test('constructs a single axios instance from the provided base URL', () => {
    createHttpTransport('https://api.example.com/');

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate).toHaveBeenCalledWith({ baseURL: 'https://api.example.com/' });
  });

  test('maps an axios success to the response data for a body-less method', async () => {
    mockInstance.get.mockResolvedValue({ data: [{ ChamberTemp: 225 }] });
    const transport = createHttpTransport('https://api.example.com/');

    const result = await transport.get<Array<{ ChamberTemp: number }>>('temps');

    expect(mockInstance.get).toHaveBeenCalledWith('temps');
    expect(result).toEqual([{ ChamberTemp: 225 }]);
  });

  test('sends the body on a body-carrying method', async () => {
    mockInstance.post.mockResolvedValue({ data: { success: true } });
    const transport = createHttpTransport('https://api.example.com/');

    await transport.post('temps/batch', [{ ChamberTemp: 225 }]);

    expect(mockInstance.post).toHaveBeenCalledWith('temps/batch', [{ ChamberTemp: 225 }]);
  });

  test('passes an empty-body 200 through untouched by default', async () => {
    // NestJS serializes a handler returning null/undefined as an EMPTY body,
    // which axios surfaces as `''`. Rewriting that is a policy an app opts into:
    // callers that dereference the result unguarded (`state.smoking`) rely on
    // `''` staying a string, because `null.smoking` throws. So the default is a
    // faithful passthrough of what axios gave us.
    mockInstance.get.mockResolvedValue({ data: '' });
    const transport = createHttpTransport('https://api.example.com/');

    const result = await transport.get('state');

    expect(result).toBe('');
  });

  test('maps an empty-body 200 to null when the app opts in', async () => {
    // An app whose callers treat "no current resource" as `null` (the frontend)
    // opts in, so an empty body never reaches component state as a
    // truthy-shaped empty string.
    mockInstance.get.mockResolvedValue({ data: '' });
    const transport = createHttpTransport('https://api.example.com/', {
      emptyBodyAsNull: true,
    });

    const result = await transport.get('presmoke/');

    expect(result).toBeNull();
  });

  test('leaves a non-empty body alone when the mapping is enabled', async () => {
    mockInstance.get.mockResolvedValue({ data: { smokeId: 's1', smoking: false } });
    const transport = createHttpTransport('https://api.example.com/', {
      emptyBodyAsNull: true,
    });

    await expect(transport.get('state')).resolves.toEqual({ smokeId: 's1', smoking: false });
  });

  test('maps an axios failure to the typed ApiError with status/path/method', async () => {
    mockInstance.delete.mockRejectedValue({ response: { status: 503 }, message: 'boom' });
    const transport = createHttpTransport('https://api.example.com/');

    const error = (await transport.delete('temps/abc').catch(e => e)) as ApiError;

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(503);
    expect(error.path).toBe('temps/abc');
    expect(error.method).toBe('delete');
    expect(error.message).toBe('boom');
  });

  test('maps a failure with no response (network down) to a status-less ApiError', async () => {
    mockInstance.get.mockRejectedValue(new Error('Network Error'));
    const transport = createHttpTransport(undefined);

    const error = (await transport.get('state').catch(e => e)) as ApiError;

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBeUndefined();
    expect(error.cause).toBeInstanceOf(Error);
  });
});
