var conn, online_users;

function connect() {
  if (window['WebSocket']) {
    conn = new WebSocket('ws://localhost:8124');

    conn.onmessage = function (evt) {
      var message = JSON.parse(evt.data);

      // Dispatch new messages to their appropriate handlers.
      switch (message.type) {
        case 'login':
          handleLogin(message.status, message.text);
          break;

        case 'logout':
          handleLogout(message.status, message.text);
          break;

        case 'join':
          userJoin(message.username, message.timestamp);
          break;

        case 'part':
          userPart(message.username, message.timestamp);
          break;

        case 'msg':
          addMessage(message.username, message.text, message.timestamp);
          break;
      }
    };
  }
}

// Keep the most recent messages visible
function scrollDown () {
  window.scrollBy(0, 100000000000000000); // change to log section
  $("#entry").focus();
}

//inserts an event into the stream for display
//the event may be a msg, join or part type
//from is the user, text is the body and time is the timestamp, defaulting to now
//_class is a css class to apply to the message, usefull for system events
function addMessage (from, text, time, _class) {
  console.log(message.text);

  if (!text) return;

  if (!time) { // if the time is null or undefined, use the current time
    time = new Date();
  } else if ((time instanceof Date) === false) {
    time = new Date(time); // if it's a timestamp, interpret it
  }

  // Every message you see is actually a div with 3 elements:
  //  the time,
  //  the person who caused the event,
  //  and the content
  var messageElement = $(document.createElement("tr"));

  if (_class)
    messageElement.addClass(_class);

  // sanitize
  text = util.toStaticHTML(text);

  // If the current user said this, add a special css class
  // var nick_re = new RegExp(CONFIG.nick);
  // if (nick_re.exec(text))
  //   messageElement.addClass("personal");

  // replace URLs with links
  text = text.replace(util.urlRE, '<a target="_blank" href="$&">$&</a>');

  var content = '  <td>' + util.timeString(time) + '</td>'
              + '  <td>' + util.toStaticHTML(from) + '</td>'
              + '  <td>' + text  + '</td>';
  messageElement.html(content);

  //the log is the stream that we view
  $("#log").append(messageElement);

  //always view the most recent message when it is added
  scrollDown();
}

// Update the list of users to show all online users (and count).
function updateUsers() {
  if (message['online-users'] &&
        message['online-users'].constructor.toString().indexOf('Array') != -1) {
    $('#online-users > h3 > span').text(message['online-users'].length);
    $('#online-users > ul').html('<li>'+message['online-users'].join('</li><li>')+'</li>');
  }

  var t = online_users.length.toString() + ' user';
  if (online_users.length != 1) t += 's';
  $('#usersLink').text(t);
}

// Handle another user joining chat.
function userJoin(username, timestamp) {
  addMessage(username, 'joined', timestamp, 'join'); // put it in the stream
  // If we already know about this user, ignore it.
  for (var i = 0; i < online_users.length; i++) {
    if (online_users[i] == username) return;
  }
  online_users.push(username); // otherwise, add the user to the list
  updateUsers(); // update the UI
}

// Handle a user leaving.
function userPart(username, timestamp) {
  addMessage(username, 'left', timestamp, 'part'); // put it in the stream
  // Remove the user from the list.
  for (var i = 0; i < online_users.length; i++) {
    if (online_users[i] == username) {
      online_users.splice(i,1)
      break;
    }
  }
  updateUsers(); // update the UI
}

function flashSuccess(message) {
  flashFeedback('success', message);
}

function flashNotice(message) {
  flashFeedback('notice', message);
}

function flashError(message) {
  flashFeedback('error', message);
}

function handleLogin(status, message) {
  if (status === 'success') {
    // updateUsers();
    $('#online-users').show();
    $('#logout').show();
    $('#login').hide();
  }
  flashFeedback(status, message)
}

function handleLogout(status, message) {
  if (status === 'success') {
    $('#online-users').hide();
    $('#login').show();
    $('#logout').hide();
  }
  flashFeedback(status, message)
}

function flashFeedback(status, message) {
  $('p#feedback').attr('class', status).text(message);
}

function openChatWithUser(username) {
  // Open box for direct messaging like gmail does
  alert('open a new chat with user ' + username);
}

$(document).ready(function () {

  connect();

  // Add newline to message if the user holds shift & hits enter.
  var shift_is_down = false;
  $('#entry').keydown(function (e) {
    if (e.keyCode == 16) shift_is_down = true;
  });
  $('#entry').keyup(function (e) {
    if (e.keyCode == 16) shift_is_down = false;
  });

  // Submit new messages when the user hits enter if the message isnt blank.
  $('#entry').keypress(function (e) {
    if (e.keyCode != 13 /* Return */) return;
    var text = $('#entry').attr('value');
    if (shift_is_down) {
      $('#entry').attr('value', text+"\n");
    } else {
      var msg = text.trim();
      if (msg) send(msg);
      $('#entry').attr('value', ''); // clear the entry field.
    }
  });

  // Username validation like http://www.facebook.com/username/
  $('#login :button').click(function () {
    var username = $('#login input:first').val().trim().replace('.', '');

    if (username.length < 2) {
      flashError('Usernames must be at least 2 characters long.');
    } else if (username.match(/[^A-Za-z0-9]/)) {
      flashError('Usernames must only contain A-Z, a-z, 0-9, and periods (.).');
    } else {
      conn.send(JSON.stringify({'uid': username}));
    }
  });

  $('#logout').click(function () {
    conn.send('{"logout": "logout"}');
  });

  $('#online-users > ul > li').click(function () {
    openChatWithUser($(this).text());
  });
});
