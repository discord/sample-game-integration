from flask import Flask, request
import json
import requests
from flask_cors import CORS
import cPickle as pickle
import ConfigParser

app = Flask(__name__)
CORS(app)  # don't do this in production

BASE_URL = 'https://discordapp.com/api'

config = ConfigParser.RawConfigParser()
config.read('discord.cfg')

BOT_TOKEN = config.get('DiscordOptions', 'bot_token')
CLIENT_SECRET = config.get('DiscordOptions', 'client_secret')
CLIENT_ID = config.get('DiscordOptions', 'client_id')
HEADERS = {
    'Authorization': 'Bot {0}'.format(BOT_TOKEN),
    'User-Agent': 'DiscordBot (Sample-Game-Client, 0.1)'
}


############################################################
# Who needs a map?
############################################################
class User:
    def __init__(self):
        self.id = None
        self.refresh_token = None
        self.access_token = None

class Game:
    def __init__(self):
        self.guild_id = None

data = {
    'games': [],    # Game
    'users': {}     # User
}

try:
    data = pickle.load(open('discord-server.p', 'rb'))
except:
    pass


def save():
    pickle.dump(data, open('discord-server.p', 'wb'))


############################################################
# Discord Role Permission Bits
############################################################
CREATE_INSTANT_INVITE = 0x00000001
KICK_MEMBERS = 0x00000002
BAN_MEMBERS = 0x00000004
ADMINISTRATOR = 0x00000008
MANAGE_CHANNELS = 0x00000010
MANAGE_GUILD = 0x00000020
READ_MESSAGES = 0x00000400
SEND_MESSAGES = 0x00000800
SEND_TTS_MESSAGES = 0x00001000
MANAGE_MESSAGES = 0x00002000
EMBED_LINKS = 0x00004000
ATTACH_FILES = 0x00008000
READ_MESSAGE_HISTORY = 0x00010000
MENTION_EVERYONE = 0x00020000
CONNECT = 0x00100000
SPEAK = 0x00200000
MUTE_MEMBERS = 0x00400000
DEAFEN_MEMBERS = 0x00800000
MOVE_MEMBERS = 0x01000000
USE_VAD = 0x02000000
CHANGE_NICKNAME = 0x04000000
MANAGE_NICKNAMES = 0x08000000
MANAGE_ROLES = 0x10000000


############################################################
# Game Match Management Routes
############################################################
@app.route('/create_match', methods=['POST'])
def create_match():
    delete_all_games()

    permissions = (READ_MESSAGES | SEND_MESSAGES | READ_MESSAGE_HISTORY | CONNECT | SPEAK | USE_VAD)
    create_match_data = {
        'name': 'Testing This',
        'region': 'us-west',
        'icon': '',
        'roles': [
            {
                'id': 0,
                'p': permissions
            }
        ]
    }
    r = requests.post(BASE_URL + '/guilds', headers=HEADERS, json=create_match_data)
    print r.text
    r.raise_for_status()
    guild_id = r.json()['id']

    game = Game()
    game.guild_id = guild_id
    data['games'].append(game)
    save()

    return json.dumps({
        'guild_id': guild_id
    })


@app.route('/join_match', methods=['POST'])
def join_match():
    user = data['users'][request.get_json()['id']]
    discord_id = request.get_json()['discord_id']

    game = data['games'][0]
    guild_id = game.guild_id

    add_to_server = {
        'access_token': user.access_token
    }
    r = requests.put(BASE_URL + '/guilds/{0}/members/{1}'.format(guild_id, discord_id),
                     headers=HEADERS, json=add_to_server)
    r.raise_for_status()
    return json.dumps({'guild_id': guild_id})


@app.route('/end_match', methods=['POST'])
def end_match():
    delete_all_games()
    return ''


@app.route('/delete_all_servers')
def delete_all_games():
    data['games'] = []
    save()

    r = requests.get(BASE_URL + '/users/@me/guilds', headers=HEADERS)
    r.raise_for_status()
    guilds = r.json()
    for guild in guilds:
        if guild['owner'] is True:
            r = requests.delete(BASE_URL + '/guilds/{0}'.format(guild['id']), headers=HEADERS)
            print 'deleting', guild['name']
            r.raise_for_status()

    return ''


############################################################
# OAuth Routes
############################################################
@app.route('/discord_auth')
def discord_authenticate():
    create_token_data = {
        'client_id': CLIENT_ID,
        'client_secret': CLIENT_SECRET
    }
    r = requests.post(BASE_URL + '/oauth2/token/rpc', headers=HEADERS, data=create_token_data)
    r.raise_for_status()
    rpc_token = r.json()['rpc_token']

    return json.dumps({
        'rpc_token': rpc_token
    })


@app.route('/discord_exchange_code', methods=['POST'])
def discord_exchange_token():
    code = request.get_json()['code']
    exchange_code = {
        'grant_type': 'authorization_code',
        'code': code,
        'redirect_uri': 'http://localhost:3000',
        'client_id': CLIENT_ID
    }
    r = requests.post(BASE_URL + '/oauth2/token', headers=HEADERS, data=exchange_code)
    r.raise_for_status()

    user = User()
    user.id = request.get_json()['id']
    user.access_token = r.json()['access_token']
    user.refresh_token = r.json()['refresh_token']
    data['users'][user.id] = user
    save()

    return json.dumps({
        'access_token': user.access_token
    })
