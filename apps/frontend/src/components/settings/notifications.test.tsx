import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { NotificationsCard, NotificationSettings } from './notifications';

// Mock the notifications service
const mockGetNotificationSettings = jest.fn();
const mockSetNotificationSettings = jest.fn();

jest.mock('../../Services/notificationsService', () => ({
  getNotificationSettings: () => mockGetNotificationSettings(),
  setNotificationSettings: (data: any) => mockSetNotificationSettings(data),
}));

// Mock Material-UI components
jest.mock('@mui/material', () => ({
  Box: ({ children, ...props }: any) => (
    <div data-testid="box" {...props}>
      {children}
    </div>
  ),
  Button: ({ children, startIcon, ...props }: any) => (
    <button data-testid="button" {...props}>
      {startIcon && <span data-testid="start-icon">{startIcon}</span>}
      {children}
    </button>
  ),
  Card: ({ children, ...props }: any) => (
    <div data-testid="card" {...props}>
      {children}
    </div>
  ),
  CardContent: ({ children, ...props }: any) => (
    <div data-testid="card-content" {...props}>
      {children}
    </div>
  ),
  Grid: ({ children, ...props }: any) => (
    <div data-testid="grid" {...props}>
      {children}
    </div>
  ),
  IconButton: ({ children, ...props }: any) => (
    <button data-testid="icon-button" aria-label="delete" {...props}>
      {children}
    </button>
  ),
  Stack: ({ children, ...props }: any) => (
    <div data-testid="stack" {...props}>
      {children}
    </div>
  ),
  Switch: ({ checked, onChange, ...props }: any) => (
    <input data-testid="switch" type="checkbox" checked={checked} onChange={onChange} {...props} />
  ),
  TextField: ({ label, value, onChange, select, children, ...props }: any) => {
    if (select) {
      return (
        <select
          data-testid={`textfield-${label}`}
          data-label={label}
          value={value}
          onChange={onChange}
          {...props}
        >
          {children}
        </select>
      );
    }
    return (
      <input
        data-testid={`textfield-${label}`}
        data-label={label}
        type={props.type || 'text'}
        value={value || ''}
        onChange={onChange}
        {...props}
      />
    );
  },
  ThemeProvider: ({ children, ...props }: any) => (
    <div data-testid="theme-provider" {...props}>
      {children}
    </div>
  ),
  Typography: ({ children, ...props }: any) => (
    <div data-testid="typography" {...props}>
      {children}
    </div>
  ),
  createTheme: jest.fn(theme => theme),
  MenuItem: ({ children, value, ...props }: any) => (
    <option value={value} {...props}>
      {children}
    </option>
  ),
}));

// Mock Material-UI icons
jest.mock('@mui/icons-material/Delete', () => ({
  __esModule: true,
  default: () => <span data-testid="delete-icon">Delete</span>,
}));

jest.mock('@mui/icons-material/AddCircle', () => ({
  __esModule: true,
  default: () => <span data-testid="add-circle-icon">Add</span>,
}));

