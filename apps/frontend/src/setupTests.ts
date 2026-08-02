// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';
import { stubSystemColorScheme } from 'theme/src/testing/systemColorScheme';

// Every browser has a media-query engine, and the app asks it which colour
// scheme the device prefers; jsdom has none at all, so anything rendering the
// app root would throw. Give every test a device that prefers light — a test
// about the colour scheme takes it over.
beforeEach(() => {
  stubSystemColorScheme(false);
});
