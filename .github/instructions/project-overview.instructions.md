---
applyTo: "**"
---

# Smart Smoker V2 - Project Overview

## What This Repository Does

Smart Smoker V2 is a comprehensive IoT smoking device management system that controls and monitors smoking equipment through multiple interconnected applications. The system enables users to remotely monitor temperature, set cooking profiles, receive notifications, and manage smoking sessions through web, desktop, and mobile interfaces.

## Repository Information

- **Repository Size**: ~50+ TypeScript/JavaScript files across 4 main applications
- **Project Type**: IoT/Hardware control system with full-stack web applications
- **Languages**: TypeScript (primary), JavaScript, Arduino C++, Python (documentation)
- **Target Runtime**: Node.js 24, npm 10 (managed via mise)
- **Architecture**: Microservices with monorepo structure

## Core Applications

### Backend Service (`apps/backend/`)
- **Framework**: NestJS API server (Node.js/TypeScript)
- **Database**: MongoDB with Mongoose ODM
- **Communication**: WebSockets for real-time updates, REST APIs
- **Purpose**: Central business logic, data persistence, real-time communication hub
- **Key Features**: State management, smoking workflows, temperature control, notifications

### Device Service (`apps/device-service/`)
- **Framework**: NestJS microservice
- **Purpose**: Hardware communication bridge between software and Arduino
- **Communication**: Serial over USB/WiFi with physical smoker hardware
- **Responsibilities**: Temperature readings, hardware control commands, device status

### Frontend (`apps/frontend/`)
- **Framework**: React 17+ with TypeScript
- **UI**: Material-UI (MUI) components
- **Data Visualization**: D3.js for temperature charts and analytics
- **Purpose**: Web-based smoker monitoring and control interface
- **Build Tool**: Webpack

### Smoker App (`apps/smoker/`)
- **Framework**: Electron desktop application with React
- **Purpose**: Local smoker management and control
- **Build Tool**: Electron Forge
- **UI**: Material-UI components
- **Target**: Desktop users requiring local hardware access

### MicroController (`MicroController/`)
- **Platform**: Arduino firmware (.ino files)
- **Purpose**: Physical hardware control (temperature sensors, heating elements, fans)
- **Communication**: Serial communication with Device Service

### Shared Packages (`packages/`)
- **TemperatureChart**: Reusable D3.js temperature visualization component
- **Testing**: Jest 28.0.3 with ES module support for D3.js
- **Purpose**: Shared components and utilities across applications

## Key Technologies & Dependencies

### Backend Stack
- NestJS with TypeScript strict mode
- MongoDB with Mongoose ODM
- WebSockets for real-time communication
- Swagger/OpenAPI for API documentation
- Jest for testing with 80% coverage requirement

### Frontend Stack
- React functional components with hooks (no class components)
- Material-UI for consistent design system
- D3.js for data visualization and charts
- Axios for HTTP client
- TypeScript with strict typing

### Hardware Integration
- Arduino platform for physical control
- Serial communication protocols
- Temperature sensor interfaces
- Hardware state management

## System Architecture

The system follows a microservices architecture where:
1. **Frontend/Smoker App** → **Backend Service** (API calls, WebSocket)
2. **Backend Service** → **Device Service** (hardware commands)
3. **Device Service** → **MicroController** (serial communication)
4. **MicroController** → **Physical Hardware** (sensors, controls)

Real-time data flows back through the same chain via WebSockets, enabling live temperature monitoring and status updates across all applications.

## Documentation Structure

- `docs/`: MkDocs documentation with architectural decisions
- `docs/Backend/`: Backend service architecture and API specs
- `docs/CI-CD/`: GitHub Actions and deployment information
- `docs/Packages/`: Package development guidelines and templates
- Individual app READMEs for specific setup instructions
