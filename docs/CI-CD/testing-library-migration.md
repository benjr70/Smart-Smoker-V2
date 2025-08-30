# Testing Library Best Practices Migration Guide

## Overview

This guide addresses the systematic migration needed to fix Testing Library rule violations across the Frontend and Smoker applications. We currently have 240+ violations that need to be addressed.

## Issue Categories

### 1. Multiple Assertions in `waitFor` (87 violations)

**Problem**: Multiple assertions within a single `waitFor` callback
```tsx
// ❌ Bad
await waitFor(() => {
  expect(element1).toBeInTheDocument();
  expect(element2).toHaveTextContent('test');
  expect(element3).toBeVisible();
});
```

**Solution**: Split into separate `waitFor` calls or use separate assertions
```tsx
// ✅ Good
await waitFor(() => expect(element1).toBeInTheDocument());
await waitFor(() => expect(element2).toHaveTextContent('test'));
await waitFor(() => expect(element3).toBeVisible());

// ✅ Or if they're related to the same condition
await waitFor(() => expect(element1).toBeInTheDocument());
expect(element2).toHaveTextContent('test');
expect(element3).toBeVisible();
```

### 2. Unnecessary `act` Wrapping (65 violations)

**Problem**: Wrapping Testing Library utilities in `act` unnecessarily
```tsx
// ❌ Bad
await act(async () => {
  fireEvent.click(button);
});
```

**Solution**: Remove `act` wrapper for Testing Library utilities
```tsx
// ✅ Good
fireEvent.click(button);
// or for user events
await user.click(button);
```

### 3. Direct Node Access (45 violations)

**Problem**: Accessing DOM nodes directly instead of using Testing Library queries
```tsx
// ❌ Bad
const element = container.firstChild;
const buttons = container.querySelectorAll('button');
```

**Solution**: Use Testing Library queries
```tsx
// ✅ Good
const element = screen.getByRole('button');
const buttons = screen.getAllByRole('button');
```

### 4. Side Effects in `waitFor` (35 violations)

**Problem**: Performing side effects inside `waitFor` callbacks
```tsx
// ❌ Bad
await waitFor(() => {
  fireEvent.click(button);
  expect(result).toBe(true);
});
```

**Solution**: Move side effects outside `waitFor`
```tsx
// ✅ Good
fireEvent.click(button);
await waitFor(() => expect(result).toBe(true));
```

### 5. Using Container Methods (8 violations)

**Problem**: Using `container` methods instead of `screen` queries
```tsx
// ❌ Bad
const { container } = render(<Component />);
const element = container.querySelector('.class-name');
```

**Solution**: Use `screen` queries with appropriate roles/labels
```tsx
// ✅ Good
render(<Component />);
const element = screen.getByRole('button', { name: /submit/i });
// or
const element = screen.getByTestId('submit-button');
```

## Migration Strategy

### Phase 1: Quick Wins (Low Risk)
1. Remove unnecessary `act` wrappers
2. Fix unused variable warnings
3. Remove unnecessary imports
4. Fix escape character issues

### Phase 2: Testing Library Queries (Medium Risk)
1. Replace `container.querySelector` with `screen.getBy*` queries
2. Replace direct node access with proper queries
3. Add missing `data-testid` attributes where needed

### Phase 3: Async Testing Patterns (High Risk)
1. Split multiple assertions in `waitFor`
2. Move side effects out of `waitFor` callbacks
3. Review and optimize async test patterns

### Phase 4: Validation
1. Run full test suite to ensure no regressions
2. Verify coverage thresholds are maintained
3. Update test documentation

## File Priority Order

### Frontend App (148 violations)
1. **High Priority (>20 violations)**:
   - `components/settings/notifications.test.tsx` (36 violations)
   - `components/history/history.test.tsx` (11 violations)
   - `components/common/components/DynamicList.test.tsx` (25 violations)

2. **Medium Priority (5-20 violations)**:
   - `components/smoke/smoke-simple.test.tsx` (7 violations)
   - `components/smoke/smoke.test.tsx` (11 violations)
   - `components/smoke/smokeStep/smokeStep.test.tsx` (19 violations)

3. **Low Priority (<5 violations)**:
   - `App.test.tsx` (fixed)
   - `components/history/smokeCards/ratingsCard.test.tsx` (1 violation)
   - Various component files with unused imports

### Smoker App (92 violations)
1. **High Priority**:
   - `components/home/home.test.tsx` (43 violations)
   - `components/home/wifi/wifi.test.tsx` (46 violations)

## Tools and Commands

### Lint specific files
```bash
# Check specific file
cd apps/frontend && npx eslint src/components/settings/notifications.test.tsx

# Fix auto-fixable issues
cd apps/frontend && npx eslint src/components/settings/notifications.test.tsx --fix
```

### Run tests for specific files
```bash
# Test specific file
cd apps/frontend && npm test -- notifications.test.tsx

# Test with coverage
cd apps/frontend && npm run test:cov -- notifications.test.tsx
```

## Best Practices Going Forward

### 1. Use Modern Testing Library Patterns
```tsx
// Use user events for interactions
import { user } from '@testing-library/user-event';
await user.click(button);
await user.type(input, 'text');

// Use proper queries with good selectors
screen.getByRole('button', { name: /submit/i })
screen.getByLabelText(/email address/i)
screen.getByText(/loading/i)
```

### 2. Structure Async Tests Properly
```tsx
test('async behavior', async () => {
  render(<Component />);
  
  // Perform actions
  fireEvent.click(screen.getByRole('button'));
  
  // Wait for results
  await waitFor(() => 
    expect(screen.getByText('success')).toBeInTheDocument()
  );
  
  // Additional synchronous assertions
  expect(screen.getByText('completed')).toBeInTheDocument();
});
```

### 3. Use Appropriate Queries
- `getByRole` - Primary choice for interactive elements
- `getByLabelText` - Form inputs
- `getByText` - Text content
- `getByTestId` - Last resort for complex scenarios

### 4. Avoid Common Anti-patterns
- Don't use `act` with Testing Library utilities
- Don't access DOM nodes directly
- Don't put multiple assertions in `waitFor`
- Don't perform side effects in `waitFor`

## Implementation Timeline

**Week 1**: Quick wins (unused imports, simple fixes)
**Week 2-3**: Testing Library queries migration
**Week 4-5**: Async testing patterns refactor
**Week 6**: Validation and documentation update

This systematic approach ensures we maintain test quality while improving code standards.
