FROM node:16.15.1


# Install dependencies from https://www.electronjs.org/docs/latest/development/build-instructions-linux
# RUN apt-get install build-essential clang libdbus-1-dev libgtk-3-dev libnotify-dev libasound2-dev libcap-dev libcups2-dev libxtst-dev libxss1 libnss3-dev gcc-multilib g++-multilib curl gperf bison python3-dbusmock openjdk-8-jre
# RUN apt-get install libc6-dev-armhf-cross linux-libc-dev-armhf-cross g++-arm-linux-gnueabihf
# RUN gn gen out/Testing --args='import(...) target_cpu="arm"'


COPY apps/ElectronShell/dist /dist
COPY apps/ElectronShell/package.json package.json


  CMD ["npm", "run", "start"]



