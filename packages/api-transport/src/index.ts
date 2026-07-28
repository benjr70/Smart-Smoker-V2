/**
 * Shared HTTP transport primitives for the smart smoker API clients.
 *
 * Ports & adapters: the transport port is the only seam that knows HTTP exists
 * (production = the axios adapter, tests = a fake backend built on the kernel),
 * and a single typed {@link ApiError} class describes every failure. Each app's
 * deep client sits above these, owning its own URL construction, response
 * shaping and route table.
 */
export type { HttpMethod, TransportPort } from './transport';
export { ApiError } from './transport';
export type { HttpTransportOptions } from './httpAdapter';
export { createHttpTransport } from './httpAdapter';
export type {
  FakeBackendKernel,
  FakeRequest,
  FakeRouteTable,
  FaultInjection,
  RecordedRequest,
} from './fakeBackend';
export { clone, createFakeBackendKernel, NO_ROUTE } from './fakeBackend';
