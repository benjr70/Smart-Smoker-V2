import { preSmoke } from "../components/common/interfaces/preSmoke";


const envUrl = process.env.REACT_APP_CLOUD_URL;

export const getCurrentPreSmoke = async ():Promise<preSmoke> => {
    const axios = require('axios');
    axios.defaults.baseURL = envUrl;
    return axios.get('presmoke/').then((result:any) => {
        return result.data;
    }).catch((error: any) => {
        console.log(error);
    });
}

export const setCurrentPreSmoke = async(presmoke: preSmoke): Promise<any> => {
    const axios = require('axios');
    axios.defaults.baseURL = envUrl;
    return axios.post('presmoke', presmoke).catch((error: any) => {
        console.log(error);
    });
}

export const getPreSmokeById = async(id: string): Promise<preSmoke> => {
    const axios = require('axios');
    axios.defaults.baseURL = envUrl;
    return axios.get('presmoke/' + id).then((result:any) => {
        return result.data;
    });
}

export const deletePreSmokeById = async(id: string) => {
    const axios = require('axios');
    axios.defaults.baseURL = envUrl;
    return axios.delete('presmoke/' + id);
}

