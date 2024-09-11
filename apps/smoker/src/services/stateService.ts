export interface State {
    smokeId:string;
    smoking:boolean;
}

export interface smokeProfile {
    chamberName: string;
    probe1Name: string;
    probe2Name: string;
    probe3Name: string;
    notes: string;
    woodType: string;
}


const envUrl = process.env.REACT_APP_CLOUD_URL_API;

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
    }).catch((error: any) => {
        console.log(error);
    });
}