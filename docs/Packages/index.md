# Packages Documentation

The Smart Smoker V2 monorepo includes shared packages that provide reusable components and utilities across multiple applications.

## Current Packages

### TemperatureChart
- **Location**: `packages/TemperatureChart/`
- **Purpose**: Shared temperature visualization component using D3.js
- **Used By**: Frontend, Smoker App
- **Technologies**: React, TypeScript, D3.js, Material-UI

## Package Development

### Getting Started
All packages in this monorepo follow a standardized structure and testing approach. For creating new packages, see the [Testing Template](testing-template.md) which provides:

- Jest configuration with TypeScript support
- D3.js ES module handling
- React Testing Library setup
- Coverage reporting
- Consistent dependency management

### Architecture Principles

1. **Reusability**: Packages should be generic enough to be used across multiple apps
2. **TypeScript First**: All packages use TypeScript with strict typing
3. **Testing**: Minimum 70% test coverage required
4. **Documentation**: Each package should have comprehensive README
5. **Dependencies**: Use `--legacy-peer-deps` for compatibility

### Package Structure

```
packages/
├── PackageName/
│   ├── src/
│   │   ├── index.ts           # Main export
│   │   ├── components/        # React components
│   │   ├── types/            # TypeScript interfaces
│   │   ├── utils/            # Utility functions
│   │   ├── __tests__/        # Test files
│   │   ├── __mocks__/        # Mock files (D3, etc.)
│   │   └── setupTests.ts     # Test configuration
│   ├── package.json          # Package configuration
│   ├── tsconfig.json         # TypeScript config
│   └── README.md             # Package documentation
```

### Testing Strategy

Each package follows the same testing approach:
- **Unit Tests**: Component logic and data transformations
- **Interface Tests**: TypeScript type validation
- **Integration Tests**: Cross-component interactions
- **Mock Strategy**: Complex dependencies (D3.js, APIs) are mocked

### Development Workflow

1. **Create Package**: Follow the testing template structure
2. **Install Dependencies**: Use `npm install --legacy-peer-deps`
3. **Develop**: Write TypeScript code with proper interfaces
4. **Test**: Maintain test coverage above 70%
5. **Document**: Update README and add to this index
6. **Integrate**: Import and use in target applications

## Integration with Apps

Packages are designed to integrate seamlessly with the main applications:

- **Backend**: Can import utility functions and types
- **Device Service**: Shares communication protocols and data structures
- **Frontend**: Imports React components and visualization tools
- **Smoker App**: Uses same components as frontend for consistency

## Best Practices

### Code Quality
- Follow TypeScript strict mode
- Use proper error handling
- Implement comprehensive logging
- Write self-documenting code

### Performance
- Lazy load heavy components
- Optimize D3.js rendering
- Use React.memo for expensive renders
- Implement proper cleanup in useEffect

### Maintenance
- Keep dependencies up to date
- Monitor bundle size
- Regular security audits
- Backward compatibility considerations

## Future Packages

Planned packages for future development:
- **DataProcessor**: Time series data analysis utilities
- **NotificationManager**: Cross-platform notification handling  
- **ConfigManager**: Shared configuration and settings management
- **ProtocolHandler**: Serial communication protocols
- **StateManager**: Centralized state management utilities

For more information about testing new packages, see [Testing Template](testing-template.md).
