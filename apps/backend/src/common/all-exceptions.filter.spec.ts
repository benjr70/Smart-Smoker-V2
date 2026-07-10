import {
  ArgumentsHost,
  ConflictException,
  HttpException,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;
  let json: jest.Mock;
  let status: jest.Mock;
  let host: ArgumentsHost;

  beforeEach(() => {
    filter = new AllExceptionsFilter();
    json = jest.fn();
    status = jest.fn().mockReturnValue({ json });
    host = {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
        getRequest: () => ({ url: '/api/postSmoke/abc' }),
      }),
    } as unknown as ArgumentsHost;
  });

  const statusCodeOf = () => status.mock.calls[0][0];
  const bodyOf = () => json.mock.calls[0][0];

  it('passes an HttpException through with its own status', () => {
    filter.catch(new NotFoundException('missing'), host);

    expect(statusCodeOf()).toBe(HttpStatus.NOT_FOUND);
    expect(bodyOf()).toMatchObject({
      statusCode: HttpStatus.NOT_FOUND,
      path: '/api/postSmoke/abc',
    });
  });

  it('maps a Mongoose CastError to 400', () => {
    const castError = Object.assign(new Error('cast failed'), {
      name: 'CastError',
    });

    filter.catch(castError, host);

    expect(statusCodeOf()).toBe(HttpStatus.BAD_REQUEST);
  });

  it('maps a Mongoose ValidationError to 400', () => {
    const validationError = Object.assign(new Error('validation failed'), {
      name: 'ValidationError',
    });

    filter.catch(validationError, host);

    expect(statusCodeOf()).toBe(HttpStatus.BAD_REQUEST);
  });

  it('maps a Mongo E11000 duplicate-key error to 409', () => {
    const dupError = Object.assign(new Error('E11000 duplicate key'), {
      name: 'MongoServerError',
      code: 11000,
    });

    filter.catch(dupError, host);

    expect(statusCodeOf()).toBe(HttpStatus.CONFLICT);
  });

  it('maps a ConflictException through as 409', () => {
    filter.catch(new ConflictException('dup'), host);

    expect(statusCodeOf()).toBe(HttpStatus.CONFLICT);
  });

  it('maps an unknown error to 500', () => {
    filter.catch(new Error('boom'), host);

    expect(statusCodeOf()).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
  });

  it('produces a uniform error body', () => {
    filter.catch(new NotFoundException('missing'), host);

    const body = bodyOf();
    expect(body).toHaveProperty('statusCode');
    expect(body).toHaveProperty('error');
    expect(body).toHaveProperty('message');
    expect(body).toHaveProperty('path');
    expect(body).toHaveProperty('timestamp');
  });

  it('uses the raw string when an HttpException carries a string response', () => {
    filter.catch(
      new HttpException('plain message', HttpStatus.BAD_REQUEST),
      host,
    );

    expect(statusCodeOf()).toBe(HttpStatus.BAD_REQUEST);
    expect(bodyOf().message).toBe('plain message');
  });

  it('falls back to exception.message when the response object has no message', () => {
    filter.catch(
      new HttpException({ error: 'Teapot' }, HttpStatus.I_AM_A_TEAPOT),
      host,
    );

    expect(statusCodeOf()).toBe(HttpStatus.I_AM_A_TEAPOT);
    expect(bodyOf().message).toBeDefined();
  });

  it('supplies default messages when Mongo/unknown errors carry none', () => {
    filter.catch({ code: 11000 }, host);
    expect(statusCodeOf()).toBe(HttpStatus.CONFLICT);
    expect(bodyOf().message).toBe('Duplicate key error');

    json.mockClear();
    status.mockClear();
    filter.catch({ name: 'CastError' }, host);
    expect(statusCodeOf()).toBe(HttpStatus.BAD_REQUEST);
    expect(bodyOf().message).toBe('Invalid request');

    json.mockClear();
    status.mockClear();
    filter.catch({}, host);
    expect(statusCodeOf()).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(bodyOf().message).toBe('Internal server error');
  });

  it('tolerates a missing request object when building the path', () => {
    const hostNoReq = {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
        getRequest: () => undefined,
      }),
    } as unknown as ArgumentsHost;

    filter.catch(new NotFoundException('missing'), hostNoReq);

    expect(bodyOf().path).toBeUndefined();
  });
});
