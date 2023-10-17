## Smoker Pi Software

* tailscale
* network manager
  * https://pimylifeup.com/raspberry-pi-network-manager/
* nvm/node/npm
  * `curl -o- https://raw.githubusercontent.com/creationix/nvm/v0.31.3/install.sh | bash`
* docker
  * `curl -fsSL https://get.docker.com -o get-docker.sh`
  * `sudo sh get-docker.sh`
* power button stuff
* github action runner if needed

### Kiosk mode
* used [this video](https://www.youtube.com/watch?v=kdugp7DrODY) to set boot screen settings
* removed mouse by setting `xserver-command = X -nocursor` in `/etc/lightdm/lightdm.conf`
* auto hide the task bar and set desktop to boot splash screen
* lots of more setting in `.config/lxpanel/LXDE-pi/panels/pane`