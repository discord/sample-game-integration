import React, {Component} from 'react';
import request from 'superagent';
import classnames from 'classnames';
import Select from 'react-select';
const nonce = require('nonce')();

import './App.css';
import 'react-select/dist/react-select.css';

const config = require('json!./../config.json');

let username = 'Jason';
let startOffset = 0;

// For example you can use for testing two users:
// http://localhost:3000/illumina/0
// http://localhost:3000/moonshed/1
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
const ERROR_ALREADY_IN_VOICE_CHANNEL = 5003;
const ERROR_TOKEN_DOESNT_MATCH_CURRENT_USER = 4009;
const CHANNEL_TYPE_TEXT = 0;

class App extends Component {
  constructor(props) {
    super(props);
    this.handlers = {};
    this.state = {
      message: 'Hello',
      loggedIn: false,
      connected: false,
      channelId: null,
      lines: [],
      accessToken: null,
      voiceUsers: {},
      ioPort: 0,
      shareGuilds: null,
      shareChannels: null,
      shareChannelId: null
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

  discordRequest(route, body, file) {
    if (file) {
      request
        .post(`https://discordapp.io:${this.state.ioPort}/${route}`)
        .set('Authorization', `Bearer ${this.state.accessToken}`)
        .field('payload_json', JSON.stringify(body))
        .attach('file', file, file.name)
        .end((err, res) => {
          console.log('sent', err, res);
        });
    }
    else {
      request
        .post(`https://discordapp.io:${this.state.ioPort}/${route}`)
        .set('Authorization', `Bearer ${this.state.accessToken}`)
        .send(body)
        .end((err, res) => {
          console.log('sent', err, res);
        });
    }
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

      this.loadGuildsForSharing();
    });
  }

