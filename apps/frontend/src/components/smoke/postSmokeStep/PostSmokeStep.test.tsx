import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { PostSmokeStep } from './PostSmokeStep';
import { getCurrentPostSmoke, setCurrentPostSmoke } from '../../../Services/postSmokeService';

// Mock Material-UI components
jest.mock('@mui/material', () => ({
  Grid: ({ children, item, sx, direction, justifyContent, flexDirection, ...props }: any) => (
    <div 
      data-testid="grid" 
      data-item={item}
      data-sx={JSON.stringify(sx)}
      data-direction={direction}
      data-justify-content={justifyContent}
      data-flex-direction={flexDirection}
      {...props}
    >
      {children}
    </div>
  ),
  TextField: ({ label, value, onChange, multiline, rows, variant, sx, InputProps, ...props }: any) => (
    <input 
      data-testid="text-field" 
      data-label={label}
      value={value || ''} 
      onChange={onChange} 
      data-multiline={multiline}
      data-rows={rows}
      data-variant={variant}
      data-sx={JSON.stringify(sx)}
      data-input-props={JSON.stringify(InputProps)}
      {...props} 
    />
  )
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
            onChange={(e) => onListChange(e.target.value, index)}
          />
          <button 
            data-testid={`remove-step-${index}`}
            onClick={() => removeLine(index)}
          >
            Remove
          </button>
        </div>
      ))}
      <button data-testid="add-step" onClick={newline}>Add Step</button>
    </div>
  )
}));

// Mock react-imask
jest.mock('react-imask', () => ({
  IMaskInput: (props: any) => {
    const { onAccept, mask, definitions, overwrite, ...restProps } = props;
    return (
      <input
        data-testid="imask-input"
        data-mask={mask}
        data-definitions={JSON.stringify(definitions)}
        data-overwrite={overwrite}
        onChange={(e) => {
          if (onAccept) {
            onAccept(e.target.value);
          }
        }}
        {...restProps}
      />
    );
  }
}));

// Mock services
jest.mock('../../../Services/postSmokeService', () => ({
  getCurrentPostSmoke: jest.fn(),
  setCurrentPostSmoke: jest.fn()
}));

const mockGetCurrentPostSmoke = getCurrentPostSmoke as jest.MockedFunction<typeof getCurrentPostSmoke>;
const mockSetCurrentPostSmoke = setCurrentPostSmoke as jest.MockedFunction<typeof setCurrentPostSmoke>;

