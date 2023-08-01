# Overview



### Docker commands

* From base folder build and push test smoker image 
* must do a npm run build first for smoker
* ` docker build -f apps/smoker/Dockerfile --platform linux/arm/v7  -t benjr70/smart_smoker:smokerTest .`
* ` docker push benjr70/smart_smoker:smokerTest`

* pull and run smoker image on pi
* `docker pull benjr70/smart_smoker:smokerTest`
* `docker run -p 8080:8080 benjr70/smart_smoker:smokerTest`

* From base folder build and push test device service image 
* ` docker build -f apps/device-service/Dockerfile --platform linux/arm/v7  -t benjr70/smart_smoker:device-serviceTest .`
* ` docker push benjr70/smart_smoker:device-serviceTest`

* pull and run device service on pi
* `docker pull benjr70/smart_smoker:device-serviceTest`
* `docker run --privileged  --device=/dev/ttyUSB0 -p 3000:3000 benjr70/smart_smoker:device-serviceTest`


### Network

Using Tailscale to manage my network, this provides a private internal network for all devices. 

Tailscale creates the ssl cert and key and also serves the sites
I used the tailscale funnel feature to expose the frontend and backend to the broad web for the cloud app
that url is https://smokecloud.tail74646.ts.net for the frontend and https://smokecloud.tail74646.ts.net:8443 for the backend

use command tailscale funnel status should result in this output if correctly set up

    ubuntu@ubuntu:/etc/nginx/sites-available$ sudo tailscale funnel status

    # Funnel on:
    #     - https://smokecloud.tail74646.ts.net
    #     - https://smokecloud.tail74646.ts.net:8443

    https://smokecloud.tail74646.ts.net (Funnel on)
    |-- / proxy http://127.0.0.1:80

    https://smokecloud.tail74646.ts.net:8443 (Funnel on)
    |-- / proxy http://127.0.0.1:3001

To get there you must to a `tailscale serve http:<port> / <local"port>` then a `tailscale funnel <port> on`
for each service you want outside the network

For the deploy workflow i had to stop the tailscale service then do docker compose up then start it again.<BR>
This is because tailscale would not let go of the ports I need so i had to kill it first get the containers running then start it back up. A proper would would be great but couldn't find that at the time

#### Tailscale docs links<br>
* [General](https://tailscale.com/kb/start/)
* [Serve](https://tailscale.com/kb/1242/tailscale-serve/)
* [Https](https://tailscale.com/kb/1153/enabling-https/)


