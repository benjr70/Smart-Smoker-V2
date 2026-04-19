import { HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { SerialService } from '../serial/serial.serivce';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  let controller: HealthController;
  const mockSerialService: { port: { isOpen: boolean } | null } = {
    port: { isOpen: true },
  };

  const mockResponse = () => {
    const res: { status: jest.Mock; json: jest.Mock } = {
      status: jest.fn(),
      json: jest.fn(),
    };
    res.status.mockReturnValue(res);
    res.json.mockReturnValue(res);
    return res;
  };

  const originalEnv = process.env.NODE_ENV;
  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: SerialService, useValue: mockSerialService }],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  describe('GET /api/health (liveness)', () => {
    it('always returns status ok', () => {
      const result = controller.check();
      expect(result.status).toBe('ok');
      expect(typeof result.uptime).toBe('number');
      expect(result.timestamp).toBeDefined();
    });
  });

  describe('GET /api/ready (readiness)', () => {
    it('returns 200 when serial port is open', () => {
      process.env.NODE_ENV = 'production';
      mockSerialService.port = { isOpen: true };
      const res = mockResponse();
      controller.ready(res as never);
      expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'ready',
          checks: { serial: 'up' },
        }),
      );
    });

    it('returns 503 when serial port is closed', () => {
      process.env.NODE_ENV = 'production';
      mockSerialService.port = { isOpen: false };
      const res = mockResponse();
      controller.ready(res as never);
      expect(res.status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'not_ready',
          checks: { serial: 'down' },
        }),
      );
    });

    it('returns 503 when serial port is missing', () => {
      process.env.NODE_ENV = 'production';
      mockSerialService.port = null;
      const res = mockResponse();
      controller.ready(res as never);
      expect(res.status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
    });

    it('returns 200 in emulator mode regardless of port state', () => {
      process.env.NODE_ENV = 'local';
      mockSerialService.port = null;
      const res = mockResponse();
      controller.ready(res as never);
      expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'ready',
          checks: { serial: 'emulator' },
        }),
      );
    });
  });
});
