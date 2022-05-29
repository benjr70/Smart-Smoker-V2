#!/usr/bin/python3.9
import time
import serial
import re
import asyncio
import websockets

ser =  serial.Serial( port = '/dev/ttyUSB0',
                      baudrate = 9600,
                      parity = serial.PARITY_NONE,
                      stopbits = serial.STOPBITS_ONE,
                      bytesize = serial.EIGHTBITS,
                      timeout = 1
                      )


async def handler(websocket, path):
 
    # data = await websocket.recv()
 
    # reply = f"Data recieved as:  {data}!"
	
	await websocket.send(ser.readline().decode('utf-8'))
	line = ser.readline().decode('utf-8')
	print(line)
 
 
 
start_server = websockets.serve(handler, "localhost", 8000)
 
 
 
asyncio.get_event_loop().run_until_complete(start_server)
 
asyncio.get_event_loop().run_forever()