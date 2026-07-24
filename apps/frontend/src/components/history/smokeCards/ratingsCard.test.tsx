import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import {
  ApiClientProvider,
  createApiClient,
  createFakeBackend,
  FakeBackend,
  rating,
  RecordedRequest,
} from '../../../api';
import { RatingsCard } from './ratingsCard';

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
  Rating: ({ name, defaultValue, size, max, value, onChange, ...props }: any) => (
    <input
      data-testid="rating"
      data-name={name}
      data-default-value={defaultValue}
      data-size={size}
      data-max={max}
      value={value}
      onChange={onChange}
      type="number"
      min="0"
      max={max}
      step="0.1"
      {...props}
    />
  ),
  ThemeProvider: ({ children, theme, ...props }: any) => (
    <div data-testid="theme-provider" data-theme={JSON.stringify(theme)} {...props}>
      {children}
    </div>
  ),
  Typography: ({ children, variant, component, align, ...props }: any) => (
    <div
      data-testid="typography"
      data-variant={variant}
      data-component={component}
      data-align={align}
      {...props}
    >
      {children}
    </div>
  ),
  createTheme: jest.fn(theme => theme),
}));

let backend: FakeBackend;

// The rating save routes create-vs-update on `_id`; a rating with an id updates
// the id-scoped path with the DTO-whitelisted body (the `_id` is stripped).
const ratingSaveRequests = (): RecordedRequest[] =>
  backend.requests.filter(r => r.method === 'post' && r.path.startsWith('ratings'));

// The outbound body the client projects for a saved rating: exactly the backend
// DTO whitelist, with the persisted `_id` dropped.
const projectedBody = (r: rating) => ({
  smokeFlavor: r.smokeFlavor,
  seasoning: r.seasoning,
  tenderness: r.tenderness,
  overallTaste: r.overallTaste,
  notes: r.notes,
});

const renderCard = (props: { ratings: rating }) =>
  render(
    <ApiClientProvider client={createApiClient(backend)}>
      <RatingsCard {...props} />
    </ApiClientProvider>
  );

