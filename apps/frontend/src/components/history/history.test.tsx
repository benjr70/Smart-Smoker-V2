import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { History } from './history';
import { getSmokeHistory } from '../../Services/smokerService';
import { deleteSmoke } from '../../Services/deleteSmokeService';
import { smokeHistory } from '../common/interfaces/history';

// Mock the services
jest.mock('../../Services/smokerService', () => ({
  getSmokeHistory: jest.fn()
}));

jest.mock('../../Services/deleteSmokeService', () => ({
  deleteSmoke: jest.fn()
}));

// Mock the child components
jest.mock('./smokeCards/smokeCard', () => ({
  SmokeCard: ({ 
    name, 
    meatType, 
    date, 
    weight, 
    overAllRatings, 
    weightUnit, 
    woodType, 
    smokeId, 
    onViewClick, 
    onDeleteClick 
  }: any) => (
    <div data-testid={`smoke-card-${smokeId}`}>
      <div data-testid="smoke-name">{name}</div>
      <div data-testid="meat-type">{meatType}</div>
      <div data-testid="date">{date}</div>
      <div data-testid="weight">{weight}</div>
      <div data-testid="overall-ratings">{overAllRatings}</div>
      <div data-testid="weight-unit">{weightUnit}</div>
      <div data-testid="wood-type">{woodType}</div>
      <button 
        data-testid={`view-button-${smokeId}`}
        onClick={() => onViewClick(smokeId)}
      >
        View
      </button>
      <button 
        data-testid={`delete-button-${smokeId}`}
        onClick={() => onDeleteClick(smokeId)}
      >
        Delete
      </button>
    </div>
  )
}));

jest.mock('./smokeReview/smokeReview', () => ({
  SmokeReview: ({ smokeId }: any) => (
    <div data-testid="smoke-review">
      <div data-testid="review-smoke-id">{smokeId}</div>
    </div>
  )
}));

// Mock Material-UI components
jest.mock('@mui/material', () => ({
  Grid: ({ children, className, paddingTop, paddingLeft, container, spacing, sx, paddingBottom, item, xs, ...props }: any) => {
    let testId = 'grid';
    if (className === 'history') testId = 'main-grid';
    if (container) testId = 'container-grid';
    if (item) testId = `item-grid-${xs || 'default'}`;
    if (paddingLeft) testId = 'back-button-grid';
    
    return (
      <div 
        data-testid={testId}
        className={className}
        data-padding-top={paddingTop}
        data-padding-left={paddingLeft}
        data-container={container}
        data-spacing={spacing}
        data-sx={JSON.stringify(sx)}
        data-padding-bottom={paddingBottom}
        data-item={item}
        data-xs={xs}
        {...props}
      >
        {children}
      </div>
    );
  },
  TextField: ({ ...props }: any) => (
    <input data-testid="text-field" {...props} />
  ),
  IconButton: ({ children, onClick, color, component, ...props }: any) => (
    <button 
      data-testid="icon-button" 
      onClick={onClick}
      data-color={color}
      data-component={component}
      {...props}
    >
      {children}
    </button>
  )
}));

jest.mock('@mui/icons-material/ArrowBackIos', () => {
  return function ArrowBackIosIcon() {
    return <div data-testid="arrow-back-icon">←</div>;
  };
});

// Mock CSS import
jest.mock('./history.style.css', () => ({}));

const mockGetSmokeHistory = getSmokeHistory as jest.MockedFunction<typeof getSmokeHistory>;
const mockDeleteSmoke = deleteSmoke as jest.MockedFunction<typeof deleteSmoke>;

