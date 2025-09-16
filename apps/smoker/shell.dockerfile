FROM arm32v7/ubuntu:20.04

ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=America/New_York

RUN apt-get update && \
    apt-get install -y \
        socat \
        wmctrl \
        x11-utils \
        dumb-init \
        inotify-tools \
        libxss1 \
        libnss3 \
        libnss3-tools \
        libnspr4 \
        libgbm1 \
        libatk1.0-0 \
        libatk1.0 \
        libatk-bridge2.0-0 \
        librust-gdk-pixbuf-sys-dev \
        libgdk-pixbuf2.0-0 \
        libgtk-3-0 \
        libasound2 \
        xauth && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

RUN mkdir -p /usr/local/smoker/emerald-shell-linux-armv7l/
COPY apps/smoker/out/smoker-electron-build/smoker-shell-linux-armv7l /usr/local/smoker/smoker-shell-linux-armv7l/
WORKDIR /usr/local/smoker/smoker-shell-linux-armv7l
RUN chmod +x smoker-shell
CMD [ "./smoker-shell", "--no-sandbox" ]

# sudo xhost local:root && sudo docker run --net=host \
#   -v /tmp/.X11-unix:/tmp/.X11-unix -e DISPLAY=unix$DISPLAY \
#   -v "$(pwd)"/src:/app/src --rm -it --device /dev/snd \
#   benjr70/smart-smoker-electron-shell:latest


# sudo docker run --net=host \
#   -v /tmp/.X11-unix:/tmp/.X11-unix -e DISPLAY=unix:0 \
#   -v "$(pwd)"/src:/app/src --rm -it --device /dev/snd \
#   benjr70/smart-smoker-electron-shell:latest
