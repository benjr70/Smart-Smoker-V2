

export interface wifiManager {
    ssid: string;
    password: string;
}

export const connectToWiFi = async (creds: wifiManager):Promise<any> => {
    const axios = require('axios');
    axios.defaults.baseURL = 'http://localhost:3003';
    return axios.post('api/wifiManager/connect', creds).then((result:any) => {
        return result.data;
    });
}

export const getConnection = async ():Promise<any> => {
    const axios = require('axios');
    axios.defaults.baseURL = 'http://localhost:3003';
    return axios.get('api/wifiManager/connection').then((result:any) => {
        return result.data;
    });
}
