import React, { act } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Home } from './home';

// Mock the services
jest.mock('../../services/stateService', () => ({
  getCurrentSmokeProfile: jest.fn(),
  getState: jest.fn(),
  toggleSmoking: jest.fn(),
}));

jest.mock('../../services/tempsService', () => ({
  getCurrentTemps: jest.fn(),
  postTempsBatch: jest.fn(),
}));

jest.mock('../../services/deviceService', () => ({
  getConnection: jest.fn(),
}));

// Mock TempChart component
jest.mock('temperaturechart/src/tempChart', () => {
  return function MockTempChart(props: any) {
    return (
      <div data-testid="temp-chart">
        <div data-testid="chamber-temp">{props.ChamberTemp}</div>
        <div data-testid="meat-temp">{props.MeatTemp}</div>
        <div data-testid="meat2-temp">{props.Meat2Temp}</div>
        <div data-testid="meat3-temp">{props.Meat3Temp}</div>
      </div>
    );
  };
});

// Mock socket.io-client
jest.mock('socket.io-client', () => ({
  io: jest.fn(() => ({
    on: jest.fn(),
    emit: jest.fn(),
    connected: false,
  })),
}));

// Mock WiFi component
jest.mock('./wifi/wifi', () => ({
  Wifi: function MockWifi(props: any) {
    return (
      <div data-testid="wifi-component">
        <button onClick={() => props.onBack(0)}>Back to Home</button>
        WiFi Settings
      </div>
    );
  },
}));

const mockGetCurrentSmokeProfile = require('../../services/stateService').getCurrentSmokeProfile;
const mockGetState = require('../../services/stateService').getState;
const mockToggleSmoking = require('../../services/stateService').toggleSmoking;
const mockGetCurrentTemps = require('../../services/tempsService').getCurrentTemps;
const mockPostTempsBatch = require('../../services/tempsService').postTempsBatch;
const mockGetConnection = require('../../services/deviceService').getConnection;
const mockIo = require('socket.io-client').io;