  loadGuildsForSharing() {
    this.call('GET_GUILDS', {}, (response) => {
      const shareGuilds = response.data.guilds.map((guild) => {
        return {value: guild.id, label: guild.name, icon: guild.icon_url}
      });

      this.setState({shareGuilds});
      if (shareGuilds.length === 1) {
        this.handleSelectedShareGuild(shareGuilds[0]);
      }
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
      // type > 0 means it's a bot or system message.
      if (data.data.message.type > 0) {
        return;
      }
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
  connect(portOffset=0) {
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
      this.setState({'message': `Opened ${e}`, connected: true, lines: [], ioPort: portAttempt});
    };

    this.socket.onclose = (e) => {
      const wasConnected = this.state.connected;
      this.setState({'message': `Closed ${e}`, loggedIn: false, connected: false, channelId: null});

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

  findMatch() {
    request
      .post(`${ENDPOINT}/find_match`)
      .then(({text}) => {
        this.setState({gameId: JSON.parse(text).game_id});
      },
      this.handleError.bind(this)
    );
  }

  observeVoiceChannel(voiceChannelId) {
    this.call('GET_CHANNEL', {'channel_id': voiceChannelId}, (response) => {
      if (this.isError(response)) {
        console.error(response.message);
        return;
      }

      let voiceUsers = {...this.state.voiceUsers};
      response.data['voice_states'].forEach((voiceState) => {
        voiceUsers = this.addUserVoiceState(voiceState.user);
      });
      this.setState({voiceUsers});
      this.subscribe('VOICE_STATE_CREATE', {'channel_id': voiceChannelId});
      this.subscribe('VOICE_STATE_DELETE', {'channel_id': voiceChannelId});
      this.subscribe('SPEAKING_START', {'channel_id': voiceChannelId});
      this.subscribe('SPEAKING_STOP', {'channel_id': voiceChannelId});
    });
  }

 joinMatch() {
    request
      .post(`${ENDPOINT}/join_match/${this.state.gameId}`)
      .send({id: MY_USER_NAME})
      .then(({text}) => {
        const channelId = JSON.parse(text).channel_id;
        this.setState({channelId});
        this.call('SELECT_VOICE_CHANNEL', {'channel_id': channelId, timeout: DEFAULT_REQUEST_TIMEOUT}, (response) => {
          // this focuses the guild's default text channel on the client
          this.call('SELECT_TEXT_CHANNEL', {'channel_id': channelId});

          this.subscribe('MESSAGE_CREATE', {'channel_id': channelId});
          this.subscribe('MESSAGE_UPDATE', {'channel_id': channelId});
          this.subscribe('MESSAGE_DELETE', {'channel_id': channelId});

          if (this.isError(response, ERROR_ALREADY_IN_VOICE_CHANNEL)) {
            const leave = window.confirm('Leave your current voice channel to join match chat?');
            if (leave) {
              this.call('SELECT_VOICE_CHANNEL', {'channel_id': channelId, force: true}, () => {
                this.observeVoiceChannel(channelId);
              });
            }
          }
          else {
            this.observeVoiceChannel(channelId);
          }
        });
      },
      this.handleError.bind(this)
    );
  }

  endMatch() {
    this.setState({gameId: null, channelId: null});
    request.post(`${ENDPOINT}/end_match`).end();
  }

  shareResults() {
    // There are two ways to attach an image or thumbnail to an embed:
    //  1. You can use a URL that you are hosting somewhere as in the default case here.
    //  2. You can upload a png, jpeg, or gif up to 8MB large as shown here when a file is chosen in the picker.
    const shareFile = this.refs['SHARE_FILE'];
    const hasEmbedAttachment = shareFile.files.length > 0;
    const file = hasEmbedAttachment ? shareFile.files[0]: null;
    let imageUrl = 'https://lolstatic-a.akamaihd.net/game-info/1.1.9/images/content/gi-modes-sr-the-battle-for-the-rift.jpg';
    if (hasEmbedAttachment) {
      imageUrl = `attachment://${file.name}`
    }

    const embed = {
      title: `Defeat on Summoner's Rift`,
      description: 'Match results for a Diamond tier ranked game.',
      url: 'http://matchhistory.na.leagueoflegends.com/en/#match-details/NA1/2338193457/50068799?tab=overview',
      color: 0xFF0000,
      fields: [
        {
          name: 'Champion',
          value: 'Lucian',
          inline: true
        },
        {
          name: 'K/D/A',
          value: '24/18/12',
          inline: true
        }
      ],
      image: {
        url: imageUrl
      },
      footer: {
        text: `League of Legends`,
        icon_url: 'https://encrypted-tbn1.gstatic.com/images?q=tbn:ANd9GcS4Em5ICgyo-AdBKqA74vPAvoDihdnustbwuA23THD9pR8oI5Q0Z1swvw'
      }
    };

    this.discordRequest(`channels/${this.state.shareChannelId}/messages`, {embed}, file);
  }

  disconnect() {
    if (this.socket) {
      this.setState({
        lines: [], voiceUsers: {}, gameId: null, channelId: null,
        shareGuilds: null, shareChannels: null, shareGuildId: null, shareChannelId: null
      });
      this.socket.close();
      this.socket = null;
    }
  }

  // ----------------------------------------------------------------------------------------
  // UI Event Handlers
  // ----------------------------------------------------------------------------------------
  onHandleConnect() {
    this.connect();
  }

  onKeyUp(e) {
    if (e.keyCode === 13 /* enter */) {
      let inputBox = this.refs['INPUT_BOX'];
      this.discordRequest(`channels/${this.state.channelId}/messages`, {content: inputBox.value});
      inputBox.value = '';
    }
  }

  handleSelectedShareGuild(val) {
    const shareGuildId = val.value;
    this.setState({shareGuildId, shareChannels: null, shareChannelId: null});

    this.call('GET_CHANNELS', {guild_id: shareGuildId}, (response) => {
      const shareChannels = response.data.channels
        .filter((channel) => channel.type === CHANNEL_TYPE_TEXT)
        .map((channel) => {
          return {value: channel.id, label: channel.name}
        }
      );

      this.setState({shareChannels});

      if (shareChannels.length === 1) {
        this.handleSelectedShareChannel(shareChannels[0]);
      }
    });
  }

  handleSelectedShareChannel(val) {
    this.setState({shareChannelId: val.value});
  }

  // ----------------------------------------------------------------------------------------
  // Make It Pretty
  // ----------------------------------------------------------------------------------------
  renderOption(option) {
    if (option.icon) {
      return <div className="guild"><img className="guild-icon" alt="" src={option.icon} />{option.label}</div>;
    }

    return <div className="guild">{option.label}</div>;
  }

  render() {
    const {channelId, gameId, loggedIn, connected} = this.state;

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
        <div className={classnames('button', {disabled: connected})} onClick={this.onHandleConnect.bind(this)}>Connect to Discord</div>
        <div className={classnames('button', {disabled: !connected})} onClick={this.disconnect.bind(this)}>Disconnect</div>
        <div className="sections">
          <div className="section">
            <div className={classnames('button', {disabled: !connected || !loggedIn || gameId})} onClick={this.createMatch.bind(this)}>Create Match</div>
            <div className={classnames('button', {disabled: !connected || !loggedIn || gameId})} onClick={this.findMatch.bind(this)}>Find Match</div>
            <div className={classnames('button', {disabled: !gameId || channelId})} onClick={this.joinMatch.bind(this)}>Join Match</div>
            <div className={classnames('button', {disabled: !gameId || !channelId})} onClick={this.endMatch.bind(this)}>End Match</div>
          </div>
          <div className="section">
            <input className="file-share"
                   ref='SHARE_FILE'
                   type="file"
                   accept={'image/*'}
                   onChange={this.props.onChange}
                   multiple={false} />
            <Select name="SHARE_GUILD"
                    value={this.state.shareGuildId}
                    options={this.state.shareGuilds}
                    clearable={false}
                    optionRenderer={this.renderOption}
                    valueRenderer={this.renderOption}
                    onChange={this.handleSelectedShareGuild.bind(this)} />
            <Select name="SHARE_CHANNELS"
                    value={this.state.shareChannelId}
                    options={this.state.shareChannels}
                    clearable={false}
                    onChange={this.handleSelectedShareChannel.bind(this)} />
            <div className={classnames('button', {disabled: this.state.shareChannelId == null})} onClick={this.shareResults.bind(this)}>Share Results</div>
          </div>
        </div>
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
