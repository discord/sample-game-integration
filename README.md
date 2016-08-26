# Overview
Here you'll find a production (soon) grade sample of using Discord's API 
and local RPC socket to add Voice and Text chat to a match based multiplayer 
game.

As far as effort goes, it should take about an afternoon to get a first 
cut going if you're roughly familiar with the underlying technologies. 
FWIW it took me about a day to build the first cut of this sample app.
 
This sample is basically two files that show the different parts of the workflow:
- `server/index.py` for the server side 
- `client/src/App.js` for the client side

Good luck & have fun!

# Trying out this Sample

### Creating a Discord Application

First up you'll need to create an application on Discord's platform. To 
do that head to https://discordapp.com/developers/applications/me and click
the giant plus button.

To configure your application to manage voice servers properly do this stuff:

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

Be sure to click _Save Changes_ again at the bottom of the page!

**A Very Important Step** Now you will need to e-mail your point of 
contact at Discord to get your application _whitelisted._ In your e-mail 
make sure you send the `Client ID` that is listed in the `APP DETAILS` 
box up top on your application's detail page.

In the mean time you can continue setting up your sample environment.

### Installing the Sample Client
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
export FLASK_DEBUG=1 ; export FLASK_APP=index.py ; flask run
```

_Note that if you called your virtualenv something different, you will need to use that instead. E.g., . venv/client/activate_