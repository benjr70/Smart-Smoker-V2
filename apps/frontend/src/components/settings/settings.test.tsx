import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Settings } from './settings';

// Mock the Material-UI components
jest.mock('@mui/material', () => ({
  Grid: ({ children, ...props }: any) => (
    <div data-testid="grid" {...props}>
      {children}
    </div>
  ),
  Typography: ({ children, ...props }: any) => (
    <div data-testid="typography" {...props}>
      {children}
    </div>
  ),
  Card: ({ children, ...props }: any) => (
    <div data-testid="card" className="card" {...props}>
      {children}
    </div>
  ),
  CardContent: ({ children, ...props }: any) => (
    <div data-testid="card-content" {...props}>
      {children}
    </div>
  ),
  ThemeProvider: ({ children, theme, ...props }: any) => (
    <div data-testid="theme-provider" data-theme={JSON.stringify(theme)} {...props}>
      {children}
    </div>
  ),
  createTheme: jest.fn(theme => theme),
}));

// Mock the NotificationsCard component
jest.mock('./notifications', () => ({
  NotificationsCard: () => <div data-testid="notifications-card">Mocked NotificationsCard</div>,
}));

describe('Settings Component', () => {
  test('should render Settings component successfully', () => {
    render(<Settings />);

    expect(screen.getByText('Settings')).toBeInTheDocument();
    expect(screen.getByTestId('notifications-card')).toBeInTheDocument();
    expect(screen.getByText(/Version:/)).toBeInTheDocument();
  });

  test('should render version information', () => {
    render(<Settings />);

    const versionText = screen.getByText(/Version:/);
    expect(versionText).toBeInTheDocument();
  });

  test('should render NotificationsCard component', () => {
    render(<Settings />);

    expect(screen.getByTestId('notifications-card')).toBeInTheDocument();
    expect(screen.getByText('Mocked NotificationsCard')).toBeInTheDocument();
  });
});
