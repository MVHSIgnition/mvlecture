const os = require('os');
const { exec } = require('child_process');
const fetch = require('node-fetch');
const fs = require('fs');
const logStream = fs.createWriteStream('./logs.txt', { flags: 'a' });

function generateDescription(bookmarks) {
  let text = '';

  if (bookmarks.length !== 0) {
    text += 'Bookmarks:\n';

    for (let i = 0; i < bookmarks.length; i++) {
      let b = bookmarks[i];
      text += `${b.name} — ${b.time}\n`;
    }

    text += '\n\n';
  }

  text += 'Written by the Ignition Club\n\nMain project leads: Jonathan Liu and Erik Zhang\nProject Manager: Erik Zhang\nSoftware: Jonathan Liu and Arjun Patrawala\nHardware: Ian Schneider';

  return text;
}

function log(text, shouldPrint) {
  text = '\n' + (new Date()).toString() + '\n' + text;
  logStream.write(text);
  if (shouldPrint)
    console.log(text);
}

function printYellow(string) {
  console.log('\x1b[33m%s\x1b[0m', string);
}

function indexOfMultiple(source, find, start) {
  if (!source) {
    return [];
  }
  // if find is empty string return all indexes.
  if (!find) {
    return source.split('').map((_, i) => i);
  }
  var result = [];
  for (let i = start; i < source.length; ++i) {
    if (source.substring(i, i + find.length) == find) {
      result.push(i);
    }
  }
  return result;
}

function execp(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, (error, stdout, stderr) => {
      resolve({ error, stdout, stderr });
    });
  });
}

function getLanIpAddress() {
  let ifaces = os.networkInterfaces();

  for (let each in ifaces) {
    for (let a of ifaces[each]) {
      if (a.family === 'IPv4' && !a.internal) {
        return a.address;
      }
    }
  }
}

function updateTitleAndDescription(stream, title, oauthToken) {
  return fetch('https://www.googleapis.com/youtube/v3/liveBroadcasts?part=id,snippet', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + oauthToken,
    },
    body: JSON.stringify({
      id: stream.youtubeId,
      snippet: {
        title,
        description: generateDescription(stream.bookmarks),
        scheduledStartTime: stream.scheduledStartTime,
      }
    })
  }).then(res => res.json()).then(data => {
    if (!data.error) {
      stream.title = title;
    }

    return data;
  });
}

function addVideoToPlaylist(videoId, playlistId, oauthToken) {
  return fetch('https://www.googleapis.com/youtube/v3/playlistItems?part=snippet', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + oauthToken
    },
    body: JSON.stringify({
      snippet: {
        playlistId,
        resourceId: {
          kind: 'youtube#video',
          videoId
        }
      }
    })
  }).then(res => res.json());
}

module.exports = {
  generateDescription,
  indexOfMultiple,
  execp,
  getLanIpAddress,
  updateTitleAndDescription,
  addVideoToPlaylist,
  log,
  printYellow
}
