var sys, hash, ws, rc, server, redis_port, chat_port;

redis_port = 6391;
chat_port = 8124;
sys = require('sys');
hash = require(__dirname + '/lib/node_hash/lib/hash');
ws = require(__dirname + '/lib/ws/lib/ws');
rc = require(__dirname + '/lib/redis-node-client/lib/redis-client');
server = ws.createServer();

server.addListener("connection", function (conn) {

  var uid, client_sub, client_pub, fSubscribe;

  fSubscribe = function (channel) {
    client_sub.subscribeTo(channel, function (published_channel, published_message, subscription_pattern) {
      console.log("UID: " + uid + " IN CHANNEL: " + published_channel + " WITH PATTERN: " + subscription_pattern + " PUBLISHED MESSAGE: " + published_message);
      conn.broadcast(published_message);
    });
  }

  // Callback for incoming messages from client's websocket connection.
  conn.addListener("message", function (message) {
    console.log("MESSAGE: " + message);
    // Receive JSON from websocket client.
    message = JSON.parse(message); // rescue and return error
    if (!uid && message.uid.trim()) {
      // CONNECT: the first message after a websocket connection should contain {uid: some-uid}.
      uid = message.uid.trim();
      console.log("CONNECTING: " + uid);
      // Create redis client connections.
      client_sub = rc.createClient(redis_port);
      client_pub = rc.createClient(redis_port);
      // "Login" user and add to current list of online users.
      client_pub.sadd("online", uid, function (err, is_online) {
        if (is_online === 1) {
          // Pass variables to connection for closing later.
          conn.acani = {
            client_sub: client_sub,
            client_pub: client_pub,
            uid: uid
          };
          // Subscribe to all user's 1-on-1 rooms.
          fSubscribe("*" + uid + "*");
          // Subscribe to all user's other rooms.
          client_pub.smembers(uid + "_rooms", function (err, members) {
            var i;
            if (!err && members) {
              rc.convertMultiBulkBuffersToUTF8Strings(members);
              for (i = 0; i < members.length; i++) {
                console.log("SUBSCRIBING UID: " + uid + " TO: " + members[i]);
                fSubscribe(members[i]);
              }
            }
          });
        } else {
          console.log("UID ALREADY TAKEN");
          uid = undefined;
          // Send error back to client.
          client_pub.close();
          client_sub.close();
          conn.write(JSON.stringify({"error": "Sorry, that uid is already in use."}));
        }
      });
    } else if (uid && message.text && message.to_uid) {
      console.log("SENDING FROM: " + uid + " TO PUBLIC: " + message.to_uid + ": " + message.text);
      // SEND TO USER
      client_pub.publish([message.to_uid, uid].sort().join("_"), JSON.stringify(message));
    } else if (uid && message.text && message.to_room) {
      console.log("SENDING FROM: " + uid + " TO ROOM: " + message.to_room + ": " + message.text);
      // SEND TO ROOM
      client_pub.publish(message.to_room, JSON.stringify(message));
    } else if (uid && message.join_room) {
      console.log("UID: " + uid + " JOINING ROOM: " + message.join_room);
      // JOIN ROOM
      client_pub.sadd(uid + "_rooms", message.join_room);
      fSubscribe(message.join_room);
    } else if (uid && message.leave_room) {
      console.log("UID: " + uid + " LEAVING ROOM: " + message.leave_room);
      // LEAVE ROOM
      client_pub.srem(uid + "_rooms", message.leave_room);
      client_sub.unsubscribeFrom(message.leave_room);
    } else {
      console.log("MESSAGE NOT PROCESSED: " + JSON.stringify(message));
    }
  });
});

server.addListener("close", function (conn) {
  var acani = conn.acani;
  if (acani) {
    // Close redis connections.
    if (acani.client_sub) {
      acani.client_sub.close();
    }
    if (acani.client_pub) {
      // Remove user from list of online users.
      acani.client_pub.srem("online", acani.uid);
      acani.client_pub.close();
    }
  }
});

server.listen(chat_port);
console.log('Server running at http://127.0.0.1:' + chat_port + '/');
