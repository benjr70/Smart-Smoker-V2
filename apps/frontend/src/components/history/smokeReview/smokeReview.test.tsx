import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { SmokeReview } from './smokeReview';
import * as preSmokeService from '../../../Services/preSmokeService';
import * as smokerService from '../../../Services/smokerService';
import * as tempsService from '../../../Services/tempsService';
import * as postSmokeService from '../../../Services/postSmokeService';
import * as ratingsService from '../../../Services/ratingsService';
import { WeightUnits } from '../../common/interfaces/enums';

// Mock Material-UI Grid component
jest.mock('@mui/material', () => ({
  Grid: ({ children, item, xs, ...props }: any) => (
    <div 
      data-testid="grid" 
      data-item={item}
      data-xs={xs}
      {...props}
    >
      {children}
    </div>
  ),
}));

// Mock the card components
jest.mock('../smokeCards/preSmokeCard', () => ({
  PreSmokeCard: ({ preSmoke }: any) => (
    <div data-testid="pre-smoke-card" data-presmoke={JSON.stringify(preSmoke)}>
      PreSmokeCard
    </div>
  ),
}));

jest.mock('../smokeCards/smokeProfileCard', () => ({
  SmokeProfileCard: ({ smokeProfile, temps }: any) => (
    <div 
      data-testid="smoke-profile-card" 
      data-smokeprofile={JSON.stringify(smokeProfile)}
      data-temps={JSON.stringify(temps)}
    >
      SmokeProfileCard
    </div>
  ),
}));

jest.mock('../smokeCards/postSmokeCard', () => ({
  PostSmokeCard: ({ postSmoke }: any) => (
    <div data-testid="post-smoke-card" data-postsmoke={JSON.stringify(postSmoke)}>
      PostSmokeCard
    </div>
  ),
}));

jest.mock('../smokeCards/ratingsCard', () => ({
  RatingsCard: ({ ratings }: any) => (
    <div data-testid="ratings-card" data-ratings={JSON.stringify(ratings)}>
      RatingsCard
    </div>
  ),
}));

// Mock all service modules
jest.mock('../../../Services/preSmokeService');
jest.mock('../../../Services/smokerService');
jest.mock('../../../Services/tempsService');
jest.mock('../../../Services/postSmokeService');
jest.mock('../../../Services/ratingsService');

// Mock temperaturechart module
jest.mock('temperaturechart/src/tempChart', () => ({
  TempData: {}
}));

const mockPreSmokeService = preSmokeService as jest.Mocked<typeof preSmokeService>;
const mockSmokerService = smokerService as jest.Mocked<typeof smokerService>;
const mockTempsService = tempsService as jest.Mocked<typeof tempsService>;
const mockPostSmokeService = postSmokeService as jest.Mocked<typeof postSmokeService>;
const mockRatingsService = ratingsService as jest.Mocked<typeof ratingsService>;

