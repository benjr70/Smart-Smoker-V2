import { PostSmoke } from "../components/smoke/postSmokeStep/PostSmokeStep";


const envUrl = process.env.REACT_APP_CLOUD_URL;

export const getCurrentPostSmoke = async ():Promise<PostSmoke> => {
    const axios = require('axios');
    axios.defaults.baseURL = envUrl;
    return axios.get('postSmoke/current').then((result:any) => {
        return result.data;
    });
}

export const setCurrentPostSmoke = async(postSmoke: PostSmoke): Promise<any> => {
    const axios = require('axios');
    axios.defaults.baseURL = envUrl;
    return axios.post('postSmoke/current', postSmoke);
}


export const getPostSmokeById = async(id: string): Promise<PostSmoke> => {
    const axios = require('axios');
    axios.defaults.baseURL = envUrl;
    return axios.get('postSmoke/' + id).then((result:any) => {
        return result.data;
    });
}