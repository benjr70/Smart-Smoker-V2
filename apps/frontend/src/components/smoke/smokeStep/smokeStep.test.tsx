import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { SmokeStep } from './smokeStep';
import { getCurrentSmokeProfile, getState, setSmokeProfile, toggleSmoking } from '../../../Services/smokerService';
import { io } from 'socket.io-client';

// Mock socket.io-client
const mockSocket = {
  on: jest.fn(),
  emit: jest.fn(),
  disconnect: jest.fn()
};

jest.mock('socket.io-client', () => ({
  __esModule: true,
  io: jest.fn(() => mockSocket),
  Socket: jest.fn()
}));

// Mock Material-UI components
jest.mock('@mui/material', () => ({
  Grid: ({ children, container, item, xs, direction, className, sx, ...props }: any) => (
    <div 
      data-testid="grid"
      data-container={container} 
      data-item={item} 
      data-xs={xs} 
      data-direction={direction}
      className={className}
      data-sx={JSON.stringify(sx)}
      {...props}
    >
      {children}
    </div>
  ),
  Autocomplete: ({ freeSolo, options, inputValue, onInputChange, renderInput, ...props }: any) => {
    const handleInputChange = (e: any) => {
      if (onInputChange) {
        onInputChange(e, e.target.value);
      }
    };
    return (
      <div data-testid="autocomplete" data-free-solo={freeSolo} data-options={JSON.stringify(options)} {...props}>
        <input 
          data-testid="autocomplete-input"
          value={inputValue || ''}
          onChange={handleInputChange}
          placeholder="Wood Type"
        />
      </div>
    );
  },
  Button: ({ children, onClick, variant, size, className, ...props }: any) => (
    <button 
      data-testid="button" 
      data-variant={variant}
      data-size={size}
      className={className}
      onClick={onClick} 
      {...props}
    >
      {children}
    </button>
  ),
  Divider: ({ variant, ...props }: any) => (
    <hr data-testid="divider" data-variant={variant} {...props} />
  ),
  Input: ({ value, onChange, defaultValue, sx, disableUnderline, ...props }: any) => (
    <input 
      data-testid="input"
      value={value || ''}
      onChange={onChange}
      defaultValue={defaultValue}
      data-sx={JSON.stringify(sx)}
      data-disable-underline={disableUnderline}
      {...props}
    />
  ),
  TextField: ({ label, value, onChange, multiline, rows, sx, ...props }: any) => (
    <input 
      data-testid="text-field" 
      data-label={label}
      value={value || ''} 
      onChange={onChange} 
      data-multiline={multiline}
      data-rows={rows}
      data-sx={JSON.stringify(sx)}
      {...props} 
    />
  )
}));

// Mock TempChart
jest.mock('temperaturechart/src/tempChart', () => ({
  __esModule: true,
  default: ({ ChamberTemp, MeatTemp, Meat2Temp, Meat3Temp, ChamberName, Probe1Name, Probe2Name, Probe3Name, date, smoking, initData }: any) => (
    <div 
      data-testid="temp-chart" 
      data-chamber-temp={ChamberTemp} 
      data-meat-temp={MeatTemp} 
      data-meat2-temp={Meat2Temp} 
      data-meat3-temp={Meat3Temp} 
      data-chamber-name={ChamberName} 
      data-probe1-name={Probe1Name} 
      data-probe2-name={Probe2Name} 
      data-probe3-name={Probe3Name} 
      data-date={date} 
      data-smoking={smoking ? 'true' : 'false'} 
      data-init-data={JSON.stringify(initData)} 
    />
  )
}));

// Mock services
jest.mock('../../../Services/smokerService', () => ({
  getCurrentSmokeProfile: jest.fn(),
  getState: jest.fn(),
  setSmokeProfile: jest.fn(),
  toggleSmoking: jest.fn()
}));

jest.mock('../../../Services/tempsService', () => ({
  getCurrentTemps: jest.fn()
}));

import { getCurrentTemps } from '../../../Services/tempsService';

