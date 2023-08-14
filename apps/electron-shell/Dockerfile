FROM --platform=linux/arm/v7 ubuntu:22.04

COPY apps/electron-shell/out/electron-shell-linux-armv7l /electron-shell-linux-armv7l
RUN chmod +x ./electron-shell-linux-armv7l/electron-shell

CMD ["./electron-shell-linux-armv7l/electron-shell"]