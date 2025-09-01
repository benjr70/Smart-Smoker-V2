---
applyTo: 'apps/**'
---

# Smart Smoker V2 - Best Practices & Design Patterns

## Code Standards & Conventions

### TypeScript Standards (ENFORCED)

- **Strict Mode**: All applications use TypeScript strict mode
- **Type Safety**: Prefer explicit typing over `any`
- **Interface Design**: Use PascalCase for interfaces and types
- **Variable Naming**: camelCase for variables and functions

### File & Directory Naming

- **Backend files**: `kebab-case` (e.g., `smoke-profile.service.ts`)
- **Frontend components**: `PascalCase` (e.g., `TemperatureChart.tsx`)
- **Database collections**: `camelCase` in MongoDB
- **Constants**: `UPPER_SNAKE_CASE`
- **Environment variables**: `UPPER_SNAKE_CASE`

## NestJS Backend Patterns (REQUIRED)

### Service Pattern

```typescript
@Injectable()
export class ExampleService {
  constructor(
    @InjectModel('ModelName') private model: Model<Document>,
    private stateService: StateService
  ) {}

  async create(dto: CreateExampleDto): Promise<Example> {
    // Always use DTOs for input validation
    // Handle errors with proper HTTP status codes
    // Return properly typed responses
  }
}
```

### Controller Pattern

```typescript
@Controller('example')
@ApiTags('Example')
export class ExampleController {
  constructor(private readonly exampleService: ExampleService) {}

  @Post()
  @ApiOperation({ summary: 'Create example' })
  @ApiResponse({ status: 201, description: 'Example created successfully' })
  async create(@Body() createExampleDto: CreateExampleDto): Promise<Example> {
    return this.exampleService.create(createExampleDto);
  }
}
```

### WebSocket Gateway Pattern

```typescript
@WebSocketGateway()
export class ExampleGateway {
  @SubscribeMessage('event-name')
  handleEvent(@MessageBody() data: EventData): void {
    // All real-time updates flow through WebSocket gateways
    // Events should be typed and documented
    // Handle connection/disconnection gracefully
    // Implement proper authentication for WebSocket connections
  }
}
```

### DTO Pattern (Input Validation)

```typescript
export class CreateExampleDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty({ description: 'Example name' })
  name: string;

  @IsNumber()
  @Min(0)
  @ApiProperty({ description: 'Example value' })
  value: number;
}
```

## React Frontend Patterns (REQUIRED)

### Functional Component Pattern

```typescript
interface ExampleProps {
  data: ExampleData;
  onUpdate: (data: ExampleData) => void;
}

export const ExampleComponent: React.FC<ExampleProps> = ({ data, onUpdate }) => {
  // Use functional components with hooks ONLY
  // Avoid class components entirely
  // Use Material-UI for consistent styling
  // Implement proper error boundaries

  const [state, setState] = useState<StateType>(initialState);

  useEffect(() => {
    // Handle side effects properly
  }, [dependencies]);

  return (
    <Box component="div" sx={{ padding: 2 }}>
      {/* Material-UI components preferred */}
    </Box>
  );
};
```

### Custom Hook Pattern

```typescript
export const useExampleData = (id: string) => {
  const [data, setData] = useState<ExampleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Fetch data logic
  }, [id]);

  return { data, loading, error };
};
```

## Database Patterns (MongoDB/Mongoose)

### Schema Definition Pattern

```typescript
export const ExampleSchema = new mongoose.Schema({
  name: { type: String, required: true },
  value: { type: Number, required: true, min: 0 },
  createdAt: { type: Date, default: Date.now },
  // Use camelCase for field names
});
```

### Repository Pattern