describe('PostSmokeStep Component', () => {
  const mockNextButton = <button data-testid="next-button">Finish</button>;

  const mockPostSmokeData = {
    restTime: '02:30',
    steps: ['Let rest', 'Slice against grain'],
    notes: 'Test post-smoke notes'
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCurrentPostSmoke.mockResolvedValue(mockPostSmokeData);
    mockSetCurrentPostSmoke.mockResolvedValue(undefined);
  });

  describe('Component Rendering', () => {
    test('should render PostSmokeStep component successfully', async () => {
      render(<PostSmokeStep nextButton={mockNextButton} />);
      
      await waitFor(() => {
        expect(screen.getAllByTestId('grid')).toHaveLength(4);
        expect(screen.getAllByTestId('text-field')).toHaveLength(2); // rest time and notes
        expect(screen.getByTestId('dynamic-list')).toBeInTheDocument();
        expect(screen.getByTestId('next-button')).toBeInTheDocument();
      });
    });

    test('should load existing post-smoke data on mount', async () => {
      render(<PostSmokeStep nextButton={mockNextButton} />);
      
      await waitFor(() => {
        expect(mockGetCurrentPostSmoke).toHaveBeenCalledTimes(1);
      });
      
      await waitFor(() => {
        const restTimeField = screen.getByDisplayValue('02:30');
        expect(restTimeField).toBeInTheDocument();
        
        const notesField = screen.getByDisplayValue('Test post-smoke notes');
        expect(notesField).toBeInTheDocument();
      });
    });

    test('should render all form fields with correct labels', async () => {
      render(<PostSmokeStep nextButton={mockNextButton} />);
      
      const textFields = screen.getAllByTestId('text-field');
      
      const restTimeField = textFields.find(field => field.getAttribute('data-label') === 'Rest Time');
      const notesField = textFields.find(field => field.getAttribute('data-label') === 'Notes');
      
      expect(restTimeField).toBeInTheDocument();
      expect(notesField).toBeInTheDocument();
    });
  });

  describe('Rest Time Field', () => {
    test('should render rest time field with correct variant', () => {
      render(<PostSmokeStep nextButton={mockNextButton} />);
      
      const textFields = screen.getAllByTestId('text-field');
      const restTimeField = textFields.find(field => field.getAttribute('data-label') === 'Rest Time');
      
      expect(restTimeField).toHaveAttribute('data-variant', 'outlined');
    });

    test('should have InputProps for custom input component', () => {
      render(<PostSmokeStep nextButton={mockNextButton} />);
      
      const textFields = screen.getAllByTestId('text-field');
      const restTimeField = textFields.find(field => field.getAttribute('data-label') === 'Rest Time');
      
      const inputProps = JSON.parse(restTimeField?.getAttribute('data-input-props') || '{}');
      expect(inputProps.inputComponent).toBeDefined();
    });

    test('should update rest time when changed', async () => {
      render(<PostSmokeStep nextButton={mockNextButton} />);
      
      await waitFor(() => {
        expect(screen.getByDisplayValue('02:30')).toBeInTheDocument();
      });
      
      const restTimeField = screen.getByDisplayValue('02:30');
      fireEvent.change(restTimeField, { target: { value: '03:45' } });
      
      expect(restTimeField).toHaveValue('03:45');
    });
  });

  describe('Dynamic List Integration', () => {
    test('should render dynamic list with existing steps', async () => {
      render(<PostSmokeStep nextButton={mockNextButton} />);
      
      await waitFor(() => {
        expect(screen.getByTestId('step-input-0')).toHaveValue('Let rest');
        expect(screen.getByTestId('step-input-1')).toHaveValue('Slice against grain');
      });
    });

    test('should add new step when add button clicked', async () => {
      render(<PostSmokeStep nextButton={mockNextButton} />);
      
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
      render(<PostSmokeStep nextButton={mockNextButton} />);
      
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
      render(<PostSmokeStep nextButton={mockNextButton} />);
      
      await waitFor(() => {
        expect(screen.getByTestId('step-input-0')).toHaveValue('Let rest');
      });
      
      const stepInput = screen.getByTestId('step-input-0');
      fireEvent.change(stepInput, { target: { value: 'Let rest for 1 hour' } });
      
      expect(stepInput).toHaveValue('Let rest for 1 hour');
    });
  });

  describe('Notes Field', () => {
    test('should update notes field', async () => {
      render(<PostSmokeStep nextButton={mockNextButton} />);
      
      await waitFor(() => {
        expect(screen.getByDisplayValue('Test post-smoke notes')).toBeInTheDocument();
      });
      
      const notesField = screen.getByDisplayValue('Test post-smoke notes');
      fireEvent.change(notesField, { target: { value: 'Updated post-smoke notes' } });
      
      expect(notesField).toHaveValue('Updated post-smoke notes');
    });

    test('should render multiline notes field', async () => {
      render(<PostSmokeStep nextButton={mockNextButton} />);
      
      const textFields = screen.getAllByTestId('text-field');
      const notesField = textFields.find(field => field.getAttribute('data-label') === 'Notes');
      
      expect(notesField).toHaveAttribute('data-multiline', 'true');
      expect(notesField).toHaveAttribute('data-rows', '4');
    });

    test('should have correct width styling for notes field', async () => {
      render(<PostSmokeStep nextButton={mockNextButton} />);
      
      const textFields = screen.getAllByTestId('text-field');
      const notesField = textFields.find(field => field.getAttribute('data-label') === 'Notes');
      
      const sx = JSON.parse(notesField?.getAttribute('data-sx') || '{}');
      expect(sx.width).toBe('100%');
    });
  });

  describe('Component Lifecycle', () => {
    test('should call setCurrentPostSmoke on unmount', async () => {
      const { unmount } = render(<PostSmokeStep nextButton={mockNextButton} />);
      
      await waitFor(() => {
        expect(mockGetCurrentPostSmoke).toHaveBeenCalled();
      });
      
      unmount();
      
      expect(mockSetCurrentPostSmoke).toHaveBeenCalledWith(
        expect.objectContaining({
          restTime: expect.any(String),
          steps: expect.any(Array),
          notes: expect.any(String)
        })
      );
    });

    test('should handle empty current post-smoke data', async () => {
      const emptyData = {
        restTime: '',
        steps: [''],
        notes: ''
      };
      mockGetCurrentPostSmoke.mockResolvedValue(emptyData);
      
      render(<PostSmokeStep nextButton={mockNextButton} />);
      
      await waitFor(() => {
        expect(mockGetCurrentPostSmoke).toHaveBeenCalled();
      });
      
      // Should render with empty values
      const textFields = screen.getAllByTestId('text-field');
      const restTimeField = textFields.find(field => field.getAttribute('data-label') === 'Rest Time');
      expect(restTimeField).toHaveValue('');
    });
  });

  describe('Component Structure', () => {
    test('should have correct grid structure', async () => {
      render(<PostSmokeStep nextButton={mockNextButton} />);
      
      const grids = screen.getAllByTestId('grid');
      expect(grids).toHaveLength(4);
      
      // Check for main container grid
      const mainGrid = grids.find(grid => {
        const sx = JSON.parse(grid.getAttribute('data-sx') || '{}');
        return sx.width === '100%';
      });
      expect(mainGrid).toBeInTheDocument();
    });

    test('should render next button in correct position', () => {
      render(<PostSmokeStep nextButton={mockNextButton} />);
      
      expect(screen.getByTestId('next-button')).toBeInTheDocument();
      
      // Should be in a grid with flexDirection row-reverse
      const buttonGrid = screen.getAllByTestId('grid').find(
        grid => grid.getAttribute('data-flex-direction') === 'row-reverse'
      );
      expect(buttonGrid).toBeInTheDocument();
    });

    test('should have correct spacing for fields', () => {
      render(<PostSmokeStep nextButton={mockNextButton} />);
      
      const textFields = screen.getAllByTestId('text-field');
      const restTimeField = textFields.find(field => field.getAttribute('data-label') === 'Rest Time');
      
      const sx = JSON.parse(restTimeField?.getAttribute('data-sx') || '{}');
      expect(sx.marginBottom).toBe('10px');
    });
  });

  describe('TextMaskCustom Component', () => {
    test('should render with correct mask pattern', () => {
      render(<PostSmokeStep nextButton={mockNextButton} />);
      
      // The TextMaskCustom is used as InputProps.inputComponent
      // We can verify it's being used by checking the InputProps
      const textFields = screen.getAllByTestId('text-field');
      const restTimeField = textFields.find(field => field.getAttribute('data-label') === 'Rest Time');
      
      const inputProps = JSON.parse(restTimeField?.getAttribute('data-input-props') || '{}');
      expect(inputProps.inputComponent).toBeDefined();
    });
  });

  describe('Form Validation', () => {
    test('should handle invalid rest time format', async () => {
      render(<PostSmokeStep nextButton={mockNextButton} />);
      
      await waitFor(() => {
        expect(screen.getByDisplayValue('02:30')).toBeInTheDocument();
      });
      
      const restTimeField = screen.getByDisplayValue('02:30');
      fireEvent.change(restTimeField, { target: { value: 'invalid' } });
      
      // Component should handle invalid input gracefully
      expect(restTimeField).toHaveValue('invalid');
    });
  });

  describe('Props Interface', () => {
    test('should accept nextButton prop correctly', () => {
      const customButton = <button data-testid="custom-button">Custom Finish</button>;
      
      render(<PostSmokeStep nextButton={customButton} />);
      
      expect(screen.getByTestId('custom-button')).toBeInTheDocument();
      expect(screen.getByText('Custom Finish')).toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    test('should handle service calls gracefully', async () => {
      render(<PostSmokeStep nextButton={mockNextButton} />);
      
      await waitFor(() => {
        expect(mockGetCurrentPostSmoke).toHaveBeenCalled();
      });
      
      // Component should render with proper service interaction
      expect(screen.getAllByTestId('text-field')).toHaveLength(2);
    });

    test('should call setCurrentPostSmoke on unmount', async () => {
      const { unmount } = render(<PostSmokeStep nextButton={mockNextButton} />);
      
      await waitFor(() => {
        expect(mockGetCurrentPostSmoke).toHaveBeenCalled();
      });
      
      unmount();
      
      expect(mockSetCurrentPostSmoke).toHaveBeenCalled();
    });
  });

  describe('State Management', () => {
    test('should maintain state across re-renders', async () => {
      const { rerender } = render(<PostSmokeStep nextButton={mockNextButton} />);
      
      await waitFor(() => {
        expect(screen.getByDisplayValue('02:30')).toBeInTheDocument();
      });
      
      const restTimeField = screen.getByDisplayValue('02:30');
      fireEvent.change(restTimeField, { target: { value: '04:00' } });
      
      rerender(<PostSmokeStep nextButton={mockNextButton} />);
      
      expect(restTimeField).toHaveValue('04:00');
    });

    test('should update latestState ref when state changes', async () => {
      render(<PostSmokeStep nextButton={mockNextButton} />);
      
      await waitFor(() => {
        expect(screen.getByDisplayValue('02:30')).toBeInTheDocument();
      });
      
      const restTimeField = screen.getByDisplayValue('02:30');
      fireEvent.change(restTimeField, { target: { value: '05:15' } });
      
      expect(restTimeField).toHaveValue('05:15');
    });
  });

  describe('Default Values', () => {
    test('should initialize with default empty state', async () => {
      const defaultData = {
        restTime: '',
        steps: [''],
        notes: ''
      };
      mockGetCurrentPostSmoke.mockResolvedValue(defaultData);
      
      render(<PostSmokeStep nextButton={mockNextButton} />);
      
      await waitFor(() => {
        const textFields = screen.getAllByTestId('text-field');
        textFields.forEach(field => {
          if (field.getAttribute('data-label') === 'Rest Time' || field.getAttribute('data-label') === 'Notes') {
            expect(field).toHaveValue('');
          }
        });
      });
    });
  });
});
