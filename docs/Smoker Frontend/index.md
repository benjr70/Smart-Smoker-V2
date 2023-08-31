# Getting Started

after installing (on the welcome page)

just run <br>
`npm run start` <br>
and <br>
visit `http://localhost:8080` <br>

will need to run the backend in order for app to function and save data <br>
so go to that page to set that up

make sure you double check the values in .env.local is pointing to your local backend (it should be by default)

dimensions for the ui is build for 800 X 400


## Electron shell

To build electron shell use the `npm run forge:thin` cmd to build for you arch <br>
use the `npm run forgeLinux64:thin` to build for pi 3 that is used on smoker (results may vary base on what you are building on)

To run electron docker container on pi use this cdm <br>
```
sudo xhost local:root && sudo docker run --net=host -v /tmp/.X11-unix:/tmp/.X11-unix -e DISPLAY=unix$DISPLAY -v`pwd`/src:/app/src --rm -it --device /dev/snd benjr70/smart_smoker:electron-shell
```
