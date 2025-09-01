import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

// Mock NestFactory
jest.mock('@nestjs/core', () => ({
  NestFactory: {
    create: jest.fn(),
  },
}));

describe('Bootstrap', () => {
  let mockApp: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockApp = {
      enableCors: jest.fn(),
      listen: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined),
    };

    (NestFactory.create as jest.Mock).mockResolvedValue(mockApp);
  });

  afterEach(async () => {
    jest.clearAllMocks();

    // Clean up any created app instance
    if (mockApp && typeof mockApp.close === 'function') {
      await mockApp.close();
    }
  });

  it('should create NestJS application with correct configuration', async () => {
    // Import the actual bootstrap function directly
    const { bootstrap: actualBootstrap } = jest.requireActual('./main');

    await actualBootstrap();

    expect(NestFactory.create).toHaveBeenCalledWith(AppModule);
    expect(mockApp.enableCors).toHaveBeenCalledWith({
      origin: true,
      methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
      preflightContinue: false,
      optionsSuccessStatus: 200,
    });
    expect(mockApp.listen).toHaveBeenCalledWith(3003);
  });

  it('should handle bootstrap errors gracefully', async () => {
    (NestFactory.create as jest.Mock).mockRejectedValue(
      new Error('Bootstrap failed'),
    );

    const { bootstrap: actualBootstrap } = jest.requireActual('./main');

    await expect(actualBootstrap()).rejects.toThrow('Bootstrap failed');
  });

  it('should handle listen errors gracefully', async () => {
    mockApp.listen.mockRejectedValue(new Error('Listen failed'));

    const { bootstrap: actualBootstrap } = jest.requireActual('./main');

    await expect(actualBootstrap()).rejects.toThrow('Listen failed');
  });

  it('should enable CORS with specific configuration options', async () => {
    const { bootstrap: actualBootstrap } = jest.requireActual('./main');

    await actualBootstrap();

    expect(mockApp.enableCors).toHaveBeenCalledWith(
      expect.objectContaining({
        origin: true,
        methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
        preflightContinue: false,
        optionsSuccessStatus: 200,
      }),
    );
  });

  it('should listen on port 3003', async () => {
    const { bootstrap: actualBootstrap } = jest.requireActual('./main');

    await actualBootstrap();

    expect(mockApp.listen).toHaveBeenCalledWith(3003);
  });

  it('should handle CORS configuration errors gracefully', async () => {
    mockApp.enableCors.mockImplementation(() => {
      throw new Error('CORS configuration failed');
    });

    const { bootstrap: actualBootstrap } = jest.requireActual('./main');

    await expect(actualBootstrap()).rejects.toThrow(
      'CORS configuration failed',
    );
  });
});
