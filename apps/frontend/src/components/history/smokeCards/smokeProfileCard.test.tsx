import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { SmokeProfileCard } from './smokeProfileCard';
import { SmokeProfile } from '../../../api/types';
import { TempData } from 'temperaturechart/src/tempChart';
import { plotBoxOf } from 'temperaturechart/src/chartGeometry';

// Mock Material-UI components
jest.mock('@mui/material', () => ({
  Card: ({ children, 'data-testid': _dataTestId, ...props }: any) => (
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
}));

// The chart is not stubbed: it draws itself in plain React SVG, so what the
// review card shows of a stored cook is assertable here.

describe('SmokeProfileCard Component', () => {
  const mockSmokeProfile: SmokeProfile = {
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
      expect(screen.getByTestId('card')).toBeInTheDocument();
      expect(screen.getByTestId('card-content')).toBeInTheDocument();
    });

    test('should render Smoke title', () => {
      render(<SmokeProfileCard {...mockProps} />);
      expect(screen.getByText('Smoke')).toBeInTheDocument();
    });

    test('should render probe names and chamber name', () => {
      render(<SmokeProfileCard {...mockProps} />);

      // Each name is written twice: once as the card's own readout, and once in
      // the chart's legend, labelling that probe's line.
      ['Main Chamber', 'Point', 'Flat', 'Ambient'].forEach(name =>
        expect(screen.getAllByText(name)).toHaveLength(2)
      );
    });

    test('should render each renamed readout under its own test id', () => {
      // The chart is handed the very same names, so the e2e review check needs
      // an id per readout to read the card rather than the chart.
      render(<SmokeProfileCard {...mockProps} />);

      expect(screen.getByTestId('review-smoke-chambername')).toHaveTextContent('Main Chamber');
      expect(screen.getByTestId('review-smoke-probe1name')).toHaveTextContent('Point');
      expect(screen.getByTestId('review-smoke-probe2name')).toHaveTextContent('Flat');
      expect(screen.getByTestId('review-smoke-probe3name')).toHaveTextContent('Ambient');
    });

    test('should render notes under their own test id', () => {
      render(<SmokeProfileCard {...mockProps} />);

      expect(screen.getByTestId('review-smoke-notes')).toHaveTextContent('Great smoke session');
    });

    test('should render wood type and notes', () => {
      render(<SmokeProfileCard {...mockProps} />);
      expect(screen.getByText('Hickory Wood')).toBeInTheDocument();
      expect(screen.getByText('Great smoke session')).toBeInTheDocument();
    });

    test('draws the stored cook as a line per probe', () => {
      const { container } = render(<SmokeProfileCard {...mockProps} />);

      const lines = Array.from(container.querySelectorAll('path[data-series]'));

      expect(lines).toHaveLength(4);
      // Two stored readings a couple of hours apart, so each line is drawn
      // between two moments rather than being a single dot.
      lines.forEach(line => expect(line.getAttribute('d')).toMatch(/[LC]/));
    });

    test('draws no target across a cook that is already over', () => {
      const { container } = render(<SmokeProfileCard {...mockProps} />);

      expect(container.querySelectorAll('[data-target]')).toHaveLength(0);
      expect(container.querySelectorAll('[data-target-label]')).toHaveLength(0);
    });

    test('draws it in the shape the review card has room for', () => {
      const { container } = render(<SmokeProfileCard {...mockProps} />);
      const compact = plotBoxOf('compact');

      expect(container.querySelector('svg')).toHaveAttribute(
        'viewBox',
        `0 0 ${compact.width} ${compact.height}`
      );
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

      // The default names stand in on the card and in the chart's legend alike.
      ['Chamber', 'Probe 1', 'Probe 2', 'Probe 3'].forEach(name =>
        expect(screen.getAllByText(name)).toHaveLength(2)
      );
    });

    test('should handle empty temps array', () => {
      const propsWithEmptyTemps = {
        smokeProfile: mockSmokeProfile,
        temps: [],
      };
      const { container } = render(<SmokeProfileCard {...propsWithEmptyTemps} />);
      // A smoke with nothing recorded still draws its frame and its legend.
      expect(screen.getByRole('img', { name: 'Temperature chart' })).toBeInTheDocument();
      expect(container.querySelectorAll('path[data-series]')).toHaveLength(4);
    });
  });

  describe('Component Structure', () => {
    test('should have correct grid and card structure', () => {
      render(<SmokeProfileCard {...mockProps} />);
      expect(screen.getByTestId('grid')).toBeInTheDocument();
      expect(screen.getByTestId('card')).toBeInTheDocument();
      expect(screen.getByTestId('card-content')).toBeInTheDocument();
    });

    // Each name is painted in its own probe's colour, and which colour that is
    // depends on the colour scheme in effect — something this suite's stub
    // components, which have no theme to read, cannot see. It is asserted
    // against real Material-UI, under both schemes, in
    // `src/theme/restyledScreens.test.tsx`.
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
