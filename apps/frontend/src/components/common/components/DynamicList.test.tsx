import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { DynamicList } from './DynamicList';

// Mock Material-UI components
jest.mock('@mui/material', () => ({
  Button: ({ children, onClick, className, variant, size, ...props }: any) => (
    <button
      onClick={onClick}
      className={className}
      data-testid={`button-${children}`}
      data-variant={variant}
      data-size={size}
      {...props}
    >
      {children}
    </button>
  ),
  Grid: ({ children, className, ...props }: any) => (
    <div className={className} data-testid="grid" {...props}>
      {children}
    </div>
  ),
  TextField: ({ 
    value, 
    onChange, 
    label, 
    placeholder, 
    multiline, 
    sx, 
    id, 
    ...props 
  }: any) => (
    <input
      type="text"
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      data-testid={`textfield-${label || 'input'}`}
      data-label={label}
      data-multiline={multiline}
      data-id={id}
      {...props}
    />
  ),
}));

// Mock CSS import
jest.mock('./Dynamiclist.style.css', () => ({}));

describe('DynamicList', () => {
  let defaultProps: {
    onListChange: jest.Mock;
    newline: jest.Mock;
    removeLine: jest.Mock;
    steps: string[];
  };

  beforeEach(() => {
    defaultProps = {
      onListChange: jest.fn(),
      newline: jest.fn(),
      removeLine: jest.fn(),
      steps: ['Step 1', 'Step 2', 'Step 3'],
    };
  });

  describe('Rendering', () => {
    test('should render DynamicList component successfully', () => {
      render(<DynamicList {...defaultProps} />);
      
      expect(screen.getAllByTestId('grid')).toHaveLength(6); // 3 items * 2 grids each
      expect(screen.getAllByTestId(/textfield-Step/)).toHaveLength(3);
    });

    test('should render correct number of steps', () => {
      render(<DynamicList {...defaultProps} />);
      
      const textFields = screen.getAllByTestId('textfield-Step');
      expect(textFields).toHaveLength(3);
      expect(textFields[0]).toHaveValue('Step 1');
      expect(textFields[1]).toHaveValue('Step 2');
      expect(textFields[2]).toHaveValue('Step 3');
    });

    test('should render step numbers correctly', () => {
      render(<DynamicList {...defaultProps} />);
      
      expect(screen.getByText('1.')).toBeInTheDocument();
      expect(screen.getByText('2.')).toBeInTheDocument();
      expect(screen.getByText('3.')).toBeInTheDocument();
    });

    test('should render empty fragment when steps is empty', () => {
      const { container } = render(<DynamicList {...defaultProps} steps={[]} />);
      
      expect(container.firstChild).toBeNull();
    });

    test('should render empty fragment when steps is undefined', () => {
      const { container } = render(<DynamicList {...defaultProps} steps={undefined as any} />);
      
      expect(container.firstChild).toBeNull();
    });

    test('should render empty fragment when steps is null', () => {
      const { container } = render(<DynamicList {...defaultProps} steps={null as any} />);
      
      expect(container.firstChild).toBeNull();
    });

    test('should render single step correctly', () => {
      render(<DynamicList {...defaultProps} steps={['Single step']} />);
      
      expect(screen.getByText('1.')).toBeInTheDocument();
      expect(screen.getByTestId('textfield-Step')).toHaveValue('Single step');
      expect(screen.getByTestId('button-+')).toBeInTheDocument();
      expect(screen.queryByTestId('button--')).not.toBeInTheDocument();
    });
  });

  describe('Button Rendering Logic', () => {
    test('should show + button only on the last item', () => {
      render(<DynamicList {...defaultProps} />);
      
      const addButtons = screen.getAllByTestId('button-+');
      const removeButtons = screen.getAllByTestId('button--');
      
      expect(addButtons).toHaveLength(1);
      expect(removeButtons).toHaveLength(2);
    });

    test('should show - button on all items except the last one', () => {
      render(<DynamicList {...defaultProps} steps={['Step 1', 'Step 2', 'Step 3', 'Step 4']} />);
      
      const addButtons = screen.getAllByTestId('button-+');
      const removeButtons = screen.getAllByTestId('button--');
      
      expect(addButtons).toHaveLength(1);
      expect(removeButtons).toHaveLength(3);
    });

    test('should have correct button properties', () => {
      render(<DynamicList {...defaultProps} />);
      
      const addButton = screen.getByTestId('button-+');
      const removeButtons = screen.getAllByTestId('button--');
      
      expect(addButton).toHaveAttribute('data-variant', 'outlined');
      expect(addButton).toHaveAttribute('data-size', 'small');
      expect(addButton).toHaveClass('addButton');
      
      removeButtons.forEach(removeButton => {
        expect(removeButton).toHaveAttribute('data-variant', 'outlined');
        expect(removeButton).toHaveAttribute('data-size', 'small');
        expect(removeButton).toHaveClass('addButton');
      });
    });
  });

  describe('TextField Properties', () => {
    test('should render TextFields with correct properties', () => {
      render(<DynamicList {...defaultProps} />);
      
      const textFields = screen.getAllByTestId('textfield-Step');
      
      textFields.forEach(field => {
        expect(field).toHaveAttribute('data-label', 'Step');
        expect(field).toHaveAttribute('placeholder', 'Placeholder');
        expect(field).toHaveAttribute('data-multiline', 'true');
        expect(field).toHaveAttribute('data-id', 'outlined-textarea');
      });
    });

    test('should have unique keys for each list item', () => {
      const { container } = render(<DynamicList {...defaultProps} />);
      
      const gridElements = container.querySelectorAll('.dynamicList');
      expect(gridElements).toHaveLength(3);
    });
  });

  describe('User Interactions', () => {
    test('should call onListChange when text is changed', () => {
      render(<DynamicList {...defaultProps} />);
      
      const firstTextField = screen.getAllByTestId('textfield-Step')[0];
      fireEvent.change(firstTextField, { target: { value: 'Updated step 1' } });
      
      expect(defaultProps.onListChange).toHaveBeenCalledWith('Updated step 1', 0);
    });

    test('should call onListChange with correct index for different steps', () => {
      render(<DynamicList {...defaultProps} />);
      
      const textFields = screen.getAllByTestId('textfield-Step');
      
      fireEvent.change(textFields[1], { target: { value: 'Updated step 2' } });
      expect(defaultProps.onListChange).toHaveBeenCalledWith('Updated step 2', 1);
      
      fireEvent.change(textFields[2], { target: { value: 'Updated step 3' } });
      expect(defaultProps.onListChange).toHaveBeenCalledWith('Updated step 3', 2);
    });

    test('should call newline when + button is clicked', () => {
      render(<DynamicList {...defaultProps} />);
      
      const addButton = screen.getByTestId('button-+');
      fireEvent.click(addButton);
      
      expect(defaultProps.newline).toHaveBeenCalledTimes(1);
    });

    test('should call removeLine when - button is clicked', () => {
      render(<DynamicList {...defaultProps} />);
      
      const removeButtons = screen.getAllByTestId('button--');
      fireEvent.click(removeButtons[0]);
      
      expect(defaultProps.removeLine).toHaveBeenCalledWith(0);
    });

    test('should call removeLine with correct index for different buttons', () => {
      render(<DynamicList {...defaultProps} />);
      
      const removeButtons = screen.getAllByTestId('button--');
      
      fireEvent.click(removeButtons[1]);
      expect(defaultProps.removeLine).toHaveBeenCalledWith(1);
    });

    test('should handle multiple interactions correctly', () => {
      render(<DynamicList {...defaultProps} />);
      
      const textFields = screen.getAllByTestId('textfield-Step');
      const addButton = screen.getByTestId('button-+');
      const removeButtons = screen.getAllByTestId('button--');
      
      // Change text
      fireEvent.change(textFields[0], { target: { value: 'Changed text' } });
      
      // Click add button
      fireEvent.click(addButton);
      
      // Click remove button
      fireEvent.click(removeButtons[0]);
      
      expect(defaultProps.onListChange).toHaveBeenCalledWith('Changed text', 0);
      expect(defaultProps.newline).toHaveBeenCalledTimes(1);
      expect(defaultProps.removeLine).toHaveBeenCalledWith(0);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('should handle empty string steps', () => {
      render(<DynamicList {...defaultProps} steps={['', 'Step 2', '']} />);
      
      const textFields = screen.getAllByTestId('textfield-Step');
      expect(textFields[0]).toHaveValue('');
      expect(textFields[1]).toHaveValue('Step 2');
      expect(textFields[2]).toHaveValue('');
    });

    test('should handle undefined callback functions gracefully', () => {
      const propsWithUndefined = {
        onListChange: undefined as any,
        newline: undefined as any,
        removeLine: undefined as any,
        steps: ['Step 1'],
      };
      
      expect(() => {
        render(<DynamicList {...propsWithUndefined} />);
      }).not.toThrow();
    });

    test('should handle null callback functions gracefully', () => {
      const propsWithNull = {
        onListChange: null as any,
        newline: null as any,
        removeLine: null as any,
        steps: ['Step 1'],
      };
      
      expect(() => {
        render(<DynamicList {...propsWithNull} />);
      }).not.toThrow();
    });

    test('should handle very long step text', () => {
      const longText = 'A'.repeat(1000);
      render(<DynamicList {...defaultProps} steps={[longText]} />);
      
      const textField = screen.getByTestId('textfield-Step');
      expect(textField).toHaveValue(longText);
    });

    test('should handle special characters in step text', () => {
      const specialText = '!@#$%^&*()_+-=[]{}|;:,.<>?';
      render(<DynamicList {...defaultProps} steps={[specialText]} />);
      
      const textField = screen.getByTestId('textfield-Step');
      expect(textField).toHaveValue(specialText);
    });

    test('should handle large number of steps', () => {
      const manySteps = Array.from({ length: 100 }, (_, i) => `Step ${i + 1}`);
      render(<DynamicList {...defaultProps} steps={manySteps} />);
      
      const textFields = screen.getAllByTestId('textfield-Step');
      expect(textFields).toHaveLength(100);
      
      const addButtons = screen.getAllByTestId('button-+');
      const removeButtons = screen.getAllByTestId('button--');
      
      expect(addButtons).toHaveLength(1);
      expect(removeButtons).toHaveLength(99);
    });
  });

  describe('Component Structure and Props', () => {
    test('should apply correct CSS classes', () => {
      const { container } = render(<DynamicList {...defaultProps} />);
      
      const dynamicListElements = container.querySelectorAll('.dynamicList');
      const stepNumberElements = container.querySelectorAll('.stepNumber');
      const addButtonElements = container.querySelectorAll('.addButton');
      
      expect(dynamicListElements).toHaveLength(3);
      expect(stepNumberElements).toHaveLength(3);
      expect(addButtonElements).toHaveLength(3); // 1 add + 2 remove buttons
    });

    test('should maintain component structure integrity', () => {
      const { container } = render(<DynamicList {...defaultProps} />);
      
      // Check that each step has the expected structure
      const dynamicListElements = container.querySelectorAll('.dynamicList');
      
      dynamicListElements.forEach((element, index) => {
        const stepNumber = element.querySelector('.stepNumber');
        const textField = element.querySelector('[data-testid="textfield-Step"]');
        const button = element.querySelector('button');
        
        expect(stepNumber).toBeInTheDocument();
        expect(stepNumber).toHaveTextContent(`${index + 1}.`);
        expect(textField).toBeInTheDocument();
        expect(button).toBeInTheDocument();
      });
    });

    test('should render Fragment as root element', () => {
      const { container } = render(<DynamicList {...defaultProps} />);
      
      // Fragment doesn't create a wrapper element
      expect(container.firstChild).toHaveClass('dynamicList');
    });
  });

  describe('State Management Simulation', () => {
    test('should properly update when steps prop changes', () => {
      const { rerender } = render(<DynamicList {...defaultProps} />);
      
      expect(screen.getAllByTestId('textfield-Step')).toHaveLength(3);
      
      // Update steps
      rerender(<DynamicList {...defaultProps} steps={['New Step 1', 'New Step 2']} />);
      
      const updatedTextFields = screen.getAllByTestId('textfield-Step');
      expect(updatedTextFields).toHaveLength(2);
      expect(updatedTextFields[0]).toHaveValue('New Step 1');
      expect(updatedTextFields[1]).toHaveValue('New Step 2');
    });

    test('should handle steps being added dynamically', () => {
      const { rerender } = render(<DynamicList {...defaultProps} steps={['Step 1']} />);
      
      expect(screen.getAllByTestId('textfield-Step')).toHaveLength(1);
      expect(screen.getByTestId('button-+')).toBeInTheDocument();
      expect(screen.queryByTestId('button--')).not.toBeInTheDocument();
      
      // Add more steps
      rerender(<DynamicList {...defaultProps} steps={['Step 1', 'Step 2']} />);
      
      expect(screen.getAllByTestId('textfield-Step')).toHaveLength(2);
      expect(screen.getByTestId('button-+')).toBeInTheDocument();
      expect(screen.getByTestId('button--')).toBeInTheDocument();
    });

    test('should handle steps being removed dynamically', () => {
      const { rerender } = render(<DynamicList {...defaultProps} />);
      
      expect(screen.getAllByTestId('textfield-Step')).toHaveLength(3);
      
      // Remove steps
      rerender(<DynamicList {...defaultProps} steps={['Step 1']} />);
      
      expect(screen.getAllByTestId('textfield-Step')).toHaveLength(1);
      expect(screen.getByTestId('button-+')).toBeInTheDocument();
      expect(screen.queryByTestId('button--')).not.toBeInTheDocument();
    });
  });
});
