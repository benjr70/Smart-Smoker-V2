import { preSmoke } from '../components/common/interfaces/preSmoke';

const envUrl = process.env.REACT_APP_CLOUD_URL;

// Project a pre-smoke down to exactly the fields the backend PreSmokeDto
// whitelists. A fetched current pre-smoke document carries persisted `_id`/`__v`
// (and a `weight._id` on the nested subdocument) that the strict validation edge
// (forbidNonWhitelisted) would reject on save.
const toPreSmokePayload = (presmoke: preSmoke) => ({
  name: presmoke.name,
  meatType: presmoke.meatType,
  weight: {
    unit: presmoke.weight?.unit,
    weight: presmoke.weight?.weight,
  },
  steps: presmoke.steps,
  notes: presmoke.notes,
});

export const getCurrentPreSmoke = async (): Promise<preSmoke> => {
  const axios = require('axios');
  axios.defaults.baseURL = envUrl;
  return axios
    .get('presmoke/')
    .then((result: any) => {
      return result.data;
    })
    .catch((error: any) => {
      console.log(error);
    });
};

export const setCurrentPreSmoke = async (presmoke: preSmoke): Promise<any> => {
  const axios = require('axios');
  axios.defaults.baseURL = envUrl;
  return axios.post('presmoke', toPreSmokePayload(presmoke)).catch((error: any) => {
    console.log(error);
  });
};

export const getPreSmokeById = async (id: string): Promise<preSmoke> => {
  const axios = require('axios');
  axios.defaults.baseURL = envUrl;
  return axios
    .get('presmoke/' + id)
    .then((result: any) => {
      return result.data;
    })
    .catch((error: any) => {
      console.log(error);
    });
};

export const deletePreSmokeById = async (id: string) => {
  const axios = require('axios');
  axios.defaults.baseURL = envUrl;
  return axios.delete('presmoke/' + id).catch((error: any) => {
    console.log(error);
  });
};
