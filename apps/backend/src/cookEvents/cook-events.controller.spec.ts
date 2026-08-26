import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { CookEventsController } from './cook-events.controller';
import { CookEventsService } from './cook-events.service';
import { RecordCookEventDto } from './cook-events.dto';

describe('CookEventsController', () => {
  let controller: CookEventsController;
  let service: {
    record: jest.Mock;
    listCurrent: jest.Mock;
    listForSmoke: jest.Mock;
    remove: jest.Mock;
  };

  beforeEach(async () => {
    service = {
      record: jest.fn().mockResolvedValue({ stampKey: 'wood' }),
      listCurrent: jest.fn().mockResolvedValue([{ stampKey: 'wood' }]),
      listForSmoke: jest.fn().mockResolvedValue([{ stampKey: 'wrap' }]),
      remove: jest.fn().mockResolvedValue({ deletedCount: 1 }),
    };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CookEventsController],
      providers: [{ provide: CookEventsService, useValue: service }],
    }).compile();
    controller = module.get<CookEventsController>(CookEventsController);
  });

  it('logs the stamp the body names', async () => {
    expect(await controller.record({ stampKey: 'wood' })).toEqual({
      stampKey: 'wood',
    });
    expect(service.record).toHaveBeenCalledWith('wood');
  });

  it('serves the current cook log', async () => {
    expect(await controller.listCurrent()).toEqual([{ stampKey: 'wood' }]);
  });

  it('serves a stored cook log by id', async () => {
    expect(await controller.listForSmoke('smoke-1')).toEqual([
      { stampKey: 'wrap' },
    ]);
    expect(service.listForSmoke).toHaveBeenCalledWith('smoke-1');
  });

  it('removes one event by id', async () => {
    await controller.remove('event-1');

    expect(service.remove).toHaveBeenCalledWith('event-1');
  });
});

/**
 * The route runs under the app's global ValidationPipe (whitelist +
 * forbidNonWhitelisted + transform), so the DTO is the contract: a body it does
 * not declare is a 400 before the service is ever reached.
 */
describe('RecordCookEventDto validation', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });
  const metadata = { type: 'body' as const, metatype: RecordCookEventDto };

  it('accepts the stamp key the tap sends', async () => {
    expect(await pipe.transform({ stampKey: 'wood' }, metadata)).toEqual({
      stampKey: 'wood',
    });
  });

  it('rejects a body with no stamp key at all', async () => {
    await expect(pipe.transform({}, metadata)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      pipe.transform({ stampKey: '' }, metadata),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects anything the client tried to stamp the event with itself', async () => {
    // The moment and the temperatures are the server's to decide; a client
    // that sent its own is refused rather than quietly ignored.
    await expect(
      pipe.transform(
        { stampKey: 'wood', at: '2020-01-01T00:00:00.000Z' },
        metadata,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
