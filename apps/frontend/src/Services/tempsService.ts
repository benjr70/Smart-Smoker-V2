import { TempData } from 'temperaturechart/src/tempChart';


const envUrl = process.env.REACT_APP_CLOUD_URL;

export const getCurrentTemps = async ():Promise<TempData[]> => {
    const axios = require('axios');
    axios.defaults.baseURL = envUrl;
    return axios.get('temps').then((result:any) => {
        return result.data;
    }).catch((error: any) => {
        console.log(error);
    });
}

export const getTempsById = async (id: string): Promise<TempData[]> => {
    const axios = require('axios');
    axios.defaults.baseURL = envUrl;
    return axios.get('temps/' + id).then((result:any) => {
        return result.data;
    }).catch((error: any) => {
        console.log(error);
    });
}

export const deleteTempsById = async(id: string) => {
    const axios = require('axios');
    axios.defaults.baseURL = envUrl;
    return axios.delete('temps/' + id)
    .catch((error: any) => {
        console.log(error);
    });
}
