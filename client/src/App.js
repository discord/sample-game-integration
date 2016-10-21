import React, {Component} from 'react';
import request from 'superagent';
import './App.css';
import classnames from 'classnames';
const nonce = require('nonce')();

const config = require('json!./../config.json');

let username = 'Jason';
let startOffset = 0;

// For example you can use for testing two users:
// http://localhost:3006/illumina/0
// http://localhost:3006/moonshed/1
if (window.location.pathname !== '/') {
  const params = window.location.pathname.split('/');
  if (params.length > 1) {
    username = params[1];
  }

  if (params.length > 2) {
    startOffset = parseInt(params[2], 10);
  }
}

const VERSION = '1';
const CLIENT_ID = config.clientId;
const PORT = 6463 + startOffset;
const NUM_PORTS_TO_SEARCH = 10 - startOffset;
const ENCODING = 'json';
const MY_USER_NAME = username;
const ENDPOINT = 'http://localhost:5000';
const DEFAULT_REQUEST_TIMEOUT = 60; // seconds
const CHANNEL_TYPE_VOICE = 2;
const ERROR_ALREADY_IN_VOICE_CHANNEL = 5003;
const ERROR_TOKEN_DOESNT_MATCH_CURRENT_USER = 4009;

class App extends Component {
  constructor(props) {
    super(props);
    this.handlers = {};
    this.state = {
      message: 'Hello',
      loggedIn: false,
      connected: false,
      guildId: null,
      lines: [],
      accessToken: null,
      voiceUsers: {}
    };
  }

  // ----------------------------------------------------------------------------------------
  // RPC Socket helper functions
  // ----------------------------------------------------------------------------------------
  send(payload) {
    this.socket.send(JSON.stringify(payload));
  }

  call(command, args, handler=null) {
    let n = nonce();
    if (handler) {
      this.handlers[n] = handler;
    }

    this.send({
      'cmd': command,
      'nonce': n,
      'args': args
    });
  }

  subscribe(event, args) {
    this.send({
      'cmd': 'SUBSCRIBE',
      'evt': event,
      'nonce': nonce(),
      'args': args
    });
  }

  isError(response, code=undefined) {
    return response.evt === 'ERROR' && (code ? response.data.code === code : true);
  }

  // ----------------------------------------------------------------------------------------
  // Response handlers
  // ----------------------------------------------------------------------------------------
  handleError(err) {
    // note: You should implement real error handling that, when appropriate, retries with a backoff :-)

    console.log(err);
    this.setState({message: err.toString()});
  }

  handleGotAccessToken(user) {
    const accessToken = user['access_token'];
    const discordId = user['discord_id'];
    this.setState({accessToken, discordId});
    this.call('AUTHENTICATE', {access_token: accessToken}, (response) => {
      if (response.data.code === ERROR_TOKEN_DOESNT_MATCH_CURRENT_USER) {
        console.error(response.data);
        this.disconnect();
        return;
      }

      this.setState({
        message: response.data.user.username,
        loggedIn: true
      });
    });
  }

