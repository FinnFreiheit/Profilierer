import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { errorMiddleware, requestFehlerLog } from './log.js';

// console.warn/error abfangen, damit die Tests still bleiben und die Aufrufe pruefbar sind.
let warns, errors;
const origWarn = console.warn;
const origError = console.error;

beforeEach(() => {
  warns = [];
  errors = [];
  console.warn = (...args) => warns.push(args);
  console.error = (...args) => errors.push(args);
});

afterEach(() => {
  console.warn = origWarn;
  console.error = origError;
});

const fakeReq = () => ({ method: 'GET', originalUrl: '/api/profiles/x' });

/** Fake-res: EventEmitter mit status()/json() wie Express. */
const fakeRes = (statusCode = 200) => {
  const res = new EventEmitter();
  res.statusCode = statusCode;
  res.headersSent = false;
  res.body = undefined;
  res.status = (s) => ((res.statusCode = s), res);
  res.json = (b) => ((res.body = b), res);
  return res;
};

test('requestFehlerLog loggt Antworten mit Status >= 400', () => {
  const res = fakeRes(404);
  let nexted = false;
  requestFehlerLog(fakeReq(), res, () => (nexted = true));
  assert.equal(nexted, true);
  res.emit('finish');
  assert.equal(warns.length, 1);
  assert.equal(warns[0][0], '[xjp] 404 GET /api/profiles/x');
});

test('requestFehlerLog loggt erfolgreiche Antworten nicht', () => {
  const res = fakeRes(200);
  requestFehlerLog(fakeReq(), res, () => {});
  res.emit('finish');
  assert.equal(warns.length, 0);
});

test('errorMiddleware antwortet mit 500-JSON und loggt den Fehler', () => {
  const res = fakeRes();
  errorMiddleware(new Error('DB kaputt'), fakeReq(), res, () => {});
  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: 'Interner Serverfehler' });
  assert.equal(errors.length, 1);
  assert.equal(errors[0][0], '[xjp] FEHLER GET /api/profiles/x:');
});

test('errorMiddleware reicht err.status und message durch (z. B. Body-Parse 400)', () => {
  const err = new Error('Unexpected token');
  err.status = 400;
  const res = fakeRes();
  errorMiddleware(err, fakeReq(), res, () => {});
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: 'Unexpected token' });
});

test('errorMiddleware delegiert bei headersSent an next', () => {
  const res = fakeRes();
  res.headersSent = true;
  let nextErr = null;
  const err = new Error('zu spaet');
  errorMiddleware(err, fakeReq(), res, (e) => (nextErr = e));
  assert.equal(nextErr, err);
  assert.equal(res.body, undefined);
});
