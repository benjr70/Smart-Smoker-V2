import { TempData } from 'temperaturechart/src/tempChart';

const envUrl = process.env.REACT_APP_CLOUD_URL_API;

export const getCurrentTemps = async (): Promise<TempData[]> => {
  const axios = require('axios');
  axios.defaults.baseURL = envUrl;
  return axios.get('temps').then((result: any) => {
    return result.data;
  });
};

export const postTempsBatch = async (batch: TempData[]): Promise<void> => {
  const axios = require('axios');
  axios.defaults.baseURL = envUrl;
  return axios.post('temps/batch', batch).then((result: any) => {
    return result.data;
  });
};