describe('RatingsCard Component', () => {
  const mockRatingData: rating = {
    smokeFlavor: 8,
    seasoning: 7,
    tenderness: 9,
    overallTaste: 8.5,
    notes: 'Excellent smoke flavor',
    _id: 'rating-123',
  };

  const mockProps = {
    ratings: mockRatingData,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    backend = createFakeBackend({
      ratings: { records: { 'rating-123': mockRatingData } },
    });
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Component Rendering', () => {
    test('should render RatingsCard component successfully', () => {
      renderCard(mockProps);

      expect(screen.getByTestId('grid')).toBeInTheDocument();
      expect(screen.getByTestId('theme-provider')).toBeInTheDocument();
      expect(screen.getByTestId('card')).toBeInTheDocument();
      expect(screen.getByTestId('card-content')).toBeInTheDocument();
    });

    test('should render Ratings title', () => {
      renderCard(mockProps);

      expect(screen.getByText('Ratings')).toBeInTheDocument();
    });

    test('should render all rating categories with values', () => {
      renderCard(mockProps);

      expect(screen.getByText('Smoke Flavor: 8')).toBeInTheDocument();
      expect(screen.getByText('Seasoning: 7')).toBeInTheDocument();
      expect(screen.getByText('Tenderness: 9')).toBeInTheDocument();
      expect(screen.getByText('Overall Taste: 8.5')).toBeInTheDocument();
    });

    test('should render all rating input components', () => {
      renderCard(mockProps);

      const ratingInputs = screen.getAllByTestId('rating');
      expect(ratingInputs).toHaveLength(4);

      // Check values
      expect(ratingInputs[0]).toHaveValue(8);
      expect(ratingInputs[1]).toHaveValue(7);
      expect(ratingInputs[2]).toHaveValue(9);
      expect(ratingInputs[3]).toHaveValue(8.5);
    });

    test('should have correct rating component properties', () => {
      renderCard(mockProps);

      const ratingInputs = screen.getAllByTestId('rating');

      ratingInputs.forEach(rating => {
        expect(rating).toHaveAttribute('data-size', 'large');
        expect(rating).toHaveAttribute('data-max', '10');
        expect(rating).toHaveAttribute('data-default-value', '5');
      });
    });
  });

  describe('Props Validation', () => {
    test('should handle zero ratings', () => {
      const propsWithZeroRatings = {
        ratings: {
          ...mockRatingData,
          smokeFlavor: 0,
          seasoning: 0,
          tenderness: 0,
          overallTaste: 0,
        },
      };

      renderCard(propsWithZeroRatings);

      expect(screen.getByText('Smoke Flavor: 0')).toBeInTheDocument();
      expect(screen.getByText('Seasoning: 0')).toBeInTheDocument();
      expect(screen.getByText('Tenderness: 0')).toBeInTheDocument();
      expect(screen.getByText('Overall Taste: 0')).toBeInTheDocument();
    });

    test('should handle maximum ratings', () => {
      const propsWithMaxRatings = {
        ratings: {
          ...mockRatingData,
          smokeFlavor: 10,
          seasoning: 10,
          tenderness: 10,
          overallTaste: 10,
        },
      };

      renderCard(propsWithMaxRatings);

      const ratingInputs = screen.getAllByTestId('rating');
      ratingInputs.forEach(rating => {
        expect(rating).toHaveValue(10);
      });
    });

    test('should handle decimal ratings', () => {
      const propsWithDecimalRatings = {
        ratings: {
          ...mockRatingData,
          smokeFlavor: 7.5,
          seasoning: 8.2,
          tenderness: 9.7,
          overallTaste: 6.8,
        },
      };

      renderCard(propsWithDecimalRatings);

      expect(screen.getByText('Smoke Flavor: 7.5')).toBeInTheDocument();
      expect(screen.getByText('Seasoning: 8.2')).toBeInTheDocument();
      expect(screen.getByText('Tenderness: 9.7')).toBeInTheDocument();
      expect(screen.getByText('Overall Taste: 6.8')).toBeInTheDocument();
    });

    test('should handle missing _id', () => {
      const propsWithoutId = {
        ratings: {
          ...mockRatingData,
          _id: undefined,
        },
      };

      renderCard(propsWithoutId);

      expect(screen.getByTestId('card')).toBeInTheDocument();
      expect(ratingSaveRequests()).toHaveLength(0);
    });

    test('should handle empty notes', () => {
      const propsWithEmptyNotes = {
        ratings: {
          ...mockRatingData,
          notes: '',
        },
      };

      renderCard(propsWithEmptyNotes);

      expect(screen.getByTestId('card')).toBeInTheDocument();
    });
  });

  describe('User Interactions', () => {
    test('should save smoke flavor rating when changed', async () => {
      renderCard(mockProps);

      const ratingInputs = screen.getAllByTestId('rating');
      const smokeFlavorRating = ratingInputs[0];

      fireEvent.change(smokeFlavorRating, { target: { value: '9' } });

      await waitFor(() => {
        expect(backend.requests).toContainEqual({
          method: 'post',
          path: 'ratings/rating-123',
          body: projectedBody({ ...mockRatingData, smokeFlavor: 9 }),
        });
      });
    });

    test('should save seasoning rating when changed', async () => {
      renderCard(mockProps);

      const ratingInputs = screen.getAllByTestId('rating');
      const seasoningRating = ratingInputs[1];

      fireEvent.change(seasoningRating, { target: { value: '8.5' } });

      await waitFor(() => {
        expect(backend.requests).toContainEqual({
          method: 'post',
          path: 'ratings/rating-123',
          body: projectedBody({ ...mockRatingData, seasoning: 8.5 }),
        });
      });
    });

    test('should save tenderness rating when changed', async () => {
      renderCard(mockProps);

      const ratingInputs = screen.getAllByTestId('rating');
      const tendernessRating = ratingInputs[2];

      fireEvent.change(tendernessRating, { target: { value: '7' } });

      await waitFor(() => {
        expect(backend.requests).toContainEqual({
          method: 'post',
          path: 'ratings/rating-123',
          body: projectedBody({ ...mockRatingData, tenderness: 7 }),
        });
      });
    });

    test('should save overall taste rating when changed', async () => {
      renderCard(mockProps);

      const ratingInputs = screen.getAllByTestId('rating');
      const overallTasteRating = ratingInputs[3];

      fireEvent.change(overallTasteRating, { target: { value: '9.5' } });

      await waitFor(() => {
        expect(backend.requests).toContainEqual({
          method: 'post',
          path: 'ratings/rating-123',
          body: projectedBody({ ...mockRatingData, overallTaste: 9.5 }),
        });
      });
    });

    test('should not save when rating has no _id', async () => {
      const propsWithoutId = {
        ratings: {
          ...mockRatingData,
          _id: undefined,
        },
      };

      renderCard(propsWithoutId);

      const ratingInputs = screen.getAllByTestId('rating');
      fireEvent.change(ratingInputs[0], { target: { value: '9' } });

      await waitFor(() => {
        expect(ratingSaveRequests()).toHaveLength(0);
      });
    });
  });

  describe('State Management', () => {
    test('should update internal state when props change', () => {
      const { rerender } = renderCard(mockProps);

      const newRatings = {
        ...mockRatingData,
        smokeFlavor: 5,
        seasoning: 6,
      };

      rerender(
        <ApiClientProvider client={createApiClient(backend)}>
          <RatingsCard ratings={newRatings} />
        </ApiClientProvider>
      );

      expect(screen.getByText('Smoke Flavor: 5')).toBeInTheDocument();
      expect(screen.getByText('Seasoning: 6')).toBeInTheDocument();
    });

    test('should maintain local state after rating changes', async () => {
      renderCard(mockProps);

      const ratingInputs = screen.getAllByTestId('rating');
      fireEvent.change(ratingInputs[0], { target: { value: '9' } });

      await waitFor(() => {
        expect(screen.getByText('Smoke Flavor: 9')).toBeInTheDocument();
      });
    });
  });

  describe('Component Structure', () => {
    test('should have correct typography variant for title', () => {
      renderCard(mockProps);

      const typographies = screen.getAllByTestId('typography');

      const title = typographies.find(
        t =>
          t.getAttribute('data-variant') === 'h5' &&
          t.getAttribute('data-align') === 'center' &&
          t.textContent === 'Ratings'
      );
      expect(title).toBeInTheDocument();
    });

    test('should have correct typography for rating labels', () => {
      renderCard(mockProps);

      const typographies = screen.getAllByTestId('typography');

      const smokeFlavorLabel = typographies.find(
        t => t.getAttribute('data-component') === 'legend' && t.textContent === 'Smoke Flavor: 8'
      );
      expect(smokeFlavorLabel).toBeInTheDocument();

      const seasoningLabel = typographies.find(
        t => t.getAttribute('data-component') === 'legend' && t.textContent === 'Seasoning: 7'
      );
      expect(seasoningLabel).toBeInTheDocument();

      const tendernessLabel = typographies.find(
        t => t.getAttribute('data-component') === 'legend' && t.textContent === 'Tenderness: 9'
      );
      expect(tendernessLabel).toBeInTheDocument();

      // The Overall Taste legend carries an e2e test id, so query it directly
      // rather than through the shared `typography` test id.
      const overallTasteLabel = screen.getByTestId('review-rating-overallTaste-value');
      expect(overallTasteLabel).toHaveAttribute('data-component', 'legend');
      expect(overallTasteLabel).toHaveTextContent('Overall Taste: 8.5');
    });
  });

  describe('Theme Integration', () => {
    test('should apply theme provider with custom theme', () => {
      renderCard(mockProps);

      const themeProvider = screen.getByTestId('theme-provider');
      const theme = JSON.parse(themeProvider.getAttribute('data-theme') || '{}');

      expect(theme.components.MuiCard.styleOverrides.root.backgroundColor).toBe('white');
      expect(theme.components.MuiCard.styleOverrides.root.borderRadius).toBe('15px');
    });
  });

  describe('Client Integration', () => {
    test('should save via the client when rating changes and _id exists', async () => {
      renderCard(mockProps);

      const ratingInputs = screen.getAllByTestId('rating');
      fireEvent.change(ratingInputs[0], { target: { value: '9' } });

      // Saved once on initial mount (id present) and again on the change.
      await waitFor(() => expect(ratingSaveRequests().length).toBeGreaterThanOrEqual(2));

      expect(backend.requests).toContainEqual({
        method: 'post',
        path: 'ratings/rating-123',
        body: projectedBody({ ...mockRatingData, smokeFlavor: 9 }),
      });
    });

    test('should keep rendering after a save call', async () => {
      renderCard(mockProps);
      const ratingInputs = screen.getAllByTestId('rating');

      fireEvent.change(ratingInputs[0], { target: { value: '9' } });

      await waitFor(() => {
        expect(backend.requests).toContainEqual({
          method: 'post',
          path: 'ratings/rating-123',
          body: projectedBody({ ...mockRatingData, smokeFlavor: 9 }),
        });
      });

      expect(screen.getByTestId('card')).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    test('should handle invalid number inputs', async () => {
      renderCard(mockProps);

      const ratingInputs = screen.getAllByTestId('rating');
      fireEvent.change(ratingInputs[0], { target: { value: 'invalid' } });

      await waitFor(() => {
        expect(backend.requests).toContainEqual({
          method: 'post',
          path: 'ratings/rating-123',
          body: projectedBody({ ...mockRatingData, smokeFlavor: NaN }),
        });
      });
    });

    test('should handle negative values', async () => {
      renderCard(mockProps);

      const ratingInputs = screen.getAllByTestId('rating');
      fireEvent.change(ratingInputs[0], { target: { value: '-1' } });

      await waitFor(() => {
        expect(backend.requests).toContainEqual({
          method: 'post',
          path: 'ratings/rating-123',
          body: projectedBody({ ...mockRatingData, smokeFlavor: -1 }),
        });
      });
    });

    test('should handle values above maximum', async () => {
      renderCard(mockProps);

      const ratingInputs = screen.getAllByTestId('rating');
      fireEvent.change(ratingInputs[0], { target: { value: '15' } });

      await waitFor(() => {
        expect(backend.requests).toContainEqual({
          method: 'post',
          path: 'ratings/rating-123',
          body: projectedBody({ ...mockRatingData, smokeFlavor: 15 }),
        });
      });
    });

    test('should handle empty string _id', async () => {
      const propsWithEmptyId = {
        ratings: {
          ...mockRatingData,
          _id: '',
        },
      };

      renderCard(propsWithEmptyId);

      const ratingInputs = screen.getAllByTestId('rating');
      fireEvent.change(ratingInputs[0], { target: { value: '9' } });

      await waitFor(() => {
        expect(ratingSaveRequests()).toHaveLength(0);
      });
    });
  });

  describe('Interface Compliance', () => {
    test('should accept rating interface correctly', () => {
      const validRating: rating = {
        smokeFlavor: 8,
        seasoning: 7,
        tenderness: 9,
        overallTaste: 8.5,
        notes: 'Test notes',
        _id: 'test-id',
      };

      const props = { ratings: validRating };

      expect(() => renderCard(props)).not.toThrow();
    });

    test('should handle rating with minimal required fields', () => {
      const minimalRating: rating = {
        smokeFlavor: 5,
        seasoning: 5,
        tenderness: 5,
        overallTaste: 5,
        notes: '',
      };

      const props = { ratings: minimalRating };

      renderCard(props);

      expect(screen.getByText('Ratings')).toBeInTheDocument();
      expect(screen.getAllByTestId('rating')).toHaveLength(4);
    });
  });
});
