import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { SmokeCard } from './smokeCard';

// Mock Material-UI components
jest.mock('@mui/material', () => ({
  Button: ({ children, onClick, size, color, ...props }: any) => (
    <button data-testid="button" onClick={onClick} data-size={size} data-color={color} {...props}>
      {children}
    </button>
  ),
  Card: ({ children, ...props }: any) => (
    <div data-testid="card" {...props}>
      {children}
    </div>
  ),
  CardActions: ({ children, sx, ...props }: any) => (
    <div data-testid="card-actions" data-sx={JSON.stringify(sx)} {...props}>
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
  Rating: ({ name, defaultValue, size, max, value, ...props }: any) => (
    <div
      data-testid="rating"
      data-name={name}
      data-default-value={defaultValue}
      data-size={size}
      data-max={max}
      data-value={value}
      {...props}
    >
      Rating: {value}/10
    </div>
  ),
  ThemeProvider: ({ children, theme, ...props }: any) => (
    <div data-testid="theme-provider" data-theme={JSON.stringify(theme)} {...props}>
      {children}
    </div>
  ),
  Typography: ({ children, variant, component, sx, color, ...props }: any) => (
    <div
      data-testid="typography"
      data-variant={variant}
      data-component={component}
      data-sx={JSON.stringify(sx)}
      data-color={color}
      {...props}
    >
      {children}
    </div>
  ),
  createTheme: jest.fn(theme => theme),
}));

describe('SmokeCard Component', () => {
  const mockProps = {
    name: 'Brisket Smoke',
    meatType: 'Brisket',
    date: '2023-07-15',
    weight: '12',
    weightUnit: 'lbs',
    smokeId: 'smoke-123',
    woodType: 'Hickory',
    overAllRatings: '8.5',
    onViewClick: jest.fn(),
    onDeleteClick: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Component Rendering', () => {
    test('should render SmokeCard component successfully', () => {
      render(<SmokeCard {...mockProps} />);

      expect(screen.getByTestId('grid')).toBeInTheDocument();
      expect(screen.getByTestId('theme-provider')).toBeInTheDocument();
      expect(screen.getByTestId('card')).toBeInTheDocument();
    });

    test('should render smoke name correctly', () => {
      render(<SmokeCard {...mockProps} />);
      expect(screen.getByText(/Brisket Smoke/)).toBeInTheDocument();
    });

    test('should render smoke details correctly', () => {
      render(<SmokeCard {...mockProps} />);
      // Use regex to allow for whitespace splitting
      expect(screen.getByText(/12\s*lbs\s*Brisket\s*Hickory\s*wood/)).toBeInTheDocument();
      expect(screen.getByText(/2023-07-15/)).toBeInTheDocument();
    });

    test('should render rating component with correct value', () => {
      render(<SmokeCard {...mockProps} />);

      const rating = screen.getByTestId('rating');
      expect(rating).toHaveAttribute('data-value', '8.5');
      expect(rating).toHaveAttribute('data-max', '10');
      expect(rating).toHaveAttribute('data-size', 'large');
      expect(rating).toHaveTextContent('Rating: 8.5/10');
    });

    test('should render View and Delete buttons', () => {
      render(<SmokeCard {...mockProps} />);

      expect(screen.getByText('View')).toBeInTheDocument();
      expect(screen.getByText('delete')).toBeInTheDocument();
    });
  });

  describe('Props Validation', () => {
    test('should handle different weight units', () => {
      const propsWithOz = { ...mockProps, weight: '8', weightUnit: 'oz' };
      render(<SmokeCard {...propsWithOz} />);
      expect(screen.getByText(/8\s*oz\s*Brisket\s*Hickory\s*wood/)).toBeInTheDocument();
    });

    test('should handle different meat types', () => {
      const propsWithPork = { ...mockProps, meatType: 'Pork Shoulder' };
      render(<SmokeCard {...propsWithPork} />);
      expect(screen.getByText(/12\s*lbs\s*Pork Shoulder\s*Hickory\s*wood/)).toBeInTheDocument();
    });

    test('should handle different wood types', () => {
      const propsWithApple = { ...mockProps, woodType: 'Apple' };
      render(<SmokeCard {...propsWithApple} />);
      expect(screen.getByText(/12\s*lbs\s*Brisket\s*Apple\s*wood/)).toBeInTheDocument();
    });

    test('should handle zero rating', () => {
      const propsWithZeroRating = { ...mockProps, overAllRatings: '0' };
      render(<SmokeCard {...propsWithZeroRating} />);

      const rating = screen.getByTestId('rating');
      expect(rating).toHaveAttribute('data-value', '0');
    });

    test('should handle maximum rating', () => {
      const propsWithMaxRating = { ...mockProps, overAllRatings: '10' };
      render(<SmokeCard {...propsWithMaxRating} />);

      const rating = screen.getByTestId('rating');
      expect(rating).toHaveAttribute('data-value', '10');
    });

    test('should handle decimal ratings', () => {
      const propsWithDecimal = { ...mockProps, overAllRatings: '7.3' };
      render(<SmokeCard {...propsWithDecimal} />);

      const rating = screen.getByTestId('rating');
      expect(rating).toHaveAttribute('data-value', '7.3');
    });
  });

  describe('User Interactions', () => {
    test('should call onViewClick when View button is clicked', () => {
      render(<SmokeCard {...mockProps} />);

      const viewButton = screen.getByText('View');
      fireEvent.click(viewButton);

      expect(mockProps.onViewClick).toHaveBeenCalledTimes(1);
      expect(mockProps.onViewClick).toHaveBeenCalledWith('smoke-123');
    });

    test('should call onDeleteClick when delete button is clicked', () => {
      render(<SmokeCard {...mockProps} />);

      const deleteButton = screen.getByText('delete');
      fireEvent.click(deleteButton);

      expect(mockProps.onDeleteClick).toHaveBeenCalledTimes(1);
      expect(mockProps.onDeleteClick).toHaveBeenCalledWith('smoke-123');
    });

    test('should not call callbacks when buttons are not clicked', () => {
      render(<SmokeCard {...mockProps} />);

      expect(mockProps.onViewClick).not.toHaveBeenCalled();
      expect(mockProps.onDeleteClick).not.toHaveBeenCalled();
    });
  });

  describe('Component Structure', () => {
    test('should have correct typography variants', () => {
      render(<SmokeCard {...mockProps} />);

      const typographies = screen.getAllByTestId('typography');

      // Check name typography
      const nameTypography = typographies.find(
        t => t.getAttribute('data-variant') === 'h5' && t.getAttribute('data-component') === 'div'
      );
      expect(nameTypography).toBeInTheDocument();
      expect(nameTypography).toHaveTextContent('Brisket Smoke');

      // Check detail typographies
      const detailTypographies = typographies.filter(
        t => t.getAttribute('data-color') === 'text.secondary'
      );
      expect(detailTypographies).toHaveLength(2);
    });

    test('should have correct button properties', () => {
      render(<SmokeCard {...mockProps} />);

      const buttons = screen.getAllByTestId('button');
      expect(buttons).toHaveLength(2);

      const viewButton = buttons.find(b => b.textContent === 'View');
      const deleteButton = buttons.find(b => b.textContent === 'delete');

      expect(viewButton).toHaveAttribute('data-size', 'small');
      expect(deleteButton).toHaveAttribute('data-size', 'small');
      expect(deleteButton).toHaveAttribute('data-color', 'error');
    });

    test('should have correct card actions styling', () => {
      render(<SmokeCard {...mockProps} />);

      const cardActions = screen.getByTestId('card-actions');
      const sx = JSON.parse(cardActions.getAttribute('data-sx') || '{}');

      expect(sx.display).toBe('flex');
      expect(sx.justifyContent).toBe('space-between');
    });
  });

  describe('Theme Integration', () => {
    test('should apply theme provider with custom theme', () => {
      render(<SmokeCard {...mockProps} />);

      const themeProvider = screen.getByTestId('theme-provider');
      const theme = JSON.parse(themeProvider.getAttribute('data-theme') || '{}');

      expect(theme.components.MuiCard.styleOverrides.root.backgroundColor).toBe('white');
      expect(theme.components.MuiCard.styleOverrides.root.borderRadius).toBe('15px');
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty string values', () => {
      const emptyProps = {
        ...mockProps,
        name: '',
        meatType: '',
        woodType: '',
        weight: '',
        weightUnit: '',
        date: '',
      };
      render(<SmokeCard {...emptyProps} />);
      expect(screen.getByTestId('card')).toBeInTheDocument();
      // Use regex to allow for whitespace splitting
      expect(screen.getByText(/wood/)).toBeInTheDocument();
    });

    test('should handle invalid rating strings', () => {
      const invalidRatingProps = { ...mockProps, overAllRatings: 'invalid' };
      render(<SmokeCard {...invalidRatingProps} />);

      const rating = screen.getByTestId('rating');
      expect(rating).toHaveAttribute('data-value', 'NaN');
    });

    test('should handle very long names and descriptions', () => {
      const longTextProps = {
        ...mockProps,
        name: 'A very long smoke session name that might overflow the container',
        meatType: 'Super long meat type description',
        woodType: 'Extremely descriptive wood type name',
      };

      render(<SmokeCard {...longTextProps} />);

      expect(screen.getByText(longTextProps.name)).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    test('should have proper button roles', () => {
      render(<SmokeCard {...mockProps} />);

      const viewButton = screen.getByText('View');
      const deleteButton = screen.getByText('delete');

      expect(viewButton.tagName).toBe('BUTTON');
      expect(deleteButton.tagName).toBe('BUTTON');
    });

    test('should have rating component with proper attributes', () => {
      render(<SmokeCard {...mockProps} />);

      const rating = screen.getByTestId('rating');
      expect(rating).toHaveAttribute('data-name', 'size-large');
    });
  });
});
