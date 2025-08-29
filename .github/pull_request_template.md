## Description
<!-- Provide a brief summary of changes and motivation for the change -->

## Type of Change
<!-- Mark with an 'x' all that apply -->
- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update
- [ ] Performance improvement
- [ ] Refactoring (no functional changes)
- [ ] CI/CD changes

## Affected Applications
<!-- Mark with an 'x' all that apply -->
- [ ] Backend Service (apps/backend)
- [ ] Device Service (apps/device-service)
- [ ] Frontend (apps/frontend)
- [ ] Smoker App (apps/smoker)
- [ ] MicroController (Arduino firmware)
- [ ] Shared Packages (packages/*)
- [ ] Documentation (docs/)
- [ ] CI/CD Pipeline (.github/workflows)

## Testing Checklist
<!-- Ensure all tests pass before submitting PR -->
- [ ] Unit tests pass locally (`npm test` from app directory)
- [ ] E2E tests pass locally (`npm run test:e2e` from app directory)
- [ ] Coverage thresholds met (Backend: 80%, Device Service: 75%, Frontend: 75%, Smoker: 80%)
- [ ] Manual testing completed for affected functionality
- [ ] Hardware integration tested (if applicable)

## Code Quality Checklist
<!-- Verify code quality standards are met -->
- [ ] TypeScript strict mode compliance
- [ ] ESLint/Prettier formatting applied
- [ ] No console.log statements in production code
- [ ] Proper error handling implemented
- [ ] API documentation updated (if applicable)
- [ ] Environment variables documented (if new ones added)

## Security Checklist
<!-- Complete if changes involve security-sensitive areas -->
- [ ] Input validation implemented
- [ ] Authentication/authorization considered
- [ ] No sensitive data exposed in logs
- [ ] Dependencies scanned for vulnerabilities
- [ ] N/A - No security implications

## Breaking Changes
<!-- If this is a breaking change, describe what changes users need to make -->
- [ ] No breaking changes
- [ ] Breaking changes described below:

<!--
If breaking changes exist, provide details:
- Configuration changes required
- API changes that affect other applications
- Database migration requirements
- Hardware compatibility changes
-->

## Hardware Integration
<!-- Complete if changes affect hardware communication -->
- [ ] Serial communication tested with MicroController
- [ ] Temperature sensor functionality verified
- [ ] Hardware control commands validated
- [ ] Device service communication confirmed
- [ ] N/A - No hardware changes

## Real-time Features
<!-- Complete if changes affect WebSocket communication -->
- [ ] WebSocket events tested
- [ ] Real-time updates verified across all clients
- [ ] Connection handling (connect/disconnect) tested
- [ ] Authentication for WebSocket connections verified
- [ ] N/A - No real-time features affected

## Database Changes
<!-- Complete if changes affect data models or migrations -->
- [ ] MongoDB schema changes documented
- [ ] Data migration scripts provided (if needed)
- [ ] Backward compatibility maintained
- [ ] Database indexes updated (if needed)
- [ ] N/A - No database changes

## Additional Notes
<!-- Any additional context, screenshots, or relevant information -->

---

### Review Guidelines for Reviewers
- **Architecture**: Check if changes follow established patterns in `/docs/Backend/` and other architecture docs
- **Testing**: Verify adequate test coverage and quality
- **Performance**: Consider impact on real-time communication and hardware interaction
- **Security**: Review authentication, input validation, and data exposure
- **Documentation**: Ensure changes are properly documented
- **Multi-App Impact**: Consider how changes affect other applications in the monorepo

### Links
- Related Issue: <!-- Link to GitHub issue if applicable -->
- Documentation: <!-- Link to relevant documentation -->
- Staging Environment: <!-- Link to staging deployment if applicable -->
