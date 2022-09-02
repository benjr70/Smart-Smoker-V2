import { PostSmoke } from "../components/smoke/postSmokeStep/PostSmokeStep";


// switch which line is commented for environment 
const envUrl = 'http://136.60.164.223:3001/api/';
//const envUrl = 'http://localhost:3001/api/';

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