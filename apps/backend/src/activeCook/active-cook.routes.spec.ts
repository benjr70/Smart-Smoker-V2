import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { SmokeStatus } from '../smoke/smoke.schema';
import { CookSnapshot, idleCook } from './active-cook';
import { ActiveCookController } from './active-cook.controller';
import { ActiveCookService } from './active-cook.service';
import {
  attachedCook,
  FakeActiveCook,
  fakeActiveCook,
} from './testing/fake-active-cook';

/**
 * The state routes over real HTTP — the one seam that holds their *paths*.
 *
 * A spec on the controller object proves what each route does and nothing
 * about where it lives: a decorator naming the wrong verb or dropping a
 * segment would pass it and break both apps, which is exactly the risk in
 * moving these three routes to another module. So the three that survive are
 * asked for here the way the frontend and the smoker ask for them, and the two
 * raw write routes are asked for to prove they are gone.
 *
 * The Active Cook behind it is the shared fake: what a transition *does* is
 * held by its own spec, against the store.
 */
describe('the state routes', () => {
  let app: INestApplication;
  let activeCook: FakeActiveCook;

  /** The app over whatever cook the fake is pointed at. */
  const boot = async (snapshot: CookSnapshot = lit()): Promise<void> => {
    activeCook = fakeActiveCook(snapshot);
    const module = await Test.createTestingModule({
      controllers: [ActiveCookController],
      providers: [{ provide: ActiveCookService, useValue: activeCook }],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  };

  /** A cook that is attached and running, as a lit smoker holds one. */
  const lit = () =>
    attachedCook({ _id: 'cook-1', status: SmokeStatus.InProgress }, true);

  afterEach(async () => {
    await app?.close();
  });

  describe('reading the state', () => {
    it('answers GET /api/state with the stored state', async () => {
      await boot();

      const response = await request(app.getHttpServer()).get('/api/state');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(
        expect.objectContaining({ smokeId: 'cook-1', smoking: true }),
      );
    });

    /**
     * Both apps' clients read an empty body here as "no cook", because a box
     * whose state was never written has no document to answer with. Held at
     * this seam because it is the serialization that is the contract: a `null`
     * handed back from the controller has to reach the wire as no body at all.
     */
    it('answers with an empty body on a box that has never held a state', async () => {
      await boot();
      activeCook.state.mockResolvedValue(null);

      const response = await request(app.getHttpServer()).get('/api/state');

      expect(response.status).toBe(200);
      expect(response.text).toBe('');
    });
  });

  describe('switching smoking', () => {
    it('answers PUT /api/state/toggleSmoking with the state the flip left', async () => {
      await boot();

      const response = await request(app.getHttpServer()).put(
        '/api/state/toggleSmoking',
      );

      expect(response.status).toBe(200);
      expect(response.body).toEqual(
        expect.objectContaining({ smokeId: 'cook-1', smoking: false }),
      );
    });

    it('answers with an empty body when there was no cook to toggle', async () => {
      await boot(idleCook());

      const response = await request(app.getHttpServer()).put(
        '/api/state/toggleSmoking',
      );

      expect(response.status).toBe(200);
      expect(response.text).toBe('');
    });
  });

  describe('putting the cook away', () => {
    it('answers PUT /api/state/clearSmoke with the state the clear left', async () => {
      await boot();

      const response = await request(app.getHttpServer()).put(
        '/api/state/clearSmoke',
      );

      expect(response.status).toBe(200);
      expect(response.body).toEqual(
        expect.objectContaining({ smokeId: '', smoking: false }),
      );
    });
  });

  /**
   * Writing a whole state document let a client name any cook it liked and set
   * the smoking flag with no stamp, no announcement and no conditional write.
   * Nothing called them; they are not routes any more, and a client that finds
   * one is told so rather than quietly getting away with it.
   */
  describe('the raw state writes', () => {
    it('answers PUT /api/state with a 404', async () => {
      await boot();

      await request(app.getHttpServer())
        .put('/api/state')
        .send({ smokeId: 'cook-9', smoking: true })
        .expect(404);
    });

    it('answers POST /api/state with a 404', async () => {
      await boot();

      await request(app.getHttpServer())
        .post('/api/state')
        .send({ smokeId: 'cook-9', smoking: true })
        .expect(404);
    });
  });
});
