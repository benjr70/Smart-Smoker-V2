import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { SmokeProfileCard } from './smokeProfileCard';
import { smokeProfile } from '../../../Services/smokerService';
import { TempData } from 'temperaturechart/src/tempChart';

// Mock Material-UI components
jest.mock('@mui/material', () => ({
  Card: ({ children, ...props }: any) => (
    <div data-testid="card" {...props}>
      {children}
    </div>
  ),
  CardContent: ({ children, ...props }: any) => (
    <div data-testid="card-content" {...props}>
      {children}
    </div>
  ),
  Grid: ({ children, ...props }: any) => (
    <div data-testid="grid" {...props}>
      {children}
    </div>
  ),
  ThemeProvider: ({ children, theme, ...props }: any) => (
    <div data-testid="theme-provider" data-theme={JSON.stringify(theme)} {...props}>
      {children}
    </div>
  ),
  Typography: ({ children, variant, component, align, sx, ...props }: any) => (
    <div
      data-testid="typography"
      data-variant={variant}
      data-component={component}
      data-align={align}
      data-sx={JSON.stringify(sx)}
      {...props}
    >
      {children}
    </div>
  ),
  createTheme: jest.fn(theme => theme),
}));

// Mock TempChart
jest.mock('temperaturechart/src/tempChart', () => ({
  __esModule: true,
  default: ({
    ChamberTemp,
    MeatTemp,
    Meat2Temp,
    Meat3Temp,
    ChamberName,
    Probe1Name,
    Probe2Name,
    Probe3Name,
    date,
    smoking,
    initData,
  }: any) => (
    <div
      data-testid="temp-chart"
      data-chamber-temp={ChamberTemp}
      data-meat-temp={MeatTemp}
      data-meat2-temp={Meat2Temp}
      data-meat3-temp={Meat3Temp}
      data-chamber-name={ChamberName}
      data-probe1-name={Probe1Name}
      data-probe2-name={Probe2Name}
      data-probe3-name={Probe3Name}
      data-date={date}
      data-smoking={smoking ? 'true' : 'false'}
      data-init-data={JSON.stringify(initData)}
    />
  ),
}));

