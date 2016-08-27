import React, {Component} from 'react';
import request from 'superagent';
import './App.css';
import classnames from 'classnames';
const nonce = require('nonce')();

const VERSION = '1';
const CLIENT_ID = '217441586089295872';
const PORT = 6463;
const NUM_PORTS_TO_SEARCH = 10;
const ENCODING = 'json';
const MY_USER_NAME = 'Jason';
const ENDPOINT = 'http://localhost:5000';


class App extends Component {
  constructor(props) {
    super(props);
    this.handlers = {};
    this.state = {
      message: 'Hello',
      discordUserId: null,
      loggedIn: false,
      connected: false,
      guildId: null,
      lines: [],
      accessToken: null
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

  // ----------------------------------------------------------------------------------------
  // Response handlers
  // ----------------------------------------------------------------------------------------
  handleError(err) {
    console.log(err);
    this.setState({message: err.toString()});
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
        .get(`${ENDPOINT}/discord_auth`)
        .then((res) => {
          this.call('AUTHORIZE', {
            'client_id': CLIENT_ID,
            'scopes': ['rpc.api', 'identify', 'rpc', 'guilds.join'],
            rpc_token: JSON.parse(res.text).rpc_token
          },
          (response) => {
            request
              .post(`${ENDPOINT}/discord_exchange_code`)
              .send({code: response.data.code, id: MY_USER_NAME})
              .then(({text}) => {
                const access_token = JSON.parse(text).access_token;
                this.setState({accessToken: access_token});
                this.call('AUTHENTICATE', {access_token}, (response) => {
                  this.setState({
                    discordUserId: response.data.user.id,
                    message: response.data.user.username,
                    loggedIn: true
                  });
                });
              },
              this.handleError.bind(this)
            );
          });
        },
        this.handleError.bind(this)
      );
    }
    else if(event === 'MESSAGE_CREATE') {
      let lines = this.state.lines.slice();
      lines.push(data.data.message);
      this.setState({lines});
    }
    else if(event === 'MESSAGE_UPDATE') {
      const index = lines.findIndex((message) => message.id === data.data.message.id);
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

      if (wasConnected == false && portOffset < NUM_PORTS_TO_SEARCH) {
        this.connect(null, portOffset + 1);
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

  joinMatch() {
    request
      .post(`${ENDPOINT}/join_match/${this.state.gameId}`)
      .send({id: MY_USER_NAME, discord_id: this.state.discordUserId})
      .then(({text}) => {
        // citron note: We are attempting to wait for the new match server to be loaded by the Discord
        // client before requesting channels from it. Ideally, Discord would just hold this request until
        // the server arrives & then return.
        window.setTimeout(() => {
          const guildId = JSON.parse(text).guild_id;
          this.setState({guildId});
          this.call('GET_CHANNELS', {guild_id: guildId}, (response) => {
            const first_voice_channel = response.data.channels[1];
            this.call('SELECT_VOICE_CHANNEL', {'channel_id': first_voice_channel.id});
            this.subscribe('MESSAGE_CREATE', {'channel_id': guildId});
            this.subscribe('MESSAGE_UPDATE', {'channel_id': guildId});
            this.subscribe('MESSAGE_DELETE', {'channel_id': guildId});
          });
        }, 500);
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
      this.setState({lines: []});
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

    return (
      <div className="App">
        <div className="status">{this.state.message}</div>
        <div className={classnames('button', {disabled: connected})} onClick={this.connect.bind(this)}>Connect to Discord</div>
        <div className={classnames('button', {disabled: !connected || !loggedIn || gameId})} onClick={this.createMatch.bind(this)}>Create Match</div>
        <div className={classnames('button', {disabled: !gameId || guildId})} onClick={this.joinMatch.bind(this)}>Join Match</div>
        <div className={classnames('button', {disabled: !gameId || !guildId})} onClick={this.endMatch.bind(this)}>End Match</div>
        <div className={classnames('button', {disabled: !connected})} onClick={this.disconnect.bind(this)}>Disconnect</div>
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
