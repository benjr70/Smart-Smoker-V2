import React from 'react';
import { render, screen } from '@testing-library/react';
import App from './App';

test('renders smoker interface', () => {
  render(<App />);
  const startButton = screen.getByText(/Start Smoking/i);
  expect(startButton).toBeInTheDocument();
});
