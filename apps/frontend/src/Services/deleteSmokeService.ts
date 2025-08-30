import { deletePostSmokeById } from './postSmokeService';
import { deletePreSmokeById } from './preSmokeService';
import { deleteRatingsById } from './ratingsService';
import { deleteSmokeById, deleteSmokeProfileById, getSmokeById } from './smokerService';
import { deleteTempsById } from './tempsService';

export const deleteSmoke = (smokeId: string): Promise<void> => {
  return getSmokeById(smokeId)
    .then(async smoke => {
      await deletePreSmokeById(smoke.preSmokeId);
      await deleteSmokeProfileById(smoke.smokeProfileId);
      await deleteTempsById(smoke.tempsId);
      await deletePostSmokeById(smoke.postSmokeId);
      await deleteRatingsById(smoke.ratingId);
    })
    .finally(async () => {
      await deleteSmokeById(smokeId);
    })
    .catch((error: any) => {
      console.log(error);
    });
};
