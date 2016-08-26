# Overview
Here you'll find a production (soon) grade sample of using Discord's API 
and local RPC socket to add Voice and Text chat to a match based multiplayer 
game.

# Trying out this Sample

Briefly the structure of this sample is two parts: client and server. 
The meat of this example is in two primary files 
- `server/index.py` to dive into the server side logic
- `client/src/App.js` for the client side logic

### Creating a Discord Application

You will need to clone `server/example.cfg` and rename to `server/discord.cfg`
then fill out your application's configuration fields. You can get them
from your app on https://discordapp.com/developers/applications/me - or go ahead 
and make an app to try out with this sample.

Be sure to uncheck `Public Bot` on the Application detail page.

You'll want to add to `REDIRECT URIs` the following:
- `http://localhost:3000`

You will also want to add an `RPC ORIGIN`:
- `http://localhost:3000`

Be sure to click _Save Changes_ at the bottom of the page!


### Installing the Sample Client
Installing the client requires only that you have node and npm installed. From this project's
root folder:
```
cd client
npm install
```

### Installing the Sample Server
You'll need to setup and install Flask. Detailed instructions are 
available here http://flask.pocoo.org/docs/0.11/installation/.

Be sure to activate your virtual environment. Then install the python 
packages in addition to flask:
- `pip install flask-cors`
- `pip install requests`

If you're feeling lazy it's basically this on MacOS from the project's 
root folder:
```
sudo pip install virtualenv
cd server
virtualenv client
. client/bin/activate
pip install flask
pip install flask-cors
pip install requests
```

### Running the Sample Client
From the project's root folder:
```
cd client
npm start
```

### Running the Sample Server
From the project's root folder:
```
cd server
. client/bin/activate
export FLASK_DEBUG=1 ; export FLASK_APP=index.py ; flask run
```

_Note that if you called your virtualenv something different, you will need to use that instead. E.g., . venv/client/activate_