```typescript
@Injectable()
export class ExampleRepository {
  constructor(
    @InjectModel('Example') private exampleModel: Model<ExampleDocument>
  ) {}

  async findByName(name: string): Promise<Example | null> {
    return this.exampleModel.findOne({ name }).exec();
  }

  // Use aggregation pipelines for complex queries
  async getStatistics(): Promise<any[]> {
    return this.exampleModel
      .aggregate([{ $group: { _id: null, total: { $sum: '$value' } } }])
      .exec();
  }
}
```

## Backend Module Architecture

### Core Modules & Responsibilities

#### State Module

- **Purpose**: Central state management for smoker status
- **Pattern**: Singleton service with observable state
- **Dependencies**: WebSocket gateway for real-time updates

#### Smoke Module

- **Purpose**: Core smoking operations and timer management
- **Pattern**: Service with scheduled tasks and event emitters
- **Dependencies**: State, Temps, WebSocket modules

#### Temps Module

- **Purpose**: Temperature monitoring and PID control
- **Pattern**: Service with hardware communication and control algorithms
- **Dependencies**: Device service communication, State module

#### PreSmoke/PostSmoke Modules

- **Purpose**: Workflow state management
- **Pattern**: State machine implementation
- **Dependencies**: State, Smoke, Notification modules

#### SmokeProfile Module

- **Purpose**: Recipe and cooking profile management
- **Pattern**: CRUD service with validation
- **Dependencies**: Database repository pattern

#### WebSocket Module

- **Purpose**: Real-time communication hub
- **Pattern**: Gateway with event broadcasting
- **Dependencies**: All other modules for state broadcasting

## Error Handling Patterns

### Backend Exception Handling

```typescript
@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    // Implement structured error responses
    // Log errors with sufficient context
    // Provide user-friendly error messages
  }
}
```

### Frontend Error Boundaries

```typescript
// Note: Error boundaries currently require class components in React
// This is an exception to the functional component rule
class ErrorBoundary extends React.Component {
  // Implement proper error boundaries in React
  // Handle component errors gracefully
  // Provide fallback UI
}
```

## Testing Patterns

### Unit Test Pattern

```typescript
describe('ExampleService', () => {
  let service: ExampleService;
  let mockModel: jest.Mocked<Model<ExampleDocument>>;

  beforeEach(async () => {
    // Mock external dependencies
    // Use proper dependency injection in tests
    // Clear mocks between tests
  });

  it('should create an example', async () => {
    // Arrange, Act, Assert pattern
    // Test both success and failure cases
    // Verify mock interactions
  });
});
```

### E2E Test Pattern

```typescript
describe('Example E2E', () => {
  // Test complete user workflows
  // Use proper test data setup and cleanup
  // Mock external services (hardware, databases)
});
```

## Security Best Practices

### Input Validation

- Always use DTOs with class-validator decorators
- Sanitize all user inputs
- Implement proper type checking

### Authentication & Authorization

- Implement JWT token validation
- Use proper authentication guards
- Validate WebSocket connections before message handling

### Database Security

- Use Mongoose schema validation
- Implement proper query sanitization
- Avoid direct database injection risks

## Performance Guidelines

### Database Optimization

- Use appropriate indexing for frequent queries
- Implement aggregation pipelines for complex operations
- Consider caching for frequently accessed data

### Frontend Optimization

- Use React component lazy loading
- Implement proper WebSocket message throttling
- Optimize D3.js chart rendering for large datasets

### Real-time Communication

- Throttle WebSocket message frequency
- Implement proper connection pooling
- Handle connection drops gracefully

## Code Quality Standards

### Documentation Requirements

- Use JSDoc for all TypeScript functions
- Update API documentation in Swagger
- Maintain architectural decisions in docs/
- Document environment variables and configuration

### Logging Standards

- Use structured logging throughout applications
- Include sufficient context in error logs
- Implement different log levels appropriately

### Code Review Checklist

- TypeScript strict mode compliance
- Proper error handling implementation
- Test coverage meets thresholds
- Security best practices followed
- Performance considerations addressed
- Documentation updated appropriately
