#!/usr/bin/python3.9
import time
import serial
import re
import os
import asyncio
import websockets

os.system("sudo systemctl start nodered.service")

ser =  serial.Serial( port = '/dev/ttyUSB0',
                      baudrate = 9600,
                      parity = serial.PARITY_NONE,
                      stopbits = serial.STOPBITS_ONE,
                      bytesize = serial.EIGHTBITS,
                      timeout = 1
                      )

counter = 0

async with websockets.connect("ws://localhost:5765") as websocket:
	while 1:
		line = ser.readline().decode('utf-8')
		await websocket.send(line);
		print(line);
        