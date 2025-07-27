import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { BottomBar } from './bottombar';

// Mock Material-UI components
jest.mock('@mui/material/BottomNavigation', () => {
  return function MockBottomNavigation({ children, onChange, value, showLabels }: any) {
    return (
      <div 
        data-testid="bottom-navigation" 
        data-value={value}
        data-show-labels={showLabels}
        onClick={(e) => {
          // Simulate clicking different navigation items
          const target = e.target as HTMLElement;
          const actionIndex = target.getAttribute('data-action-index');
          if (actionIndex !== null && onChange) {
            onChange(e, parseInt(actionIndex));
          }
        }}
      >
        {children}
      </div>
    );
  };
});

jest.mock('@mui/material/BottomNavigationAction', () => {
  return function MockBottomNavigationAction({ label, icon, ...props }: any) {
    return (
      <button 
        data-testid={`bottom-nav-action-${label.toLowerCase()}`}
        data-action-index={label === 'Smoke' ? '0' : label === 'Review' ? '1' : '2'}
        {...props}
      >
        <span data-testid={`${label.toLowerCase()}-icon`}>{icon}</span>
        <span data-testid={`${label.toLowerCase()}-label`}>{label}</span>
      </button>
    );
  };
});

jest.mock('@mui/material/Grid', () => {
  return function MockGrid({ children, className }: any) {
    return <div className={className} data-testid="grid-container">{children}</div>;
  };
});

// Mock Material-UI icons
jest.mock('@mui/icons-material/Settings', () => {
  return function MockSettingsIcon() {
    return <span data-testid="settings-icon-component">⚙️</span>;
  };
});

jest.mock('@mui/icons-material/Reviews', () => {
  return function MockReviewsIcon() {
    return <span data-testid="reviews-icon-component">📝</span>;
  };
});

jest.mock('@mui/icons-material/OutdoorGrill', () => {
  return function MockOutdoorGrillIcon() {
    return <span data-testid="outdoor-grill-icon-component">🔥</span>;
  };
});

