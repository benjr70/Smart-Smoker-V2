# Welcome

This is the documentation for the Smart Smoker system. This a full stack solution for tracking meat smoking receipts prep, and temperatures. This app has 4 main components as follows, Backend, cloud-frontend, device-service, smoker-frontend. Database for this project uses mongoBD<br>

[agile/ jira board link](https://smartsmokerv2.atlassian.net/jira/software/projects/SS2/boards/1)<br>
[figma link](https://www.figma.com/file/CMoUqq5JztkckkR3bkKhRe/Smart-Smoker-v2-UI?type=design&node-id=4-0&mode=design&t=oSKKdeh8lHfDtact-0) (This is very out dated)
## Getting Started

This project uses npm workspaces for all its apps, therefore you can install all apps at once. <br>

pre-requisite to install

 * `node v16`
 * `npm v8`

run this cmd from the base folder of the repo <br>
`npm run bootstrap` 

This should install all apps in the project. To run each one please see appropriate tab above
running each app locally should all connect and run together without extra config

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


## Dev/Git Requirements

Branch naming
* names start with either feature/bug/hotfix
* then has jira number example SS2-14
* then has name of card
* example feature/SS2-14-login

all changes must come from a separate branch and merged to master via a PR. 
DO NOT COMMIT STRAIGHT TO MASTER

PR Requirments
* must be rebase off of latest master
* all PR's must have Ben Approval before being merged