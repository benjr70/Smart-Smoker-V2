import { TempData } from "../components/common/tempChart";


const envUrl = process.env.REACT_APP_CLOUD_URL_API;

export const getCurrentTemps = async ():Promise<TempData[]> => {
    const axios = require('axios');
    axios.defaults.baseURL = envUrl;
    return axios.get('temps').then((result:any) => {
        return result.data;
    });
}
