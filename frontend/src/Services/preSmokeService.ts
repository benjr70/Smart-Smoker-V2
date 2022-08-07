import { preSmoke } from "../components/common/interfaces/preSmoke";


// switch which line is commented for environment 
const envUrl = 'http://136.60.164.223/:3001/api/';
//const envUrl = 'http://localhost:3001/api/';

export const getCurrentPreSmoke = async ():Promise<preSmoke> => {
    const axios = require('axios');
    axios.defaults.baseURL = envUrl;
    return axios.get('presmoke/current').then((result:any) => {
        return result.data;
    });
}

export const setCurrentPreSmoke = async(presmoke: preSmoke): Promise<any> => {
    const axios = require('axios');
    axios.defaults.baseURL = envUrl;
    return axios.post('presmoke', presmoke);
}