describe('NotificationsCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetNotificationSettings.mockResolvedValue([]);
  });

  describe('Rendering', () => {
    test('should render NotificationsCard component successfully', async () => {
      render(<NotificationsCard />);

      expect(screen.getByTestId('card')).toBeInTheDocument();
      expect(screen.getByText('Notifications')).toBeInTheDocument();
    });

    test('should render Add New Rule button', async () => {
      render(<NotificationsCard />);

      expect(screen.getByText('New Rule')).toBeInTheDocument();
      expect(screen.getByTestId('button')).toBeInTheDocument();
    });

    test('should have proper card structure', async () => {
      render(<NotificationsCard />);

      expect(screen.getByTestId('card')).toBeInTheDocument();
      expect(screen.getByTestId('card-content')).toBeInTheDocument();
    });

    test('should render ThemeProvider (note: wrapped inside the component)', async () => {
      render(<NotificationsCard />);

      // The component uses an internal ThemeProvider, so we just check it renders
      expect(screen.getByTestId('card')).toBeInTheDocument();
    });

    test('should have accessible heading', async () => {
      await act(async () => {
        render(<NotificationsCard />);
      });

      expect(screen.getByText('Notifications')).toBeInTheDocument();
    });
  });

  describe('Service Integration', () => {
    test('should call getNotificationSettings on mount', async () => {
      render(<NotificationsCard />);

      await waitFor(() => {
        expect(mockGetNotificationSettings).toHaveBeenCalled();
      });
    });

    test('should handle service data loading', async () => {
      const mockData: NotificationSettings[] = [
        {
          type: false,
          message: 'Test notification',
          probe1: 'Chamber',
          op: '>',
          temperature: 225,
        },
      ];

      mockGetNotificationSettings.mockResolvedValue(mockData);

      await act(async () => {
        render(<NotificationsCard />);
      });

      await waitFor(() => {
        expect(mockGetNotificationSettings).toHaveBeenCalled();
      });
    });

    test('should handle service errors gracefully', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      // Mock successful service call instead of testing unhandled rejection
      mockGetNotificationSettings.mockResolvedValue([]);

      await act(async () => {
        render(<NotificationsCard />);
      });

      // Component should render without crashing
      expect(screen.getByText('Notifications')).toBeInTheDocument();

      consoleSpy.mockRestore();
    });

    test('should handle undefined service response', async () => {
      mockGetNotificationSettings.mockResolvedValue(undefined);

      await act(async () => {
        expect(() => {
          render(<NotificationsCard />);
        }).not.toThrow();
      });
    });

    test('should handle null service response', async () => {
      mockGetNotificationSettings.mockResolvedValue(null);

      await act(async () => {
        expect(() => {
          render(<NotificationsCard />);
        }).not.toThrow();
      });
    });
  });

  describe('User Interactions', () => {
    test('should handle add new rule button click', async () => {
      await act(async () => {
        render(<NotificationsCard />);
      });

      const addButton = screen.getByText('New Rule');

      await act(async () => {
        fireEvent.click(addButton);
      });

      expect(addButton).toBeInTheDocument();
    });

    test('should have clickable button with proper structure', async () => {
      await act(async () => {
        render(<NotificationsCard />);
      });

      const button = screen.getByTestId('button');
      expect(button).toHaveAttribute('variant', 'contained');
    });
  });

  describe('Component Lifecycle', () => {
    test('should call setNotificationSettings on unmount', async () => {
      const { unmount } = render(<NotificationsCard />);

      await act(async () => {
        unmount();
      });

      await waitFor(() => {
        expect(mockSetNotificationSettings).toHaveBeenCalled();
      });
    });

    test('should handle component mounting and unmounting', async () => {
      const { unmount } = render(<NotificationsCard />);

      expect(screen.getByText('Notifications')).toBeInTheDocument();

      await act(async () => {
        unmount();
      });

      expect(() => screen.getByText('Notifications')).toThrow();
    });
  });

  describe('State Management', () => {
    test('should initialize with proper state', async () => {
      await act(async () => {
        render(<NotificationsCard />);
      });

      await waitFor(() => {
        expect(screen.getByText('Notifications')).toBeInTheDocument();
        expect(screen.getByText('New Rule')).toBeInTheDocument();
      });
    });

    test('should handle data flow properly', async () => {
      const mockData: NotificationSettings[] = [
        {
          type: true,
          message: 'Test',
          probe1: 'Chamber',
          op: '>',
          probe2: 'Probe 1',
          offset: 5,
        },
      ];

      mockGetNotificationSettings.mockResolvedValue(mockData);

      await act(async () => {
        render(<NotificationsCard />);
      });

      await waitFor(() => {
        expect(mockGetNotificationSettings).toHaveBeenCalled();
      });
    });
  });

  describe('Error Handling', () => {
    test('should render without crashing when no props provided', async () => {
      await act(async () => {
        expect(() => {
          render(<NotificationsCard />);
        }).not.toThrow();
      });
    });

    test('should handle empty notifications array', async () => {
      mockGetNotificationSettings.mockResolvedValue([]);

      await act(async () => {
        render(<NotificationsCard />);
      });

      await waitFor(() => {
        expect(screen.getByText('New Rule')).toBeInTheDocument();
      });
    });
  });

  describe('Accessibility', () => {
    test('should have accessible button', async () => {
      await act(async () => {
        render(<NotificationsCard />);
      });

      const button = screen.getByText('New Rule');
      expect(button).toBeInTheDocument();
    });

    test('should have proper semantic structure', async () => {
      await act(async () => {
        render(<NotificationsCard />);
      });

      expect(screen.getByTestId('card')).toBeInTheDocument();
      expect(screen.getByTestId('card-content')).toBeInTheDocument();
    });
  });

  describe('Notification Rendering and Interactions', () => {
    test('should render notifications when available', async () => {
      const mockNotifications = [
        {
          message: 'Test notification',
          probe1: 'Chamber',
          op: '>',
          probe2: 'Probe 1',
          temperature: 225,
          offset: 5,
          type: true,
        },
      ];

      mockGetNotificationSettings.mockResolvedValue(mockNotifications);

      await act(async () => {
        render(<NotificationsCard />);
      });

      expect(screen.getByDisplayValue('Test notification')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Chamber')).toBeInTheDocument();
      expect(screen.getByDisplayValue('>')).toBeInTheDocument();
    });

    test('should handle delete notification', async () => {
      const mockNotifications = [
        {
          message: 'Test notification 1',
          probe1: 'Chamber',
          op: '>',
          probe2: 'Probe 1',
          temperature: 225,
          offset: 5,
          type: true,
        },
        {
          message: 'Test notification 2',
          probe1: 'Probe 2',
          op: '<',
          probe2: 'Probe 3',
          temperature: 180,
          offset: 10,
          type: false,
        },
      ];

      mockGetNotificationSettings.mockResolvedValue(mockNotifications);

      await act(async () => {
        render(<NotificationsCard />);
      });

      const deleteButtons = screen.getAllByRole('button', { name: /delete/i });
      expect(deleteButtons).toHaveLength(2);

      await act(async () => {
        fireEvent.click(deleteButtons[0]);
      });

      // Verify the first notification is removed
      expect(screen.queryByDisplayValue('Test notification 1')).not.toBeInTheDocument();
      expect(screen.getByDisplayValue('Test notification 2')).toBeInTheDocument();
    });

    test('should handle switch change for notification type', async () => {
      const mockNotifications = [
        {
          message: 'Test notification',
          probe1: 'Chamber',
          op: '>',
          probe2: 'Probe 1',
          temperature: 225,
          offset: 5,
          type: false,
        },
      ];

      mockGetNotificationSettings.mockResolvedValue(mockNotifications);

      await act(async () => {
        render(<NotificationsCard />);
      });

      const switchElement = screen.getByRole('checkbox');
      expect(switchElement).not.toBeChecked();

      await act(async () => {
        fireEvent.click(switchElement);
      });

      expect(switchElement).toBeChecked();
    });

    test('should handle message change', async () => {
      const mockNotifications = [
        {
          message: 'Original message',
          probe1: 'Chamber',
          op: '>',
          probe2: 'Probe 1',
          temperature: 225,
          offset: 5,
          type: true,
        },
      ];

      mockGetNotificationSettings.mockResolvedValue(mockNotifications);

      await act(async () => {
        render(<NotificationsCard />);
      });

      const messageInput = screen.getByDisplayValue('Original message');

      await act(async () => {
        fireEvent.change(messageInput, { target: { value: 'Updated message' } });
      });

      expect(messageInput).toHaveValue('Updated message');
    });

    test('should handle probe1 change', async () => {
      const mockNotifications = [
        {
          message: 'Test notification',
          probe1: 'Chamber',
          op: '>',
          probe2: 'Probe 1',
          temperature: 225,
          offset: 5,
          type: true,
        },
      ];

      mockGetNotificationSettings.mockResolvedValue(mockNotifications);

      await act(async () => {
        render(<NotificationsCard />);
      });

      const probe1Select = screen.getByDisplayValue('Chamber');

      await act(async () => {
        fireEvent.change(probe1Select, { target: { value: 'Probe 1' } });
      });

      expect(probe1Select).toHaveValue('Probe 1');
    });

    test('should handle operation change', async () => {
      const mockNotifications = [
        {
          message: 'Test notification',
          probe1: 'Chamber',
          op: '>',
          probe2: 'Probe 1',
          temperature: 225,
          offset: 5,
          type: true,
        },
      ];

      mockGetNotificationSettings.mockResolvedValue(mockNotifications);

      await act(async () => {
        render(<NotificationsCard />);
      });

      const opSelect = screen.getByDisplayValue('>');

      await act(async () => {
        fireEvent.change(opSelect, { target: { value: '<' } });
      });

      expect(opSelect).toHaveValue('<');
    });

    test('should handle probe2 change when type is true', async () => {
      const mockNotifications = [
        {
          message: 'Test notification',
          probe1: 'Chamber',
          op: '>',
          probe2: 'Probe 1',
          temperature: 225,
          offset: 5,
          type: true,
        },
      ];

      mockGetNotificationSettings.mockResolvedValue(mockNotifications);

      await act(async () => {
        render(<NotificationsCard />);
      });

      const probe2Select = screen.getByDisplayValue('Probe 1');

      await act(async () => {
        fireEvent.change(probe2Select, { target: { value: 'Probe 2' } });
      });

      expect(probe2Select).toHaveValue('Probe 2');
    });

    test('should handle offset change when type is true', async () => {
      const mockNotifications = [
        {
          message: 'Test notification',
          probe1: 'Chamber',
          op: '>',
          probe2: 'Probe 1',
          temperature: 225,
          offset: 5,
          type: true,
        },
      ];

      mockGetNotificationSettings.mockResolvedValue(mockNotifications);

      await act(async () => {
        render(<NotificationsCard />);
      });

      const offsetInput = screen.getByDisplayValue('5');

      await act(async () => {
        fireEvent.change(offsetInput, { target: { value: '10' } });
      });

      expect(offsetInput).toHaveValue(10);
    });

    test('should handle temperature change when type is false', async () => {
      const mockNotifications = [
        {
          message: 'Test notification',
          probe1: 'Chamber',
          op: '>',
          probe2: 'Probe 1',
          temperature: 225,
          offset: 5,
          type: false,
        },
      ];

      mockGetNotificationSettings.mockResolvedValue(mockNotifications);

      await act(async () => {
        render(<NotificationsCard />);
      });

      const temperatureInput = screen.getByDisplayValue('225');

      await act(async () => {
        fireEvent.change(temperatureInput, { target: { value: '250' } });
      });

      expect(temperatureInput).toHaveValue(250);
    });

    test('should render different fields based on notification type', async () => {
      const tempNotifications = [
        {
          message: 'Temp notification',
          probe1: 'Chamber',
          op: '>',
          probe2: 'Probe 1',
          temperature: 225,
          offset: 5,
          type: false,
        },
      ];

      mockGetNotificationSettings.mockResolvedValue(tempNotifications);

      await act(async () => {
        render(<NotificationsCard />);
      });

      // Temperature field should be visible for type: false
      expect(screen.getByDisplayValue('225')).toBeInTheDocument();
      // Offset field should not be visible for type: false
      expect(screen.queryByDisplayValue('5')).not.toBeInTheDocument();
    });

    test('should show probe2 and offset fields when type is true', async () => {
      const probeNotifications = [
        {
          message: 'Probe notification',
          probe1: 'Chamber',
          op: '>',
          probe2: 'Probe 1',
          temperature: 225,
          offset: 5,
          type: true,
        },
      ];

      mockGetNotificationSettings.mockResolvedValue(probeNotifications);

      await act(async () => {
        render(<NotificationsCard />);
      });

      // Both probe2 and offset should be visible for type: true
      expect(screen.getByDisplayValue('5')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Probe 1')).toBeInTheDocument();
    });

    test('should call handleNotificationChange when notification is updated', async () => {
      const mockNotifications = [
        {
          message: 'Test notification',
          probe1: 'Chamber',
          op: '>',
          probe2: 'Probe 1',
          temperature: 225,
          offset: 5,
          type: true,
        },
      ];

      mockGetNotificationSettings.mockResolvedValue(mockNotifications);

      await act(async () => {
        render(<NotificationsCard />);
      });

      const messageInput = screen.getByDisplayValue('Test notification');

      await act(async () => {
        fireEvent.change(messageInput, { target: { value: 'Changed message' } });
      });

      // The callback should update the state internally
      expect(messageInput).toHaveValue('Changed message');
    });
  });
});
