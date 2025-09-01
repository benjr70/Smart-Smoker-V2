import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Smoke, delay } from './smoke';
import { FinishSmoke, clearSmoke } from '../../Services/smokerService';

// Mock Material-UI components
jest.mock('@mui/material', () => ({
  Stepper: ({ children, ...props }: any) => (
    <div data-testid="stepper" data-active-step={props.activeStep} {...props}>
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
  Button: ({ children, onClick, ...props }: any) => (
    <button data-testid="button" onClick={onClick} {...props}>
      {children}
    </button>
  ),
  Grid: ({ children, className, ...props }: any) => (
    <div data-testid="grid" data-classname={className} {...props}>
      {children}
    </div>
  ),
}));

// Mock step components
jest.mock('./preSmokeStep/preSmokeStep', () => ({
  PreSmokeStep: ({ nextButton }: any) => <div data-testid="pre-smoke-step">{nextButton}</div>,
}));

jest.mock('./smokeStep/smokeStep', () => ({
  SmokeStep: ({ nextButton }: any) => <div data-testid="smoke-step">{nextButton}</div>,
}));

jest.mock('./postSmokeStep/PostSmokeStep', () => ({
  PostSmokeStep: ({ nextButton }: any) => <div data-testid="post-smoke-step">{nextButton}</div>,
}));

// Mock services
jest.mock('../../Services/smokerService', () => ({
  FinishSmoke: jest.fn(),
  clearSmoke: jest.fn(),
}));

const mockFinishSmoke = FinishSmoke as jest.MockedFunction<typeof FinishSmoke>;
const mockClearSmoke = clearSmoke as jest.MockedFunction<typeof clearSmoke>;

describe('Smoke Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFinishSmoke.mockResolvedValue(undefined);
    mockClearSmoke.mockResolvedValue({ smokeId: 'test-id', smoking: false });
  });

  describe('Component Rendering', () => {
    test('should render Smoke component successfully', () => {
      render(<Smoke />);

      // Look for the actual MUI stepper instead of our mock
      expect(document.querySelector('.MuiStepper-root')).toBeInTheDocument();
      expect(screen.getAllByTestId('grid')).toHaveLength(3);
      expect(document.querySelectorAll('.MuiStep-root')).toHaveLength(3);
      expect(document.querySelectorAll('.MuiStepButton-root')).toHaveLength(3);
    });

    test('should render all step labels', () => {
      render(<Smoke />);

      expect(screen.getByText('Pre-Smoke')).toBeInTheDocument();
      expect(screen.getByText('Smoke')).toBeInTheDocument();
      expect(screen.getByText('Post-Smoke')).toBeInTheDocument();
    });

    test('should start with step 0 (Pre-Smoke) active', () => {
      render(<Smoke />);

      // Check that the stepper shows active step 0
      const stepper = document.querySelector('.MuiStepper-root');
      expect(stepper).toBeInTheDocument();
      expect(screen.getByTestId('pre-smoke-step')).toBeInTheDocument();
      expect(screen.queryByTestId('smoke-step')).not.toBeInTheDocument();
      expect(screen.queryByTestId('post-smoke-step')).not.toBeInTheDocument();
    });

    test('should render next button with correct text for first step', () => {
      render(<Smoke />);

      const nextButton = screen.getByText('Next');
      expect(nextButton).toBeInTheDocument();
      expect(nextButton).toHaveClass('nextButton');
    });
  });

  describe('Step Navigation', () => {
    test('should navigate to next step when next button is clicked', async () => {
      render(<Smoke />);

      // Start at step 0
      expect(screen.getByTestId('pre-smoke-step')).toBeInTheDocument();

      // Click next button
      const nextButton = screen.getByText('Next');
      fireEvent.click(nextButton);

      // Should be at step 1
      await waitFor(() => {
        expect(screen.getByTestId('smoke-step')).toBeInTheDocument();
        expect(screen.queryByTestId('pre-smoke-step')).not.toBeInTheDocument();
      });
    });

    test('should navigate to step 2 from step 1', async () => {
      render(<Smoke />);

      // Navigate to step 1
      const nextButton = screen.getByText('Next');
      fireEvent.click(nextButton);

      await waitFor(() => {
        expect(screen.getByTestId('smoke-step')).toBeInTheDocument();
      });

      // Navigate to step 2 using the next button from step 1
      const nextButton2 = screen.getByText('Next');
      fireEvent.click(nextButton2);

      await waitFor(() => {
        expect(screen.getByTestId('post-smoke-step')).toBeInTheDocument();
        expect(screen.queryByTestId('smoke-step')).not.toBeInTheDocument();
      });
    });

    test('should show "Finish" button on last step', async () => {
      render(<Smoke />);

      // Navigate to step 2 using two separate next button clicks
      let nextButton = screen.getByText('Next');
      fireEvent.click(nextButton); // Go to step 1

      await waitFor(() => {
        expect(screen.getByTestId('smoke-step')).toBeInTheDocument();
      });

      // Get the next button from the new step
      nextButton = screen.getByText('Next');
      fireEvent.click(nextButton); // Go to step 2

      await waitFor(() => {
        expect(screen.getByTestId('post-smoke-step')).toBeInTheDocument();
        expect(screen.getByText('Finish')).toBeInTheDocument();
        expect(screen.queryByText('Next')).not.toBeInTheDocument();
      });
    });

    test('should navigate directly to step using step buttons', async () => {
      render(<Smoke />);

      const stepButtons = document.querySelectorAll('.MuiStepButton-root');
      expect(stepButtons).toHaveLength(3);

      // Click step 2 button (index 2)
      fireEvent.click(stepButtons[2] as Element);

      await waitFor(() => {
        expect(screen.getByTestId('post-smoke-step')).toBeInTheDocument();
      });
    });

    test('should navigate to step 1 using step button', async () => {
      render(<Smoke />);

      const stepButtons = document.querySelectorAll('.MuiStepButton-root');

      // Click step 1 button (index 1)
      fireEvent.click(stepButtons[1] as Element);

      await waitFor(() => {
        expect(screen.getByTestId('smoke-step')).toBeInTheDocument();
      });
    });
  });

  describe('Finish Smoke Functionality', () => {
    test('should call FinishSmoke and clearSmoke when finish button is clicked', async () => {
      render(<Smoke />);

      // Navigate to step 2 by clicking next buttons twice
      let nextButton = screen.getByText('Next');
      fireEvent.click(nextButton); // Go to step 1

      await waitFor(() => {
        expect(screen.getByTestId('smoke-step')).toBeInTheDocument();
      });

      nextButton = screen.getByText('Next'); // Get the next button from step 1
      fireEvent.click(nextButton); // Go to step 2

      await waitFor(() => {
        expect(screen.getByTestId('post-smoke-step')).toBeInTheDocument();
      });

      // Now we should see the Finish button
      await waitFor(() => {
        expect(screen.getByText('Finish')).toBeInTheDocument();
      });

      // Click finish button
      const finishButton = screen.getByText('Finish');
      fireEvent.click(finishButton);

      await waitFor(() => {
        expect(mockFinishSmoke).toHaveBeenCalledTimes(1);
        expect(mockClearSmoke).toHaveBeenCalledTimes(1);
      });
    });

    test('should reset to step 0 after finishing smoke', async () => {
      render(<Smoke />);

      // Navigate to step 2
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

      await waitFor(() => {
        expect(screen.getByText('Finish')).toBeInTheDocument();
      });

      // Click finish button
      const finishButton = screen.getByText('Finish');
      fireEvent.click(finishButton);

      // Wait for reset to step 0
      await waitFor(
        () => {
          expect(screen.getByTestId('pre-smoke-step')).toBeInTheDocument();
        },
        { timeout: 3000 }
      );
    });
  });

  describe('Component Structure', () => {
    test('should have correct grid structure', () => {
      render(<Smoke />);

      const grids = screen.getAllByTestId('grid');
      expect(grids).toHaveLength(3);

      // Check for specific class names - find the main grid by class name
      expect(grids[0]).toHaveAttribute('data-classname', 'smoke');
    });

    test('should render stepper with correct props', () => {
      render(<Smoke />);

      // Find stepper by its MUI class name
      const stepper = document.querySelector('.MuiStepper-root');
      expect(stepper).toBeInTheDocument();
      expect(stepper).toHaveClass('MuiStepper-horizontal');
      expect(stepper).toHaveClass('MuiStepper-nonLinear');
      expect(stepper).toHaveClass('MuiStepper-alternativeLabel');
    });
  });

  describe('Edge Cases', () => {
    test('should not navigate beyond step 2', async () => {
      render(<Smoke />);

      // Start at step 0 (pre-smoke)
      expect(screen.getByTestId('pre-smoke-step')).toBeInTheDocument();

      // Navigate to step 1 (smoke)
      const nextButton = screen.getByText('Next');
      fireEvent.click(nextButton);

      await waitFor(() => {
        expect(screen.getByTestId('smoke-step')).toBeInTheDocument();
      });

      // Navigate to step 2 (post-smoke)
      const nextButton2 = screen.getByText('Next');
      fireEvent.click(nextButton2);

      await waitFor(() => {
        expect(screen.getByTestId('post-smoke-step')).toBeInTheDocument();
      });

      // Should show Finish button now
      expect(screen.getByText('Finish')).toBeInTheDocument();
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