describe('SmokeProfileCard Component', () => {
  const mockSmokeProfile: smokeProfile = {
    chamberName: 'Main Chamber',
    probe1Name: 'Point',
    probe2Name: 'Flat',
    probe3Name: 'Ambient',
    notes: 'Great smoke session',
    woodType: 'Hickory',
  };

  const mockTemps: TempData[] = [
    {
      ChamberTemp: 225,
      MeatTemp: 150,
      Meat2Temp: 145,
      Meat3Temp: 140,
      date: new Date('2023-07-15T12:00:00Z'),
    },
    {
      ChamberTemp: 250,
      MeatTemp: 180,
      Meat2Temp: 170,
      Meat3Temp: 160,
      date: new Date('2023-07-15T14:00:00Z'),
    },
  ];

  const mockProps = {
    smokeProfile: mockSmokeProfile,
    temps: mockTemps,
  };

  describe('Component Rendering', () => {
    test('should render SmokeProfileCard component successfully', () => {
      render(<SmokeProfileCard {...mockProps} />);
      expect(screen.getByTestId('grid')).toBeInTheDocument();
      expect(screen.getByTestId('theme-provider')).toBeInTheDocument();
      expect(screen.getByTestId('card')).toBeInTheDocument();
      expect(screen.getByTestId('card-content')).toBeInTheDocument();
    });

    test('should render Smoke title', () => {
      render(<SmokeProfileCard {...mockProps} />);
      expect(screen.getByText('Smoke')).toBeInTheDocument();
    });

    test('should render probe names and chamber name', () => {
      render(<SmokeProfileCard {...mockProps} />);
      expect(screen.getByText('Main Chamber')).toBeInTheDocument();
      expect(screen.getByText('Point')).toBeInTheDocument();
      expect(screen.getByText('Flat')).toBeInTheDocument();
      expect(screen.getByText('Ambient')).toBeInTheDocument();
    });

    test('should render wood type and notes', () => {
      render(<SmokeProfileCard {...mockProps} />);
      expect(screen.getByText('Hickory Wood')).toBeInTheDocument();
      expect(screen.getByText('Great smoke session')).toBeInTheDocument();
    });

    test('should render TempChart with correct props', () => {
      render(<SmokeProfileCard {...mockProps} />);
      const tempChart = screen.getByTestId('temp-chart');
      expect(tempChart).toHaveAttribute('data-chamber-temp', '250');
      expect(tempChart).toHaveAttribute('data-meat-temp', '180');
      expect(tempChart).toHaveAttribute('data-meat2-temp', '170');
      expect(tempChart).toHaveAttribute('data-meat3-temp', '160');
      expect(tempChart).toHaveAttribute('data-chamber-name', 'Main Chamber');
      expect(tempChart).toHaveAttribute('data-probe1-name', 'Point');
      expect(tempChart).toHaveAttribute('data-probe2-name', 'Flat');
      expect(tempChart).toHaveAttribute('data-probe3-name', 'Ambient');
      expect(tempChart).toHaveAttribute('data-date', new Date('2023-07-15T14:00:00Z').toString());
      expect(tempChart).toHaveAttribute('data-smoking', 'false');
    });
  });

  describe('Props Validation', () => {
    test('should handle missing probe names and chamber name', () => {
      const propsWithMissingNames = {
        smokeProfile: {
          ...mockSmokeProfile,
          chamberName: null as any,
          probe1Name: null as any,
          probe2Name: null as any,
          probe3Name: null as any,
        },
        temps: mockTemps,
      };
      render(<SmokeProfileCard {...propsWithMissingNames} />);
      expect(screen.getByText('Chamber')).toBeInTheDocument();
      expect(screen.getByText('Probe 1')).toBeInTheDocument();
      expect(screen.getByText('Probe 2')).toBeInTheDocument();
      expect(screen.getByText('Probe 3')).toBeInTheDocument();
    });

    test('should handle empty temps array', () => {
      const propsWithEmptyTemps = {
        smokeProfile: mockSmokeProfile,
        temps: [],
      };
      render(<SmokeProfileCard {...propsWithEmptyTemps} />);
      // Should not crash, but TempChart will get undefined values
      expect(screen.getByTestId('temp-chart')).toBeInTheDocument();
    });
  });

  describe('Component Structure', () => {
    test('should have correct grid and card structure', () => {
      render(<SmokeProfileCard {...mockProps} />);
      expect(screen.getByTestId('grid')).toBeInTheDocument();
      expect(screen.getByTestId('card')).toBeInTheDocument();
      expect(screen.getByTestId('card-content')).toBeInTheDocument();
    });

    test('should have correct typography for probe and chamber names', () => {
      render(<SmokeProfileCard {...mockProps} />);
      const typographies = screen.getAllByTestId('typography');
      expect(typographies.some(t => t.textContent === 'Main Chamber')).toBe(true);
      expect(typographies.some(t => t.textContent === 'Point')).toBe(true);
      expect(typographies.some(t => t.textContent === 'Flat')).toBe(true);
      expect(typographies.some(t => t.textContent === 'Ambient')).toBe(true);
    });
  });

  describe('Theme Integration', () => {
    test('should apply theme provider with custom theme', () => {
      render(<SmokeProfileCard {...mockProps} />);
      const themeProvider = screen.getByTestId('theme-provider');
      const theme = JSON.parse(themeProvider.getAttribute('data-theme') || '{}');
      expect(theme.components.MuiCard.styleOverrides.root.backgroundColor).toBe('white');
      expect(theme.components.MuiCard.styleOverrides.root.borderRadius).toBe('15px');
    });
  });

  describe('Edge Cases', () => {
    test('should handle very long notes and wood type', () => {
      const propsWithLongNotes = {
        smokeProfile: {
          ...mockSmokeProfile,
          notes: 'A'.repeat(200),
          woodType: 'VeryLongWoodTypeNameThatExceedsNormalLength',
        },
        temps: mockTemps,
      };
      render(<SmokeProfileCard {...propsWithLongNotes} />);
      expect(
        screen.getByText('VeryLongWoodTypeNameThatExceedsNormalLength Wood')
      ).toBeInTheDocument();
      expect(screen.getByText('A'.repeat(200))).toBeInTheDocument();
    });
  });
});
