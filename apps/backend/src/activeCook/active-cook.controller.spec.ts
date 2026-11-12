import { Test, TestingModule } from '@nestjs/testing';
import { SmokeStatus } from '../smoke/smoke.schema';
import { idleCook } from './active-cook';
import { ActiveCookController } from './active-cook.controller';
import { ActiveCookService } from './active-cook.service';
import {
  attachedCook,
  FakeActiveCook,
  fakeActiveCook,
} from './testing/fake-active-cook';

describe('ActiveCookController', () => {
  let controller: ActiveCookController;
  /**
   * The Active Cook as every other spec of a route through it takes it: the
   * shared fake, pointed at a lit cook. A hand-rolled `{ toggle: jest.Mock }`
   * would let this spec describe a transition the real one cannot make.
   */
  let activeCook: FakeActiveCook;

  beforeEach(async () => {
    activeCook = fakeActiveCook(
      attachedCook(
        { _id: 'test-smoke-id', status: SmokeStatus.InProgress },
        true,
      ),
    );

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ActiveCookController],
      providers: [{ provide: ActiveCookService, useValue: activeCook }],
    }).compile();

    controller = module.get<ActiveCookController>(ActiveCookController);
  });

  describe('getState', () => {
    it('answers with the stored state, which is what the apps load the flag from', async () => {
      expect(await controller.getState()).toEqual(
        expect.objectContaining({ smokeId: 'test-smoke-id', smoking: true }),
      );
    });

    /**
     * A box whose state document was never written has none to answer with,
     * since reading the Active Cook no longer writes one into being. Stubbed
     * past the fake, which always holds a state: the collection being empty is
     * a fact about the store, not a snapshot the fake can be pointed at.
     */
    it('answers with nothing on a box that has never held a state', async () => {
      activeCook.state.mockResolvedValue(null);

      expect(await controller.getState()).toBeNull();
    });
  });

  describe('toggleSmoking', () => {
    it('flips through the Active Cook and answers with the state it left', async () => {
      const result = await controller.toggleSmoking();

      expect(activeCook.toggle).toHaveBeenCalledWith();
      expect(result).toEqual(
        expect.objectContaining({ smokeId: 'test-smoke-id', smoking: false }),
      );
    });

    /** A toggle on an idle smoker has always answered with nothing. */
    it('answers with nothing when there was no cook to toggle', async () => {
      activeCook.pointAt(idleCook());

      expect(await controller.toggleSmoking()).toBeNull();
    });
  });

  describe('clearSmoke', () => {
    it('clears through the Active Cook and answers with the state it left', async () => {
      const result = await controller.clearSmoke();

      expect(activeCook.clear).toHaveBeenCalledWith();
      expect(result).toEqual(
        expect.objectContaining({ smokeId: '', smoking: false }),
      );
    });

    /**
     * Clearing a smoker that is already idle is a no-op, and the route still
     * answers with the state rather than failing a request the apps make on
     * every End Smoke.
     */
    it('answers with the state when there was nothing to clear', async () => {
      activeCook.pointAt(idleCook());

      expect(await controller.clearSmoke()).toEqual(
        expect.objectContaining({ smoking: false }),
      );
    });

    /** Nothing to answer with on a box that has never held a state. */
    it('answers with nothing on a box that has never held a state', async () => {
      activeCook.clear.mockResolvedValue({
        won: false,
        cook: idleCook(),
        state: null,
      });

      expect(await controller.clearSmoke()).toBeNull();
    });
  });
});
