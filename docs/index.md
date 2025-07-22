# Welcome

This is the documentation for the Smart Smoker system. This a full stack solution for tracking meat smoking receipts prep, and temperatures. This app has 4 main components as follows, Backend, cloud-frontend, device-service, smoker-frontend. Database for this project uses mongoBD<br>

[agile/ jira board link](https://smartsmokerv2.atlassian.net/jira/software/projects/SS2/boards/1)<br>
[figma link](https://www.figma.com/file/CMoUqq5JztkckkR3bkKhRe/Smart-Smoker-v2-UI?type=design&node-id=4-0&mode=design&t=oSKKdeh8lHfDtact-0) (This is very out dated)
## Getting Started

This project uses npm workspaces for all its apps, therefore you can install all apps at once. <br>

pre-requisite to install

 * `node v20`
 * `npm v10`

run this cmd from the base folder of the repo <br>
`npm run bootstrap` 

This should install all apps in the project. To run each one please see appropriate tab above
running each app locally should all connect and run together without extra config

or to run all apps locally run run `npm run start` in the root folder. This will app all app in one terminal
note you must have a local mongo DS instance running for the backend to boot

You will also need a local mongo db running </br>
[install link](https://www.mongodb.com/docs/manual/tutorial/install-mongodb-on-ubuntu/) </br>
Run `sudo systemctl start mongod` to start on linux 

## Documentation Development

This project uses MkDocs with Material theme for documentation. To work with the documentation:

### Prerequisites
Make sure you have `mise` installed and the project tools set up:
```bash
mise install  # Installs Python 3.11, Node 20, and npm 10
```

### Required Dependencies
- **MkDocs**: `1.6.1`
- **MkDocs Material Theme**: `9.6.15`

### Documentation Commands
```bash
# Install documentation dependencies
mise run docs-install

# Serve documentation locally (auto-reload on changes)
mise run docs-serve

# Build static documentation site
mise run docs-build

# Deploy to GitHub Pages (requires permissions)
mise run docs-deploy
```

The documentation will be available at: http://127.0.0.1:8001

### Adding New Documentation
- Add new markdown files to the `docs/` folder
- Update `mkdocs.yml` navigation if needed
- Follow the existing structure and Material theme guidelines

## Project layout

    mkdocs.yml          # The configuration file.
    docs/
        index.md        # The documentation homepage.
        CI-CD/          # CI/CD and deployment documentation
        ...             # Other markdown pages, images and other files.
    apps/
        backend/        # umm this is the backend
        device-service/ # handles pi devices example. serial port, wifi
        frontend/       # frontend for cloud app
        smoker/         # frontend for pi on smoker
    packages/           # shared components and utilities
        TemperatureChart/ # D3.js temperature visualization component
    MicroController/    # arduino file
    .github/
        workflows/      # github action workflows


## Dev/Git Requirements

### Branch Naming Convention
* Names start with either `feature/`, `bug/`, or `hotfix/`
* Then has Jira number example `SS2-14`
* Then has name of card
* Example: `feature/SS2-14-login`

### Pull Request Workflow
All changes must come from a separate branch and merged to master via a PR.
**DO NOT COMMIT STRAIGHT TO MASTER**

### PR Requirements
* Must be rebased off of latest master
* All PR's must have Ben's approval before being merged
* **All automated tests must pass** (enforced by GitHub Actions)

### Automated Testing (CI/CD)
Every PR automatically runs:
- ✅ **Jest Tests**: All 4 apps (backend, device-service, frontend, smoker)
- ✅ **Package Tests**: TemperatureChart and future packages  
- ✅ **TypeScript Compilation**: Ensures code compiles without errors
- ✅ **Build Verification**: Frontend and Smoker apps must build successfully
- ✅ **Code Quality**: Linting and formatting checks

**Branch Protection**: The `master` branch is protected and requires all status checks to pass before merging.

For detailed CI/CD documentation, see the [CI/CD section](CI-CD/index.md).

### Setting Up Branch Protection
See `.github/BRANCH_PROTECTION_SETUP.md` for detailed instructions on configuring required status checks in GitHub.