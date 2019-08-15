const express = require("express");
const app = express();
const server = require("http").createServer(app);
const WebSocket = require('ws');
const debug = require("debug")("cloudstate-sample-gateway");

const grpc = require("grpc");
const protoLoader = require("@grpc/proto-loader");

const ws = new WebSocket.Server({ server });

let service;
if (process.argv.length > 2) {
  service = process.argv[2];
} else {
  service = "127.0.0.1:9000"
}

debug("Connecting to presence service at %s", service);

const descriptor = grpc.loadPackageDefinition(protoLoader.loadSync("../presence/presence.proto"));
const presenceClient = new descriptor.cloudstate.samples.chat.presence.Presence(service, grpc.credentials.createInsecure());

app.use(express.static("public"));

const Channels = require("./channels");
const channels = new Channels(ws);

require("./presence")(channels, presenceClient);

server.listen(3000);
console.log("Gateway running on " + server.address().address + ":" + server.address().port);
