FROM node:12.16.3-buster-slim

WORKDIR /opt/presence
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run prestart
EXPOSE 8080
ENV DEBUG=cloudstate*
ENTRYPOINT [ "npm", "run", "start-no-prestart" ]