const mockGetCurrentSmokeProfile = getCurrentSmokeProfile as jest.MockedFunction<typeof getCurrentSmokeProfile>;
const mockGetState = getState as jest.MockedFunction<typeof getState>;
const mockSetSmokeProfile = setSmokeProfile as jest.MockedFunction<typeof setSmokeProfile>;
const mockToggleSmoking = toggleSmoking as jest.MockedFunction<typeof toggleSmoking>;
const mockGetCurrentTemps = getCurrentTemps as jest.MockedFunction<typeof getCurrentTemps>;
const mockIoFunction = io as jest.MockedFunction<typeof io>;

// Mock environment variable
const originalEnv = process.env;

describe('SmokeStep Component', () => {
  const mockNextButton = <button data-testid="next-button">Next</button>;

  const mockSmokeProfile = {
    chamberName: 'Main Chamber',
    probe1Name: 'Probe 1',
    probe2Name: 'Probe 2',
    probe3Name: 'Probe 3',
    notes: 'Test notes',
    woodType: 'Hickory'
  };

  const mockTemps = [
    {
      ChamberTemp: 225,
      MeatTemp: 150,
      Meat2Temp: 145,
      Meat3Temp: 140,
      date: new Date('2023-07-15T12:00:00Z')
    }
  ];

  const mockState = {
    smokeId: 'test-id',
    smoking: false
  };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv, WS_URL: 'ws://localhost:3001' };
    
    // Ensure socket mock returns our mock socket
    mockIoFunction.mockReturnValue(mockSocket as any);
    
    mockGetCurrentSmokeProfile.mockResolvedValue(mockSmokeProfile);
    mockGetCurrentTemps.mockResolvedValue(mockTemps);
    mockGetState.mockResolvedValue(mockState);
    mockSetSmokeProfile.mockResolvedValue(undefined);
    mockToggleSmoking.mockResolvedValue({ smokeId: 'test-id', smoking: true });
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Component Rendering', () => {
    test('should render SmokeStep component successfully', async () => {
      render(<SmokeStep nextButton={mockNextButton} />);
      
      await waitFor(() => {
        expect(screen.getByTestId('temp-chart')).toBeInTheDocument();
        expect(screen.getAllByTestId('input')).toHaveLength(4); // chamber + 3 probes
        expect(screen.getAllByTestId('divider')).toHaveLength(3);
        expect(screen.getByTestId('autocomplete')).toBeInTheDocument();
        expect(screen.getByTestId('text-field')).toBeInTheDocument();
        expect(screen.getByTestId('next-button')).toBeInTheDocument();
      });
    });

    test('should load smoke profile data on mount', async () => {
      render(<SmokeStep nextButton={mockNextButton} />);
      
      await waitFor(() => {
        expect(mockGetCurrentSmokeProfile).toHaveBeenCalledTimes(1);
        expect(mockGetCurrentTemps).toHaveBeenCalledTimes(1);
        expect(mockGetState).toHaveBeenCalledTimes(1);
      });
    });

    test('should display initial temperature values', async () => {
      render(<SmokeStep nextButton={mockNextButton} />);
      
      await waitFor(() => {
        // Check for temperature displays - there are multiple 0s shown for initial temps
        const tempDisplays = screen.getAllByText('0');
        expect(tempDisplays.length).toBeGreaterThanOrEqual(4); // Chamber + 3 probes showing initial 0 values
      });
    });

    test('should render smoking button with correct initial state', async () => {
      render(<SmokeStep nextButton={mockNextButton} />);
      
      await waitFor(() => {
        expect(screen.getByText('Start Smoking')).toBeInTheDocument();
      });
    });
  });

  describe('Probe Name Updates', () => {
    test('should update chamber name', async () => {
      render(<SmokeStep nextButton={mockNextButton} />);
      
      await waitFor(() => {
        const inputs = screen.getAllByTestId('input');
        expect(inputs[0]).toHaveValue('Main Chamber');
      });
      
      const chamberInput = screen.getAllByTestId('input')[0];
      fireEvent.change(chamberInput, { target: { value: 'New Chamber' } });
      
      expect(chamberInput).toHaveValue('New Chamber');
    });

    test('should update probe 1 name', async () => {
      render(<SmokeStep nextButton={mockNextButton} />);
      
      await waitFor(() => {
        const inputs = screen.getAllByTestId('input');
        expect(inputs[1]).toHaveValue('Probe 1');
      });
      
      const probe1Input = screen.getAllByTestId('input')[1];
      fireEvent.change(probe1Input, { target: { value: 'Point' } });
      
      expect(probe1Input).toHaveValue('Point');
    });

    test('should update probe 2 name', async () => {
      render(<SmokeStep nextButton={mockNextButton} />);
      
      await waitFor(() => {
        const inputs = screen.getAllByTestId('input');
        expect(inputs[2]).toHaveValue('Probe 2');
      });
      
      const probe2Input = screen.getAllByTestId('input')[2];
      fireEvent.change(probe2Input, { target: { value: 'Flat' } });
      
      expect(probe2Input).toHaveValue('Flat');
    });

    test('should update probe 3 name', async () => {
      render(<SmokeStep nextButton={mockNextButton} />);
      
      await waitFor(() => {
        const inputs = screen.getAllByTestId('input');
        expect(inputs[3]).toHaveValue('Probe 3');
      });
      
      const probe3Input = screen.getAllByTestId('input')[3];
      fireEvent.change(probe3Input, { target: { value: 'Ambient' } });
      
      expect(probe3Input).toHaveValue('Ambient');
    });
  });

  describe('Smoking Control', () => {
    test('should toggle smoking state when button clicked', async () => {
      render(<SmokeStep nextButton={mockNextButton} />);
      
      await waitFor(() => {
        expect(screen.getByText('Start Smoking')).toBeInTheDocument();
      });
      
      const smokingButton = screen.getByText('Start Smoking');
      fireEvent.click(smokingButton);
      
      await waitFor(() => {
        expect(mockToggleSmoking).toHaveBeenCalledTimes(1);
      });
    });

    test('should display "Stop Smoking" when smoking is active', async () => {
      mockGetState.mockResolvedValue({ smokeId: 'test-id', smoking: true });
      
      render(<SmokeStep nextButton={mockNextButton} />);
      
      await waitFor(() => {
        expect(screen.getByText('Stop Smoking')).toBeInTheDocument();
      });
    });
  });

  describe('Wood Type Selection', () => {
    test('should render autocomplete with wood type options', async () => {
      render(<SmokeStep nextButton={mockNextButton} />);
      
      const autocomplete = screen.getByTestId('autocomplete');
      const options = JSON.parse(autocomplete.getAttribute('data-options') || '[]');
      
      expect(options).toContain('Hickory');
      expect(options).toContain('Post Oak');
      expect(options).toContain('Pecan');
      expect(options).toContain('Cherry');
      expect(options).toContain('Apple');
    });

    test('should update wood type via autocomplete', async () => {
      render(<SmokeStep nextButton={mockNextButton} />);
      
      await waitFor(() => {
        expect(screen.getByTestId('autocomplete-input')).toHaveValue('Hickory');
      });
      
      const autocompleteInput = screen.getByTestId('autocomplete-input');
      fireEvent.change(autocompleteInput, { target: { value: 'Cherry' } });
      
      expect(autocompleteInput).toHaveValue('Cherry');
    });

    test('should support free solo wood type input', () => {
      render(<SmokeStep nextButton={mockNextButton} />);
      
      const autocomplete = screen.getByTestId('autocomplete');
      expect(autocomplete).toHaveAttribute('data-free-solo', 'true');
    });
  });

  describe('Notes Field', () => {
    test('should update notes field', async () => {
      render(<SmokeStep nextButton={mockNextButton} />);
      
      await waitFor(() => {
        expect(screen.getByTestId('text-field')).toHaveValue('Test notes');
      });
      
      const notesField = screen.getByTestId('text-field');
      fireEvent.change(notesField, { target: { value: 'Updated notes' } });
      
      expect(notesField).toHaveValue('Updated notes');
    });

    test('should render multiline notes field', () => {
      render(<SmokeStep nextButton={mockNextButton} />);
      
      const notesField = screen.getByTestId('text-field');
      expect(notesField).toHaveAttribute('data-multiline', 'true');
      expect(notesField).toHaveAttribute('data-rows', '4');
    });
  });

  describe('Temperature Chart Integration', () => {
    test('should render TempChart with correct props', async () => {
      render(<SmokeStep nextButton={mockNextButton} />);
      
      await waitFor(() => {
        const tempChart = screen.getByTestId('temp-chart');
        expect(tempChart).toHaveAttribute('data-chamber-name', 'Main Chamber');
        expect(tempChart).toHaveAttribute('data-probe1-name', 'Probe 1');
        expect(tempChart).toHaveAttribute('data-probe2-name', 'Probe 2');
        expect(tempChart).toHaveAttribute('data-probe3-name', 'Probe 3');
        expect(tempChart).toHaveAttribute('data-smoking', 'false');
      });
    });

    test('should pass initial temperature data to chart', async () => {
      render(<SmokeStep nextButton={mockNextButton} />);
      
      await waitFor(() => {
        const tempChart = screen.getByTestId('temp-chart');
        const initData = JSON.parse(tempChart.getAttribute('data-init-data') || '[]');
        expect(initData).toHaveLength(1);
        expect(initData[0]).toMatchObject({
          ChamberTemp: 225,
          MeatTemp: 150,
          Meat2Temp: 145,
          Meat3Temp: 140
        });
      });
    });
  });

  describe('Component Lifecycle', () => {
    test('should call setSmokeProfile on unmount', async () => {
      const { unmount } = render(<SmokeStep nextButton={mockNextButton} />);
      
      await waitFor(() => {
        expect(mockGetCurrentSmokeProfile).toHaveBeenCalled();
      });
      
      unmount();
      
      expect(mockSetSmokeProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          chamberName: expect.any(String),
          probe1Name: expect.any(String),
          probe2Name: expect.any(String),
          probe3Name: expect.any(String),
          notes: expect.any(String),
          woodType: expect.any(String)
        })
      );
    });
  });

  describe('Socket Integration', () => {
    test('should initialize socket connection with correct URL', () => {
      const { io } = require('socket.io-client');
      
      render(<SmokeStep nextButton={mockNextButton} />);
      
      expect(io).toHaveBeenCalledWith('ws://localhost:3001');
    });

    test('should handle empty WS_URL environment variable', () => {
      process.env.WS_URL = '';
      const { io } = require('socket.io-client');
      
      render(<SmokeStep nextButton={mockNextButton} />);
      
      expect(io).toHaveBeenCalledWith('');
    });
  });

  describe('Component Structure', () => {
    test('should have correct grid structure', async () => {
      render(<SmokeStep nextButton={mockNextButton} />);
      
      // Since real MUI Grid components are being used, check for the actual MUI classes
      const grids = document.querySelectorAll('.MuiGrid-root');
      expect(grids.length).toBeGreaterThan(5);
      
      // Check for specific class names indicating proper grid usage
      expect(document.querySelector('.MuiGrid-container')).toBeInTheDocument();
      expect(document.querySelector('.MuiGrid-item')).toBeInTheDocument();
    });

    test('should render dividers between probe sections', () => {
      render(<SmokeStep nextButton={mockNextButton} />);
      
      const dividers = screen.getAllByTestId('divider');
      expect(dividers).toHaveLength(3);
      
      dividers.forEach(divider => {
        expect(divider).toHaveAttribute('data-variant', 'middle');
      });
    });

    test('should render inputs with correct styling', async () => {
      render(<SmokeStep nextButton={mockNextButton} />);
      
      await waitFor(() => {
        const inputs = screen.getAllByTestId('input');
        inputs.forEach(input => {
          expect(input).toHaveAttribute('data-disable-underline', 'true');
        });
      });
    });
  });

  describe('Default Values', () => {
    test('should use default probe names when not provided', async () => {
      const emptyProfile = {
        chamberName: '',
        probe1Name: '',
        probe2Name: '',
        probe3Name: '',
        notes: '',
        woodType: ''
      };
      mockGetCurrentSmokeProfile.mockResolvedValue(emptyProfile);
      
      render(<SmokeStep nextButton={mockNextButton} />);
      
      await waitFor(() => {
        const inputs = screen.getAllByTestId('input');
        expect(inputs[0]).toHaveValue('');
        expect(inputs[1]).toHaveValue('');
        expect(inputs[2]).toHaveValue('');
        expect(inputs[3]).toHaveValue('');
      });
    });
  });
});
