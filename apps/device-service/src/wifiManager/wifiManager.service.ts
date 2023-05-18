import { Injectable } from "@nestjs/common";
import { exec } from "child_process";
import { wifiDto } from "./wifiDto";



@Injectable()
export class WifiManagerService {

    connectToWiFi(dto: wifiDto) {
        return new Promise((resolve, reject) => {
            exec(
            `nmcli device wifi connect "${dto.ssid}" password "${dto.password}"`,
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