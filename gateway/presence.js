const debug = require("debug")("cloudstate-sample-gateway");

class OnlineUser {
  constructor(presenceClient, username) {
    this.presenceClient = presenceClient;
    this.username = username;
    this.onThisNode = 1;
    this.connect();
  }

  reconnect() {
    if (this.onThisNode > 0) {
      // Reconnect after a timeout
      setTimeout(() => {
        this.connect();
      }, 5000);
    }
  }

  connect() {
    if (this.onThisNode > 0) {
      const call = this.presenceClient.connect({name: this.username});
      call.on("error", this.reconnect.bind(this));
      call.on("end", this.reconnect.bind(this));
      this.call = call;
    }
  }

}

class OnlineUsers {
  constructor(presenceClient) {
    this.users = new Map();
    this.presenceClient = presenceClient;
  }

  connect(username) {
    if (this.users.has(username)) {
      this.users.get(username).onThisNode += 1;
    } else {
      this.users.set(username, new OnlineUser(this.presenceClient, username));
    }
  }

  disconnect(username) {
    if (this.users.has(username)) {
      const connection = this.users.get(username);
      if (connection.onThisNode > 1) {
        connection.onThisNode -= 1;
      } else {
        connection.onThisNode = 0;
        connection.call.cancel();
        this.users.delete(username);
      }
    }
  }
}

class MonitoredUser {
  constructor(presenceClient, username) {
    this.presenceClient = presenceClient;
    this.username = username;
    this.status = "offline";
    this.monitoring = new Map();
  }

  reconnect() {
    if (this.monitoring.size > 0) {
      // Reconnect after a timeout
      setTimeout(() => {
        this.connect();
      }, 5000);
    }
  }

  connect() {
    if (this.monitoring.size > 0) {
      const call = this.presenceClient.monitor({name: this.username});
      call.on("error", this.reconnect.bind(this));
      call.on("end", this.reconnect.bind(this));
      call.on("data", status => {
        if (status.online) {
          this.status = "online";
        } else {
          this.status = "offline";
        }
        debug("%s went %s with %d clients listening", this.username, this.status, this.monitoring.size);
        this.monitoring.forEach(callback => {
          callback(this.status);
        })
      });
      this.call = call;
    }
  }
}

class MonitoredUsers {
  constructor(presenceClient) {
    this.users = new Map();
    this.presenceClient = presenceClient;
  }

  monitor(username, socketId, callback) {
    if (this.users.has(username)) {
      const user = this.users.get(username);
      user.monitoring.set(socketId, callback);
      callback(user.status);
    } else {
      const user = new MonitoredUser(this.presenceClient, username);
      user.monitoring.set(socketId, callback);
      user.connect();
      this.users.set(username, user);
    }
  }

  unmonitor(username, socketId) {
    if (this.users.has(username)) {
      const user = this.users.get(username);
      user.monitoring.delete(socketId);
      if (user.monitoring.size === 0) {
        user.call.cancel();
        this.users.delete(username);
      }
    }
  }
}

module.exports = (channels, presenceClient) => {
  const onlineUsers = new OnlineUsers(presenceClient);
  const monitoredUsers = new MonitoredUsers(presenceClient);

  debug("Starting presence");

  channels.of("presence", channel => {
    const monitoring = new Set();
    let username = null;

    debug("Received new connection");

    channel.on("connectas", (user) => {
      debug("Connecting as %s", user);
      if (username !== null) {
        debug("Disconnecting %s first", username);
        onlineUsers.disconnect(username);
      }
      username = user;
      onlineUsers.connect(username);
    });

    channel.on("close", () => {
      if (username !== null) {
        debug("%s disconnected", username);
        onlineUsers.disconnect(username);
        monitoring.forEach(user => {
          monitoredUsers.unmonitor(user, channel.id);
        });
      }
    });

    channel.on("error", () => {
      if (username !== null) {
        debug("%s disconnected", username);
        onlineUsers.disconnect(username);
        monitoring.forEach(user => {
          monitoredUsers.unmonitor(user, channel.id);
        });
      }
    });

    channel.on("monitor", user => {
      debug("%s is monitoring %s", username, user);
      monitoring.add(user);
      monitoredUsers.monitor(user, channel.id, status => {
        channel.send(status, user);
      });
    });

    channel.on("unmonitor", user => {
      debug("%s is unmonitoring %s", username, user);
      monitoring.delete(user);
      monitoredUsers.unmonitor(user, channel.id);
    });
  })
};
