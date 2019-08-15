# CloudState js-chat sample application

This is a sample application demoing using CloudState to build a chat application in Node.js.

Currently, there's only one feature, user presence, but in future we will add chat room support, push notifications for chat messages, etc.

The application has two components, a presence stateful function, which uses a vote CRDT to store whether a user is currently online or not, and a gateway, which is an express/ws application, that serves a UI.

The UI is designed to allow connecting as multiple users in one browser window, this is for demonstration purposes, to make it straight forward to see real time interactions, serverside pushes etc, without needing to open many browser tabs.

## Running in Docker

The application can be run locally using Docker, without Kubernetes. To do this, run the following commands:

```bash
docker run --rm -d -p 3000:3000 --name gateway \
  cloudstateio/samples-js-chat-gateway:latest
docker run --rm -d --network container:gateway \
  --name presence cloudstateio/samples-js-chat-presence:latest
docker run --rm -d --network container:gateway \
  --name proxy cloudstateio/cloudstate-proxy-dev-mode:latest
```

Now you can visit the app by going to http://localhost:3000 in your browser. You can view the logs of the precense stateful fuction by running `docker logs presence -f`.

The above commands do the folowing:

1. First the gateway is started, with port 3000 exposed on your host. The gateway is started first because it is what is exposing the port that it connects.
2. Then the presence stateful function is started. It is configured to use the gateways network namespace.
3. Finally, the CloudState proxy is started. The dev-mode proxy starts a single node cluster. It listens on port 9000, which the gateway will connect to by default, and connects to the presence stateful function on port 8080.

To stop everything, run:

```
docker stop gateway presence proxy
```

## Running in Kubernetes

To run in Kubernetes you'll first need to install the CloudState operator. It's also recommended that you install Istio, version 1.2.0 is the minimum supported version. Istio is not absolutely necessary, however because CloudState uses gRPC, load balancing doesn't tend to work very well without a service mesh that understands HTTP/2, and can balance requests within a single HTTP/2 connection across many nodes.

Istio can be installed by following the [Istio documentation](https://istio.io/docs/setup/kubernetes/). Ensure that you enable Istio injection on whichever namespaces you're using.

CloudState can be installed according to the instructions [here](https://github.com/cloudstateio/cloudstate).

tba
