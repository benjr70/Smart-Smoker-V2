import { Injectable } from '@nestjs/common';
import { PreSmokeService } from '../presmoke/presmoke.service';
import { PostSmokeService } from '../postSmoke/postSmoke.service';
import { RatingsService } from '../ratings/ratings.service';
import { SmokeService } from '../smoke/smoke.service';
import { SmokeProfileService } from '../smokeProfile/smokeProfile.service';
import { SmokeHistory } from './histroyDto';
import { SmokeStatus } from '../smoke/smoke.schema';
import { TimelineService } from '../timeline/timeline.service';

/**
 * The notes a cook accumulated, in the order they were written, with the
 * stages nobody wrote anything for dropped.
 *
 * A blank note is not a note: it would only widen every search by an empty
 * string, which every row contains.
 */
const notesOf = (stages: Array<{ notes?: string } | null>): string[] =>
  stages
    .map((stage) => stage?.notes)
    .filter((note): note is string => typeof note === 'string' && note !== '');

@Injectable()
export class HistoryService {
  constructor(
    private smokeService: SmokeService,
    private preSmokeService: PreSmokeService,
    private smokeProfileService: SmokeProfileService,
    private postSmokeService: PostSmokeService,
    private ratingsService: RatingsService,
    private timelineService: TimelineService,
  ) {}

  async getHistory(): Promise<SmokeHistory[]> {
    return this.smokeService.getAll().then((smokeList) => {
      return Promise.all(
        smokeList
          .filter((smoke) => smoke.status === SmokeStatus.Complete)
          .map(async (smoke) => {
            const preSmoke = await this.preSmokeService.getById(
              smoke.preSmokeId,
            );
            const smokeProfile = await this.smokeProfileService.getById(
              smoke.smokeProfileId,
            );
            // Read only for its notes: the list shows nothing else the
            // post-smoke stage holds, but the history search reads notes and a
            // user's word may only ever have been typed here.
            const postSmoke = await this.postSmokeService.getById(
              smoke.postSmokeId,
            );
            const ratings = await this.ratingsService.getById(smoke.ratingId);
            // How long the cook ran is derived, never stored: see the timeline
            // module. The list form of the read never loads a series.
            const durationMs = await this.timelineService.getDurationMs(smoke);
            const smokeHistory: SmokeHistory = {
              name: preSmoke ? preSmoke.name : '',
              meatType: preSmoke ? preSmoke.meatType : '',
              date: smoke.date ? smoke.date.toDateString() : '',
              weight:
                preSmoke && preSmoke.weight.weight
                  ? preSmoke.weight.weight.toString()
                  : '',
              weightUnit: preSmoke ? preSmoke.weight.unit : '',
              woodType: smokeProfile != null ? smokeProfile.woodType : '',
              smokeId: smoke['_id'],
              overAllRating:
                ratings && ratings.overallTaste
                  ? ratings.overallTaste.toString()
                  : '',
              durationMs,
              notes: notesOf([preSmoke, smokeProfile, postSmoke, ratings]),
            };
            return smokeHistory;
          }),
      );
    });
  }
}
