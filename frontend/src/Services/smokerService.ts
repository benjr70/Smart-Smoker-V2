import { State } from "../components/common/interfaces/state";


// switch which line is commented for environment 
const envUrl = 'http://136.60.164.223:3001/api/';
//const envUrl = 'http://localhost:3001/api/';

export interface smokeProfile {
    notes: string;
    woodType: string;
}

export const toggleSmoking = async ():Promise<State> => {
    const axios = require('axios');
    axios.defaults.baseURL = envUrl;
    return axios.put('state/toggleSmoking').then((result:any) => {
        return result.data;
    });
}

export const getState =async ():Promise<State>  => {
    const axios = require('axios');
    axios.defaults.baseURL = envUrl;
    return axios.get('state').then((result:any) => {
        return result.data;
    });
}

export const setSmokeProfile=async (smokeProfileDTO: smokeProfile) => {
    const axios = require('axios');
    axios.defaults.baseURL = envUrl;
    return axios.post('smokeProfile/current', smokeProfileDTO);
}


export const getCurrentSmokeProfile = async ():Promise<smokeProfile> => {
    const axios = require('axios');
    axios.defaults.baseURL = envUrl;
    return axios.get('smokeProfile/current').then((result:any) => {
        if(!result.data.notes){
            result.data.notes = ''
        }
        if (!result.data.woodType){
            result.data.woodType = ''
        }
        return result.data;
    });
}