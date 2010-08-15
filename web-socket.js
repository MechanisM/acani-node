var ws = require(__dirname + '/lib/ws/lib/ws'),
    server = ws.createServer();

server.addListener("connection", function(conn){
  conn.addListener("message", function(message){
    message = JSON.parse(message);
    message['id'] = conn.id;
    conn.broadcast(JSON.stringify(message));
    console.log('Message received'+message);
  });
});

server.addListener("close", function(conn){
  conn.broadcast(JSON.stringify({'id': conn.id, 'action': 'close'}));
});

server.listen(8124);
console.log('Server running at http://127.0.0.1:8124/');
