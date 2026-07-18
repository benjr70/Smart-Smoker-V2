import { createServer, Server as HttpServer } from 'http';
import { AddressInfo } from 'net';
import { Server, Socket as ServerSocket } from 'socket.io';
import { SmokeUpdate } from '../wire/types';
import { CloudSocketAdapter, createCloudSocketAdapter } from './cloud-socket';

/**
 * Integration backstop for the cloud socket adapter: a real in-process
 * socket.io server on an ephemeral port stands in for the backend gateway, so
 * the adapter's connect/disconnect and frame semantics are anchored to the
 * wire, not to the in-memory fakes.
 */

/** Resolve once `cond` holds, or reject after `timeoutMs`. */
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

describe('createCloudSocketAdapter (integration)', () => {
  let httpServer: HttpServer;
  let io: Server;
  let url: string;
  let serverSockets: ServerSocket[];
  let adapter: CloudSocketAdapter | undefined;

  beforeEach(async () => {
    httpServer = createServer();
    io = new Server(httpServer);
    serverSockets = [];
    io.on('connection', socket => {
      serverSockets.push(socket);
      // Mirror the backend gateway: re-broadcast what a client emits.
      socket.on('smokeUpdate', data => io.emit('smokeUpdate', data));
      socket.on('clear', data => io.emit('clear', data));
    });
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

  it('delivers an inbound events frame as the raw JSON string, unmodified', async () => {
    adapter = createCloudSocketAdapter(url);
    const received: string[] = [];
    adapter.onEvents(payload => received.push(payload));

    await waitUntil(() => serverSockets.length > 0);
    const frame = JSON.stringify({ chamberTemp: '212.5', probeTemp1: '145.0' });
    io.emit('events', frame);

    await waitUntil(() => received.length > 0);
    expect(received[0]).toBe(frame);
    expect(typeof received[0]).toBe('string');
  });

  it('round-trips an emitted smokeUpdate as an object, envelope preserved', async () => {
    adapter = createCloudSocketAdapter(url);
    const received: SmokeUpdate[] = [];
    adapter.onSmokeUpdate(update => received.push(update));

    await waitUntil(() => serverSockets.length > 0);
    const update: SmokeUpdate = {
      smoking: true,
      chamberName: 'Chamber',
      probe1Name: 'Brisket',
      probe2Name: 'probe 2',
      probe3Name: 'probe 3',
    };
    adapter.emitSmokeUpdate(update);

    await waitUntil(() => received.length > 0);
    expect(received[0]).toEqual(update);
    expect(typeof received[0]).toBe('object');
  });

  it('fires onClear when an emitted clear signal round-trips the server', async () => {
    adapter = createCloudSocketAdapter(url);
    let cleared = 0;
    adapter.onClear(() => (cleared += 1));

    await waitUntil(() => serverSockets.length > 0);
    adapter.emitClear();

    await waitUntil(() => cleared > 0);
    expect(cleared).toBe(1);
  });

  it('emits an events frame the server receives as the exact raw JSON string', async () => {
    adapter = createCloudSocketAdapter(url);

    await waitUntil(() => serverSockets.length > 0);
    const received: unknown[] = [];
    serverSockets[0].on('events', payload => received.push(payload));

    const frame = JSON.stringify({ chamberTemp: '212.5', probeTemp1: '145.0' });
    adapter.emitEvents(frame);

    await waitUntil(() => received.length > 0);
    expect(received[0]).toBe(frame);
    expect(typeof received[0]).toBe('string');
  });

  it('emits a bare refresh signal the server receives with no payload', async () => {
    adapter = createCloudSocketAdapter(url);

    await waitUntil(() => serverSockets.length > 0);
    let refreshed = 0;
    serverSockets[0].on('refresh', () => (refreshed += 1));

    adapter.emitRefresh();

    await waitUntil(() => refreshed > 0);
    expect(refreshed).toBe(1);
  });

  it('fires onRefresh when the server broadcasts a bare refresh signal', async () => {
    adapter = createCloudSocketAdapter(url);
    let refreshed = 0;
    adapter.onRefresh(() => (refreshed += 1));

    await waitUntil(() => serverSockets.length > 0);
    io.emit('refresh');

    await waitUntil(() => refreshed > 0);
    expect(refreshed).toBe(1);
  });

  it('fires connection-change and tracks connected across disconnect and reconnect', async () => {
    const { port } = httpServer.address() as AddressInfo;
    adapter = createCloudSocketAdapter(url);
    const states: boolean[] = [];
    adapter.onConnectionChange(connected => states.push(connected));
    expect(adapter.connected).toBe(false);

    await waitUntil(() => adapter?.connected === true);
    expect(states[0]).toBe(true);

    // Drop the whole server (transport close), which the client reconnects
    // from — a server-initiated socket.disconnect() would suppress reconnect.
    io.close();
    await new Promise<void>(resolve => httpServer.close(() => resolve()));
    await waitUntil(() => states.includes(false));
    expect(adapter.connected).toBe(false);

    // Bring the server back on the same port; the client auto-reconnects.
    httpServer = createServer();
    io = new Server(httpServer);
    io.on('connection', socket => serverSockets.push(socket));
    await new Promise<void>(resolve => httpServer.listen(port, resolve));

    await waitUntil(() => adapter?.connected === true, 8000);
    expect(states.slice(0, 3)).toEqual([true, false, true]);
  }, 15000);

  it('stops delivering to a listener after its unsubscribe handle is called', async () => {
    adapter = createCloudSocketAdapter(url);
    const received: string[] = [];
    const unsubscribe = adapter.onEvents(payload => received.push(payload));
    const stopConn = adapter.onConnectionChange(() => undefined);

    await waitUntil(() => adapter?.connected === true);
    unsubscribe();
    stopConn();
    io.emit('events', JSON.stringify({ chamberTemp: '200' }));

    await new Promise<void>(resolve => setTimeout(resolve, 100));
    expect(received).toHaveLength(0);
  });

  it('delivers no callbacks after close()', async () => {
    adapter = createCloudSocketAdapter(url);
    const received: string[] = [];
    adapter.onEvents(payload => received.push(payload));

    await waitUntil(() => adapter?.connected === true);
    adapter.close();
    expect(adapter.connected).toBe(false);

    io.emit('events', JSON.stringify({ chamberTemp: '200' }));
    await new Promise<void>(resolve => setTimeout(resolve, 100));
    expect(received).toHaveLength(0);
  });
});
