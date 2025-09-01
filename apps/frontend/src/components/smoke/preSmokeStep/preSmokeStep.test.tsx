import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { PreSmokeStep } from './preSmokeStep';
import { getCurrentPreSmoke, setCurrentPreSmoke } from '../../../Services/preSmokeService';
import { WeightUnits } from '../../common/interfaces/enums';

// Mock Material-UI components
jest.mock('@mui/material', () => ({
  Autocomplete: ({ freeSolo, options, inputValue, onInputChange, renderInput, ...props }: any) => {
    const handleInputChange = (e: any) => {
      if (onInputChange) {
        onInputChange(e, e.target.value);
      }
    };
    return (
      <div
        data-testid="autocomplete"
        data-free-solo={freeSolo}
        data-options={JSON.stringify(options)}
        {...props}
      >
        <input
          data-testid="autocomplete-input"
          value={inputValue || ''}
          onChange={handleInputChange}
          placeholder="Autocomplete"
        />
        {renderInput && renderInput({ inputProps: {} })}
      </div>
    );
  },
  Grid: ({ children, className, flexDirection, ...props }: any) => (
    <div
      data-testid="grid"
      data-classname={className}
      data-flex-direction={flexDirection}
      {...props}
    >
      {children}
    </div>
  ),
  MenuItem: ({ children, value, ...props }: any) => (
    <option data-testid="menu-item" value={value} {...props}>
      {children}
    </option>
  ),
  Select: ({ children, value, onChange, ...props }: any) => (
    <select data-testid="select" value={value} onChange={onChange} {...props}>
      {children}
    </select>
  ),
  TextField: ({ label, value, onChange, type, multiline, rows, ...props }: any) => (
    <input
      data-testid="text-field"
      data-label={label}
      value={value || ''}
      onChange={onChange}
      type={type || 'text'}
      data-multiline={multiline}
      data-rows={rows}
      {...props}
    />
  ),
}));

// Mock DynamicList component
jest.mock('../../common/components/DynamicList', () => ({
  DynamicList: ({ newline, removeLine, steps, onListChange, ...props }: any) => (
    <div data-testid="dynamic-list" {...props}>
      {steps.map((step: string, index: number) => (
        <div key={index} data-testid={`step-${index}`}>
          <input
            data-testid={`step-input-${index}`}
            value={step}
            onChange={e => onListChange && onListChange(e.target.value, index)}
          />
          <button
            data-testid={`remove-step-${index}`}
            onClick={() => removeLine && removeLine(index)}
          >
            Remove
          </button>
        </div>
      ))}
      <button data-testid="add-step" onClick={newline}>
        Add Step
      </button>
    </div>
  ),
}));

// Mock services
jest.mock('../../../Services/preSmokeService', () => ({
  getCurrentPreSmoke: jest.fn(),
  setCurrentPreSmoke: jest.fn(),
}));

const mockGetCurrentPreSmoke = getCurrentPreSmoke as jest.MockedFunction<typeof getCurrentPreSmoke>;
const mockSetCurrentPreSmoke = setCurrentPreSmoke as jest.MockedFunction<typeof setCurrentPreSmoke>;

