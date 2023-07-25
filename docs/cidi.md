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

Using tailscale to manage my network, this provides a private internal network for all devices. 

