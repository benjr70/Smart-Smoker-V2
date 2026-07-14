import { NotificationSettings } from '../components/settings/notifications';

const envUrl = process.env.REACT_APP_CLOUD_URL;

// Project each notification rule down to the fields the backend
// NotificationSettingsDto whitelists. Rules fetched from the backend carry a
// persisted subdocument `_id` (and `__v`) that the strict validation edge
// (forbidNonWhitelisted) would reject on save. `lastNotificationSent` is
// server-managed but validated/optional, so it is preserved when present to
// avoid resetting the notification throttle.
const toNotificationSettingsPayload = (notificationSettings: any) => ({
  settings: Array.isArray(notificationSettings?.settings)
    ? notificationSettings.settings.map((rule: any) => {
        const projected: any = {
          type: rule.type,
          message: rule.message,
          probe1: rule.probe1,
          op: rule.op,
          probe2: rule.probe2,
          offset: rule.offset,
          temperature: rule.temperature,
        };
        if (rule.lastNotificationSent !== undefined) {
          projected.lastNotificationSent = rule.lastNotificationSent;
        }
        return projected;
      })
    : [],
});

export const getNotificationSettings = async (): Promise<NotificationSettings[]> => {
  const axios = require('axios');
  axios.defaults.baseURL = envUrl;
  return axios
    .get('notifications/settings')
    .then((result: any) => {
      return result.data.settings;
    })
    .catch((error: any) => {
      console.log(error);
    });
};

export const setNotificationSettings = async (
  notificationSettings: any
): Promise<NotificationSettings> => {
  const axios = require('axios');
  axios.defaults.baseURL = envUrl;
  return axios
    .post('notifications/settings', toNotificationSettingsPayload(notificationSettings))
    .catch((error: any) => {
      console.log(error);
    });
};