describe('BottomBar', () => {
  let mockSmokeOnClick: jest.Mock;
  let mockReviewOnClick: jest.Mock;
  let mockSettingsOnClick: jest.Mock;
  let defaultProps: any;

  beforeEach(() => {
    mockSmokeOnClick = jest.fn();
    mockReviewOnClick = jest.fn();
    mockSettingsOnClick = jest.fn();
    
    defaultProps = {
      smokeOnClick: mockSmokeOnClick,
      reviewOnClick: mockReviewOnClick,
      settingsOnClick: mockSettingsOnClick,
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    test('should render BottomBar component successfully', () => {
      render(<BottomBar {...defaultProps} />);
      
      expect(screen.getByTestId('grid-container')).toBeInTheDocument();
      expect(screen.getByTestId('bottom-navigation')).toBeInTheDocument();
    });

    test('should render all three navigation actions', () => {
      render(<BottomBar {...defaultProps} />);
      
      expect(screen.getByTestId('bottom-nav-action-smoke')).toBeInTheDocument();
      expect(screen.getByTestId('bottom-nav-action-review')).toBeInTheDocument();
      expect(screen.getByTestId('bottom-nav-action-settings')).toBeInTheDocument();
    });

    test('should render correct labels for navigation actions', () => {
      render(<BottomBar {...defaultProps} />);
      
      expect(screen.getByTestId('smoke-label')).toHaveTextContent('Smoke');
      expect(screen.getByTestId('review-label')).toHaveTextContent('Review');
      expect(screen.getByTestId('settings-label')).toHaveTextContent('Settings');
    });

    test('should render correct icons for navigation actions', () => {
      render(<BottomBar {...defaultProps} />);
      
      expect(screen.getByTestId('outdoor-grill-icon-component')).toBeInTheDocument();
      expect(screen.getByTestId('reviews-icon-component')).toBeInTheDocument();
      expect(screen.getByTestId('settings-icon-component')).toBeInTheDocument();
    });

    test('should apply correct CSS class to Grid container', () => {
      render(<BottomBar {...defaultProps} />);
      
      const gridContainer = screen.getByTestId('grid-container');
      expect(gridContainer).toHaveClass('bottomBar');
    });

    test('should set showLabels prop on BottomNavigation', () => {
      render(<BottomBar {...defaultProps} />);
      
      const bottomNavigation = screen.getByTestId('bottom-navigation');
      expect(bottomNavigation).toHaveAttribute('data-show-labels', 'true');
    });

    test('should initialize with value 0 (Smoke selected)', () => {
      render(<BottomBar {...defaultProps} />);
      
      const bottomNavigation = screen.getByTestId('bottom-navigation');
      expect(bottomNavigation).toHaveAttribute('data-value', '0');
    });
  });

  describe('Navigation Interactions', () => {
    test('should call smokeOnClick when Smoke action is clicked', () => {
      render(<BottomBar {...defaultProps} />);
      
      const smokeAction = screen.getByTestId('bottom-nav-action-smoke');
      fireEvent.click(smokeAction);
      
      expect(mockSmokeOnClick).toHaveBeenCalledTimes(1);
      expect(mockReviewOnClick).not.toHaveBeenCalled();
      expect(mockSettingsOnClick).not.toHaveBeenCalled();
    });

    test('should call reviewOnClick when Review action is clicked', () => {
      render(<BottomBar {...defaultProps} />);
      
      const reviewAction = screen.getByTestId('bottom-nav-action-review');
      fireEvent.click(reviewAction);
      
      expect(mockReviewOnClick).toHaveBeenCalledTimes(1);
      expect(mockSmokeOnClick).not.toHaveBeenCalled();
      expect(mockSettingsOnClick).not.toHaveBeenCalled();
    });

    test('should call settingsOnClick when Settings action is clicked', () => {
      render(<BottomBar {...defaultProps} />);
      
      const settingsAction = screen.getByTestId('bottom-nav-action-settings');
      fireEvent.click(settingsAction);
      
      expect(mockSettingsOnClick).toHaveBeenCalledTimes(1);
      expect(mockSmokeOnClick).not.toHaveBeenCalled();
      expect(mockReviewOnClick).not.toHaveBeenCalled();
    });

    test('should update internal state when navigation value changes', () => {
      render(<BottomBar {...defaultProps} />);
      
      const reviewAction = screen.getByTestId('bottom-nav-action-review');
      fireEvent.click(reviewAction);
      
      const bottomNavigation = screen.getByTestId('bottom-navigation');
      expect(bottomNavigation).toHaveAttribute('data-value', '1');
    });

    test('should handle multiple navigation clicks correctly', () => {
      render(<BottomBar {...defaultProps} />);
      
      // Click Review
      fireEvent.click(screen.getByTestId('bottom-nav-action-review'));
      expect(mockReviewOnClick).toHaveBeenCalledTimes(1);
      
      // Click Settings
      fireEvent.click(screen.getByTestId('bottom-nav-action-settings'));
      expect(mockSettingsOnClick).toHaveBeenCalledTimes(1);
      
      // Click Smoke
      fireEvent.click(screen.getByTestId('bottom-nav-action-smoke'));
      expect(mockSmokeOnClick).toHaveBeenCalledTimes(1);
      
      // Verify total calls
      expect(mockReviewOnClick).toHaveBeenCalledTimes(1);
      expect(mockSettingsOnClick).toHaveBeenCalledTimes(1);
      expect(mockSmokeOnClick).toHaveBeenCalledTimes(1);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('should handle undefined onClick functions gracefully', () => {
      const propsWithUndefined = {
        smokeOnClick: undefined as any,
        reviewOnClick: jest.fn(),
        settingsOnClick: jest.fn(),
      };
      
      render(<BottomBar {...propsWithUndefined} />);
      
      expect(screen.getByTestId('grid-container')).toBeInTheDocument();
      expect(screen.getByTestId('bottom-navigation')).toBeInTheDocument();
    });

    test('should handle null onClick functions gracefully', () => {
      const propsWithNull = {
        smokeOnClick: null as any,
        reviewOnClick: jest.fn(),
        settingsOnClick: jest.fn(),
      };
      
      render(<BottomBar {...propsWithNull} />);
      
      expect(screen.getByTestId('grid-container')).toBeInTheDocument();
      expect(screen.getByTestId('bottom-navigation')).toBeInTheDocument();
    });

    test('should not crash when clicking with undefined handlers', () => {
      const propsWithUndefined = {
        smokeOnClick: undefined as any,
        reviewOnClick: jest.fn(),
        settingsOnClick: jest.fn(),
      };
      
      render(<BottomBar {...propsWithUndefined} />);
      
      // Should not crash when clicking undefined handler
      expect(() => {
        fireEvent.click(screen.getByTestId('bottom-nav-action-smoke'));
      }).not.toThrow();
      
      // Other handlers should still work
      fireEvent.click(screen.getByTestId('bottom-nav-action-review'));
      expect(propsWithUndefined.reviewOnClick).toHaveBeenCalled();
    });

    test('should handle rapid successive clicks', () => {
      render(<BottomBar {...defaultProps} />);
      
      // Test rapid clicks
      fireEvent.click(screen.getByTestId('bottom-nav-action-smoke'));
      fireEvent.click(screen.getByTestId('bottom-nav-action-review'));
      fireEvent.click(screen.getByTestId('bottom-nav-action-settings'));
      fireEvent.click(screen.getByTestId('bottom-nav-action-smoke'));
      
      expect(defaultProps.smokeOnClick).toHaveBeenCalledTimes(2);
      expect(defaultProps.reviewOnClick).toHaveBeenCalledTimes(1);
      expect(defaultProps.settingsOnClick).toHaveBeenCalledTimes(1);
    });

    test('should handle non-function onClick props gracefully', () => {
      const propsWithNonFunction = {
        smokeOnClick: 'not-a-function' as any,
        reviewOnClick: 42 as any,
        settingsOnClick: {} as any,
      };
      
      render(<BottomBar {...propsWithNonFunction} />);
      
      // Should not crash when clicking with non-function handlers
      expect(() => {
        fireEvent.click(screen.getByTestId('bottom-nav-action-smoke'));
        fireEvent.click(screen.getByTestId('bottom-nav-action-review'));
        fireEvent.click(screen.getByTestId('bottom-nav-action-settings'));
      }).not.toThrow();
    });
  });

  describe('Component Structure and Props', () => {
    test('should pass correct props to BottomNavigation component', () => {
      render(<BottomBar {...defaultProps} />);
      
      const bottomNavigation = screen.getByTestId('bottom-navigation');
      expect(bottomNavigation).toHaveAttribute('data-show-labels', 'true');
      expect(bottomNavigation).toHaveAttribute('data-value', '0');
    });

    test('should maintain component structure integrity', () => {
      render(<BottomBar {...defaultProps} />);
      
      // Check hierarchy: Grid > BottomNavigation > BottomNavigationActions
      const gridContainer = screen.getByTestId('grid-container');
      const bottomNavigation = screen.getByTestId('bottom-navigation');
      
      expect(gridContainer).toContainElement(bottomNavigation);
      expect(bottomNavigation).toContainElement(screen.getByTestId('bottom-nav-action-smoke'));
      expect(bottomNavigation).toContainElement(screen.getByTestId('bottom-nav-action-review'));
      expect(bottomNavigation).toContainElement(screen.getByTestId('bottom-nav-action-settings'));
    });

    test('should render icons within their respective navigation actions', () => {
      render(<BottomBar {...defaultProps} />);
      
      const smokeAction = screen.getByTestId('bottom-nav-action-smoke');
      const reviewAction = screen.getByTestId('bottom-nav-action-review');
      const settingsAction = screen.getByTestId('bottom-nav-action-settings');
      
      expect(smokeAction).toContainElement(screen.getByTestId('outdoor-grill-icon-component'));
      expect(reviewAction).toContainElement(screen.getByTestId('reviews-icon-component'));
      expect(settingsAction).toContainElement(screen.getByTestId('settings-icon-component'));
    });

    test('should verify correct action index mapping', () => {
      render(<BottomBar {...defaultProps} />);
      
      expect(screen.getByTestId('bottom-nav-action-smoke')).toHaveAttribute('data-action-index', '0');
      expect(screen.getByTestId('bottom-nav-action-review')).toHaveAttribute('data-action-index', '1');
      expect(screen.getByTestId('bottom-nav-action-settings')).toHaveAttribute('data-action-index', '2');
    });
  });

  describe('State Management', () => {
    test('should track navigation state changes correctly', () => {
      render(<BottomBar {...defaultProps} />);
      
      const bottomNavigation = screen.getByTestId('bottom-navigation');
      
      // Initial state
      expect(bottomNavigation).toHaveAttribute('data-value', '0');
      
      // Click Review (index 1)
      fireEvent.click(screen.getByTestId('bottom-nav-action-review'));
      expect(bottomNavigation).toHaveAttribute('data-value', '1');
      
      // Click Settings (index 2)
      fireEvent.click(screen.getByTestId('bottom-nav-action-settings'));
      expect(bottomNavigation).toHaveAttribute('data-value', '2');
      
      // Click back to Smoke (index 0)
      fireEvent.click(screen.getByTestId('bottom-nav-action-smoke'));
      expect(bottomNavigation).toHaveAttribute('data-value', '0');
    });

    test('should maintain state consistency across re-renders', () => {
      const { rerender } = render(<BottomBar {...defaultProps} />);
      
      // Change state
      fireEvent.click(screen.getByTestId('bottom-nav-action-settings'));
      expect(screen.getByTestId('bottom-navigation')).toHaveAttribute('data-value', '2');
      
      // Re-render with same props
      rerender(<BottomBar {...defaultProps} />);
      
      // State should be maintained
      expect(screen.getByTestId('bottom-navigation')).toHaveAttribute('data-value', '2');
    });
  });
});
