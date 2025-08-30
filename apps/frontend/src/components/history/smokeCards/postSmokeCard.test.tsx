import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { PostSmokeCard } from './postSmokeCard';
import { PostSmoke } from '../../smoke/postSmokeStep/PostSmokeStep';

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

describe('PostSmokeCard Component', () => {
  const mockPostSmokeData: PostSmoke = {
    restTime: '30 minutes',
    steps: ['Wrap in butcher paper', 'Let rest in cooler', 'Slice against the grain'],
    notes: 'Resting is crucial for juicy meat',
  };

  const mockProps = {
    postSmoke: mockPostSmokeData,
  };

  describe('Component Rendering', () => {
    test('should render PostSmokeCard component successfully', () => {
      render(<PostSmokeCard {...mockProps} />);

      expect(screen.getByTestId('grid')).toBeInTheDocument();
      expect(screen.getByTestId('theme-provider')).toBeInTheDocument();
      expect(screen.getByTestId('card')).toBeInTheDocument();
      expect(screen.getByTestId('card-content')).toBeInTheDocument();
    });

    test('should render PostSmoke title', () => {
      render(<PostSmokeCard {...mockProps} />);

      expect(screen.getByText('PostSmoke')).toBeInTheDocument();
    });

    test('should render rest time', () => {
      render(<PostSmokeCard {...mockProps} />);

      expect(screen.getByText('Rest Time: 30 minutes')).toBeInTheDocument();
    });

    test('should render all post-smoke steps', () => {
      render(<PostSmokeCard {...mockProps} />);

      expect(screen.getByText('1. Wrap in butcher paper')).toBeInTheDocument();
      expect(screen.getByText('2. Let rest in cooler')).toBeInTheDocument();
      expect(screen.getByText('3. Slice against the grain')).toBeInTheDocument();
    });

    test('should render notes', () => {
      render(<PostSmokeCard {...mockProps} />);

      expect(screen.getByText('Resting is crucial for juicy meat')).toBeInTheDocument();
    });
  });

  describe('Props Validation', () => {
    test('should handle different rest times', () => {
      const propsWithDifferentRest = {
        postSmoke: {
          ...mockPostSmokeData,
          restTime: '2 hours',
        },
      };

      render(<PostSmokeCard {...propsWithDifferentRest} />);

      expect(screen.getByText('Rest Time: 2 hours')).toBeInTheDocument();
    });

    test('should handle empty rest time', () => {
      const propsWithEmptyRest = {
        postSmoke: {
          ...mockPostSmokeData,
          restTime: '',
        },
      };

      render(<PostSmokeCard {...propsWithEmptyRest} />);

      expect(screen.getByText(/Rest Time:/)).toBeInTheDocument();
    });

    test('should handle empty steps array', () => {
      const propsWithoutSteps = {
        postSmoke: {
          ...mockPostSmokeData,
          steps: [],
        },
      };

      render(<PostSmokeCard {...propsWithoutSteps} />);

      expect(screen.getByText('PostSmoke')).toBeInTheDocument();
      expect(screen.queryByText(/^\d+\./)).not.toBeInTheDocument();
    });

    test('should handle single step', () => {
      const propsWithSingleStep = {
        postSmoke: {
          ...mockPostSmokeData,
          steps: ['Let meat rest'],
        },
      };

      render(<PostSmokeCard {...propsWithSingleStep} />);

      expect(screen.getByText('1. Let meat rest')).toBeInTheDocument();
    });

    test('should handle many steps', () => {
      const propsWithManySteps = {
        postSmoke: {
          ...mockPostSmokeData,
          steps: Array.from({ length: 8 }, (_, i) => `Post step ${i + 1}`),
        },
      };

      render(<PostSmokeCard {...propsWithManySteps} />);

      expect(screen.getByText('1. Post step 1')).toBeInTheDocument();
      expect(screen.getByText('8. Post step 8')).toBeInTheDocument();
    });
  });

  describe('Optional Fields', () => {
    test('should handle missing notes', () => {
      const propsWithoutNotes = {
        postSmoke: {
          ...mockPostSmokeData,
          notes: undefined,
        },
      };

      render(<PostSmokeCard {...propsWithoutNotes} />);

      expect(screen.getByTestId('card')).toBeInTheDocument();
      // Should not crash without notes
    });

    test('should handle empty notes', () => {
      const propsWithEmptyNotes = {
        postSmoke: {
          ...mockPostSmokeData,
          notes: '',
        },
      };

      render(<PostSmokeCard {...propsWithEmptyNotes} />);

      expect(screen.getByTestId('card')).toBeInTheDocument();
    });
  });

  describe('Component Structure', () => {
    test('should have correct grid padding', () => {
      render(<PostSmokeCard {...mockProps} />);

      const grid = screen.getByTestId('grid');
      expect(grid).toHaveAttribute('data-padding-bottom', '1');
    });

    test('should have correct typography variants for title', () => {
      render(<PostSmokeCard {...mockProps} />);

      const typographies = screen.getAllByTestId('typography');

      // Check PostSmoke title
      const postSmokeTitle = typographies.find(
        t =>
          t.getAttribute('data-variant') === 'h5' &&
          t.getAttribute('data-align') === 'center' &&
          t.textContent === 'PostSmoke'
      );
      expect(postSmokeTitle).toBeInTheDocument();

      // Check rest time title
      const restTimeTitle = typographies.find(
        t => t.getAttribute('data-variant') === 'h6' && t.textContent === 'Rest Time: 30 minutes'
      );
      expect(restTimeTitle).toBeInTheDocument();
    });

    test('should have correct typography for steps', () => {
      render(<PostSmokeCard {...mockProps} />);

      const typographies = screen.getAllByTestId('typography');

      const stepTypographies = typographies.filter(t => {
        const sx = JSON.parse(t.getAttribute('data-sx') || '{}');
        return sx.fontSize === 18;
      });

      expect(stepTypographies).toHaveLength(3);
    });

    test('should have correct typography for notes', () => {
      render(<PostSmokeCard {...mockProps} />);

      const typographies = screen.getAllByTestId('typography');

      const notesTypography = typographies.find(
        t =>
          t.getAttribute('data-padding') === '1' &&
          t.getAttribute('data-paragraph') === 'true' &&
          t.getAttribute('data-color') === 'text.secondary' &&
          t.textContent === 'Resting is crucial for juicy meat'
      );
      expect(notesTypography).toBeInTheDocument();
    });
  });

  describe('Theme Integration', () => {
    test('should apply theme provider with custom theme', () => {
      render(<PostSmokeCard {...mockProps} />);

      const themeProvider = screen.getByTestId('theme-provider');
      const theme = JSON.parse(themeProvider.getAttribute('data-theme') || '{}');

      expect(theme.components.MuiCard.styleOverrides.root.backgroundColor).toBe('white');
      expect(theme.components.MuiCard.styleOverrides.root.borderRadius).toBe('15px');
    });
  });

  describe('Step Mapping', () => {
    test('should correctly map step indices starting from 1', () => {
      render(<PostSmokeCard {...mockProps} />);

      expect(screen.getByText('1. Wrap in butcher paper')).toBeInTheDocument();
      expect(screen.getByText('2. Let rest in cooler')).toBeInTheDocument();
      expect(screen.getByText('3. Slice against the grain')).toBeInTheDocument();
    });

    test('should have unique keys for step elements', () => {
      render(<PostSmokeCard {...mockProps} />);

      // This tests that the mapping works correctly with keys
      // We can't directly test keys, but we can test that all steps render
      const stepElements = screen.getAllByText(/^\d+\./);
      expect(stepElements).toHaveLength(3);
    });
  });

  describe('Edge Cases', () => {
    test('should handle extremely long step descriptions', () => {
      const propsWithLongSteps = {
        postSmoke: {
          ...mockPostSmokeData,
          steps: [
            'This is an extremely long post-smoke step description that might overflow the container and cause layout issues in the user interface',
          ],
        },
      };

      render(<PostSmokeCard {...propsWithLongSteps} />);

      expect(
        screen.getByText(/^1\. This is an extremely long post-smoke step/)
      ).toBeInTheDocument();
    });

    test('should handle special characters in steps', () => {
      const propsWithSpecialChars = {
        postSmoke: {
          ...mockPostSmokeData,
          steps: [
            'Rest at 140°F for 30-45 minutes',
            'Slice 1/4" thick against grain',
            'Serve with BBQ sauce & sides',
          ],
        },
      };

      render(<PostSmokeCard {...propsWithSpecialChars} />);

      expect(screen.getByText('1. Rest at 140°F for 30-45 minutes')).toBeInTheDocument();
      expect(screen.getByText('2. Slice 1/4" thick against grain')).toBeInTheDocument();
      expect(screen.getByText('3. Serve with BBQ sauce & sides')).toBeInTheDocument();
    });

    test('should handle very long rest time', () => {
      const propsWithLongRestTime = {
        postSmoke: {
          ...mockPostSmokeData,
          restTime: 'Overnight in refrigerator, then 2 hours at room temperature before serving',
        },
      };

      render(<PostSmokeCard {...propsWithLongRestTime} />);

      expect(screen.getByText(/^Rest Time: Overnight in refrigerator/)).toBeInTheDocument();
    });

    test('should handle special characters in rest time', () => {
      const propsWithSpecialRestTime = {
        postSmoke: {
          ...mockPostSmokeData,
          restTime: '45-60 minutes @ 150°F',
        },
      };

      render(<PostSmokeCard {...propsWithSpecialRestTime} />);

      expect(screen.getByText('Rest Time: 45-60 minutes @ 150°F')).toBeInTheDocument();
    });

    test('should handle very long notes', () => {
      const propsWithLongNotes = {
        postSmoke: {
          ...mockPostSmokeData,
          notes:
            'This is a very long note that contains detailed instructions about the post-smoking process including temperature management, timing considerations, and serving suggestions that might span multiple lines in the user interface.',
        },
      };

      render(<PostSmokeCard {...propsWithLongNotes} />);

      expect(
        screen.getByText(/^This is a very long note that contains detailed/)
      ).toBeInTheDocument();
    });
  });

  describe('Interface Compliance', () => {
    test('should accept PostSmoke interface correctly', () => {
      const validPostSmoke: PostSmoke = {
        restTime: '1 hour',
        steps: ['Step 1', 'Step 2'],
        notes: 'Test notes',
      };

      const props = { postSmoke: validPostSmoke };

      expect(() => render(<PostSmokeCard {...props} />)).not.toThrow();
    });

    test('should handle PostSmoke with minimal required fields', () => {
      const minimalPostSmoke: PostSmoke = {
        restTime: '30 min',
        steps: [],
      };

      const props = { postSmoke: minimalPostSmoke };

      render(<PostSmokeCard {...props} />);

      expect(screen.getByText('Rest Time: 30 min')).toBeInTheDocument();
      expect(screen.getByText('PostSmoke')).toBeInTheDocument();
    });
  });
});
