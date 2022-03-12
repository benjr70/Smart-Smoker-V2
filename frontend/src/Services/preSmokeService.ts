import { preSmoke } from "../components/common/interfaces/preSmoke";


export const getCurrentPreSmoke = async ():Promise<preSmoke> => {
    const axios = require('axios');
    axios.defaults.baseURL = 'http://localhost:3001/api/';
    return axios.get('presmoke/current').then((result:any) => {
        return result.data;
    });
}

export const setCurrentPreSmoke = async(presmoke: preSmoke) => {
    const axios = require('axios');
    axios.defaults.baseURL = 'http://localhost:3001/api/';
    return axios.post('presmoke', presmoke);
}