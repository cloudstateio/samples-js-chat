# Cloudstate samples

## Chat Presence service - Javascript implementation

This is an implementation of the presence service, which is part of Lightbend Cloudstate Chat sample.

The user code is written in Javascript and runs as a node.js server

### Preparing to build

Install npm then set up the build.

`npm install`

### Build the application and Docker image

```
npm run prestart 
DOCKER_PUBLISH_TO=[YOUR DOCKER REGISTRY] npm run dockerbuild
```

### Push the image

```
npm run prestart 
DOCKER_PUBLISH_TO=[YOUR DOCKER REGISTRY] npm run dockerpush
```

### Basic Testing

One way to test your service is to run it in a Docker container, and have it connect to the Cloudstate side-car (also known as Cloudstate proxy). The following steps will allow you test the presence after you have built the Docker image.

```
docker run -it --rm --network mynetwork --name cloudstate -p 9000:9000 cloudstateio/cloudstate-proxy-dev-mode -Dcloudstate.proxy.user-function-port=8080 -Dcloudstate.proxy.user-function-interface=samples-js-chat-presence
docker run -it --rm --name java-presence --network mynetwork [YOUR DOCKER REGISTRY]/samples-js-chat-presence
```

Now you can test the service over port 9000 using grpcurl or using a gRPC library of your choice to write integration tests.
