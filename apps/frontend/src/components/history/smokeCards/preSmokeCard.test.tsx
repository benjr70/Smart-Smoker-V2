import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { PreSmokeCard } from './preSmokeCard';
import { preSmoke } from '../../common/interfaces/preSmoke';
import { WeightUnits } from '../../common/interfaces/enums';

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
  Grid: ({ children, paddingBottom, ...props }: any) => (
    <div data-testid="grid" data-padding-bottom={paddingBottom} {...props}>
      {children}
    </div>
  ),
  ThemeProvider: ({ children, theme, ...props }: any) => (
    <div data-testid="theme-provider" data-theme={JSON.stringify(theme)} {...props}>
      {children}
    </div>
  ),
  Typography: ({
    children,
    variant,
    component,
    align,
    sx,
    paddingBottom,
    padding,
    paragraph,
    color,
    ...props
  }: any) => (
    <div
      data-testid="typography"
      data-variant={variant}
      data-component={component}
      data-align={align}
      data-sx={JSON.stringify(sx)}
      data-padding-bottom={paddingBottom}
      data-padding={padding}
      data-paragraph={paragraph}
      data-color={color}
      {...props}
    >
      {children}
    </div>
  ),
  createTheme: jest.fn(theme => theme),
}));

describe('PreSmokeCard Component', () => {
  const mockPreSmokeData: preSmoke = {
    name: 'BBQ Brisket',
    meatType: 'Beef Brisket',
    weight: {
      weight: 12,
      unit: WeightUnits.LB,
    },
    steps: ['Trim excess fat', 'Apply dry rub', 'Let rest for 2 hours'],
    notes: 'Make sure to keep the fat cap on for moisture',
  };

  const mockProps = {
    preSmoke: mockPreSmokeData,
  };

  describe('Component Rendering', () => {
    test('should render PreSmokeCard component successfully', () => {
      render(<PreSmokeCard {...mockProps} />);

      expect(screen.getByTestId('grid')).toBeInTheDocument();
      expect(screen.getByTestId('theme-provider')).toBeInTheDocument();
      expect(screen.getByTestId('card')).toBeInTheDocument();
      expect(screen.getByTestId('card-content')).toBeInTheDocument();
    });

    test('should render PreSmoke title', () => {
      render(<PreSmokeCard {...mockProps} />);
      expect(screen.getByText(/PreSmoke/)).toBeInTheDocument();
    });

    test('should render smoke name', () => {
      render(<PreSmokeCard {...mockProps} />);
      expect(screen.getByText(/BBQ Brisket/)).toBeInTheDocument();
    });

    test('should render meat type and weight information', () => {
      render(<PreSmokeCard {...mockProps} />);
      // Use regex to allow for whitespace splitting
      expect(screen.getByText(/Beef Brisket\s*12\s*LB/)).toBeInTheDocument();
    });

    test('should render all preparation steps', () => {
      render(<PreSmokeCard {...mockProps} />);
      expect(screen.getByText(/1\. Trim excess fat/)).toBeInTheDocument();
      expect(screen.getByText(/2\. Apply dry rub/)).toBeInTheDocument();
      expect(screen.getByText(/3\. Let rest for 2 hours/)).toBeInTheDocument();
    });

    test('should render notes', () => {
      render(<PreSmokeCard {...mockProps} />);
      expect(screen.getByText(/Make sure to keep the fat cap on for moisture/)).toBeInTheDocument();
    });
  });

  describe('Props Validation', () => {
    test('should handle different weight units', () => {
      const propsWithOz = {
        preSmoke: {
          ...mockPreSmokeData,
          weight: { weight: 8, unit: WeightUnits.OZ },
        },
      };
      render(<PreSmokeCard {...propsWithOz} />);
      expect(screen.getByText(/Beef Brisket\s*8\s*OZ/)).toBeInTheDocument();
    });

    test('should handle missing weight values', () => {
      const propsWithoutWeight = {
        preSmoke: {
          ...mockPreSmokeData,
          weight: {},
        },
      };
      render(<PreSmokeCard {...propsWithoutWeight} />);
      expect(screen.getByText(/Beef Brisket/)).toBeInTheDocument();
    });

    test('should handle missing weight unit', () => {
      const propsWithoutUnit = {
        preSmoke: {
          ...mockPreSmokeData,
          weight: { weight: 12 },
        },
      };
      render(<PreSmokeCard {...propsWithoutUnit} />);
      expect(screen.getByText(/Beef Brisket\s*12/)).toBeInTheDocument();
    });

    test('should handle missing weight amount', () => {
      const propsWithoutAmount = {
        preSmoke: {
          ...mockPreSmokeData,
          weight: { unit: WeightUnits.LB },
        },
      };
      render(<PreSmokeCard {...propsWithoutAmount} />);
      expect(screen.getByText(/Beef Brisket\s*LB/)).toBeInTheDocument();
    });

    test('should handle empty steps array', () => {
      const propsWithoutSteps = {
        preSmoke: {
          ...mockPreSmokeData,
          steps: [],
        },
      };

      render(<PreSmokeCard {...propsWithoutSteps} />);

      expect(screen.getByText('PreSmoke')).toBeInTheDocument();
      expect(screen.queryByText(/^\d+\./)).not.toBeInTheDocument();
    });

    test('should handle single step', () => {
      const propsWithSingleStep = {
        preSmoke: {
          ...mockPreSmokeData,
          steps: ['Season generously'],
        },
      };

      render(<PreSmokeCard {...propsWithSingleStep} />);

      expect(screen.getByText('1. Season generously')).toBeInTheDocument();
    });

    test('should handle many steps', () => {
      const propsWithManySteps = {
        preSmoke: {
          ...mockPreSmokeData,
          steps: Array.from({ length: 10 }, (_, i) => `Step ${i + 1}`),
        },
      };

      render(<PreSmokeCard {...propsWithManySteps} />);

      expect(screen.getByText('1. Step 1')).toBeInTheDocument();
      expect(screen.getByText('10. Step 10')).toBeInTheDocument();
    });
  });

  describe('Optional Fields', () => {
    test('should handle missing name', () => {
      const propsWithoutName = {
        preSmoke: {
          ...mockPreSmokeData,
          name: undefined,
        },
      };

      render(<PreSmokeCard {...propsWithoutName} />);

      expect(screen.getByTestId('card')).toBeInTheDocument();
      // Should still render the card structure
    });

    test('should handle missing meat type', () => {
      const propsWithoutMeatType = {
        preSmoke: {
          ...mockPreSmokeData,
          meatType: undefined,
        },
      };
      render(<PreSmokeCard {...propsWithoutMeatType} />);
      // Just check for weight and unit
      expect(screen.getByText(/12\s*LB/)).toBeInTheDocument();
    });

    test('should handle missing notes', () => {
      const propsWithoutNotes = {
        preSmoke: {
          ...mockPreSmokeData,
          notes: undefined,
        },
      };

      render(<PreSmokeCard {...propsWithoutNotes} />);

      expect(screen.getByTestId('card')).toBeInTheDocument();
      // Should not crash without notes
    });

    test('should handle empty notes', () => {
      const propsWithEmptyNotes = {
        preSmoke: {
          ...mockPreSmokeData,
          notes: '',
        },
      };

      render(<PreSmokeCard {...propsWithEmptyNotes} />);

      expect(screen.getByTestId('card')).toBeInTheDocument();
    });
  });

  describe('Component Structure', () => {
    test('should have correct grid padding', () => {
      render(<PreSmokeCard {...mockProps} />);

      const grid = screen.getByTestId('grid');
      expect(grid).toHaveAttribute('data-padding-bottom', '1');
    });

    test('should have correct typography variants for title', () => {
      render(<PreSmokeCard {...mockProps} />);

      const typographies = screen.getAllByTestId('typography');

      // Check PreSmoke title
      const preSmokeTitle = typographies.find(
        t =>
          t.getAttribute('data-variant') === 'h5' &&
          t.getAttribute('data-align') === 'center' &&
          t.textContent === 'PreSmoke'
      );
      expect(preSmokeTitle).toBeInTheDocument();

      // Check name title
      const nameTitle = typographies.find(
        t => t.getAttribute('data-variant') === 'h5' && t.textContent === 'BBQ Brisket'
      );
      expect(nameTitle).toBeInTheDocument();
    });

    test('should have correct typography for meat info', () => {
      render(<PreSmokeCard {...mockProps} />);

      const typographies = screen.getAllByTestId('typography');

      const meatInfo = typographies.find(
        t =>
          t.getAttribute('data-color') === 'text.secondary' &&
          t.getAttribute('data-padding-bottom') === '1' &&
          t.textContent === 'Beef Brisket 12 LB'
      );
      expect(meatInfo).toBeInTheDocument();
    });

    test('should have correct typography for steps', () => {
      render(<PreSmokeCard {...mockProps} />);

      const typographies = screen.getAllByTestId('typography');

      const stepTypographies = typographies.filter(t => {
        const sx = JSON.parse(t.getAttribute('data-sx') || '{}');
        return sx.fontSize === 18;
      });

      expect(stepTypographies).toHaveLength(3);
    });

    test('should have correct typography for notes', () => {
      render(<PreSmokeCard {...mockProps} />);

      const typographies = screen.getAllByTestId('typography');

      const notesTypography = typographies.find(
        t =>
          t.getAttribute('data-padding') === '1' &&
          t.getAttribute('data-paragraph') === 'true' &&
          t.getAttribute('data-color') === 'text.secondary' &&
          t.textContent === 'Make sure to keep the fat cap on for moisture'
      );
      expect(notesTypography).toBeInTheDocument();
    });
  });

  describe('Theme Integration', () => {
    test('should apply theme provider with custom theme', () => {
      render(<PreSmokeCard {...mockProps} />);

      const themeProvider = screen.getByTestId('theme-provider');
      const theme = JSON.parse(themeProvider.getAttribute('data-theme') || '{}');

      expect(theme.components.MuiCard.styleOverrides.root.backgroundColor).toBe('white');
      expect(theme.components.MuiCard.styleOverrides.root.borderRadius).toBe('15px');
    });
  });

  describe('Step Mapping', () => {
    test('should correctly map step indices starting from 1', () => {
      render(<PreSmokeCard {...mockProps} />);

      expect(screen.getByText('1. Trim excess fat')).toBeInTheDocument();
      expect(screen.getByText('2. Apply dry rub')).toBeInTheDocument();
      expect(screen.getByText('3. Let rest for 2 hours')).toBeInTheDocument();
    });

    test('should have unique keys for step elements', () => {
      render(<PreSmokeCard {...mockProps} />);

      // This tests that the mapping works correctly with keys
      // We can't directly test keys, but we can test that all steps render
      const stepElements = screen.getAllByText(/^\d+\./);
      expect(stepElements).toHaveLength(3);
    });
  });

  describe('Edge Cases', () => {
    test('should handle extremely long step descriptions', () => {
      const propsWithLongSteps = {
        preSmoke: {
          ...mockPreSmokeData,
          steps: [
            'This is an extremely long step description that might overflow the container and cause layout issues in the user interface',
          ],
        },
      };

      render(<PreSmokeCard {...propsWithLongSteps} />);

      expect(screen.getByText(/^1\. This is an extremely long step/)).toBeInTheDocument();
    });

    test('should handle special characters in steps', () => {
      const propsWithSpecialChars = {
        preSmoke: {
          ...mockPreSmokeData,
          steps: [
            'Season with salt & pepper (2-3 tbsp)',
            'Heat to 225°F',
            'Cook until 195°F internal temp',
          ],
        },
      };

      render(<PreSmokeCard {...propsWithSpecialChars} />);

      expect(screen.getByText('1. Season with salt & pepper (2-3 tbsp)')).toBeInTheDocument();
      expect(screen.getByText('2. Heat to 225°F')).toBeInTheDocument();
      expect(screen.getByText('3. Cook until 195°F internal temp')).toBeInTheDocument();
    });

    test('should handle zero weight', () => {
      const propsWithZeroWeight = {
        preSmoke: {
          ...mockPreSmokeData,
          weight: { weight: 0, unit: WeightUnits.LB },
        },
      };

      render(<PreSmokeCard {...propsWithZeroWeight} />);

      expect(screen.getByText('Beef Brisket 0 LB')).toBeInTheDocument();
    });
  });
});
