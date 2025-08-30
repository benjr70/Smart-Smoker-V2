import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { FinishSmoke, clearSmoke } from '../../Services/smokerService';
import { Smoke, delay } from './smoke';

// Mock the services
jest.mock('../../Services/smokerService', () => ({
  FinishSmoke: jest.fn(() => Promise.resolve({})),
  clearSmoke: jest.fn(() => Promise.resolve({})),
}));

const mockFinishSmoke = FinishSmoke as jest.MockedFunction<typeof FinishSmoke>;
const mockClearSmoke = clearSmoke as jest.MockedFunction<typeof clearSmoke>;

// Mock the step components with simple implementations
jest.mock('./preSmokeStep/preSmokeStep', () => ({
  PreSmokeStep: ({ nextButton }: any) => <div data-testid="pre-smoke-step">{nextButton}</div>,
}));

jest.mock('./smokeStep/smokeStep', () => ({
  SmokeStep: ({ nextButton }: any) => <div data-testid="smoke-step">{nextButton}</div>,
}));

jest.mock('./postSmokeStep/PostSmokeStep', () => ({
  PostSmokeStep: ({ nextButton }: any) => <div data-testid="post-smoke-step">{nextButton}</div>,
}));

// Mock Material-UI components
jest.mock('@mui/material', () => ({
  Stepper: ({ children, activeStep, ...props }: any) => (
    <div data-testid="stepper" data-active-step={activeStep} {...props}>
      {children}
    </div>
  ),
  Step: ({ children, ...props }: any) => (
    <div data-testid="step" {...props}>
      {children}
    </div>
  ),
  StepButton: ({ children, onClick, ...props }: any) => (
    <button data-testid="step-button" onClick={onClick} {...props}>
      {children}
    </button>
  ),
  Button: ({ children, onClick, className, variant, size, ...props }: any) => (
    <button
      data-testid="button"
      onClick={onClick}
      className={className}
      variant={variant}
      size={size}
      {...props}
    >
      {children}
    </button>
  ),
  Grid: ({ children, className, container, ...props }: any) => (
    <div data-testid="grid" className={className} data-container={container} {...props}>
      {children}
    </div>
  ),
}));

describe('Smoke Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFinishSmoke.mockResolvedValue(undefined);
    mockClearSmoke.mockResolvedValue({ smokeId: 'test-id', smoking: false });
  });

  describe('Component Rendering', () => {
    test('should render Smoke component successfully', () => {
      render(<Smoke />);
      expect(screen.getByTestId('pre-smoke-step')).toBeInTheDocument();
    });

    test('should render with correct initial state', () => {
      render(<Smoke />);

      // Should show pre-smoke step initially
      expect(screen.getByTestId('pre-smoke-step')).toBeInTheDocument();
      expect(screen.queryByTestId('smoke-step')).not.toBeInTheDocument();
      expect(screen.queryByTestId('post-smoke-step')).not.toBeInTheDocument();
    });

    test('should display Next button on pre-smoke step', () => {
      render(<Smoke />);
      expect(screen.getByText('Next')).toBeInTheDocument();
    });
  });

  describe('Navigation', () => {
    test('should navigate from pre-smoke to smoke step', async () => {
      render(<Smoke />);

      // Start at pre-smoke step
      expect(screen.getByTestId('pre-smoke-step')).toBeInTheDocument();

      // Click next button
      const nextButton = screen.getByText('Next');
      fireEvent.click(nextButton);

      // Should now show smoke step
      await waitFor(() => {
        expect(screen.getByTestId('smoke-step')).toBeInTheDocument();
      });

      expect(screen.queryByTestId('pre-smoke-step')).not.toBeInTheDocument();
    });

    test('should navigate from smoke to post-smoke step', async () => {
      render(<Smoke />);

      // Navigate to smoke step first
      const nextButton = screen.getByText('Next');
      fireEvent.click(nextButton);

      await waitFor(() => {
        expect(screen.getByTestId('smoke-step')).toBeInTheDocument();
      });

      // Navigate to post-smoke step
      const nextButton2 = screen.getByText('Next');
      fireEvent.click(nextButton2);

      await waitFor(() => {
        expect(screen.getByTestId('post-smoke-step')).toBeInTheDocument();
      });

      expect(screen.queryByTestId('smoke-step')).not.toBeInTheDocument();
    });

    test('should show Finish button on post-smoke step', async () => {
      render(<Smoke />);

      // Navigate to post-smoke step
      const nextButton = screen.getByText('Next');
      fireEvent.click(nextButton);

      await waitFor(() => {
        expect(screen.getByTestId('smoke-step')).toBeInTheDocument();
      });

      const nextButton2 = screen.getByText('Next');
      fireEvent.click(nextButton2);

      await waitFor(() => {
        expect(screen.getByTestId('post-smoke-step')).toBeInTheDocument();
        expect(screen.getByText('Finish')).toBeInTheDocument();
      });
    });
  });

  describe('Stepper Navigation', () => {
    test('should allow direct navigation via stepper buttons', async () => {
      render(<Smoke />);

      // Get step buttons by their actual names
      const preSmokeButton = screen.getByRole('button', { name: /pre-smoke/i });
      const smokeButton = screen.getByRole('button', { name: /^smoke$/i });
      const postSmokeButton = screen.getByRole('button', { name: /post-smoke/i });

      expect(preSmokeButton).toBeInTheDocument();
      expect(smokeButton).toBeInTheDocument();
      expect(postSmokeButton).toBeInTheDocument();

      // Click on smoke step (index 1)
      fireEvent.click(smokeButton);

      await waitFor(() => {
        expect(screen.getByTestId('smoke-step')).toBeInTheDocument();
      });
    });
  });

  describe('Finish Functionality', () => {
    test('should handle finish smoke workflow', async () => {
      render(<Smoke />);

      // Navigate to post-smoke step
      let nextButton = screen.getByText('Next');
      fireEvent.click(nextButton);

      await waitFor(() => {
        expect(screen.getByTestId('smoke-step')).toBeInTheDocument();
      });

      nextButton = screen.getByText('Next');
      fireEvent.click(nextButton);

      await waitFor(() => {
        expect(screen.getByTestId('post-smoke-step')).toBeInTheDocument();
      });

      // Click finish
      const finishButton = screen.getByText('Finish');
      fireEvent.click(finishButton);

      await waitFor(() => {
        expect(mockFinishSmoke).toHaveBeenCalled();
        expect(mockClearSmoke).toHaveBeenCalled();
      });
    });
  });

  describe('Delay Function', () => {
    test('should resolve after specified time', async () => {
      const startTime = Date.now();
      await delay(10);
      const endTime = Date.now();

      expect(endTime - startTime).toBeGreaterThanOrEqual(10);
    });

    test('should be exported and callable', () => {
      expect(typeof delay).toBe('function');
    });
  });
});
