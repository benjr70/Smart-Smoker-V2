import { createServer, Server as HttpServer } from 'http';
import { AddressInfo } from 'net';
import { Server, Socket as ServerSocket } from 'socket.io';
import { DeviceFeedAdapter, createDeviceFeedAdapter } from './device-feed';

/**
 * Integration backstop for the device feed adapter: a real in-process
 * socket.io server on an ephemeral port stands in for device-service, which
 * re-broadcasts each raw serial frame verbatim on the `temp` event.
 */

function waitUntil(cond: () => boolean, timeoutMs = 2000): Promise<void> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = (): void => {
      if (cond()) return resolve();
      if (Date.now() - started > timeoutMs) return reject(new Error('waitUntil timed out'));
      setTimeout(tick, 5);
    };
    tick();
  });
}

describe('createDeviceFeedAdapter (integration)', () => {
  let httpServer: HttpServer;
  let io: Server;
  let url: string;
  let serverSockets: ServerSocket[];
  let adapter: DeviceFeedAdapter | undefined;

  beforeEach(async () => {
    httpServer = createServer();
    io = new Server(httpServer);
    serverSockets = [];
    io.on('connection', socket => serverSockets.push(socket));
    await new Promise<void>(resolve => httpServer.listen(0, resolve));
    const { port } = httpServer.address() as AddressInfo;
    url = `http://localhost:${port}`;
  });

  afterEach(async () => {
    adapter?.close();
    adapter = undefined;
    io.close();
    await new Promise<void>(resolve => httpServer.close(() => resolve()));
  });

  it('delivers the raw temp frame string unmodified', async () => {
    adapter = createDeviceFeedAdapter(url);
    const received: string[] = [];
    adapter.onReading(raw => received.push(raw));

    await waitUntil(() => serverSockets.length > 0);
    const frame = JSON.stringify({ Meat: '123.45', Meat2: '0', Meat3: '0', Chamber: '210.00' });
    io.emit('temp', frame);

    await waitUntil(() => received.length > 0);
    expect(received[0]).toBe(frame);
    expect(typeof received[0]).toBe('string');
  });

  it('fires connection-change and tracks connected across disconnect and reconnect', async () => {
    const { port } = httpServer.address() as AddressInfo;
    adapter = createDeviceFeedAdapter(url);
    const states: boolean[] = [];
    adapter.onConnectionChange(connected => states.push(connected));
    expect(adapter.connected).toBe(false);

    await waitUntil(() => adapter?.connected === true);
    expect(states[0]).toBe(true);

    io.close();
    await new Promise<void>(resolve => httpServer.close(() => resolve()));
    await waitUntil(() => states.includes(false));
    expect(adapter.connected).toBe(false);

    httpServer = createServer();
    io = new Server(httpServer);
    io.on('connection', socket => serverSockets.push(socket));
    await new Promise<void>(resolve => httpServer.listen(port, resolve));

    await waitUntil(() => adapter?.connected === true, 8000);
    expect(states.slice(0, 3)).toEqual([true, false, true]);
  }, 15000);

  it('stops delivering to a listener after its unsubscribe handle is called', async () => {
    adapter = createDeviceFeedAdapter(url);
    const received: string[] = [];
    const unsubscribe = adapter.onReading(raw => received.push(raw));
    const stopConn = adapter.onConnectionChange(() => undefined);

    await waitUntil(() => adapter?.connected === true);
    unsubscribe();
    stopConn();
    io.emit('temp', JSON.stringify({ Meat: '1', Meat2: '2', Meat3: '3', Chamber: '4' }));

    await new Promise<void>(resolve => setTimeout(resolve, 100));
    expect(received).toHaveLength(0);
  });

  it('delivers no callbacks after close()', async () => {
    adapter = createDeviceFeedAdapter(url);
    const received: string[] = [];
    adapter.onReading(raw => received.push(raw));

    await waitUntil(() => adapter?.connected === true);
    adapter.close();
    expect(adapter.connected).toBe(false);

    io.emit('temp', JSON.stringify({ Meat: '1', Meat2: '2', Meat3: '3', Chamber: '4' }));
    await new Promise<void>(resolve => setTimeout(resolve, 100));
    expect(received).toHaveLength(0);
  });
});