describe('SmokeReview Component', () => {
  const mockSmokeId = 'test-smoke-id';
  const mockSmokeData = {
    preSmokeId: 'pre-smoke-id',
    smokeProfileId: 'smoke-profile-id',
    tempsId: 'temps-id',
    postSmokeId: 'post-smoke-id',
    ratingId: 'rating-id',
  };

  const mockPreSmokeData = {
    weight: {
      weight: 5,
      unit: WeightUnits.LB,
    },
    steps: ['Step 1', 'Step 2'],
    notes: 'Pre-smoke notes',
  };

  const mockSmokeProfileData = {
    chamberName: 'Test Chamber',
    probe1Name: 'Test Probe 1',
    probe2Name: 'Test Probe 2',
    probe3Name: 'Test Probe 3',
    woodType: 'Oak',
    notes: 'Smoke profile notes',
  };

  const mockTempsData = [
    {
      ChamberTemp: 225,
      MeatTemp: 165,
      Meat2Temp: 160,
      Meat3Temp: 155,
      date: new Date('2023-01-01T12:00:00Z'),
    },
    {
      ChamberTemp: 230,
      MeatTemp: 170,
      Meat2Temp: 165,
      Meat3Temp: 160,
      date: new Date('2023-01-01T13:00:00Z'),
    },
  ];

  const mockPostSmokeData = {
    restTime: '30 minutes',
    steps: ['Rest step 1', 'Rest step 2'],
    notes: 'Post-smoke notes',
  };

  const mockRatingData = {
    smokeFlavor: 4,
    seasoning: 5,
    tenderness: 4,
    overallTaste: 4,
    notes: 'Rating notes',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup default successful mock responses
    mockSmokerService.getSmokeById.mockResolvedValue(mockSmokeData);
    mockPreSmokeService.getPreSmokeById.mockResolvedValue(mockPreSmokeData);
    mockSmokerService.getSmokeProfileById.mockResolvedValue(mockSmokeProfileData);
    mockTempsService.getTempsById.mockResolvedValue(mockTempsData);
    mockPostSmokeService.getPostSmokeById.mockResolvedValue(mockPostSmokeData);
    mockRatingsService.getRatingById.mockResolvedValue(mockRatingData);
  });

  test('should render SmokeReview component with all cards', async () => {
    render(<SmokeReview smokeId={mockSmokeId} />);

    // Check that all card components are rendered
    expect(screen.getByTestId('pre-smoke-card')).toBeInTheDocument();
    expect(screen.getByTestId('smoke-profile-card')).toBeInTheDocument();
    expect(screen.getByTestId('post-smoke-card')).toBeInTheDocument();
    expect(screen.getByTestId('ratings-card')).toBeInTheDocument();
    expect(screen.getByTestId('grid')).toBeInTheDocument();
  });

  test('should call getSmokeById with correct smokeId', async () => {
    render(<SmokeReview smokeId={mockSmokeId} />);

    await waitFor(() => {
      expect(mockSmokerService.getSmokeById).toHaveBeenCalledWith(mockSmokeId);
    });
  });

  test('should fetch and display all smoke data successfully', async () => {
    render(<SmokeReview smokeId={mockSmokeId} />);

    await waitFor(() => {
      expect(mockSmokerService.getSmokeById).toHaveBeenCalledWith(mockSmokeId);
      expect(mockPreSmokeService.getPreSmokeById).toHaveBeenCalledWith(mockSmokeData.preSmokeId);
      expect(mockSmokerService.getSmokeProfileById).toHaveBeenCalledWith(mockSmokeData.smokeProfileId);
      expect(mockTempsService.getTempsById).toHaveBeenCalledWith(mockSmokeData.tempsId);
      expect(mockPostSmokeService.getPostSmokeById).toHaveBeenCalledWith(mockSmokeData.postSmokeId);
      expect(mockRatingsService.getRatingById).toHaveBeenCalledWith(mockSmokeData.ratingId);
    });

    // Verify that data is passed to components correctly
    const preSmokeCard = screen.getByTestId('pre-smoke-card');
    expect(preSmokeCard).toHaveAttribute('data-presmoke', JSON.stringify(mockPreSmokeData));

    const smokeProfileCard = screen.getByTestId('smoke-profile-card');
    expect(smokeProfileCard).toHaveAttribute('data-smokeprofile', JSON.stringify(mockSmokeProfileData));
    expect(smokeProfileCard).toHaveAttribute('data-temps', JSON.stringify(mockTempsData));

    const postSmokeCard = screen.getByTestId('post-smoke-card');
    expect(postSmokeCard).toHaveAttribute('data-postsmoke', JSON.stringify(mockPostSmokeData));

    const ratingsCard = screen.getByTestId('ratings-card');
    expect(ratingsCard).toHaveAttribute('data-ratings', JSON.stringify(mockRatingData));
  });

  test('should handle missing tempsId gracefully', async () => {
    const smokeDataWithoutTemps = {
      ...mockSmokeData,
      tempsId: undefined,
    };
    mockSmokerService.getSmokeById.mockResolvedValue(smokeDataWithoutTemps);

    render(<SmokeReview smokeId={mockSmokeId} />);

    await waitFor(() => {
      expect(mockSmokerService.getSmokeById).toHaveBeenCalledWith(mockSmokeId);
      expect(mockTempsService.getTempsById).not.toHaveBeenCalled();
    });

    // Should still render with initial temp data
    const smokeProfileCard = screen.getByTestId('smoke-profile-card');
    const expectedInitialTempData = [{
      ChamberTemp: 0,
      MeatTemp: 0,
      Meat2Temp: 0,
      Meat3Temp: 0,
      date: expect.any(Date),
    }];
    
    const actualTempData = JSON.parse(smokeProfileCard.getAttribute('data-temps') || '[]');
    expect(actualTempData).toHaveLength(1);
    expect(actualTempData[0]).toMatchObject({
      ChamberTemp: 0,
      MeatTemp: 0,
      Meat2Temp: 0,
      Meat3Temp: 0,
    });
  });

  test('should handle empty temps array gracefully', async () => {
    mockTempsService.getTempsById.mockResolvedValue([]);

    render(<SmokeReview smokeId={mockSmokeId} />);

    await waitFor(() => {
      expect(mockTempsService.getTempsById).toHaveBeenCalledWith(mockSmokeData.tempsId);
    });

    // Should still render with initial temp data when temps array is empty
    const smokeProfileCard = screen.getByTestId('smoke-profile-card');
    const actualTempData = JSON.parse(smokeProfileCard.getAttribute('data-temps') || '[]');
    expect(actualTempData).toHaveLength(1);
    expect(actualTempData[0]).toMatchObject({
      ChamberTemp: 0,
      MeatTemp: 0,
      Meat2Temp: 0,
      Meat3Temp: 0,
    });
  });

  test('should handle null/undefined responses from services gracefully', async () => {
    mockPreSmokeService.getPreSmokeById.mockResolvedValue(null as any);
    mockSmokerService.getSmokeProfileById.mockResolvedValue(null as any);
    mockTempsService.getTempsById.mockResolvedValue(null as any);
    mockPostSmokeService.getPostSmokeById.mockResolvedValue(null as any);
    mockRatingsService.getRatingById.mockResolvedValue(null as any);

    render(<SmokeReview smokeId={mockSmokeId} />);

    await waitFor(() => {
      expect(mockSmokerService.getSmokeById).toHaveBeenCalledWith(mockSmokeId);
    });

    // Should render with initial values when services return null
    const preSmokeCard = screen.getByTestId('pre-smoke-card');
    const expectedInitialPreSmoke = {
      weight: {
        weight: undefined,
        unit: undefined,
      },
      steps: [],
    };
    expect(preSmokeCard).toHaveAttribute('data-presmoke', JSON.stringify(expectedInitialPreSmoke));

    const smokeProfileCard = screen.getByTestId('smoke-profile-card');
    const expectedInitialSmokeProfile = {
      chamberName: 'Chamber',
      probe1Name: 'Probe 1',
      probe2Name: 'Probe 2',
      probe3Name: 'Probe 3',
      woodType: '',
      notes: '',
    };
    expect(smokeProfileCard).toHaveAttribute('data-smokeprofile', JSON.stringify(expectedInitialSmokeProfile));

    const postSmokeCard = screen.getByTestId('post-smoke-card');
    const expectedInitialPostSmoke = {
      restTime: '',
      steps: [],
    };
    expect(postSmokeCard).toHaveAttribute('data-postsmoke', JSON.stringify(expectedInitialPostSmoke));

    const ratingsCard = screen.getByTestId('ratings-card');
    const expectedInitialRating = {
      smokeFlavor: 0,
      seasoning: 0,
      tenderness: 0,
      overallTaste: 0,
      notes: '',
    };
    expect(ratingsCard).toHaveAttribute('data-ratings', JSON.stringify(expectedInitialRating));
  });

  test('should update data when smokeId prop changes', async () => {
    const { rerender } = render(<SmokeReview smokeId={mockSmokeId} />);

    await waitFor(() => {
      expect(mockSmokerService.getSmokeById).toHaveBeenCalledWith(mockSmokeId);
    });

    // Clear mocks and setup new data for different smokeId
    jest.clearAllMocks();
    const newSmokeId = 'new-smoke-id';
    const newSmokeData = {
      ...mockSmokeData,
      preSmokeId: 'new-pre-smoke-id',
    };
    const newPreSmokeData = {
      ...mockPreSmokeData,
      notes: 'Updated pre-smoke notes',
    };

    mockSmokerService.getSmokeById.mockResolvedValue(newSmokeData);
    mockPreSmokeService.getPreSmokeById.mockResolvedValue(newPreSmokeData);
    mockSmokerService.getSmokeProfileById.mockResolvedValue(mockSmokeProfileData);
    mockTempsService.getTempsById.mockResolvedValue(mockTempsData);
    mockPostSmokeService.getPostSmokeById.mockResolvedValue(mockPostSmokeData);
    mockRatingsService.getRatingById.mockResolvedValue(mockRatingData);

    // Re-render with new smokeId
    rerender(<SmokeReview smokeId={newSmokeId} />);

    await waitFor(() => {
      expect(mockSmokerService.getSmokeById).toHaveBeenCalledWith(newSmokeId);
      expect(mockPreSmokeService.getPreSmokeById).toHaveBeenCalledWith(newSmokeData.preSmokeId);
    });

    // Verify updated data is displayed
    const preSmokeCard = screen.getByTestId('pre-smoke-card');
    expect(preSmokeCard).toHaveAttribute('data-presmoke', JSON.stringify(newPreSmokeData));
  });

  test('should render with correct Grid props', () => {
    render(<SmokeReview smokeId={mockSmokeId} />);

    const grid = screen.getByTestId('grid');
    expect(grid).toHaveAttribute('data-xs', '11');
    expect(grid).toHaveAttribute('data-item', 'true');
  });

  test('should handle temps data with valid length correctly', async () => {
    render(<SmokeReview smokeId={mockSmokeId} />);

    await waitFor(() => {
      expect(mockTempsService.getTempsById).toHaveBeenCalledWith(mockSmokeData.tempsId);
    });

    const smokeProfileCard = screen.getByTestId('smoke-profile-card');
    expect(smokeProfileCard).toHaveAttribute('data-temps', JSON.stringify(mockTempsData));
  });

  test('should initialize with correct default values', () => {
    render(<SmokeReview smokeId={mockSmokeId} />);

    // Check initial rendering before any async operations complete
    const preSmokeCard = screen.getByTestId('pre-smoke-card');
    const smokeProfileCard = screen.getByTestId('smoke-profile-card');
    const postSmokeCard = screen.getByTestId('post-smoke-card');
    const ratingsCard = screen.getByTestId('ratings-card');

    expect(preSmokeCard).toBeInTheDocument();
    expect(smokeProfileCard).toBeInTheDocument();
    expect(postSmokeCard).toBeInTheDocument();
    expect(ratingsCard).toBeInTheDocument();
  });

  test('should handle services that do not return data gracefully', async () => {
    // Test the conditional branches without triggering errors
    mockPreSmokeService.getPreSmokeById.mockResolvedValue(undefined as any);
    mockSmokerService.getSmokeProfileById.mockResolvedValue(undefined as any);
    mockPostSmokeService.getPostSmokeById.mockResolvedValue(undefined as any);
    mockRatingsService.getRatingById.mockResolvedValue(undefined as any);

    render(<SmokeReview smokeId={mockSmokeId} />);

    await waitFor(() => {
      expect(mockSmokerService.getSmokeById).toHaveBeenCalledWith(mockSmokeId);
    });

    // Services should be called but component should handle undefined gracefully
    expect(mockPreSmokeService.getPreSmokeById).toHaveBeenCalled();
    expect(mockSmokerService.getSmokeProfileById).toHaveBeenCalled();
    expect(mockPostSmokeService.getPostSmokeById).toHaveBeenCalled();
    expect(mockRatingsService.getRatingById).toHaveBeenCalled();
    
    // Component should still render
    expect(screen.getByTestId('pre-smoke-card')).toBeInTheDocument();
    expect(screen.getByTestId('smoke-profile-card')).toBeInTheDocument();
    expect(screen.getByTestId('post-smoke-card')).toBeInTheDocument();
    expect(screen.getByTestId('ratings-card')).toBeInTheDocument();
  });
});
