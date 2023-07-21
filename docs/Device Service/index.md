# Getting Started

after installing (on the welcome page)

just run <br>
`npm run start` <br>

This will fail to boot if the serial port fails to connect <br>
so this has to be run on the pi or edit that serial port


# Components 
### Wifi

This service uses the network-manager linux package to manage the wifi changing.<br>
This required network-manager to be install on the pi and to disable the wpa service that is on by default.<br>


### Serial port

This stuff can be found in the serial.service.ts. if you go there it probs tells you what you need <br>
defaults to `/dev/ttyUSB0` port

### Websocket

takes the serial read an uses a websocket to shoot the temps over to the smoker frontend