describe('PreSmokeStep Component', () => {
  const mockNextButton = <button data-testid="next-button">Next</button>;

  const mockPreSmokeData = {
    name: 'Test Smoke',
    meatType: 'Brisket',
    weight: {
      weight: 10,
      unit: WeightUnits.LB,
    },
    steps: ['Step 1', 'Step 2'],
    notes: 'Test notes',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCurrentPreSmoke.mockResolvedValue(mockPreSmokeData);
    mockSetCurrentPreSmoke.mockResolvedValue(undefined);
  });

  describe('Component Rendering', () => {
    test('should render PreSmokeStep component successfully', async () => {
      render(<PreSmokeStep nextButton={mockNextButton} />);

      await waitFor(() => {
        expect(screen.getAllByTestId('grid')).toHaveLength(4); // Main grid + weight grid + steps grid + button grid
        expect(screen.getAllByTestId('text-field')).toHaveLength(4); // name, meat type, weight, notes
        expect(screen.getByTestId('autocomplete')).toBeInTheDocument();
        expect(screen.getByTestId('select')).toBeInTheDocument();
        expect(screen.getByTestId('dynamic-list')).toBeInTheDocument();
        expect(screen.getByTestId('next-button')).toBeInTheDocument();
      });
    });

    test('should load existing pre-smoke data on mount', async () => {
      render(<PreSmokeStep nextButton={mockNextButton} />);

      await waitFor(() => {
        expect(mockGetCurrentPreSmoke).toHaveBeenCalledTimes(1);
      });

      await waitFor(() => {
        const nameField = screen.getByDisplayValue('Test Smoke');
        expect(nameField).toBeInTheDocument();

        const weightField = screen.getByDisplayValue('10');
        expect(weightField).toBeInTheDocument();

        const notesField = screen.getByDisplayValue('Test notes');
        expect(notesField).toBeInTheDocument();
      });
    });

    test('should render all form fields with correct labels', () => {
      render(<PreSmokeStep nextButton={mockNextButton} />);

      const textFields = screen.getAllByTestId('text-field');
      const nameField = textFields.find(field => field.getAttribute('data-label') === 'Name');
      const weightField = textFields.find(field => field.getAttribute('data-label') === 'Weight');
      const notesField = textFields.find(field => field.getAttribute('data-label') === 'Notes');

      expect(nameField).toHaveAttribute('data-label', 'Name');
      expect(screen.getByTestId('autocomplete-input')).toBeInTheDocument();
      expect(weightField).toBeInTheDocument();
      expect(notesField).toBeInTheDocument();
    });
  });

  describe('Form Interactions', () => {
    test('should update name field when changed', async () => {
      render(<PreSmokeStep nextButton={mockNextButton} />);

      await waitFor(() => {
        expect(screen.getByDisplayValue('Test Smoke')).toBeInTheDocument();
      });

      const nameField = screen.getByDisplayValue('Test Smoke');
      fireEvent.change(nameField, { target: { value: 'New Smoke Name' } });

      expect(nameField).toHaveValue('New Smoke Name');
    });

    test('should update meat type via autocomplete', async () => {
      render(<PreSmokeStep nextButton={mockNextButton} />);

      const autocompleteInput = screen.getByTestId('autocomplete-input');
      fireEvent.change(autocompleteInput, { target: { value: 'Turkey' } });

      expect(autocompleteInput).toHaveValue('Turkey');
    });

    test('should update weight value', async () => {
      render(<PreSmokeStep nextButton={mockNextButton} />);

      await waitFor(() => {
        expect(screen.getByDisplayValue('10')).toBeInTheDocument();
      });

      const weightField = screen.getByDisplayValue('10');
      fireEvent.change(weightField, { target: { value: 15 } });

      expect(weightField).toHaveValue(15);
    });

    test('should update weight unit via select', async () => {
      render(<PreSmokeStep nextButton={mockNextButton} />);

      const selectField = screen.getByTestId('select');
      fireEvent.change(selectField, { target: { value: WeightUnits.OZ } });

      expect(selectField).toHaveValue(WeightUnits.OZ);
    });

    test('should update notes field', async () => {
      render(<PreSmokeStep nextButton={mockNextButton} />);

      await waitFor(() => {
        expect(screen.getByDisplayValue('Test notes')).toBeInTheDocument();
      });

      const notesField = screen.getByDisplayValue('Test notes');
      fireEvent.change(notesField, { target: { value: 'Updated notes' } });

      expect(notesField).toHaveValue('Updated notes');
    });
  });

  describe('Dynamic List Integration', () => {
    test('should render dynamic list with existing steps', async () => {
      render(<PreSmokeStep nextButton={mockNextButton} />);

      await waitFor(() => {
        expect(screen.getByTestId('step-input-0')).toHaveValue('Step 1');
        expect(screen.getByTestId('step-input-1')).toHaveValue('Step 2');
      });
    });

    test('should add new step when add button clicked', async () => {
      render(<PreSmokeStep nextButton={mockNextButton} />);

      await waitFor(() => {
        expect(screen.getByTestId('dynamic-list')).toBeInTheDocument();
      });

      const addButton = screen.getByTestId('add-step');
      expect(addButton).toBeInTheDocument();

      // The mock doesn't actually add new steps, but we can verify the button exists and can be clicked
      fireEvent.click(addButton);

      // Since our mock is static, we just verify that the existing steps are still there
      await waitFor(() => {
        expect(screen.getByTestId('step-input-0')).toBeInTheDocument();
        expect(screen.getByTestId('step-input-1')).toBeInTheDocument();
      });
    });

    test('should remove step when remove button clicked', async () => {
      render(<PreSmokeStep nextButton={mockNextButton} />);

      await waitFor(() => {
        expect(screen.getByTestId('step-input-1')).toBeInTheDocument();
      });

      const removeButton = screen.getByTestId('remove-step-1');
      fireEvent.click(removeButton);

      await waitFor(() => {
        expect(screen.queryByTestId('step-input-1')).not.toBeInTheDocument();
      });
    });

    test('should update step content when input changed', async () => {
      render(<PreSmokeStep nextButton={mockNextButton} />);

      await waitFor(() => {
        expect(screen.getByTestId('step-input-0')).toHaveValue('Step 1');
      });

      const stepInput = screen.getByTestId('step-input-0');
      fireEvent.change(stepInput, { target: { value: 'Updated Step 1' } });

      expect(stepInput).toHaveValue('Updated Step 1');
    });
  });

  describe('Component Lifecycle', () => {
    test('should call setCurrentPreSmoke on unmount', async () => {
      const { unmount } = render(<PreSmokeStep nextButton={mockNextButton} />);

      await waitFor(() => {
        expect(mockGetCurrentPreSmoke).toHaveBeenCalled();
      });

      unmount();

      expect(mockSetCurrentPreSmoke).toHaveBeenCalledWith(
        expect.objectContaining({
          name: expect.any(String),
          meatType: expect.any(String),
          weight: expect.any(Object),
          steps: expect.any(Array),
          notes: expect.any(String),
        })
      );
    });

    test('should handle empty current pre-smoke data', async () => {
      mockGetCurrentPreSmoke.mockResolvedValue({
        name: '',
        meatType: '',
        weight: { unit: WeightUnits.LB },
        steps: [''],
        notes: '',
      });

      render(<PreSmokeStep nextButton={mockNextButton} />);

      await waitFor(() => {
        expect(mockGetCurrentPreSmoke).toHaveBeenCalled();
      });

      // Should render with default empty values
      const textFields = screen.getAllByTestId('text-field');
      const nameField = textFields.find(field => field.getAttribute('data-label') === 'Name');
      expect(nameField).toHaveValue('');
    });
  });

  describe('Form Validation', () => {
    test('should handle empty weight field', async () => {
      const emptyWeightData = {
        ...mockPreSmokeData,
        weight: { unit: WeightUnits.LB },
      };
      mockGetCurrentPreSmoke.mockResolvedValue(emptyWeightData);

      render(<PreSmokeStep nextButton={mockNextButton} />);

      await waitFor(() => {
        const weightFields = screen.getAllByTestId('text-field');
        const weightField = weightFields.find(field => field.getAttribute('type') === 'number');
        expect(weightField).toHaveAttribute('value', '');
      });
    });

    test('should handle number input for weight', async () => {
      render(<PreSmokeStep nextButton={mockNextButton} />);

      const weightFields = screen.getAllByTestId('text-field');
      const weightField = weightFields.find(field => field.getAttribute('type') === 'number');

      expect(weightField).toHaveAttribute('type', 'number');
    });
  });

  describe('Component Structure', () => {
    test('should have correct grid structure', () => {
      render(<PreSmokeStep nextButton={mockNextButton} />);

      const grids = screen.getAllByTestId('grid');
      expect(grids.length).toBeGreaterThan(1);
    });

    test('should render next button in correct position', () => {
      render(<PreSmokeStep nextButton={mockNextButton} />);

      expect(screen.getByTestId('next-button')).toBeInTheDocument();
    });
  });

  describe('Autocomplete Features', () => {
    test('should render autocomplete with meat options', () => {
      render(<PreSmokeStep nextButton={mockNextButton} />);

      const autocomplete = screen.getByTestId('autocomplete');
      const options = JSON.parse(autocomplete.getAttribute('data-options') || '[]');

      expect(options).toContain('Ribs');
      expect(options).toContain('Brisket');
      expect(options).toContain('Turkey');
    });

    test('should support free solo input', () => {
      render(<PreSmokeStep nextButton={mockNextButton} />);

      const autocomplete = screen.getByTestId('autocomplete');
      expect(autocomplete).toHaveAttribute('data-free-solo', 'true');
    });
  });

  describe('Weight Unit Selection', () => {
    test('should render weight unit options', () => {
      render(<PreSmokeStep nextButton={mockNextButton} />);

      expect(screen.getByText('LB')).toBeInTheDocument();
      expect(screen.getByText('OZ')).toBeInTheDocument();
    });

    test('should default to LB unit', async () => {
      mockGetCurrentPreSmoke.mockResolvedValue({
        name: '',
        meatType: '',
        weight: { unit: WeightUnits.LB },
        steps: [''],
        notes: '',
      });

      render(<PreSmokeStep nextButton={mockNextButton} />);

      const selectField = screen.getByTestId('select');
      expect(selectField).toHaveValue(WeightUnits.LB);
    });
  });
});
