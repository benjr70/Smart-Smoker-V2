import { HttpStatus } from '@nestjs/common';
import { getConnectionToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  let controller: HealthController;
  const mockConnection = { readyState: 1, name: 'test-db' };

  const mockResponse = () => {
    const res: { status: jest.Mock; json: jest.Mock } = {
      status: jest.fn(),
      json: jest.fn(),
    };
    res.status.mockReturnValue(res);
    res.json.mockReturnValue(res);
    return res;
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: getConnectionToken(), useValue: mockConnection }],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  describe('GET /api/health (liveness)', () => {
    it('returns status ok with db info', () => {
      mockConnection.readyState = 1;
      const result = controller.check();
      expect(result.status).toBe('ok');
      expect(result.database.status).toBe('connected');
      expect(result.database.name).toBe('test-db');
      expect(typeof result.uptime).toBe('number');
      expect(result.timestamp).toBeDefined();
    });

    it('reports disconnected when readyState !== 1', () => {
      mockConnection.readyState = 0;
      const result = controller.check();
      expect(result.database.status).toBe('disconnected');
      expect(result.status).toBe('ok');
    });
  });

  describe('GET /api/ready (readiness)', () => {
    it('returns 200 when db connected', () => {
      mockConnection.readyState = 1;
      const res = mockResponse();
      controller.ready(res as never);
      expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'ready',
          checks: { database: 'up' },
        }),
      );
    });

    it('returns 503 when db disconnected', () => {
      mockConnection.readyState = 0;
      const res = mockResponse();
      controller.ready(res as never);
      expect(res.status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'not_ready',
          checks: { database: 'down' },
        }),
      );
    });
  });
});
