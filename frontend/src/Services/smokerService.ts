import { State } from "../components/common/interfaces/state";


// switch which line is commented for environment 
//const envUrl = 'http://136.60.164.223:3001/api/';
const envUrl = 'http://localhost:3001/api/';

export const toggleSmoking = async ():Promise<State> => {
    const axios = require('axios');
    axios.defaults.baseURL = envUrl;
    return axios.put('state/toggleSmoking').then((result:any) => {
        return result.data;
    });
}
