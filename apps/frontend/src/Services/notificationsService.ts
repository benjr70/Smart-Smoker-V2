import { getDefaultApiClient } from '../api';
import { NotificationSettings } from '../api/types';

/**
 * @deprecated Use the API client (`useApiClient().notifications`) instead. These
 * are delegating shims that preserve the legacy swallow-and-log semantics
 * (catch, `console.log`, resolve `undefined`) until every caller has migrated.
 * The response unwrap, the DTO-whitelist projection and the legacy envelope wrap
 * now live inside the client.
 */
export const getNotificationSettings = async (): Promise<NotificationSettings[]> => {
  try {
    return await getDefaultApiClient().notifications.getSettings();
  } catch (error) {
    console.log(error);
    return undefined as unknown as NotificationSettings[];
  }
};

/** @deprecated Use `useApiClient().notifications.saveSettings` instead. */
export const setNotificationSettings = async (
  notificationSettings: unknown
): Promise<NotificationSettings> => {
  try {
    return (await getDefaultApiClient().notifications.saveSettings(
      notificationSettings
    )) as unknown as NotificationSettings;
  } catch (error) {
    console.log(error);
    return undefined as unknown as NotificationSettings;
  }
};
