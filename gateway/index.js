const express = require("express");
const app = express();
const server = require("http").createServer(app);
const WebSocket = require('ws');
const debug = require("debug")("cloudstate-sample-gateway");

const grpc = require("grpc");
const protoLoader = require("@grpc/proto-loader");

const ws = new WebSocket.Server({ server });

let presenceService;
if (process.env.PRESENCE) {
  presenceService = process.env.PRESENCE;
} else {
  presenceService = "presence:80";
}

debug("Connecting to presence service at %s", presenceService);

let friendsService;
if (process.env.FRIENDS) {
  friendsService = process.env.FRIENDS;
} else {
  friendsService = "friends:80";
}

debug("Connecting to friends service at %s", friendsService);

const descriptor = grpc.loadPackageDefinition(protoLoader.loadSync(["../presence/presence.proto", "../friends/friends.proto"]));
const presenceClient = new descriptor.cloudstate.samples.chat.presence.Presence(presenceService, grpc.credentials.createInsecure());
const friendsClient = new descriptor.cloudstate.samples.chat.friends.Friends(friendsService, grpc.credentials.createInsecure());

app.use(express.static("public"));

const Channels = require("./channels");
const channels = new Channels(ws);

require("./presence")(channels, presenceClient, friendsClient);

server.listen(3000);
console.log("Gateway running on " + server.address().address + ":" + server.address().port);
