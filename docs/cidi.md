# Overview


### Version Deployments

To create a new production deployment

1. Update version in package.json
2. Create a version tag in github for that commit
3. Run the `Install Smart Smoker v2` github action with the new version number


### Container deployment

Containers for the smoker is handled by watchtower. When a new container is push to docker hub watchertower will see that pull is down and replace the only one on the smoker. The delpoyment workflow is set for a manually trigger. This wil have to be used when there is an update to `smoker.docker-compose.yml` or `smoker-deploy.yml` 

Watchtower settings can be seen in the `smoker.docker-compose.yml` 

Containers for the cloud is still deploy via github action workflows

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


### Portainer Container Monitoring

using portainer to host the container monitoring dashboard.<br>
To install on cloud pi just run the following docker run cmd <br>
`docker run -d -p 10000:9000 --name portainer --restart always -v /var/run/docker.sock:/var/run/docker.sock portainer/portainer-ce`<br>

Once this is done you can connect to it via the smokerCloudIp:10000. using port 10000 because it was the last funnel port in tailscale. <br>
also had to set that up just like the other ports.

To set up the smoker pi follow the instructions [here](https://docs.portainer.io/admin/environments/add/docker/agent) to set up a portainer agent environment.

I did not add this portainer Container to the deployment process as it should work as a separate entity to the smoker app. also it clears all setting when you reset that container.


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
