# Smart Smoker V2 - GitHub Copilot Instructions

## Project Overview

Smart Smoker V2 is a comprehensive IoT smoking device management system with multiple applications:

- **Backend Service**: NestJS API server handling business logic, database operations, and WebSocket communication
- **Device Service**: NestJS microservice managing serial communication with physical smoker hardware
- **Frontend**: React web application for smoker monitoring and control
- **Smoker App**: Electron desktop application for local smoker management
- **MicroController**: Arduino code for the physical smoker hardware

## Architecture & Technologies

### Backend Stack
- **Framework**: NestJS (Node.js/TypeScript)
- **Database**: MongoDB
- **Communication**: WebSockets, REST APIs
- **Documentation**: Swagger/OpenAPI
- **Testing**: Jest

### Frontend Stack
- **Framework**: React 17+ with TypeScript
- **UI Components**: Material-UI (MUI)
- **Data Visualization**: D3.js
- **HTTP Client**: Axios
- **Build Tool**: Webpack

### Desktop App
- **Framework**: Electron with React
- **Build Tool**: Electron Forge
- **UI**: Material-UI components

### Hardware
- **Platform**: Arduino
- **Communication**: Serial over USB/WiFi

## Workspace Structure

```
apps/
├── backend/          # NestJS API server
├── device-service/   # Hardware communication service
├── frontend/         # React web app
└── smoker/          # Electron desktop app

packages/
└── TemperatureChart/ # Shared temperature chart component

docs/                 # MkDocs documentation
MicroController/      # Arduino firmware
infra/               # Infrastructure configs
```

## Development Guidelines

### Code Style & Patterns

1. **TypeScript First**: All new code should be written in TypeScript with strict typing
2. **NestJS Patterns**: Follow NestJS best practices for modules, controllers, services, and decorators
3. **React Patterns**: Use functional components with hooks, avoid class components
4. **Error Handling**: Implement proper error boundaries and exception filters
5. **Logging**: Use structured logging throughout the application

### Module Structure (Backend)

The backend follows a modular architecture:
- `State`: Central state management for smoker status
- `Smoke`: Core smoking operations and timers
- `Temps`: Temperature monitoring and control
- `PreSmoke`/`PostSmoke`: Workflow management
- `SmokeProfile`: Recipe and profile management
- `History`: Session tracking and analytics
- `Notifications`: Alert and notification system
- `Settings`: Configuration management
- `WebSocket`: Real-time communication

### Database Patterns

- Use MongoDB with Mongoose ODM
- Implement proper schema validation
- Use aggregation pipelines for complex queries
- Follow naming conventions: camelCase for fields

### WebSocket Communication

- All real-time updates flow through WebSocket gateways
- Events should be typed and documented
- Handle connection/disconnection gracefully
- Implement proper authentication for WebSocket connections

### Testing Standards

- **Unit Tests**: All services and controllers should have unit tests and they must all be passing
- **Integration Tests**: Test module interactions
- **E2E Tests**: Test complete user workflows
- **Coverage**: Maintain >80% test coverage
- **CI/CD**: All tests run automatically on PRs via GitHub Actions

### GitHub Actions CI
Every Pull Request automatically runs:
- Jest tests for all 4 applications
- Package tests (TemperatureChart)
- TypeScript compilation checks
- Build verification for frontend apps
- Code quality and linting

**Branch Protection**: Master branch requires all CI checks to pass before merging.

### Docker & Deployment

- Each app has its own Dockerfile
- Use docker-compose for local development
- Environment-specific configurations
- Health checks for all services

## Naming Conventions

### Files & Directories
- **Backend**: `kebab-case` for files, `PascalCase` for classes
- **Frontend**: `PascalCase` for components, `camelCase` for utilities
- **Database**: `camelCase` for collections and fields

### Variables & Functions
- **TypeScript**: `camelCase` for variables/functions, `PascalCase` for types/interfaces
- **Constants**: `UPPER_SNAKE_CASE`
- **Environment Variables**: `UPPER_SNAKE_CASE`

## Development Commands

```bash
# Install dependencies (from root)
npm run bootstrap

# Install dependencies in individual apps (use --legacy-peer-deps to resolve version conflicts)
cd apps/backend && npm install --legacy-peer-deps
cd apps/device-service && npm install --legacy-peer-deps  
cd apps/frontend && npm install --legacy-peer-deps
cd apps/smoker && npm install --legacy-peer-deps

# Start all services in development (from root)
npm start

# Individual services (from root)
npm run back:start     # Backend API
npm run front:start    # React frontend
npm run smoker:start   # Electron app
npm run devices:start  # Device service

# Testing (must be run from within each app folder)
# Navigate to specific app folder first, then run:
cd apps/backend && npm test              # Backend tests
cd apps/backend && npm run test:cov     # Backend coverage
cd apps/backend && npm run test:e2e     # Backend E2E tests

cd apps/device-service && npm test      # Device service tests
cd apps/device-service && npm run test:cov  # Device service coverage
cd apps/device-service && npm run test:e2e  # Device service E2E tests

cd apps/frontend && npm test            # Frontend tests
cd apps/smoker && npm test              # Smoker app tests

# Package tests
cd packages/TemperatureChart && npm test    # TemperatureChart package tests
# For new packages, follow the template in docs/Packages/testing-template.md

# Documentation (from root)
mise run docs-install    # Install MkDocs dependencies
mise run docs-serve      # Serve docs locally at http://127.0.0.1:8001
mise run docs-build      # Build static site
mise run docs-deploy     # Deploy to GitHub Pages
```

## Common Patterns

### Package Development Pattern
- **Location**: `packages/[PackageName]/`
- **Setup**: Use `docs/Packages/testing-template.md` for new packages
- **Dependencies**: Install with `--legacy-peer-deps` for compatibility
- **Testing**: Jest 28.0.3 with D3.js ES module support
- **TypeScript**: Full TypeScript support with interface testing
- **Shared Code**: Reusable components and utilities for apps

### Backend Service Pattern
```typescript
@Injectable()
export class ExampleService {
  constructor(
    @InjectModel('ModelName') private model: Model<Document>,
    private stateService: StateService
  ) {}

  async create(dto: CreateExampleDto): Promise<Example> {
    // Implementation
  }
}
```

### WebSocket Event Pattern
```typescript
@WebSocketGateway()
export class ExampleGateway {
  @SubscribeMessage('event-name')
  handleEvent(@MessageBody() data: EventData): void {
    // Implementation
  }
}
```

### React Component Pattern
```typescript
interface ExampleProps {
  data: ExampleData;
  onUpdate: (data: ExampleData) => void;
}

export const ExampleComponent: React.FC<ExampleProps> = ({ data, onUpdate }) => {
  // Implementation
};
```

## Security Considerations

- Validate all inputs with DTOs and class-validator
- Implement proper authentication and authorization
- Sanitize database queries to prevent injection
- Use HTTPS in production
- Implement rate limiting for APIs

## Performance Guidelines

- Use database indexing appropriately
- Implement caching where beneficial
- Optimize WebSocket message frequency
- Use lazy loading for frontend components
- Monitor memory usage in Electron app

## Documentation Standards

- Use JSDoc for TypeScript functions
- Update API documentation in Swagger
- Keep README files current
- Document environment variables
- Maintain architectural decisions in docs/

## Error Handling

- Use custom exception filters in NestJS
- Implement proper error boundaries in React
- Log errors with sufficient context
- Provide user-friendly error messages
- Handle hardware communication failures gracefully

When contributing to this project, please follow these guidelines and maintain consistency with the existing codebase. All changes should be properly tested and documented.
