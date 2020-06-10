/*
 * Copyright 2019 Lightbend Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */


const crdt = require("cloudstate").crdt;

const entity = new crdt.Crdt(
  "presence.proto",
  "cloudstate.samples.chat.presence.Presence"
);

entity.commandHandlers = {
  Connect: connect,
  Monitor: monitor
};

/**
 * Connect a user, to make their presence active.
 *
 * This is a streamed call. As long as a user (id given by the entity id) is connected
 * to it, they are considered to be online.
 *
 * Here we use a Vote CRDT, which if at least one node votes is true, will be true.
 * So when the user connects, we invoke the connect() method (which we have defined
 * by enriching the CRDT in onStateSet), which will manage our vote accordingly.
 *
 * When they disconnect, the onStreamCancel callback is invoked, and we disconnect,
 * removing our vote if this is the last connection to this CRDT.
 */
function connect(user, ctx) {
  if (ctx.streamed) {
    ctx.onStreamCancel = state => {
      state.disconnect();
    };
    ctx.state.connect();
  }
}

/**
 * User presence monitoring call.
 *
 * This is a streamed call. We add a onStateChange callback, so that whenever the CRDT
 * changes, if the online status has changed since the last message we pushed, we push
 * it.
 */
function monitor(user, ctx) {
  let online = ctx.state.atLeastOne;
  if (ctx.streamed) {
    ctx.onStateChange = state => {
      if (online !== state.atLeastOne) {
        online = state.atLeastOne;
        console.log("onStateChange: "+user.name + " return {"+online+"}");
        return {online};
      }
    };
  }
  console.log("monitor: "+user.name + " return {"+online+"}");
  return {online};
}

/**
 * This avoids having to do a null check on the state in each of the commands,
 * instead when there is no state, this will be invoked instead.
 */
entity.defaultValue = () => new crdt.Vote();

/**
 * This is invoked whenever a new state is created, either by the default value
 * handler above, or when the server pushes a new state. This is provided to allow
 * us to configure the CRDT, or enrich it with additional non replicated state, in this
 * case, for the vote CRDT, we add the number of users connected to this node to it,
 * so that only remove our vote when that number goes down to zero, along with
 * connect/disconnect functions for managing the users and updating the vote
 * accordingly.
 */
entity.onStateSet = state => {
  state.users = 0;
  // Enrich the state with callbacks for users connected
  state.connect = () => {
    state.users += 1;
    if (state.users === 1) {
      state.vote = true;
    }
  };
  state.disconnect = () => {
    state.users -= 1;
    if (state.users === 0) {
      state.vote = false;
    }
  };
};

// Export the entity
module.exports = entity;
