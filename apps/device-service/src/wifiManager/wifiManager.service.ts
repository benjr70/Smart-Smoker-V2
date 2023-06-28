import { HttpException, HttpStatus, Injectable } from "@nestjs/common";
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
        return wifi.getCurrentConnections();
    }


    async connectToWiFi(dto: wifiDto) {
        await wifi.scan();
         return await wifi.connect({ssid: dto.ssid, password: dto.password}).catch(err => {
            const newString = err.message.split('\n');
            console.log('here', newString);
            throw new HttpException({
                status: HttpStatus.BAD_REQUEST,
                error: err.message,
            }, HttpStatus.BAD_REQUEST);
         });
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


Command failed: nmcli -w 10 device wifi connect hhhhhhh password  ifname wlan0\nError: No network with SSID 'hhhhhhh' found.\n"
status: 4