import { rating } from '../components/common/interfaces/rating';

const envUrl = process.env.REACT_APP_CLOUD_URL;

// Project a rating down to exactly the fields the backend RatingsDto whitelists.
// The strict validation edge (forbidNonWhitelisted) rejects stray fields such as
// the persisted `_id`/`__v` that ride along on a fetched rating document.
const toRatingsPayload = (rating: rating) => ({
  smokeFlavor: rating.smokeFlavor,
  seasoning: rating.seasoning,
  tenderness: rating.tenderness,
  overallTaste: rating.overallTaste,
  notes: rating.notes,
});

export const getCurrentRatings = async (): Promise<rating> => {
  const axios = require('axios');
  axios.defaults.baseURL = envUrl;
  return axios
    .get('ratings/')
    .then((result: any) => {
      return result.data;
    })
    .catch((error: any) => {
      console.log(error);
    });
};

export const setCurrentRatings = async (rating: rating): Promise<rating> => {
  const axios = require('axios');
  axios.defaults.baseURL = envUrl;
  return axios.post('ratings/', toRatingsPayload(rating)).catch((error: any) => {
    console.log(error);
  });
};

export const updateRatings = async (rating: rating): Promise<rating> => {
  const axios = require('axios');
  axios.defaults.baseURL = envUrl;
  return axios.post('ratings/' + rating._id, toRatingsPayload(rating)).catch((error: any) => {
    console.log(error);
  });
};

export const getRatingById = async (id: string): Promise<rating> => {
  const axios = require('axios');
  axios.defaults.baseURL = envUrl;
  return axios
    .get('ratings/' + id)
    .then((result: any) => {
      return result.data;
    })
    .catch((error: any) => {
      console.log(error);
    });
};

export const deleteRatingsById = async (id: string) => {
  const axios = require('axios');
  axios.defaults.baseURL = envUrl;
  return axios.delete('ratings/' + id).catch((error: any) => {
    console.log(error);
  });
};