describe('Home Component', () => {
  let mockSocket: any;
  let mockDeviceClient: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup socket mocks
    mockSocket = {
      on: jest.fn(),
      emit: jest.fn(),
      connected: false,
    };
    
    mockDeviceClient = {
      on: jest.fn(),
      emit: jest.fn(),
    };
    
    // Mock io to return different sockets for different URLs
    mockIo.mockImplementation((url: string) => {
      if (url.includes('127.0.0.1:3003')) {
        return mockDeviceClient;
      }
      return mockSocket;
    });

    // Setup default mock responses
    mockGetCurrentTemps.mockResolvedValue([]);
    mockGetState.mockResolvedValue({ smokeId: 'test', smoking: false });
    mockGetCurrentSmokeProfile.mockResolvedValue({
      chamberName: 'Test Chamber',
      probe1Name: 'Test Probe 1',
      probe2Name: 'Test Probe 2',
      probe3Name: 'Test Probe 3',
      notes: 'Test notes',
      woodType: 'Hickory',
    });
    mockGetConnection.mockResolvedValue([]);
    mockPostTempsBatch.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should render all main UI elements in home screen', async () => {
    await act(async () => {
      render(<Home />);
    });
    
    await waitFor(() => {
      // Check that probe names and temps are displayed
      expect(screen.getByText('Test Chamber')).toBeInTheDocument();
      expect(screen.getByText('Test Probe 1')).toBeInTheDocument();
      expect(screen.getByText('Test Probe 2')).toBeInTheDocument();
      expect(screen.getByText('Test Probe 3')).toBeInTheDocument();
      
      // Check for default temperature values via TempChart
      expect(screen.getByTestId('chamber-temp')).toHaveTextContent('0');
      expect(screen.getByTestId('meat-temp')).toHaveTextContent('0');
      expect(screen.getByTestId('meat2-temp')).toHaveTextContent('0');
      expect(screen.getByTestId('meat3-temp')).toHaveTextContent('0');
      
      // Check for start smoking button
      expect(screen.getByText('Start Smoking')).toBeInTheDocument();
      
      // Check for WiFi button
      expect(screen.getByRole('button', { name: '' })).toBeInTheDocument(); // WiFi icon button
      
      // Check for TempChart
      expect(screen.getByTestId('temp-chart')).toBeInTheDocument();
    });
  });

  it('should handle missing smoke profile gracefully', async () => {
    mockGetCurrentSmokeProfile.mockRejectedValue(new Error('No profile found'));
    
    await act(async () => {
      render(<Home />);
    });
    
    await waitFor(() => {
      // Should fall back to default probe names
      expect(screen.getByText('Chamber')).toBeInTheDocument();
      expect(screen.getByText('probe 1')).toBeInTheDocument();
      expect(screen.getByText('probe 2')).toBeInTheDocument();
      expect(screen.getByText('probe 3')).toBeInTheDocument();
    });
  });

  it('should toggle smoking state when start/stop button is clicked', async () => {
    mockToggleSmoking.mockResolvedValue({ smokeId: 'test', smoking: true });
    
    await act(async () => {
      render(<Home />);
    });
    
    await waitFor(() => {
      const startButton = screen.getByText('Start Smoking');
      fireEvent.click(startButton);
    });
    
    await waitFor(() => {
      expect(mockToggleSmoking).toHaveBeenCalled();
      expect(mockSocket.emit).toHaveBeenCalledWith('smokeUpdate', expect.objectContaining({
        smoking: true,
      }));
    });
  });

  it('should show stop smoking button when currently smoking', async () => {
    mockGetState.mockResolvedValue({ smokeId: 'test', smoking: true });
    
    await act(async () => {
      render(<Home />);
    });
    
    await waitFor(() => {
      expect(screen.getByText('Stop Smoking')).toBeInTheDocument();
    });
  });

  it('should navigate to WiFi screen when WiFi button is clicked', async () => {
    await act(async () => {
      render(<Home />);
    });
    
    await waitFor(() => {
      const wifiButton = screen.getByRole('button', { name: '' }); // WiFi icon button
      fireEvent.click(wifiButton);
    });
    
    await waitFor(() => {
      expect(screen.getByTestId('wifi-component')).toBeInTheDocument();
      expect(screen.getByText('WiFi Settings')).toBeInTheDocument();
    });
  });

  it('should navigate back from WiFi screen', async () => {
    await act(async () => {
      render(<Home />);
    });
    
    // Go to WiFi screen
    await waitFor(() => {
      const wifiButton = screen.getByRole('button', { name: '' });
      fireEvent.click(wifiButton);
    });
    
    // Come back to home
    await waitFor(() => {
      const backButton = screen.getByText('Back to Home');
      fireEvent.click(backButton);
    });
    
    await waitFor(() => {
      expect(screen.getByText('Start Smoking')).toBeInTheDocument();
      expect(screen.getByTestId('temp-chart')).toBeInTheDocument();
    });
  });

  it('should handle temperature updates from device client', async () => {
    let tempCallback: (message: string) => void;
    
    mockDeviceClient.on.mockImplementation((event: string, callback: any) => {
      if (event === 'temp') {
        tempCallback = callback;
      }
    });
    
    await act(async () => {
      render(<Home />);
    });
    
    // Wait for initial render
    await waitFor(() => {
      expect(screen.getByText('Test Chamber')).toBeInTheDocument();
    });
    
    // Simulate temperature update
    const tempMessage = JSON.stringify({
      Chamber: '225',
      Meat: '185',
      Meat2: '190',
      Meat3: '0',
    });
    
    await act(async () => {
      tempCallback!(tempMessage);
    });
    
    // Check that temperatures are displayed in the UI
    await waitFor(() => {
      expect(screen.getByTestId('chamber-temp')).toHaveTextContent('225');
      expect(screen.getByTestId('meat-temp')).toHaveTextContent('185');
      expect(screen.getByTestId('meat2-temp')).toHaveTextContent('190');
      expect(screen.getByTestId('meat3-temp')).toHaveTextContent('0');
    });
  });

  it('should handle socket smoke updates', async () => {
    let smokeUpdateCallback: (message: any) => void;
    
    mockSocket.on.mockImplementation((event: string, callback: any) => {
      if (event === 'smokeUpdate') {
        smokeUpdateCallback = callback;
      }
    });
    
    await act(async () => {
      render(<Home />);
    });
    
    // Simulate smoke update
    const smokeUpdate = {
      smoking: true,
      chamberName: 'Updated Chamber',
      probe1Name: 'Updated Probe 1',
      probe2Name: 'Updated Probe 2',
      probe3Name: 'Updated Probe 3',
    };
    
    await act(async () => {
      smokeUpdateCallback!(smokeUpdate);
    });
    
    await waitFor(() => {
      expect(screen.getByText('Updated Chamber')).toBeInTheDocument();
      expect(screen.getByText('Updated Probe 1')).toBeInTheDocument();
      expect(screen.getByText('Stop Smoking')).toBeInTheDocument(); // Now smoking
    });
  });

  it('should handle socket clear event', async () => {
    let clearCallback: (message: any) => void;
    
    mockSocket.on.mockImplementation((event: string, callback: any) => {
      if (event === 'clear') {
        clearCallback = callback;
      }
    });
    
    await act(async () => {
      render(<Home />);
    });
    
    // Simulate clear event
    await act(async () => {
      clearCallback!({});
    });
    
    await waitFor(() => {
      expect(mockGetCurrentSmokeProfile).toHaveBeenCalledTimes(2); // Once on mount, once on clear
    });
  });

  it('should handle clear event when smoke profile fails', async () => {
    let clearCallback: (message: any) => void;
    
    mockSocket.on.mockImplementation((event: string, callback: any) => {
      if (event === 'clear') {
        clearCallback = callback;
      }
    });
    
    // Make profile fetch fail on clear
    mockGetCurrentSmokeProfile.mockResolvedValueOnce({
      chamberName: 'Test Chamber',
      probe1Name: 'Test Probe 1',
      probe2Name: 'Test Probe 2',
      probe3Name: 'Test Probe 3',
    }).mockRejectedValueOnce(new Error('Profile fetch failed'));
    
    await act(async () => {
      render(<Home />);
    });
    
    // Simulate clear event
    await act(async () => {
      clearCallback!({});
    });
    
    await waitFor(() => {
      // Should fall back to defaults
      expect(screen.getByText('Chamber')).toBeInTheDocument();
      expect(screen.getByText('probe 1')).toBeInTheDocument();
    });
  });

  it('should handle connection status updates', async () => {
    // Mock environment as production to trigger connection checks
    const originalEnv = process.env.ENV;
    process.env.ENV = 'production';
    
    let tempCallback: (message: string) => void;
    
    mockDeviceClient.on.mockImplementation((event: string, callback: any) => {
      if (event === 'temp') {
        tempCallback = callback;
      }
    });
    
    mockGetConnection.mockResolvedValue([{ ssid: 'TestNetwork' }]);
    
    await act(async () => {
      render(<Home />);
    });
    
    // Simulate temperature update which triggers connection check
    const tempMessage = JSON.stringify({
      Chamber: '225',
      Meat: '185',
      Meat2: '190',
      Meat3: '0',
    });
    
    await act(async () => {
      tempCallback!(tempMessage);
    });
    
    await waitFor(() => {
      expect(mockGetConnection).toHaveBeenCalled();
    });
    
    // Restore environment
    process.env.ENV = originalEnv;
  });

  it('should handle temperature parse errors gracefully', async () => {
    const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    let tempCallback: (message: string) => void;
    
    mockDeviceClient.on.mockImplementation((event: string, callback: any) => {
      if (event === 'temp') {
        tempCallback = callback;
      }
    });
    
    await act(async () => {
      render(<Home />);
    });
    
    // Simulate invalid temperature message
    await act(async () => {
      tempCallback!('invalid json');
    });
    
    await waitFor(() => {
      expect(consoleLogSpy).toHaveBeenCalled();
    });
    
    consoleLogSpy.mockRestore();
  });

  it('should emit events when socket is connected', async () => {
    let tempCallback: (message: string) => void;
    
    mockSocket.connected = true;
    
    mockDeviceClient.on.mockImplementation((event: string, callback: any) => {
      if (event === 'temp') {
        tempCallback = callback;
      }
    });
    
    await act(async () => {
      render(<Home />);
    });
    
    // Simulate temperature update
    const tempMessage = JSON.stringify({
      Chamber: '225',
      Meat: '185',
      Meat2: '190',
      Meat3: '0',
    });
    
    await act(async () => {
      tempCallback!(tempMessage);
    });
    
    await waitFor(() => {
      expect(mockSocket.emit).toHaveBeenCalledWith('events', expect.any(String));
    });
  });

  it('should batch and send temperature data when socket is not connected', async () => {
    let tempCallback: (message: string) => void;
    
    mockSocket.connected = false; // Not connected, should batch temps
    
    mockDeviceClient.on.mockImplementation((event: string, callback: any) => {
      if (event === 'temp') {
        tempCallback = callback;
      }
    });
    
    await act(async () => {
      render(<Home />);
    });
    
    // Send multiple temperature updates to trigger batching
    const tempMessage = JSON.stringify({
      Chamber: '225',
      Meat: '185',
      Meat2: '190',
      Meat3: '0',
    });
    
    // Send enough updates to trigger batch (need 11 for batchCount > 10)
    for (let i = 0; i < 12; i++) {
      await act(async () => {
        tempCallback!(tempMessage);
      });
    }
    
    // Should have called postTempsBatch due to batching
    await waitFor(() => {
      expect(mockPostTempsBatch).toHaveBeenCalled();
    });
  });

  it('should send temp batch and emit refresh when socket is connected', async () => {
    let tempCallback: (message: string) => void;
    
    mockSocket.connected = true; // Connected, should send batch immediately
    
    mockDeviceClient.on.mockImplementation((event: string, callback: any) => {
      if (event === 'temp') {
        tempCallback = callback;
      }
    });
    
    await act(async () => {
      render(<Home />);
    });
    
    // First, build up a batch by temporarily disconnecting
    mockSocket.connected = false;
    
    const tempMessage = JSON.stringify({
      Chamber: '225',
      Meat: '185',
      Meat2: '190',
      Meat3: '0',
    });
    
    // Send enough updates to build a batch
    for (let i = 0; i < 12; i++) {
      await act(async () => {
        tempCallback!(tempMessage);
      });
    }
    
    // Now reconnect and send another update
    mockSocket.connected = true;
    
    await act(async () => {
      tempCallback!(tempMessage);
    });
    
    // Should have sent the batch and emitted refresh
    await waitFor(() => {
      expect(mockSocket.emit).toHaveBeenCalledWith('refresh');
    });
  });

  it('should refresh current temps when returning from WiFi screen', async () => {
    await act(async () => {
      render(<Home />);
    });
    
    // Go to WiFi screen
    await waitFor(() => {
      const wifiButton = screen.getByRole('button', { name: '' });
      fireEvent.click(wifiButton);
    });
    
    // Come back to home (this should trigger getCurrentTemps)
    await waitFor(() => {
      const backButton = screen.getByText('Back to Home');
      fireEvent.click(backButton);
    });
    
    await waitFor(() => {
      expect(mockGetCurrentTemps).toHaveBeenCalledTimes(2); // Once on mount, once on return
    });
  });
});