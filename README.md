# Overview
Here you'll find an almost production grade sample of using Discord's API 
and local RPC socket to add Voice and Text chat to a match based multiplayer 
game.

These steps will be the same if you're using the GameBridge SDK, except
you will connect to the RPC local to your game.

As far as effort goes, it should take about an afternoon to get a first
cut going if you're roughly familiar with the underlying technologies.
FWIW it took me about a day to build the first cut of this sample app.

This sample is basically two files that show the different parts of the workflow:
- `server/index.py` for the server side
- `client/src/App.js` for the client side

Good luck & have fun!

### Additional Best Practices
This sample demonstrates a good workflow for using the Discord API & RPC
but does not have the entirety of what represents production quality
code. You should make sure to handle at minimum these scenarios if
you're adapting this into your project:

1. All HTTP requests from your game client to your game server could
 fail and should retry a few times.
2. All HTTP requests to the Discord API backend from your game server
 or game client could fail and you should retry.
3. All HTTP requests via the Discord RPC.Proxy (discordapp.io) could
 fail and you should retry a few times.

# Sample Walkthrough
To implement match/instance based voice & text chat the basic workflow is as follows:

- Connect to the local Discord RPC socket. Be sure to scan the available port range if you're working
 against a client. This is done in the `connect()` function in `client/src/App.js`. If you are using the SDK,
 the port will be provided in a callback.
- Once connected:
  - Check if you have already authorized Discord for this user. To do this, you should return a valid
    Discord `access_token` when the user logs in to your game servers. The example `/login` endpoint in
    `server/index.py` shows what your login payload might return. Depending on the results...
  - **if you don't have the user's access token:** you need to get an RPC Token from Discord API to trade
     for a user's `code`. Retrive the RPC token as shown in the `/discord_auth` route in `server/index.py`.
     Then trade that `rpc_token` for a user's code by calling `AUTHORIZE` over the RPC socket as shown in `App.js`.
     Make sure to include the correct OAuth scopes that you intend to use. With the returned code,
     send it to your server and exchange it for the user's OAuth access and refresh tokens as shown in
     `/discord_exchange_code`. You should only do this flow the _first_ time a
     user appears on your system.
  - **if you ALREADY have the user's access token saved:** you need to check if it has expired
    by comparing the current time with the `Expiry` you previously retrieved. If it has expired
    you need to refresh your access token as described here https://discordapp.com/developers/docs/topics/oauth2#implementing-oauth2.
    You can see an example of how this works in `server/index.py` by looking at the `refresh_access_token`
    helper function and where it is used.
- Once you have the user's `access_token` in your game client, call `AUTHENTICATE` over the RPC
 socket as shown in `client/src/App.js`. If you get a success response then you're ready to go.
- At this point your game will be connected to the local user's Discord account via the RPC
 system and ready to do work. If you are dev'ing against the Discord Client you'll see a clear
 indicator via a blue strip at the top of the window.
- When a user joins a match, on your server, you should create a Discord Channel
 and put the user in it. Remember: be sure to do this lazily when a game user
 connects to a match and has Discord. Don't create a group along with your match.
 This will cause lots of empty Discord channels to be sitting around! Check out
 `/join_match` in `server/index.py` to see an example of lazy creating a channels and
 placing the user into it.
- Send the new Discord channel id back to the client. This group will be the container
 for your match's voice & text chat functionality and used in many of the RPC calls.
- On the client, now you can assume the channel is in the user's Direct Messages list
  and ready to go. Begin by making RPC calls to implement whatever features you want. In this
  sample we are joining the voice channel and connecting to text chat. You can see how this is
  done in the `joinMatch()` function in `client/src/App.js`.
- One thing to note is when you subscribe to an event over the RPC you'll get
 messages sent to you as things happen in real time. Check out the `handleDiscordRPCResponse()` function
 in `client/src/App.js` to see an example of how to handle some of these events.

### Sending Messages using the RPC Proxy
- Sending messages from your game requires using the Discord RPC Proxy. Note that you can invoke
  almost any endpoint shown at http://discordapp.com/developers as if you were the user using
  this RPC.Proxy. For an example of how to send text messages as the user check out the `onKeyUp()`
  function in `client/src/App.js`.


# Trying out this Sample

### Creating a Discord Application

First up you'll need to create an application on Discord's platform. To
do that head to https://discordapp.com/developers/applications/me and click
the giant plus button.

To configure your application to manage channels properly do this stuff:

- Set a fun name like _Legend of the Apple Tree: Summary of Clouds_.
- You can set an app icon later. Eventually this will show up as the
    server or group icon on each user's Discord client.
- For development purposes add the REDIRECT URI `http://localhost:3000`
- For development purposes add the RPC ORIGIN `http://localhost:3000`
- Click Save and you'll be whisked to your app's detail page.
- Click `Create a Bot User` and accept the confirmation.
- Uncheck `Public Bot` in the new `APP BOT USER` section.
 - Later on you'll need the Client ID, Secret from the APP DETAILS section.
    You'll also need the Token from the APP BOT USER section. Don't need
    to grab them now... just pointing it out :-)
- You'll want to come back here to add other people to your tester list
  to have them try your game during development.

Be sure to click _Save Changes_ again at the bottom of the page!

### Installing the Sample Client
First you need to clone `client/example.config.json` and rename it to
`client/config.json` then fill out your application's client ID found
at https://discordapp.com/developers/applications/me. Only the `Client ID`
should be set here. The other details will be set on the example server.

Installing the client requires only that you have node and npm installed.
Then, to install project dependencies, from this project's root folder:
```
cd client
npm install
```

### Installing the Sample Server
This is a little more involved but not crazy town.

First you need to clone `server/example.cfg` and rename it to `server/discord.cfg`
then fill out your application's configuration fields found at
https://discordapp.com/developers/applications/me. The `Client ID` and
`Secret` are in the `APP DETAILS` section up top. The `Token` is in
the `APP BOT USER` section.

Next you'll need to setup and install Flask, the web framework used by
this sample. Detailed instructions are available here
http://flask.pocoo.org/docs/0.11/installation/.

Be sure to activate your virtual environment then install the python
packages in addition to flask. If you're feeling lazy it's basically
this on MacOS from the project's root folder:
```
sudo pip install virtualenv
cd server
virtualenv client
. client/bin/activate
pip install -r requirements.txt
```

If you're on Windows, you'll have to follow the instructions on Flask's 
site. I haven't tried it :-)

### Running the Sample Client
Open a Terminal / Shell window to keep running. From the project's 
root folder:
```
cd client
npm start
```

### Running the Sample Server
Open a Terminal / Shell window to keep running. From the project's 
root folder:
```
cd server
. client/bin/activate
FLASK_DEBUG=1 FLASK_APP=index.py flask run
```

_Note that if you called your virtualenv something different, you will need to use that instead. E.g., . venv/client/activate_