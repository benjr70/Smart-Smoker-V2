import { io } from "socket.io-client";
import { State } from "../components/common/interfaces/state";
import { smokeHistory } from "../components/common/interfaces/history";


const envUrl =  process.env.REACT_APP_CLOUD_URL;

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

export const clearSmoke = async ():Promise<State> => {
    let url = process.env.WS_URL ?? '';
    const socket = io(url);
    socket.emit('clear', true);
    const axios = require('axios');
    axios.defaults.baseURL = envUrl;
    return axios.put('state/clearSmoke').then((result:any) => {
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

export const getSmokeHistory = async (): Promise<smokeHistory[]> => {
    const axios = require('axios');
    axios.defaults.baseURL = envUrl;
    return axios.get('smoke').then(result => {
        return result.data;
    });
}

export const getSmokeById = async(id: string): Promise<any> => {
    const axios = require('axios');
    axios.defaults.baseURL = envUrl;
    return axios.get('smoke/' + id).then((result:any) => {
        return result.data;
    });
}