import { io } from 'socket.io-client';
import { State } from '../components/common/interfaces/state';
import { smokeHistory } from '../components/common/interfaces/history';
import { getDefaultApiClient } from '../api';
import { SmokeProfile } from '../api/types';

const envUrl = process.env.REACT_APP_CLOUD_URL;

/**
 * @deprecated The profile domain type now lives in the API types module
 * (`SmokeProfile`). This alias is re-exported here only so existing callers
 * importing `smokeProfile` from this service keep compiling until they migrate.
 */
export type { SmokeProfile as smokeProfile } from '../api/types';

export const toggleSmoking = async (): Promise<State> => {
  const axios = require('axios');
  axios.defaults.baseURL = envUrl;
  return axios.put('state/toggleSmoking').then((result: any) => {
    return result.data;
  });
};

export const clearSmoke = async (): Promise<State> => {
  let url = process.env.WS_URL ?? '';
  const socket = io(url);
  socket.emit('clear', true);
  const axios = require('axios');
  axios.defaults.baseURL = envUrl;
  return axios
    .put('state/clearSmoke')
    .then((result: any) => {
      return result.data;
    })
    .catch((error: any) => {
      console.log(error);
    });
};

export const getState = async (): Promise<State> => {
  const axios = require('axios');
  axios.defaults.baseURL = envUrl;
  return axios
    .get('state')
    .then((result: any) => {
      return result.data;
    })
    .catch((error: any) => {
      console.log(error);
    });
};

/**
 * @deprecated Use `useApiClient().smokeProfile.saveCurrent` instead. Deprecated
 * delegating shim: the outbound DTO projection (stripping stray persisted
 * fields such as `_id`/`__v`) now lives inside the client. Preserves the legacy
 * swallow-and-log semantics (catch, `console.log`, resolve `undefined`).
 */
export const setSmokeProfile = async (smokeProfileDTO: SmokeProfile) => {
  try {
    return await getDefaultApiClient().smokeProfile.saveCurrent(smokeProfileDTO);
  } catch (error) {
    console.log(error);
    return undefined;
  }
};

/**
 * @deprecated Use `useApiClient().smokeProfile.getById` instead. Deprecated
 * delegating shim; the notes/wood-type empty-string normalization now lives
 * inside the client. Preserves the legacy swallow-and-log semantics.
 */
export const getSmokeProfileById = async (id: string): Promise<SmokeProfile> => {
  try {
    return await getDefaultApiClient().smokeProfile.getById(id);
  } catch (error) {
    console.log(error);
    return undefined as unknown as SmokeProfile;
  }
};

export const FinishSmoke = async (): Promise<any> => {
  const axios = require('axios');
  axios.defaults.baseURL = envUrl;
  return axios
    .post('smoke/finish')
    .then((result: any) => {
      return result.data;
    })
    .catch((error: any) => {
      console.log(error);
    });
};

/**
 * @deprecated Use `useApiClient().smokeProfile.getCurrent` instead. Deprecated
 * delegating shim; the notes/wood-type empty-string normalization now lives
 * inside the client. Preserves the legacy swallow-and-log semantics.
 */
export const getCurrentSmokeProfile = async (): Promise<SmokeProfile> => {
  try {
    return await getDefaultApiClient().smokeProfile.getCurrent();
  } catch (error) {
    console.log(error);
    return undefined as unknown as SmokeProfile;
  }
};

export const getSmokeHistory = async (): Promise<smokeHistory[]> => {
  const axios = require('axios');
  axios.defaults.baseURL = envUrl;
  return axios
    .get('history')
    .then((result: any) => {
      return result.data;
    })
    .catch((error: any) => {
      console.log(error);
    });
};

export const getAllSmoke = async (): Promise<any> => {
  const axios = require('axios');
  axios.defaults.baseURL = envUrl;
  return axios
    .get('smoke/all')
    .then((result: any) => {
      return result.data;
    })
    .catch((error: any) => {
      console.log(error);
    });
};

export const getSmokeById = async (id: string): Promise<any> => {
  const axios = require('axios');
  axios.defaults.baseURL = envUrl;
  return axios
    .get('smoke/' + id)
    .then((result: any) => {
      return result.data;
    })
    .catch((error: any) => {
      console.log(error);
    });
};

/**
 * @deprecated Use `useApiClient().smokeProfile.deleteById` instead. Deprecated
 * delegating shim; preserves the legacy swallow-and-log semantics.
 */
export const deleteSmokeProfileById = async (id: string) => {
  try {
    await getDefaultApiClient().smokeProfile.deleteById(id);
  } catch (error) {
    console.log(error);
  }
};

export const deleteSmokeById = async (id: string) => {
  const axios = require('axios');
  axios.defaults.baseURL = envUrl;
  return axios.delete('smoke/' + id).catch((error: any) => {
    console.log(error);
  });
};
