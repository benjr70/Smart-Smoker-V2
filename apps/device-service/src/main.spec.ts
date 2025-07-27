import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { bootstrap } from './main';

// Mock NestFactory
jest.mock('@nestjs/core', () => ({
  NestFactory: {
    create: jest.fn(),
  },
}));

// Mock the bootstrap function call
jest.mock('./main', () => ({
  bootstrap: jest.fn(),
}));

describe('Bootstrap', () => {
  let mockApp: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockApp = {
      enableCors: jest.fn(),
      listen: jest.fn().mockResolvedValue(undefined),
    };
    
    (NestFactory.create as jest.Mock).mockResolvedValue(mockApp);
  });

  it('should create NestJS application with correct configuration', async () => {
    // Import the actual bootstrap function directly
    const { bootstrap: actualBootstrap } = jest.requireActual('./main');
    
    await actualBootstrap();

    expect(NestFactory.create).toHaveBeenCalledWith(AppModule);
    expect(mockApp.enableCors).toHaveBeenCalledWith({
      origin: true,
      methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
      preflightContinue: false,
      optionsSuccessStatus: 200
    });
    expect(mockApp.listen).toHaveBeenCalledWith(3003);
  });

  it('should handle bootstrap errors gracefully', async () => {
    (NestFactory.create as jest.Mock).mockRejectedValue(new Error('Bootstrap failed'));
    
    const { bootstrap: actualBootstrap } = jest.requireActual('./main');
    
    await expect(actualBootstrap()).rejects.toThrow('Bootstrap failed');
  });

  it('should handle listen errors gracefully', async () => {
    mockApp.listen.mockRejectedValue(new Error('Listen failed'));
    
    const { bootstrap: actualBootstrap } = jest.requireActual('./main');
    
    await expect(actualBootstrap()).rejects.toThrow('Listen failed');
  });
});