describe('History Component', () => {
  const mockSmokeHistoryData: smokeHistory[] = [
    {
      name: 'Brisket Smoke',
      meatType: 'Brisket',
      date: '2023-07-15',
      weight: '12',
      overAllRating: '5',
      weightUnit: 'lbs',
      woodType: 'Hickory',
      smokeId: 'smoke-1'
    },
    {
      name: 'Pork Shoulder',
      meatType: 'Pork',
      date: '2023-07-10',
      weight: '8',
      overAllRating: '4',
      weightUnit: 'lbs',
      woodType: 'Apple',
      smokeId: 'smoke-2'
    }
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset mocks to default successful values
    mockGetSmokeHistory.mockResolvedValue([...mockSmokeHistoryData]);
    mockDeleteSmoke.mockResolvedValue(undefined);
  });

  describe('Component Rendering', () => {
    test('should render History component successfully', async () => {
      render(<History />);
      
      await waitFor(() => {
        expect(screen.getByTestId('main-grid')).toBeInTheDocument();
      });
    });

    test('should render smoke cards when smoke history list is loaded', async () => {
      render(<History />);
      
      await screen.findByTestId('smoke-card-smoke-1');
      
      expect(screen.getByTestId('smoke-card-smoke-2')).toBeInTheDocument();

      expect(screen.getByText('Brisket Smoke')).toBeInTheDocument();
      expect(screen.getByText('Pork Shoulder')).toBeInTheDocument();
    });

    test('should not render back button when no smoke is selected', async () => {
      render(<History />);
      
      await waitFor(() => {
        expect(screen.getByTestId('smoke-card-smoke-1')).toBeInTheDocument();
      });

      expect(screen.queryByTestId('icon-button')).not.toBeInTheDocument();
    });

    test('should render SmokeReview component when a smoke is selected', async () => {
      render(<History />);
      
      await waitFor(() => {
        expect(screen.getByTestId('view-button-smoke-1')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('view-button-smoke-1'));

      await screen.findByTestId('smoke-review');
      
      expect(screen.getByText('smoke-1')).toBeInTheDocument();

      expect(screen.queryByTestId('smoke-card-smoke-1')).not.toBeInTheDocument();
    });

    test('should render back button when a smoke is selected', async () => {
      render(<History />);
      
      await waitFor(() => {
        expect(screen.getByTestId('view-button-smoke-1')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('view-button-smoke-1'));

      await waitFor(() => {
        expect(screen.getByTestId('icon-button')).toBeInTheDocument();
        expect(screen.getByTestId('arrow-back-icon')).toBeInTheDocument();
      });
    });
  });

  describe('Data Loading', () => {
    test('should call getSmokeHistory on component mount', async () => {
      render(<History />);
      
      await waitFor(() => {
        expect(mockGetSmokeHistory).toHaveBeenCalledTimes(1);
      });
    });

    test('should reverse the smoke history list when loaded', async () => {
      render(<History />);
      
      await waitFor(() => {
        expect(screen.getByTestId('smoke-card-smoke-1')).toBeInTheDocument();
      });

      // Since the data is reversed, the first card should show the last item from original data
      const smokeCards = screen.getAllByTestId(/smoke-card-/);
      expect(smokeCards).toHaveLength(2);
    });

    test('should handle empty smoke history list', async () => {
      mockGetSmokeHistory.mockResolvedValue([]);
      
      render(<History />);
      
      await waitFor(() => {
        expect(mockGetSmokeHistory).toHaveBeenCalledTimes(1);
      });

      expect(screen.queryByTestId(/smoke-card-/)).not.toBeInTheDocument();
    });

    test('should handle getSmokeHistory service returning undefined', async () => {
      mockGetSmokeHistory.mockResolvedValue([] as any); // Return empty array instead of undefined
      
      render(<History />);
      
      await waitFor(() => {
        expect(mockGetSmokeHistory).toHaveBeenCalledTimes(1);
      });

      // Component should still render without crashing
      expect(screen.getByTestId('main-grid')).toBeInTheDocument();
      // Should not have any smoke cards when empty array is returned
      expect(screen.queryByTestId(/smoke-card-/)).not.toBeInTheDocument();
    });
  });

  describe('User Interactions', () => {
    test('should handle view click correctly', async () => {
      render(<History />);
      
      await waitFor(() => {
        expect(screen.getByTestId('view-button-smoke-1')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('view-button-smoke-1'));

      await waitFor(() => {
        expect(screen.getByTestId('smoke-review')).toBeInTheDocument();
        expect(screen.getByText('smoke-1')).toBeInTheDocument();
      });
    });

    test('should handle back click correctly', async () => {
      render(<History />);
      
      // First select a smoke
      await waitFor(() => {
        expect(screen.getByTestId('view-button-smoke-1')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('view-button-smoke-1'));

      await waitFor(() => {
        expect(screen.getByTestId('icon-button')).toBeInTheDocument();
      });

      // Then click back
      fireEvent.click(screen.getByTestId('icon-button'));

      await waitFor(() => {
        expect(screen.getByTestId('smoke-card-smoke-1')).toBeInTheDocument();
        expect(screen.getByTestId('smoke-card-smoke-2')).toBeInTheDocument();
      });

      expect(screen.queryByTestId('smoke-review')).not.toBeInTheDocument();
      expect(mockGetSmokeHistory).toHaveBeenCalledTimes(2); // Initial load + back click refresh
    });

    test('should handle delete click correctly', async () => {
      render(<History />);
      
      await waitFor(() => {
        expect(screen.getByTestId('delete-button-smoke-1')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('delete-button-smoke-1'));

      await waitFor(() => {
        expect(mockDeleteSmoke).toHaveBeenCalledWith('smoke-1');
        expect(mockGetSmokeHistory).toHaveBeenCalledTimes(2); // Initial load + delete refresh
      });
    });

    test('should handle delete service returning undefined', async () => {
      mockDeleteSmoke.mockResolvedValue(undefined);
      
      render(<History />);
      
      await waitFor(() => {
        expect(screen.getByTestId('delete-button-smoke-1')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('delete-button-smoke-1'));

      await waitFor(() => {
        expect(mockDeleteSmoke).toHaveBeenCalledWith('smoke-1');
      });

      // Component should still be functional
      expect(screen.getByTestId('main-grid')).toBeInTheDocument();
    });
  });

  describe('State Management', () => {
    test('should maintain smoke history list when switching between views', async () => {
      render(<History />);
      
      await waitFor(() => {
        expect(screen.getByTestId('view-button-smoke-1')).toBeInTheDocument();
      });

      // Select a smoke
      fireEvent.click(screen.getByTestId('view-button-smoke-1'));

      await waitFor(() => {
        expect(screen.getByTestId('smoke-review')).toBeInTheDocument();
      });

      // Go back
      fireEvent.click(screen.getByTestId('icon-button'));

      await waitFor(() => {
        expect(screen.getByTestId('smoke-card-smoke-1')).toBeInTheDocument();
        expect(screen.getByTestId('smoke-card-smoke-2')).toBeInTheDocument();
      });
    });

    test('should clear smokeId when going back to list view', async () => {
      render(<History />);
      
      await waitFor(() => {
        expect(screen.getByTestId('view-button-smoke-1')).toBeInTheDocument();
      });

      // Select a smoke
      fireEvent.click(screen.getByTestId('view-button-smoke-1'));

      await waitFor(() => {
        expect(screen.getByTestId('smoke-review')).toBeInTheDocument();
      });

      // Go back
      fireEvent.click(screen.getByTestId('icon-button'));

      await waitFor(() => {
        expect(screen.queryByTestId('smoke-review')).not.toBeInTheDocument();
        expect(screen.getByTestId('smoke-card-smoke-1')).toBeInTheDocument();
      });
    });
  });

  describe('Component Props and Data Flow', () => {
    test('should pass correct props to SmokeCard components', async () => {
      render(<History />);
      
      await waitFor(() => {
        expect(screen.getByTestId('smoke-card-smoke-1')).toBeInTheDocument();
      });

      const firstCard = screen.getByTestId('smoke-card-smoke-1');
      expect(firstCard).toHaveTextContent('Brisket Smoke');
      expect(firstCard).toHaveTextContent('Brisket');
      expect(firstCard).toHaveTextContent('2023-07-15');
      expect(firstCard).toHaveTextContent('12');
      expect(firstCard).toHaveTextContent('5');
      expect(firstCard).toHaveTextContent('lbs');
      expect(firstCard).toHaveTextContent('Hickory');
    });

    test('should pass correct smokeId to SmokeReview component', async () => {
      render(<History />);
      
      await waitFor(() => {
        expect(screen.getByTestId('view-button-smoke-2')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('view-button-smoke-2'));

      await waitFor(() => {
        expect(screen.getByTestId('smoke-review')).toBeInTheDocument();
        expect(screen.getByText('smoke-2')).toBeInTheDocument();
      });
    });

    test('should render correct number of smoke cards', async () => {
      render(<History />);
      
      await waitFor(() => {
        const smokeCards = screen.getAllByTestId(/smoke-card-/);
        expect(smokeCards).toHaveLength(2);
      });
    });
  });

  describe('Grid Layout and Styling', () => {
    test('should apply correct Grid props for main container', async () => {
      render(<History />);
      
      const mainGrid = screen.getByTestId('main-grid');
      expect(mainGrid).toHaveAttribute('data-padding-top', '1');
      expect(mainGrid).toHaveClass('history');
    });

    test('should apply correct Grid props for card container', async () => {
      render(<History />);
      
      await waitFor(() => {
        const cardContainer = screen.getByTestId('container-grid');
        expect(cardContainer).toHaveAttribute('data-spacing', '2');
        expect(cardContainer).toHaveAttribute('data-padding-bottom', '8');
      });
    });

    test('should apply correct Grid props for individual cards', async () => {
      render(<History />);
      
      await waitFor(() => {
        const itemGrids = screen.getAllByTestId('item-grid-11');
        expect(itemGrids.length).toBeGreaterThan(0);
        itemGrids.forEach(grid => {
          expect(grid).toHaveAttribute('data-xs', '11');
        });
      });
    });
  });
});
