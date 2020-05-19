# Because the gateway depends on files outside of its directory,
# it's docker build has to run from the project root directory
# as its context. Make sure to specify a context of .. when running
# the docker build.
FROM node:12.16.3
RUN mkdir -p /opt/gateway /opt/presence /opt/friends
COPY gateway/package*.json /opt/gateway/
RUN cd /opt/gateway; npm install
COPY gateway /opt/gateway
COPY presence/presence.proto /opt/presence/
COPY friends/friends.proto /opt/friends/
WORKDIR /opt/gateway
ENV DEBUG=cloudstate*
EXPOSE 8080
ENTRYPOINT [ "npm", "start" ]
