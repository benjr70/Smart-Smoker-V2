# Getting Started

after installing (on the welcome page)

before you start you will need to run a local mongodb server <br>
you may need to do some googling to set that up but here are the [mongoDb Docs](https://www.mongodb.com/docs/manual/administration/install-community/)

make sure it is running on this `http://127.0.0.1:27017` <br>

You will need to create a local env file for this app. Copy the committed
template and fill in your own values — it lists every variable the backend
reads, with blank values:

```bash
cp apps/backend/.env.example apps/backend/.env.local
```

For a local run the values you need are:
* DB_URL=mongodb://127.0.0.1:27017/SmokerDB
* VAPID_PUBLIC_KEY=<your_generated_key>
* VAPID_PRIVATE_KEY=<your_generated_key>
* VAPID_CONTACT=mailto:<your_contact_address> (optional; a neutral placeholder is used when unset)

Never commit a filled-in env file. Deployed environments get these values from
GitHub repository secrets, which the dev and prod deploy workflows export into
the container environment.


once that is set up just run <br>
`npm run start` <br>
and you should be good to go


## API

once you get this running you can go to `http://localhost:3001/api/` to see the swagger of all api endpoint and test them to your live local env


## Websocket

This is used for live temps from the pi and to the cloud frontend<br>
It is also use for live updates like start and stop smoking button