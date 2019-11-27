const os = require('os');
const { exec } = require('child_process');
const fetch = require('node-fetch');

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

    text += 'Written by the Ignition Club\n\nMain project leads:\n    Jonathan Liu and Erik Zhang\nProject Manager:\n    Erik Zhang\nSoftware:\n    Jonathan Liu and Arjun Patrawala\nHardware:\n    Ian Schneider';

    return text;
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
  for (i = start; i < source.length; ++i) {
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

function updateTitleAndDescription(title, oauthToken) {
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
  addVideoToPlaylist
}