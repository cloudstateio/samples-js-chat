const debug = require("debug")("cloudstate-sample-gateway");

class ChannelConnection {

  constructor(connection, channel) {
    this.connection = connection;
    this.channel = channel;
    this.callbacks = new Map();
    this.id = connection.id;
  }

  on(event, callback) {
    this.callbacks.set(event, callback);
    return this;
  }

  send(event, data) {
    const msg = {
      channel: this.channel.name,
      event: event
    };
    if (data !== undefined) {
      msg.data = data;
    }
    this.connection.ws.send(JSON.stringify(msg));
    return this;
  }

  doOn(event, data) {
    if (this.callbacks.has(event)) {
      this.callbacks.get(event)(data);
    }
  }
}

class Channel {
  constructor(name, onconnect) {
    this.name = name;
    this.onconnect = onconnect;
  }

  doOnConnect(connection) {
    const channelConnection = new ChannelConnection(connection, this);
    this.onconnect(channelConnection);
    return channelConnection;
  }
}

class Connection {
  constructor(ws, channels, id) {
    this.ws = ws;
    this.id = id;
    this.channels = new Map();
    channels.forEach(channel => {
      const conn = channel.doOnConnect(this);
      this.channels.set(channel.name, conn);
    });
    ws.on("message", this.doOnMessage.bind(this));
    ws.on("error", this.doOnError.bind(this));
    ws.on("close", this.doOnClose.bind(this));
  }

  doOnMessage(msg) {
    try {
      const message = JSON.parse(msg);
      if (message.channel === undefined || !this.channels.has(message.channel)) {
        debug("Message with unknown channel: " + message.channel);
      } else {
        const channel = this.channels.get(message.channel);
        let event = message.event;
        if (event === undefined) {
          event = "data";
        } else if (event === "close" || event === "error") {
          console.error("Illegal event name [%s]", event);
          event = "data";
        }
        channel.doOn(event, message.data);
      }
    } catch (err) {
      console.error("Error parsing message as JSON: %o", err)
    }
  }

  doOnError(err) {
    this.channels.forEach(channel => {
      channel.doOn("error", err);
    });
  }

  doOnClose() {
    this.channels.forEach(channel => {
      channel.doOn("close");
    });
  }

}

class Channels {
  constructor(ws) {
    this.ws = ws;
    this.channels = new Map();
    this.connectionCounter = 0;

    ws.on("connection", conn => {
      this.connectionCounter += 1;
      new Connection(conn, this.channels, this.connectionCounter);
    });
  }

  of(name, callback) {
    const channel = new Channel(name, callback);
    this.channels.set(name, channel);
    return channel;
  }
}

module.exports = Channels;
