# Smart Smoker Backend Architecture

This document illustrates the architecture of the Smart Smoker backend system, showing how different modules interact with each other. The system consists of two main services:

1. **Backend Service**: Handles the business logic, database operations, and web socket communication with clients
2. **Device Service**: Manages communication with the physical smoker device through serial connection

## Backend Service Module Interaction Diagram

```mermaid
graph TD
    AppModule[Backend App Module] --> StateModule[State Module]
    AppModule --> PreSmokeModule[PreSmoke Module]
    AppModule --> SmokeModule[Smoke Module]
    AppModule --> EventsModule[Events WebSocket Module]
    AppModule --> TempModule[Temperature Module]
    AppModule --> SmokeProfileModule[Smoke Profile Module]
    AppModule --> PostSmokeModule[Post Smoke Module]
    AppModule --> RatingsModel[Ratings Module]
    AppModule --> HistoryModule[History Module]
    AppModule --> NotificationsModule[Notifications Module]
    AppModule --> SettingsModule[Settings Module]
    
    %% WebSocket gateway dependencies
    EventsModule --> StateModule
    EventsModule --> TempModule
    EventsModule --> NotificationsModule
    
    %% Smoke Module dependencies
    SmokeModule --> StateModule
    
    %% Temp Module dependencies
    TempModule --> StateModule
    TempModule --> SmokeModule
    
    %% PreSmoke Module dependencies
    PreSmokeModule --> StateModule
    PreSmokeModule --> SmokeModule
    
    %% PostSmoke Module dependencies
    PostSmokeModule --> StateModule
    PostSmokeModule --> SmokeModule
    
    %% SmokeProfile Module dependencies
    SmokeProfileModule --> StateModule
    SmokeProfileModule --> SmokeModule
    SmokeProfileModule --> RatingsModel
    
    %% Database connection
    AppModule --> MongoDB[(MongoDB)]
    
    classDef module fill:#b3e6ff,stroke:#3399ff,stroke-width:2px;
    classDef database fill:#ffcc99,stroke:#ff9933,stroke-width:2px;
    class AppModule,StateModule,PreSmokeModule,SmokeModule,EventsModule,TempModule,SmokeProfileModule,PostSmokeModule,RatingsModel,HistoryModule,NotificationsModule,SettingsModule module;
    class MongoDB database;
```

## Device Service Module Interaction Diagram

```mermaid
graph TD
    DeviceAppModule[Device App Module] --> SerialModule[Serial Module]
    DeviceAppModule --> DeviceEventsModule[Device WebSocket Module]
    DeviceAppModule --> WifiManagerModule[WiFi Manager Module]
    
    DeviceEventsModule --> SerialModule
    
    classDef module fill:#b3e6ff,stroke:#3399ff,stroke-width:2px;
    class DeviceAppModule,SerialModule,DeviceEventsModule,WifiManagerModule module;
```

## System Data Flow

```mermaid
graph LR
    Device[Smoker Device] -->|Serial Connection| SerialService[Serial Service]
    SerialService -->|Temperature Data| DeviceWebSocket[Device WebSocket Gateway]
    DeviceWebSocket -->|Forward Data| BackendWebSocket[Backend WebSocket Gateway]
    
    BackendWebSocket -->|Process Data| TempService[Temperature Service]
    BackendWebSocket -->|Update State| StateService[State Service]
    BackendWebSocket -->|Check Thresholds| NotificationService[Notification Service]
    
    TempService -->|Store Temperatures| Database[(MongoDB)]
    StateService -->|Update Smoking Status| Database
    
    Client[Web/Mobile Client] -->|HTTP Requests| API[REST API Controllers]
    Client -->|Real-time Updates| BackendWebSocket
    
    API -->|Manage Smoke Sessions| SmokeService[Smoke Service]
    API -->|Configure Profiles| ProfileService[Profile Service]
    API -->|Setup Pre-Smoke| PreSmokeService[PreSmoke Service]
    API -->|Record Post-Smoke| PostSmokeService[PostSmoke Service]
    
    SmokeService --> Database
    ProfileService --> Database
    PreSmokeService --> Database
    PostSmokeService --> Database
    
    classDef external fill:#ccffcc,stroke:#66cc66,stroke-width:2px;
    classDef service fill:#ffccff,stroke:#cc66cc,stroke-width:2px;
    classDef data fill:#ffcc99,stroke:#ff9933,stroke-width:2px;
    classDef gateway fill:#ffffcc,stroke:#cccc66,stroke-width:2px;
    
    class Device,Client external;
    class SerialService,TempService,StateService,NotificationService,SmokeService,ProfileService,PreSmokeService,PostSmokeService service;
    class Database data;
    class API service;
    class DeviceWebSocket,BackendWebSocket gateway;
```

## Core Components

### Backend Service Components

#### State Module
- Central module for maintaining system state
- Tracks smoking status and current session information
- Many other modules depend on this for state information

#### Events Module (Backend WebSocket)
- Handles real-time communication with clients
- Receives temperature data from the device service
- Processes data and broadcasts updates to connected clients
- Relies on Temperature, State, and Notifications modules

#### Temperature Module
- Manages temperature readings
- Stores historical temperature data
- Depends on State and Smoke modules

#### Smoke Module
- Core module for smoke session management
- Depends on State module for tracking smoking status

#### PreSmoke Module
- Handles preparation phase before smoking begins
- Depends on State and Smoke modules

#### PostSmoke Module
- Manages completion phase after smoking ends
- Depends on State and Smoke modules

#### Smoke Profile Module
- Manages smoking profiles and configurations
- Depends on State, Smoke, and Ratings modules

#### Settings Module
- Handles system configuration settings
- Operates independently with its own database schema

#### Notifications Module
- Manages user notifications based on temperature thresholds
- Used by Events module to trigger notifications

#### Ratings Module
- Handles rating system for smoke profiles
- Used by Smoke Profile module

#### History Module
- Tracks historical smoking sessions
- Provides analytics and reporting capabilities

### Device Service Components

#### Serial Module
- Manages serial communication with the smoker device hardware
- Reads temperature data from temperature probes and sensors
- Exports a service that other modules can use to interact with the hardware

#### Device Events Module (Device WebSocket)
- Forwards temperature and status data from the serial module to the backend service
- Provides a WebSocket gateway for real-time communication

#### WiFi Manager Module
- Handles WiFi connectivity for the device
- Provides API for configuring WiFi settings


!!! note

    I paid $2.50 for AI to create this soooo hopefully this is right
