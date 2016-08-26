import React, {Component} from 'react';
import request from 'superagent';
import './App.css';
import classnames from 'classnames';
const nonce = require('nonce')();

const VERSION = '1';
const CLIENT_ID = '217441586089295872';
const PORT = 6463;
const ENCODING = 'json';
const MY_USER_NAME = 'Jason';
const ENDPOINT = 'http://localhost:5000';

class App extends Component {
  constructor(props) {
    super(props);
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

  send(payload) {
    this.socket.send(JSON.stringify(payload));
  }

  call(command, args) {
    this.send({
      'cmd': command,
      'nonce': nonce(),
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

  handleError(err) {
    console.log(err);
    this.setState({message: err.toString()});
  }

  handleDiscordRPCResponse(e) {
    const data = JSON.parse(e.data);
    this.setState({'message': data.cmd});

    if (data.cmd === 'DISPATCH' && data.evt === 'READY') {
      request
        .get(`${ENDPOINT}/discord_auth`)
        .then((res) => {
          this.call('AUTHORIZE', {
            'client_id': CLIENT_ID,
            'scopes': ['rpc.api', 'identify', 'rpc', 'guilds.join'],
            rpc_token: JSON.parse(res.text).rpc_token
          });
        },
        this.handleError.bind(this));
    }
    else if(data.cmd === 'AUTHORIZE') {
      request
        .post(`${ENDPOINT}/discord_exchange_code`)
        .send({code: data.data.code, id: MY_USER_NAME})
        .then((res) => {
          const access_token = JSON.parse(res.text).access_token;
          this.setState({accessToken: access_token});
          this.call('AUTHENTICATE', {access_token});
        },
        this.handleError.bind(this));
    }
    else if(data.cmd === 'AUTHENTICATE') {
      this.setState({discordUserId: data.data.user.id, message: data.data.user.username, loggedIn: true})
    }
    else if(data.cmd === 'GET_CHANNELS') {
      const first_voice_channel = data.data.channels[1];
      this.call('SELECT_VOICE_CHANNEL', {'channel_id': first_voice_channel.id});

      this.subscribe('MESSAGE_CREATE', {'channel_id': this.state.guildId});
      this.subscribe('MESSAGE_UPDATE', {'channel_id': this.state.guildId});
      this.subscribe('MESSAGE_DELETE', {'channel_id': this.state.guildId});
    }
    else if(data.cmd === 'DISPATCH' && data.evt === 'MESSAGE_CREATE') {
      let lines = this.state.lines.slice();
      lines.push(data.data.message);
      this.setState({lines});
    }
    else if(data.cmd === 'DISPATCH' && data.evt === 'MESSAGE_UPDATE') {
      let lines = this.state.lines.slice();
      const index = lines.findIndex((message) => message.id === data.data.message.id);
      lines[index] = data.data.message;
      this.setState({lines});
    }
    else if(data.cmd === 'DISPATCH' && data.evt === 'MESSAGE_DELETE') {
      let lines = this.state.lines.filter((message) => message.id !== data.data.message.id);
      this.setState({lines});
    }
  }

  connect() {
    if (this.socket) {
      this.disconnect();
    }

    this.socket = new WebSocket(`wss://discordapp.io:${PORT}/?v=${VERSION}&client_id=${CLIENT_ID}&encoding=${ENCODING}`);

    this.socket.onmessage = this.handleDiscordRPCResponse.bind(this);

    this.socket.onopen = (e) => {
      this.setState({'message': `Opened ${e}`, connected: true, lines: []});
    };

    this.socket.onclose = (e) => {
      this.setState({'message': `Closed ${e}`, loggedIn: false, connected: false, guildId: null});
    };
  }

  createMatch() {
    request
      .post(`${ENDPOINT}/create_match`)
      .then((res) => {
        console.log(res);
        this.setState({guildId: JSON.parse(res.text).guild_id});
      },
      this.handleError.bind(this));
  }

  joinMatch() {
    request
      .post(`${ENDPOINT}/join_match`)
      .send({id: MY_USER_NAME, discord_id: this.state.discordUserId})
      .then((res) => {
        // citron note: We are attempting to wait for the new match server to be loaded by the Discord
        // client before requesting channels from it. Ideally, Discord would just hold this request until
        // the server arrives & then return.
        window.setTimeout(() => {
          const guild_id = JSON.parse(res.text).guild_id;
          this.call('GET_CHANNELS', {guild_id});
        }, 500);
      },
      this.handleError.bind(this));

  }

  endMatch() {
    this.setState({guildId: null});
    request.post(`${ENDPOINT}/end_match`).end();
  }

  disconnect() {
    if (this.socket) {
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

  render() {
    const {guildId, loggedIn, connected} = this.state;

    const lines = this.state.lines.map((message) => {
      return <div key={message.id} className="line">{message.author.username}: {message.content}</div>
    });

    return (
      <div className="App">
        <div className="status">{this.state.message}</div>
        <div className={classnames('button', {disabled: connected})} onClick={this.connect.bind(this)}>Connect to Discord</div>
        <div className={classnames('button', {disabled: !connected || !loggedIn || guildId})} onClick={this.createMatch.bind(this)}>Create Match</div>
        <div className={classnames('button', {disabled: !guildId})} onClick={this.joinMatch.bind(this)}>Join Match</div>
        <div className={classnames('button', {disabled: !guildId})} onClick={this.endMatch.bind(this)}>End Match</div>
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
