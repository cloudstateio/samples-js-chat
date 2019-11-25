# CloudState js-chat sample application

This is a sample application demoing using CloudState to build a chat application in Node.js.

Currently, there are two features, user presence, and friends, but in future we will add chat room support, push notifications for chat messages, etc.

The application has three components, a presence stateful function, which uses a vote CRDT to store whether a user is currently online or not, a friends stateful function, which uses an ORSet CRDT to store a users friends, and a gateway, which is an express/ws application, that serves a UI. The gateway is not a Cloudstate service, it simply serves as a simple way to demonstrate the Cloudstate services in action.

The UI is designed to allow connecting as multiple users in one browser window, this is for demonstration purposes, to make it straight forward to see real time interactions, serverside pushes etc, without needing to open many browser tabs. Each user is a separate iframe with a separate websocket connection.

## Running in Kubernetes

To run in Kubernetes you'll first need to install the CloudState operator. It's also recommended that you install Istio, version 1.2.0 is the minimum supported version. Istio is not absolutely necessary, however because CloudState uses gRPC, load balancing doesn't tend to work very well without a service mesh that understands HTTP/2, and can balance requests (streams) within a single HTTP/2 connection across many nodes.

### Installing Istio

Istio can be installed by following the [Istio documentation](https://istio.io/docs/setup/getting-started/). Ensure that you enable Istio injection on whichever namespaces you're using. To get started quickly with a default Istio install, simply run:

```sh
ISTIO_VERSION=1.4.0 curl -L https://istio.io/downloadIstio | sh -
cd istio-1.4.0
bin/istioctl manifest apply --set profile=default
```

And to enable sidecar injection on the default namespace:

```sh
kubectl label namespace default istio-injection=enabled
```

### Installing Cloudstate

To install Cloudstate, run the following:

```sh
kubectl create namespace cloudstate
kubectl apply -n cloudstate -f https://github.com/cloudstateio/cloudstate/releases/download/v0.5.0/cloudstate-0.5.0.yaml
```

### Installing the chat application

Now, let's start by installing the gateway and presence service by running the following:

```sh
kubectl apply -f https://raw.githubusercontent.com/cloudstateio/samples-js-chat/master/deploy/presence.yaml
kubectl apply -f https://raw.githubusercontent.com/cloudstateio/samples-js-chat/master/deploy/gateway.yaml
```

You may wish to scale the presence service up, to see that it works on multiple nodes:

```sh
kubectl scale deploy/presence-deployment --replicas 3
```

Now you need to expose the service. The best way to do this, when using Istio, is to expose it through an ingress gateway. But for the purposes of this tutorial, it's easier to just use a Kubernetes TCP `LoadBalancer` `Service`:

```sh
kubectl expose deployment gateway --type=LoadBalancer
```

Now, watch the created service, and when it gets assigned an external IP, we can now use it, by opening `http://<external-ip>:3000` in a browser.

As described above, the main index allows opening multiple chat window iframes. You can connect as multiple users, each user is represented by a websocket connection to one of the backend nodes. You can see those users statuses monitored.

To understand what you are observing here - the presence service is using a Conflict-free Replicated Data Type (CRDT) to replicate the current online state of all users across all the deployed nodes. No database is needed, the Cloudstate proxies form a cluster and gossip this state efficiently to one another, making it available for the code of the presence service to update, interrogate, and subscribe to changes for the purpose of push notifications.

### Developing a new service

Let's develop a new stateful service that stores the list of users that a user is monitoring, so that when they disconnect, and reconnect, that list can be restored. We will store this using another CRDT, this time using an [ORSet](https://cloudstate.io/docs/user/features/crdts.html#crdts-available-in-cloudstate) to store these users. We'll implement it using JavaScript, and we'll call it the friends service.

The web gateway has already been implemented to use this service, if it's available. We just need to implement it. Note that this tutorial is not going to go into all the details of what Cloudstate is and how it works, the [documentation](https://cloudstate.io/docs/user/features/index.html) is a good place to start if you want to understand that.

First create the npm `package.json` file:

```json
{
  "dependencies": {
    "cloudstate": "0.0.1"
  },
  "scripts": {
    "prestart": "compile-descriptor friends.proto",
    "start": "node index.js",
    "start-no-prestart": "node index.js"
  }
}
```

We've defined a `prestart` method that compiles the gRRC descriptor (that we'll create in a moment), and a `start` method that will run our entity. We've also defined a `start-no-prestart` method, this will be used by our Docker image to run it without compiling the descriptor each time. Speaking of Docker, let's also create a `Dockerfile`:

