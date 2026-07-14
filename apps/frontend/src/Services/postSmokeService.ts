import { PostSmoke } from '../components/smoke/postSmokeStep/PostSmokeStep';

const envUrl = process.env.REACT_APP_CLOUD_URL;

// Project a post-smoke down to exactly the fields the backend PostSmokeDto
// whitelists, so a fetched document's persisted `_id`/`__v` cannot ride along
// and trip the strict validation edge (forbidNonWhitelisted) on save.
const toPostSmokePayload = (postSmoke: PostSmoke) => ({
  restTime: postSmoke.restTime,
  steps: postSmoke.steps,
  notes: postSmoke.notes,
});

export const getCurrentPostSmoke = async (): Promise<PostSmoke> => {
  const axios = require('axios');
  axios.defaults.baseURL = envUrl;
  return axios
    .get('postSmoke/current')
    .then((result: any) => {
      return result.data;
    })
    .catch((error: any) => {
      console.log(error);
    });
};

export const setCurrentPostSmoke = async (postSmoke: PostSmoke): Promise<any> => {
  const axios = require('axios');
  axios.defaults.baseURL = envUrl;
  return axios.post('postSmoke/current', toPostSmokePayload(postSmoke)).catch((error: any) => {
    console.log(error);
  });
};

export const getPostSmokeById = async (id: string): Promise<PostSmoke> => {
  const axios = require('axios');
  axios.defaults.baseURL = envUrl;
  return axios
    .get('postSmoke/' + id)
    .then((result: any) => {
      return result.data;
    })
    .catch((error: any) => {
      console.log(error);
    });
};

export const deletePostSmokeById = async (id: string) => {
  const axios = require('axios');
  axios.defaults.baseURL = envUrl;
  return axios.delete('postSmoke/' + id).catch((error: any) => {
    console.log(error);
  });
};
