import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { ApiClientProvider, createApiClient, createFakeBackend, FakeBackend } from '../../api';
import { Smoke, delay } from './smoke';

let backend: FakeBackend;

const renderSmoke = () =>
  render(
    <ApiClientProvider client={createApiClient(backend)}>
      <Smoke />
    </ApiClientProvider>
  );

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
    backend = createFakeBackend({
      state: { smokeId: 'test-id', smoking: true },
      smoke: { finish: { _id: 'test-id' } as never },
    });
  });

  describe('Component Rendering', () => {
    test('should render Smoke component successfully', () => {
      renderSmoke();
      expect(screen.getByTestId('pre-smoke-step')).toBeInTheDocument();
    });

    test('should render with correct initial state', () => {
      renderSmoke();

      // Should show pre-smoke step initially
      expect(screen.getByTestId('pre-smoke-step')).toBeInTheDocument();
      expect(screen.queryByTestId('smoke-step')).not.toBeInTheDocument();
      expect(screen.queryByTestId('post-smoke-step')).not.toBeInTheDocument();
    });

    test('should display Next button on pre-smoke step', () => {
      renderSmoke();
      expect(screen.getByText('Next')).toBeInTheDocument();
    });
  });

  describe('Navigation', () => {
    test('should navigate from pre-smoke to smoke step', async () => {
      renderSmoke();

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
      renderSmoke();

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
      renderSmoke();

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
      renderSmoke();

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
      renderSmoke();

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
        expect(backend.requests).toContainEqual({
          method: 'post',
          path: 'smoke/finish',
          body: undefined,
        });
        expect(backend.requests).toContainEqual({
          method: 'put',
          path: 'state/clearSmoke',
          body: undefined,
        });
      });
    });
  });

  describe('Delay Function', () => {
    test('should resolve after the scheduled timer fires', async () => {
      jest.useFakeTimers();
      try {
        const resolved = jest.fn();
        const pending = delay(10).then(resolved);

        // Nothing resolves before the timer elapses...
        await Promise.resolve();
        expect(resolved).not.toHaveBeenCalled();

        // ...and it resolves once the scheduled delay fires. Fake timers make the
        // assertion deterministic (real timers under --coverage occasionally
        // measured just under the wall-clock threshold and reddened CI).
        jest.advanceTimersByTime(10);
        await pending;
        expect(resolved).toHaveBeenCalledTimes(1);
      } finally {
        jest.useRealTimers();
      }
    });

    test('should be exported and callable', () => {
      expect(typeof delay).toBe('function');
    });
  });
});