```dockerfile
FROM node:8.15

WORKDIR /opt/friends
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run prestart
EXPOSE 8080
ENTRYPOINT [ "npm", "run", "start-no-prestart" ]
```

And an accompanying `.dockerignore` file that ignores the `node_modules` directory and npm log file, this ensures that `node_modules` is not part of the layer that will change every time we make a code change, minimising the docker image size:

```
node_modules
npm-debug.log
```

Now that we're setup, the first thing to do is create the gRPC interface that our friends service will implement. Create a file called `friends.proto` with the following content:

```proto
syntax = "proto3";

import "cloudstate/entitykey.proto";

package cloudstate.samples.chat.friends;

message Friend {
    string user = 1 [(.cloudstate.entity_key) = true];
    string friend = 2;
}

message User {
    string user = 1 [(.cloudstate.entity_key) = true];
}

message FriendsList {
    repeated string friends = 1;
}

message Empty {
}

service Friends {
    rpc Add(Friend) returns (Empty);
    rpc Remove(Friend) returns (Empty);
    rpc GetFriends(User) returns (FriendsList);
}
```

This is a fairly unremarkable interface, it supports adding friends, removing friends and getting a list of friends. The one thing that is not standard is the use of `cloudstate.entity_key` annotations. This indicates to the Cloudstate proxy how to determine which entity an incoming request is for. In the above example, the `user` field on the `User` and `Friend` messages iss annotated with this, indicating our entities are identified by the user that owns them. When the proxy passes the request on to our code, it will enrich it with the current state of the CRDT for that entity.

Now we create the code. Open a file called `index.js`. First some setup code:

```js
const crdt = require("cloudstate").crdt;

const entity = new crdt.Crdt(
  "friends.proto",
  "cloudstate.samples.chat.friends.Friends"
);

entity.defaultValue = () => new crdt.ORSet();
```

We've imported the Cloudstate CRDT support, created a new CRDT entity that is served by the `Friends` grpc service in `friends.proto`, and we've set a default value for the entity, should a command come in and no CRDT has yet been created for it - in this case, the default value is an empty ORSet.

Now we'll define some command handlers:

```js
function add(friend, ctx) {
  ctx.state.add(friend.friend);
  return {};
}

function remove(friend, ctx) {
  ctx.state.delete(friend.friend);
  return {};
}

function getFriends(user, ctx) {
  return {
    friends: Array.from(ctx.state)
  };
}
```

It's just a set, the first parameter passed in to each handler is the gRPC method parameter, for `add` and `remove` that's a `Friend` message containing the friend to add or remove. The second parameter is the context, this, among other things, holds the current CRDT state (ie, the ORSet that we created before as the default value).

Finally, we'll wire this command handlers up and start the gRPC server that will serve the entity:

```js
entity.commandHandlers = {
  Add: add,
  Remove: remove,
  GetFriends: getFriends
};

entity.start();
```

And now we're done, we just need to build and deploy. Build and push the docker image, you'll need to replace `DOCKER_REGISTRY` below with a registry that you have push access to and the Kubernetes installation that you're using can pull from:

```bash
export DOCKER_REGISTRY=cloudstateio

docker build -t ${DOCKER_REGISTRY}/samples-js-chat-friends:latest .
docker push ${DOCKER_REGISTRY}/samples-js-chat-friends:latest
```

Now create a `StatefulService` descriptor for the friends service in a file called `friends.yaml`, being sure to update the image to use the docker registry you pushed to:

```yaml
apiVersion: cloudstate.io/v1alpha1
kind: StatefulService
metadata:
  name: friends
spec:
  containers:
  - image: cloudstateio/samples-js-chat-friends:latest
    env:
    - name: DEBUG
      value: cloudstate*
```

The `DEBUG` environment variable is optional, but enables some Cloudstate debug logging which may be interesting to see. Deploy this:
 
```bash
kubectl apply -f friends.yaml
``` 
 
Now go back to your browser. Now when you start monitoring a person, then disconnect, and reconnect, you should see your friends list come back. You may wish to scale the service up to see that it actually is replicating the state across multiple nodes:

```bash
kubectl scale deploy/friends-deployment --replicas 3
```

As an interesting side exercise to try, update the docker image to `cloudstateio/samples-java-chat-friends:latest`. This is a Java implementation of the friends service. Kubernetes will perform a rolling upgrade of the deployment. After that is complete (and, during the upgrade too), you should see that your friends list is still there, in spite of the fact that you have not deployed a database. The state was replicated from the JavaScript nodes to the Java nodes during the rolling upgrade. So, we just switched out a JavaScript based in memory store of friends with a Java based in memory store, without losing the state. This demonstrates a truly polyglot replicated state management solution.