  handleDiscordRPCResponse(e) {
    const data = JSON.parse(e.data);
    this.setState({'message': data.cmd});

    if (data.nonce) {
      let handler = this.handlers[data.nonce];
      if (handler) {
        delete this.handlers[data.nonce];
        handler(data);
        return;
      }
    }

    if (data.cmd !== 'DISPATCH') {
      return;
    }

    const event = data.evt;
    if (event === 'READY') {
      request
        .post(`${ENDPOINT}/login`)
        .send({id: MY_USER_NAME})
        .then(
          ({text}) => {
            this.handleGotAccessToken(JSON.parse(text));
          },
          () => {
            request
              .get(`${ENDPOINT}/discord_auth`)
              .then((res) => {
                this.call('AUTHORIZE', {
                  'client_id': CLIENT_ID,
                  'scopes': ['rpc.api', 'rpc', 'identify', 'gdm.join'],
                  rpc_token: JSON.parse(res.text).rpc_token
                },
                (response) => {
                  request
                    .post(`${ENDPOINT}/discord_exchange_code`)
                    .send({code: response.data.code, id: MY_USER_NAME})
                    .then(({text}) => {
                      this.handleGotAccessToken(JSON.parse(text))
                    },
                    this.handleError.bind(this)
                  );
                });
              },
              this.handleError.bind(this)
            );
          }
        );
    }
    else if(event === 'MESSAGE_CREATE') {
      let lines = this.state.lines.slice();
      lines.push(data.data.message);
      this.setState({lines});
    }
    else if(event === 'MESSAGE_UPDATE') {
      const index = this.state.lines.findIndex((message) => message.id === data.data.message.id);
      if (index === -1) {
        return;
      }
      let lines = this.state.lines.slice();
      lines[index] = data.data.message;
      this.setState({lines});
    }
    else if(event === 'MESSAGE_DELETE') {
      let lines = this.state.lines.filter((message) => message.id !== data.data.message.id);
      this.setState({lines});
    }
    else if(event === 'VOICE_STATE_CREATE') {
      this.setState({voiceUsers: this.addUserVoiceState(data.data.user)});
    }
    else if(event === 'VOICE_STATE_DELETE') {
      let user = data.data.user;
      let voiceUsers = this.state.voiceUsers;
      delete voiceUsers[user.id];
      this.setState({voiceUsers});
    }
    else if(event === 'SPEAKING_START') {
      let userId = data.data['user_id'];
      let voiceUsers = this.state.voiceUsers;
      if (!voiceUsers[userId]) {
        return;
      }
      voiceUsers[userId].speaking = true;
      this.setState({voiceUsers});
    }
    else if(event === 'SPEAKING_STOP') {
      let userId = data.data['user_id'];
      let voiceUsers = this.state.voiceUsers;
      if (!voiceUsers[userId]) {
        return;
      }
      voiceUsers[userId].speaking = false;
      this.setState({voiceUsers});
    }
  }

  addUserVoiceState(user) {
    if (user.bot) {
      return this.state.voiceUsers;
    }
    let voiceUsers = {...this.state.voiceUsers};
    voiceUsers[user.id] = {
      username: user.username,
      speaking: false
    };
    return voiceUsers;
  }

  // ----------------------------------------------------------------------------------------
  // UI Actions
  // ----------------------------------------------------------------------------------------
  connect(ignored, portOffset=0) {
    if (this.socket) {
      this.disconnect();
    }

    const portAttempt = PORT + portOffset;
    this.socket = new WebSocket(`wss://discordapp.io:${portAttempt}/?v=${VERSION}&client_id=${CLIENT_ID}&encoding=${ENCODING}`);

    this.socket.onmessage = this.handleDiscordRPCResponse.bind(this);

    this.socket.onerror = (e) => {
      this.setState({'message': `Error ${e}`});
    };

    this.socket.onopen = (e) => {
      this.setState({'message': `Opened ${e}`, connected: true, lines: []});
    };

    this.socket.onclose = (e) => {
      const wasConnected = this.state.connected;
      this.setState({'message': `Closed ${e}`, loggedIn: false, connected: false, guildId: null});

      if (wasConnected === false) {
        if (portOffset < NUM_PORTS_TO_SEARCH) {
          this.connect(null, portOffset + 1);
        }
        else {
          this.setState({'message': 'Discord is not running or was unable to bind to a local port'});
        }
      }
    };
  }

  createMatch() {
    request
      .post(`${ENDPOINT}/create_match`)
      .then(({text}) => {
        this.setState({gameId: JSON.parse(text).game_id});
      },
      this.handleError.bind(this)
    );
  }

  observeVoiceChannel(voiceChannel) {
    this.call('GET_CHANNEL', {'channel_id': voiceChannel.id}, (response) => {

      let voiceUsers = {...this.state.voiceUsers};
      response.data['voice_states'].forEach((voiceState) => {
        voiceUsers = this.addUserVoiceState(voiceState.user);
      });
      this.setState({voiceUsers});
      this.subscribe('VOICE_STATE_CREATE', {'channel_id': voiceChannel.id});
      this.subscribe('VOICE_STATE_DELETE', {'channel_id': voiceChannel.id});
      this.subscribe('SPEAKING_START', {'channel_id': voiceChannel.id});
      this.subscribe('SPEAKING_STOP', {'channel_id': voiceChannel.id});
    });
  }

