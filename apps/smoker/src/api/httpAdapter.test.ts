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

// eslint-disable-next-line import/first
import { createHttpTransport } from './httpAdapter';

describe('httpAdapter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreate.mockReturnValue(mockInstance);
  });

  test('constructs a single axios instance from the provided base URL', () => {
    createHttpTransport('http://localhost:3003');
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate).toHaveBeenCalledWith({ baseURL: 'http://localhost:3003' });
  });

  test('maps an axios success to response data', async () => {
    mockInstance.put.mockResolvedValue({ data: { smokeId: 's1', smoking: true } });
    const transport = createHttpTransport('http://cloud.example');

    const result = await transport.put<{ smokeId: string; smoking: boolean }>(
      'state/toggleSmoking'
    );

    expect(mockInstance.put).toHaveBeenCalledWith('state/toggleSmoking', undefined);
    expect(result).toEqual({ smokeId: 's1', smoking: true });
  });

  test('maps an axios failure to the typed ApiError with status/path/method', async () => {
    mockInstance.get.mockRejectedValue({ response: { status: 503 }, message: 'boom' });
    const transport = createHttpTransport('http://cloud.example');

    const error = (await transport.get('temps').catch(e => e)) as ApiError;

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(503);
    expect(error.path).toBe('temps');
    expect(error.method).toBe('get');
  });
});
