# Welcome

This is the documentation for the Smart Smoker system. This a full stack solution for tracking meat smoking receipts prep, and temperatures. This app has 4 main components as follows, Backend, cloud-frontend, device-service, smoker-frontend. 
## Getting Started

This project uses npm workspaces for all its apps, therefore you can install all apps at once. <br>

pre-requisite to install

 * `node v16`
 * `npm v8`

run this cmd from the base folder of the repo <br>
`npm run bootstrap` 

This should install all apps in the project. To run each one please see appropriate tab above

## Project layout

    mkdocs.yml          # The configuration file.
    docs/
        index.md        # The documentation homepage.
        ...             # Other markdown pages, images and other files.
    apps/
        backend/        # umm this is the backend
        device-service/ # handles pi devices example. serial port, wifi
        frontend/       # frontend for cloud app
        smoker/         # frontend for pi on smoker
    MicroController/    # arduino file
    .github/
        workflows/      # github action workflows
