FROM --platform=linux/arm/v7 ubuntu:22.04

COPY apps/electron-shell/out/electron-shell-linux-x64 /electron-shell-linux-x64
RUN chmod +x ./electron-shell-linux-x64/electron-shell

CMD ["./electron-shell-linux-x64/electron-shell"]