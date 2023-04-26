import { deletePostSmokeById } from "./postSmokeService";
import { deletePreSmokeById } from "./preSmokeService"
import { deleteSmokeById, deleteSmokeProfileById, getSmokeById } from "./smokerService"
import { deleteTempsById } from "./tempsService";


export const deleteSmoke = (smokeId: string): Promise<void> => {
    return getSmokeById(smokeId).then(async smoke => {
        await deletePreSmokeById(smoke.preSmokeId);
        await deleteSmokeProfileById(smoke.smokeProfileId);
        await deleteTempsById(smoke.tempsId);
        await deletePostSmokeById(smoke.postSmokeId);
    }).finally(async ()=> {
       await deleteSmokeById(smokeId);
    })
}