  joinMatch() {
    request
      .post(`${ENDPOINT}/join_match/${this.state.gameId}`)
      .send({id: MY_USER_NAME})
      .then(({text}) => {
        const guildId = JSON.parse(text).guild_id;
        this.setState({guildId});
        this.call('GET_GUILD', {guild_id: guildId, timeout: DEFAULT_REQUEST_TIMEOUT}, (response) => {
          if (this.isError(response)) {
            const message = 'Failed to load the GUILD. Trying again';
            console.error(message);
            this.setState({message});
            this.joinMatch();
            return;
          }

          this.call('GET_CHANNELS', {guild_id: guildId}, (response) => {
            const first_voice_channel = response.data.channels.find((channel) => channel.type === CHANNEL_TYPE_VOICE);
            this.call('SELECT_VOICE_CHANNEL', {'channel_id': first_voice_channel.id}, (response) => {
              if (this.isError(response, ERROR_ALREADY_IN_VOICE_CHANNEL)) {
                const leave = window.confirm('Leave your current voice channel to join match chat?');
                if (leave) {
                  this.call('SELECT_VOICE_CHANNEL', {'channel_id': first_voice_channel.id, force: true}, () => {
                    this.observeVoiceChannel(first_voice_channel);
                  });
                }
              }
              else {
                this.observeVoiceChannel(first_voice_channel);
              }
            });

            // this focuses the guild's default text channel on the client
            this.call('SELECT_TEXT_CHANNEL', {'channel_id': guildId});

            this.subscribe('MESSAGE_CREATE', {'channel_id': guildId});
            this.subscribe('MESSAGE_UPDATE', {'channel_id': guildId});
            this.subscribe('MESSAGE_DELETE', {'channel_id': guildId});
          });
        });
      },
      this.handleError.bind(this)
    );
  }

  endMatch() {
    this.setState({gameId: null, guildId: null});
    request.post(`${ENDPOINT}/end_match`).end();
  }

  disconnect() {
    if (this.socket) {
      this.setState({lines: [], voiceUsers: {}});
      this.socket.close();
      this.socket = null;
    }
  }

  onKeyUp(e) {
    if (e.keyCode === 13 /* enter */) {
      let inputBox = this.refs['INPUT_BOX'];

      request
        .post(`https://discordapp.io:${PORT}/channels/${this.state.guildId}/messages`)
        .send({content: inputBox.value})
        .set('Authorization', `Bearer ${this.state.accessToken}`)
        .end((err, res) => {
          console.log('sent', err, res);
        });

      inputBox.value = '';
    }
  }

  // ----------------------------------------------------------------------------------------
  // Make It Pretty
  // ----------------------------------------------------------------------------------------
  render() {
    const {guildId, gameId, loggedIn, connected} = this.state;

    const lines = this.state.lines.map((message) => {
      return <div key={message.id} className="line">{message.author.username}: {message.content}</div>
    });

    const voiceUsers = Object.keys(this.state.voiceUsers).map((id) => {
      const user = this.state.voiceUsers[id];
      return <div key={id} className="user">{user.username}: {user.speaking ? 'Speaking' : 'Not Speaking'}</div>
    });

    return (
      <div className="App">
        <div className="status">{this.state.message}</div>
        <div className={classnames('button', {disabled: connected})} onClick={this.connect.bind(this)}>Connect to Discord</div>
        <div className={classnames('button', {disabled: !connected || !loggedIn || gameId})} onClick={this.createMatch.bind(this)}>Create Match</div>
        <div className={classnames('button', {disabled: !gameId || guildId})} onClick={this.joinMatch.bind(this)}>Join Match</div>
        <div className={classnames('button', {disabled: !gameId || !guildId})} onClick={this.endMatch.bind(this)}>End Match</div>
        <div className={classnames('button', {disabled: !connected})} onClick={this.disconnect.bind(this)}>Disconnect</div>
        <div className="voiparea">
          <div className="users">
            {voiceUsers}
          </div>
        </div>
        <div className="chatarea">
          <div className="lines">
            {lines}
          </div>
          <div className="input">
            <input onKeyUp={this.onKeyUp.bind(this)} type="text" ref="INPUT_BOX"/>
          </div>
        </div>
      </div>
    );
  }
}

export default App;
