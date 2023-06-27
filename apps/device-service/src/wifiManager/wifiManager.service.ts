import { Injectable } from "@nestjs/common";
import { exec } from "child_process";
import { wifiDto } from "./wifiDto";
const wifi = require('node-wifi');


@Injectable()
export class WifiManagerService {

    constructor(){
        wifi.init({
            iface: 'wlan0'
        })
    }

    getConnection(){
        return wifi.getCurrentConnections((error, currentConnections) => {
            if (error) {
              console.log(error);
              return error
            } else {
              console.log(currentConnections);
                return currentConnections;
            }
          });
    }


    async connectToWiFi(dto: wifiDto) {
        await wifi.scan();
        return wifi.connect({ssid: dto.ssid, password: dto.password});
    }

    disconnectFromWiFi() {
        return new Promise((resolve, reject) => {
            exec('nmcli device disconnect wlan0', (error, stdout, stderr) => {
            if (error) {
                reject(stderr);
            } else {
                resolve(stdout);
            }
            });
        });
    }
}

// network_id=$( wpa_cli -i wlan0 add_network | tail -n 1);  wpa_cli -i wlan0 set_network $network_id ssid '"Benshotspot"';  wpa_cli -i wlan0 set_network $network_id psk '"test1234"';  wpa_cli -i wlan0 enable_network $network_id;  wpa_cli -i wlan0 save_config;  wpa_cli select_network $network_id -i wlan0