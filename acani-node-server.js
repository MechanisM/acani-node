var sys, hash, ws, rc, server;

sys = require('sys');
hash = require(__dirname + '/lib/node_hash/lib/hash');
ws = require(__dirname + '/lib/ws/lib/ws');
rc = require(__dirname + '/lib/redis-node-client/lib/redis-client');
server = ws.createServer();

server.addListener("connection", function (conn) {

  var uid, uid_public, client_sub, client_pub, fSubscribe;

  fSubscribe = function (channel) {
    client_sub.subscribeTo(channel, function (published_channel, published_message, subscription_pattern) {
      console.log("UID: " + uid + " IN CHANNEL: " + published_channel + " WITH PATTERN: " + subscription_pattern + " PUBLISHED MESSAGE: " + published_message);
      var string_msg = '{"timestamp":' + (new Date()).getTime() + ',"sender":"bob","channel":"' + published_channel + '","text":"' + published_message + '"}';
      // var stringified_msg = JSON.stringify({"sender": "bob", "channel": published_channel, "text": published_message});
      // console.log("MESSAGE STRINGIFIED: " + stringified_msg);
      conn.broadcast(encodeURI(string_msg));
    });
  }

  // Callback for incoming messages from client's websocket connection.
  conn.addListener("message", function (message) {
    console.log("MESSAGE: " + message);
    message = decodeURI(message);
    console.log("MESSAGE DECODED: " + message);
    // Receive JSON from websocket client.
    message = JSON.parse(message); // escape special chars first; rescue and return error
    if (!uid && message.uid) {
      console.log("CONNECTING: " + message.uid);
      // CONNECT: the first message after a websocket connection should contain {uid: some-uid}.
      uid = message.uid;
      // Look up public id in mongo.
      uid_public = hash.sha256(uid);
      // Create redis client connections.
      client_sub = rc.createClient();
      client_pub = rc.createClient();
      // Add the current user to list of online users.
      client_pub.sadd("online", uid_public);
      // Pass variables to connection for closing later.
      conn.acani = {
        client_sub: client_sub,
        client_pub: client_pub,
        uid: uid,
        uid_public: uid_public
      };
      // Subscribe to all user's 1-on-1 rooms.
      fSubscribe("*" + uid_public + "*");
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
    } else if (uid && message.text && message.to_uid_public) {
      console.log("SENDING FROM: " + uid + " TO PUBLIC: " + message.to_uid_public + ": " + message.text);
      // message.text = message.text.replace(/\\"/g, "\"");
      // console.log("MESSAGE ESCAPED: " + message.text);
      // SEND TO USER
      client_pub.publish([message.to_uid_public, uid_public].sort().join("_"), message.text);
    } else if (uid && message.text && message.to_room) {
      console.log("SENDING FROM: " + uid + " TO ROOM: " + message.to_room + ": " + message.text);
      // SEND TO ROOM
      client_pub.publish(message.to_room, message.text);
    } else if (uid && message.join_room) {
      console.log("UID: " + uid + " JOINING ROOM: " + message.join_room);
      // JOIN ROOM
      client_pub.sadd(uid + "_rooms", message.join_room);
      fSubscribe(message.join_room);
    } else if (uid && message.leave_room) {
      console.log("UID: " + uid + " LEAVING ROOM: " + message.leave_room);
      // LEAVE ROOM
      client_pub.srem(uid + "_rooms", message.leave_room);
      client_sub.unsubscribeFrom(message.leave_room)
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
      acani.client_pub.srem("online", acani.uid_public);
      acani.client_pub.close();
    }
  }
});

server.listen(8124);
console.log('Server running at http://127.0.0.1:8124/');
