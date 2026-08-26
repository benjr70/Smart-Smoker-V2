import { FilterQuery } from 'mongoose';
import { CookEventDocument } from './cook-events.schema';

/**
 * Every event of one cook, as a filter.
 *
 * Shared rather than restated because three places delete or read by it and
 * two of them cannot reach `CookEventsService` to ask: the smoke delete
 * cascade and `StateService.clearSmoke` both live in modules this one already
 * depends on, so importing the service back would close a DI cycle. They
 * address the collection through its model with this filter, exactly as the
 * same cascade addresses a temperature series through {@link
 * tempSeriesFilter}.
 */
export const cookEventsOfSmoke = (
  smokeId: string,
): FilterQuery<CookEventDocument> => ({ smokeId });
