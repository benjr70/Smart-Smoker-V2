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
    createHttpTransport('https://api.example.com/');
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate).toHaveBeenCalledWith({ baseURL: 'https://api.example.com/' });
  });

  test('maps an axios success to response data', async () => {
    mockInstance.get.mockResolvedValue({ data: [{ ChamberTemp: 225 }] });
    const transport = createHttpTransport('https://api.example.com/');

    const result = await transport.get<Array<{ ChamberTemp: number }>>('temps');

    expect(mockInstance.get).toHaveBeenCalledWith('temps');
    expect(result).toEqual([{ ChamberTemp: 225 }]);
  });

  test('maps an axios failure to the typed ApiError with status/path/method', async () => {
    mockInstance.delete.mockRejectedValue({ response: { status: 503 }, message: 'boom' });
    const transport = createHttpTransport('https://api.example.com/');

    const error = (await transport.delete('temps/abc').catch(e => e)) as ApiError;

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(503);
    expect(error.path).toBe('temps/abc');
    expect(error.method).toBe('delete');
  });
});
