var sys, hash, ws, rc, server, redis_port, node_port;

redis_port = 6391;
node_port = 8124;
sys = require('sys');
hash = require(__dirname + '/lib/node_hash/lib/hash');
ws = require(__dirname + '/lib/ws/lib/ws');
rc = require(__dirname + '/lib/redis-node-client/lib/redis-client');
server = ws.createServer();

server.addListener("connection", function (conn) {
  console.log("CONNECTED");

  var uid, redis_sub, redis_all, fSubscribe;

  fSubscribe = function (channel) {
    redis_sub.subscribeTo(channel, function (published_channel, published_message, subscription_pattern) {
      console.log("UID: " + uid + " IN CHANNEL: " + published_channel + " WITH PATTERN: " + subscription_pattern + " PUBLISHED MESSAGE: " + published_message);
      conn.broadcast(published_message);
    });
  };

  // Callback for incoming messages from client's websocket connection.
  conn.addListener("message", function (message) {
    console.log("MESSAGE: " + message);

    // Receive JSON from websocket client.
    message = JSON.parse(message); // rescue and return error

    if (message.uid !== undefined) { // trying to login
      message.uid = message.uid.trim();
      if (message.uid === '') {
        conn.write('{"error": "User ID must not be blank."}');
      } else if (!message.uid.match(/^[a-zA-Z0-9]+$/)) {
        conn.write('{"error": "User ID must be alphanumeric."}');
      } else if (!uid) { // not yet logged in
        redis_all = rc.createClient(redis_port);
        redis_all.sismember('online', message.uid, function (err, is_online) {
          if (err) {
            conn.write(JSON.stringify({"error": 'Error determining if ' + message.uid + ' is online! ' + err}));
          } else if (is_online) {
            console.log("USER ID ALREADY TAKEN");
            conn.write(JSON.stringify({"error": "Sorry, that user ID is already in use."}));
          } else {
            // CONNECT:
            // the first message after a websocket connection should contain {uid: some-uid}.
            uid = message.uid;
            console.log("CONNECTING: " + uid);

            // Create redis client connections.
            redis_sub = rc.createClient(redis_port);

            // "Login" user and add to current list of online users.
            redis_all.sadd("online", uid, function (err, is_online) {
              if (err) {
                conn.write(JSON.stringify({"error": 'Error logging in! ' + err}));
              } else if (is_online) { // pass variables to connection for closing later
                conn.acani = {
                  redis_sub: redis_sub,
                  redis_all: redis_all,
                  uid: uid
                };
                conn.write(JSON.stringify({
                  "success": 'You\'re now logged in as: ' + uid,
                  "login": true
                }));

                // Get online users & write to client
                redis_all.smembers('online', function (err, online_users) {
                  if (err) {
                    conn.write(JSON.stringify({"error": 'Error getting online users! ' + err}));
                  } else if (online_users) {
                    conn.write('{"online-users":["' + online_users.join('","') + '"]}');
                  }
                });

                fSubscribe("*" + uid + "*"); // subscribe to all user's 1-on-1 rooms

                // Subscribe to all user's other rooms.
                redis_all.smembers(uid + "_rooms", function (err, members) {
                  if (err) {
                    conn.write(JSON.stringify({"error": 'Error subscribing to rooms! ' + err}));
                  } else if (members) {
                    rc.convertMultiBulkBuffersToUTF8Strings(members);
                    var i;
                    for (i = 0; i < members.length; i++) {
                      console.log("SUBSCRIBING UID: " + uid + " TO: " + members[i]);
                      fSubscribe(members[i]);
                    }
                  }
                });
              }
            });            
          }
        });
      } else {
        console.log("ALREADY LOGGED IN AS: " + uid);
        conn.write(JSON.stringify({"error": 'You\'re already logged in as: ' + uid}));
      }
    } else if (message.logout) { // trying to logout
      var acani = conn.acani;
      if (acani) {
        conn.write(JSON.stringify({
          "success": uid + ' has logged out.',
          "logout": true
        }));

        // Close redis connections.
        if (acani.redis_sub) {
          acani.redis_sub.close();
        }
        if (acani.redis_all) {
          // Remove user from list of online users.
          acani.redis_all.srem("online", acani.uid);
          acani.redis_all.close();
        }
        console.log(acani.uid + " HAS LOGGED OUT");
        conn.acani = undefined;
        uid = undefined; // logout user
      } else {
        console.log("NOT LOGGED IN");
        conn.write(JSON.stringify({"error": "You're not logged in."}));
      }
    } else { // default
      console.log("MESSAGE NOT PROCESSED: " + JSON.stringify(message));
    }
  });
});

server.addListener("close", function (conn) {
  console.log("DISCONNECTED");
  var acani = conn.acani;
  if (acani) {
    // Close redis connections.
    if (acani.redis_sub) {
      acani.redis_sub.close();
    }
    if (acani.redis_all) {
      // Remove user from list of online users.
      acani.redis_all.srem("online", acani.uid);
      acani.redis_all.close();
    }
    console.log(acani.uid + " HAS LOGGED OUT");
    conn.acani = undefined;
    uid = undefined; // logout user
  }
});

server.listen(node_port);
console.log('Server running at http://127.0.0.1:' + node_port + '/');
