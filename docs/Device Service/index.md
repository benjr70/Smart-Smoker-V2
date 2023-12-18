# Getting Started

after installing (on the welcome page)

just run <br>
`npm run start` <br>

This will start the device service using fake generated temps, these temps can be changed in the `generateTemps` function in the `serial.service.ts` file


# Components 

### Wifi

This service uses the network-manager linux package to manage the wifi changing.<br>
This required network-manager to be install on the pi and to disable the wpa service that is on by default.<br>


### Serial port

This stuff can be found in the `serial.service.ts`. if you go there it probs tells you what you need <br>
defaults to `/dev/ttyS0` port, this is the port for the Pi's RX and Tx pins.

### Websocket

takes the serial read an uses a websocket to shoot the temps over to the smoker frontend