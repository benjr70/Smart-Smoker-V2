

export interface wifiManager {
    ssid: string;
    password: string;
}

export const connectToWiFi = async (creds: wifiManager):Promise<any> => {
    const axios = require('axios');
    axios.defaults.baseURL = 'http://localhost:3000';
    return axios.post('api/wifiManager', creds).then((result:any) => {
        return result.data;
    });
}
