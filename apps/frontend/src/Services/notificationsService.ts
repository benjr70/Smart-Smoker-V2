import { NotificationSettings } from '../components/settings/notifications';

const envUrl = process.env.REACT_APP_CLOUD_URL;

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
  return axios.post('notifications/settings', notificationSettings).catch((error: any) => {
    console.log(error);
  });
};
