import { TempData } from "../components/common/components/tempChart";


const envUrl = process.env.REACT_APP_CLOUD_URL;

export const getCurrentTemps = async ():Promise<TempData[]> => {
    const axios = require('axios');
    axios.defaults.baseURL = envUrl;
    return axios.get('temps').then((result:any) => {
        return result.data;
    });
}
