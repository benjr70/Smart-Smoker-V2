import { rating } from "../components/common/interfaces/rating";

const envUrl = process.env.REACT_APP_CLOUD_URL;

export const getCurrentRatings = async ():Promise<rating> => {
    const axios = require('axios');
    axios.defaults.baseURL = envUrl;
    return axios.get('ratings/')
        .then((result:any) => {
            return result.data;
        }).catch((error: any) => {
            console.log(error);
        });
    }

export const setCurrentRatings = async(rating: rating): Promise<rating> => {
    const axios = require('axios');
    axios.defaults.baseURL = envUrl;
    return axios.post('ratings/', rating)
        .catch((error: any) => {
            console.log(error);
        });
}

export const updateRatings = async(rating: rating): Promise<rating> => {
    const axios = require('axios');
    axios.defaults.baseURL = envUrl;
    return axios.post('ratings/' + rating._id, rating)
        .catch((error: any) => {
            console.log(error);
        });
}

export const getRatingById =async (id: string): Promise<rating> => {
    const axios = require('axios');
    axios.defaults.baseURL = envUrl;
    return axios.get('ratings/' + id)
        .then((result:any) => {
            return result.data;
        }).catch((error: any) => {
            console.log(error);
        });
}

export const deleteRatingsById = async(id: string) => {
    const axios = require('axios');
    axios.defaults.baseURL = envUrl;
    return axios.delete('ratings/' + id)
        .catch((error: any) => {
            console.log(error);
        });
}
