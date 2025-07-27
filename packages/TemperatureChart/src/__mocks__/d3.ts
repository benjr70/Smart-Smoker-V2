// Mock D3 module for testing
const mockChainable = {
  attr: jest.fn().mockReturnThis(),
  style: jest.fn().mockReturnThis(),
  text: jest.fn().mockReturnThis(),
  classed: jest.fn().mockReturnThis(),
  call: jest.fn().mockReturnThis(),
  transition: jest.fn().mockReturnThis(),
  duration: jest.fn().mockReturnThis(),
  on: jest.fn().mockReturnThis(),
};

const mockSelection = {
  ...mockChainable,
  selectAll: jest.fn(() => ({
    ...mockChainable,
    data: jest.fn(() => ({
      join: jest.fn(() => mockChainable),
      enter: jest.fn(() => ({
        append: jest.fn(() => mockChainable),
      })),
      exit: jest.fn(() => ({
        remove: jest.fn(),
      })),
    })),
    remove: jest.fn(),
  })),
  append: jest.fn(() => ({
    ...mockChainable,
    data: jest.fn(() => ({
      join: jest.fn(() => mockChainable),
      enter: jest.fn(() => ({
        append: jest.fn(() => mockChainable),
      })),
      exit: jest.fn(() => ({
        remove: jest.fn(),
      })),
    })),
    selectAll: jest.fn(() => ({
      data: jest.fn(() => ({
        enter: jest.fn(() => ({
          append: jest.fn(() => mockChainable),
        })),
      })),
    })),
  })),
  empty: jest.fn(() => false),
  node: jest.fn(() => ({
    getBoundingClientRect: jest.fn(() => ({
      width: 800,
      height: 400,
    })),
  })),
};

export const select = jest.fn(() => mockSelection);

export const scaleLinear = jest.fn(() => ({
  domain: jest.fn().mockReturnThis(),
  range: jest.fn().mockReturnThis(),
}));

export const scaleTime = jest.fn(() => ({
  domain: jest.fn().mockReturnThis(),
  range: jest.fn().mockReturnThis(),
}));

export const line = jest.fn(() => ({
  x: jest.fn().mockReturnThis(),
  y: jest.fn().mockReturnThis(),
  curve: jest.fn().mockReturnThis(),
}));

export const axisBottom = jest.fn();
export const axisLeft = jest.fn();

export const extent = jest.fn(() => [0, 100]);
export const max = jest.fn(() => 100);
export const min = jest.fn(() => 0);

export const bisector = jest.fn(() => ({
  left: jest.fn(),
}));

export const mouse = jest.fn(() => [0, 0]);
export const curveCardinal = 'mockCurveCardinal';

// Export all other D3 functions as mocks
export default {
  select,
  scaleLinear,
  scaleTime,
  line,
  axisBottom,
  axisLeft,
  extent,
  max,
  min,
  bisector,
  mouse,
  curveCardinal,
};
