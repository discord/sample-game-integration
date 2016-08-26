import React, {Component} from 'react';
import request from 'superagent';
import './App.css';
const nonce = require('nonce')();
import classnames from 'classnames';

const VERSION = '1';
const CLIENT_ID = '217441586089295872';
const PORT = 6463;
const ENCODING = 'json';
const MY_USER_NAME = 'Jason';

class App extends Component {
  send(payload) {
    this.socket.send(JSON.stringify(payload));
  }

  constructor(props) {
    super(props);
    this.state = {
      message: 'Not Started',
      discordUserId: null,
      loggedIn: false,
      connected: false,
      guildId: null,
      lines: [],
      accessToken: null
    };
  }

  connect() {
    let socket = new WebSocket(`wss://discordapp.io:${PORT}/?v=${VERSION}&client_id=${CLIENT_ID}&encoding=${ENCODING}`);
    this.socket = socket;
    this.socket.onopen = (e) => {
      this.setState({'message': `Opened ${e}`, connected: true, lines: []});
    };

    socket.onmessage = (e) => {
      const data = JSON.parse(e.data);
      this.setState({'message': data.cmd});
      console.log(data);

      if (data.cmd === 'DISPATCH' && data.evt === 'READY') {
        request.get('http://localhost:5000/discord_auth').end((err, res) => {
          const rpc_token = JSON.parse(res.text).rpc_token;
          this.send({
            'cmd': 'AUTHORIZE',
            'nonce': nonce(),
            'args': {
              'client_id': CLIENT_ID,
              'scopes': ['rpc.api', 'identify', 'rpc', 'guilds.join'],
              rpc_token
            }
          });
        });
      }
      else if(data.cmd === 'AUTHORIZE') {
        request
          .post('http://localhost:5000/discord_exchange_code')
          .send({code: data.data.code, id: MY_USER_NAME})
          .end((err, res) => {
            const access_token = JSON.parse(res.text).access_token;
            this.setState({accessToken: access_token});
            this.send({
              'cmd': 'AUTHENTICATE',
              'nonce': nonce(),
              'args': {access_token}
            });
          });
      }
      else if(data.cmd === 'AUTHENTICATE') {
        this.setState({discordUserId: data.data.user.id, message: data.data.user.username, loggedIn: true})
      }
      else if(data.cmd === 'GET_CHANNELS') {
        console.log('blah blah');
        const first_voice_channel = data.data.channels[1];
        this.send({
          'cmd': 'SELECT_VOICE_CHANNEL',
          'nonce': nonce(),
          'args': {
            'channel_id': first_voice_channel.id
          }
        });

        // observe the default text channel
        this.send({
          'cmd': 'SUBSCRIBE',
          'evt': 'MESSAGE_CREATE',
          'args': {
            'channel_id': this.state.guildId
          },
        });
        this.send({
          'cmd': 'SUBSCRIBE',
          'evt': 'MESSAGE_UPDATE',
          'args': {
            'channel_id': this.state.guildId
          },
        });
        this.send({
          'cmd': 'SUBSCRIBE',
          'evt': 'MESSAGE_DELETE',
          'args': {
            'channel_id': this.state.guildId
          },
        });
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
    };

    socket.onclose = (e) => {
      this.setState({'message': `Closed ${e}`, loggedIn: false, connected: false, guildId: null});
    };
  }

  componentDidMount() {
    this.setState({'message': 'Hello'});
  }

  createMatch() {
    request
      .post('http://localhost:5000/create_match')
      .end((err, res) => {
        console.log(res);
        this.setState({guildId: JSON.parse(res.text).guild_id});
      });
  }

  joinMatch() {
    request
      .post('http://localhost:5000/join_match')
      .send({id: MY_USER_NAME, discord_id: this.state.discordUserId})
      .end((err, res) => {
        window.setTimeout(() => {
          const guild_id = JSON.parse(res.text).guild_id;
          const payload = {
            'cmd': 'GET_CHANNELS',
            'nonce': nonce(),
            'args': {
              guild_id
            }
          };
          this.socket.send(JSON.stringify(payload));
        }, 500);
      });

  }

  endMatch() {
    this.setState({guildId: null});
    request.post('http://localhost:5000/end_match').end();
  }

  disconnect() {
    this.socket.close();
  }

  onKeyUp(e) {
    if (e.keyCode === 13 /* enter */) {
      let inputBox = this.refs['INPUT_BOX'];
      console.log(this.state.accessToken);

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
