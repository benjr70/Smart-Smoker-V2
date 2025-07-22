# Package Testing Template

This template provides a standardized approach for adding Jest testing to packages in the Smart Smoker V2 monorepo.

## Quick Setup for New Packages

### 1. Package.json Configuration

Add these sections to your package's `package.json`:

```json
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch", 
    "test:coverage": "jest --coverage"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^5.16.5",
    "@testing-library/react": "^13.4.0",
    "@testing-library/user-event": "^14.4.3",
    "@types/jest": "28.1.8",
    "@types/node": "^18.15.0",
    "identity-obj-proxy": "^3.0.0",
    "jest": "28.0.3",
    "jest-environment-jsdom": "28.0.2",
    "ts-jest": "28.0.8",
    "typescript": "^4.9.5"
  },
  "jest": {
    "preset": "ts-jest",
    "testEnvironment": "jsdom",
    "setupFilesAfterEnv": ["<rootDir>/src/setupTests.ts"],
    "moduleNameMapper": {
      "\\.(css|less|scss)$": "identity-obj-proxy"
    },
    "transformIgnorePatterns": [
      "node_modules/(?!(d3|d3-.*|internmap|delaunator|robust-predicates)/)"
    ],
    "testMatch": [
      "<rootDir>/src/**/__tests__/**/*.{ts,tsx}",
      "<rootDir>/src/**/*.{test,spec}.{ts,tsx}"
    ],
    "collectCoverageFrom": [
      "src/**/*.{ts,tsx}",
      "!src/**/*.d.ts",
      "!src/setupTests.ts",
      "!src/__mocks__/**"
    ]
  }
}
```

### 2. Setup Files

Create `src/setupTests.ts`:
```typescript
// Jest DOM matchers
import '@testing-library/jest-dom';

// Add any global test setup here
```

### 3. Test File Template

Create `src/[YourComponent].test.tsx`:
```typescript
import React from 'react';
import { render, screen } from '@testing-library/react';
import YourComponent from './YourComponent';

describe('YourComponent Package', () => {
  describe('Basic Functionality', () => {
    test('component renders without crashing', () => {
      render(<YourComponent />);
      expect(screen.getByRole('main')).toBeInTheDocument();
    });

    test('component accepts required props', () => {
      const props = {
        // Add your component props here
      };
      render(<YourComponent {...props} />);
      // Add assertions based on your component
    });
  });

  describe('TypeScript Interfaces', () => {
    test('interfaces work correctly', () => {
      // Test your TypeScript interfaces
      const testData: YourDataType = {
        // Add test data structure
      };
      expect(testData).toBeDefined();
    });
  });
});
```

### 4. D3.js Components (If Needed)

If your package uses D3.js, create `src/__mocks__/d3.ts`:
```typescript
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

// Add more D3 mocks as needed for your specific use case
export const select = jest.fn(() => ({
  ...mockChainable,
  // Add specific methods your component uses
}));

export default { select /* other exports */ };
```

And add to your Jest config:
```json
"moduleNameMapper": {
  "\\.(css|less|scss)$": "identity-obj-proxy",
  "^d3$": "<rootDir>/src/__mocks__/d3.ts"
}
```

### 5. Installation

```bash
cd packages/YourPackage
npm install --legacy-peer-deps
npm test
```

## Testing Commands

All packages should support these commands:

- `npm test` - Run tests once
- `npm run test:watch` - Run tests in watch mode
- `npm run test:coverage` - Run tests with coverage report

## Best Practices

1. **Start Simple**: Begin with interface/type tests and basic rendering
2. **Mock Complex Dependencies**: Use mocks for D3, external APIs, etc.
3. **Test Data Structures**: Ensure TypeScript interfaces work correctly
4. **Focus on Logic**: Test business logic rather than visual rendering
5. **Use Consistent Naming**: Follow the pattern `[ComponentName].test.tsx`

## Coverage Goals

- **Minimum**: 70% code coverage
- **Target**: 80%+ code coverage
- **Focus**: Critical business logic and data transformations

## Integration with Monorepo

This testing setup integrates with the overall Smart Smoker V2 testing strategy:

- **Consistent Jest Version**: 28.0.3 across all packages and apps
- **Shared Dependencies**: Reuses testing utilities from workspace
- **D3.js Support**: Handles D3.js modules consistently
- **TypeScript**: Full TypeScript support with proper type checking
