import { Injectable } from "@nestjs/common";
import { exec } from "child_process";
import { wifiDto } from "./wifiDto";



@Injectable()
export class WifiManagerService {

    connectToWiFi(dto: wifiDto) {
        return new Promise((resolve, reject) => {
            exec(
            `network_id=$( wpa_cli -i wlan0 add_network | tail -n 1);  wpa_cli -i wlan0 set_network $network_id ssid '"${dto.ssid}"';  wpa_cli -i wlan0 set_network $network_id psk '"${dto.password}"';  wpa_cli -i wlan0 enable_network $network_id;  wpa_cli -i wlan0 save_config;  wpa_cli select_network $network_id -i wlan0`,
            (error, stdout, stderr) => {
                if (error) {
                reject(stderr);
                } else {
                resolve(stdout);
                }
            }
            );
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