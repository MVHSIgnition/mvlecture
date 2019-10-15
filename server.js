const express = require('express');
const app = express();
const http = require('http').createServer(app);
const fetch = require('node-fetch');
const { exec } = require('child_process');
const { generateDescription } = require('./helpers.js');

const FileCleaner = require('cron-file-cleaner').FileCleaner;
const io = require('socket.io')(http);

app.use(express.json());
app.use(express.static(__dirname + '/static/'))

const localVideoDirName = __dirname + '/videos/';

let stream = null;
clearStream();

function getLanIpAddress() {
  let os = require('os');
  let ifaces = os.networkInterfaces();

  for (let each in ifaces) {
    for (let a of ifaces[each]) {
      if (a.family === 'IPv4' && !a.internal) {
        return a.address;
      }
    }
  }
}

function clearStream() {
  stream = {
    isStreaming: false,

    // user provided values
    bookmarks: [],

    // google provided values
    streamId: null,
    youtubeId: null,
    rtmpAddr: null,
    startTime: null,
    uiState: {
      title: '',
      addDate: false,
      playlist: 0,
      bookmarkName: ''
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

function streamUpdated() {
  io.emit('update state', { stream });  
}

// socket.io
io.on('connection', (socket) => {
  streamUpdated();

  socket.on('title changed', title => {
    stream.uiState.title = title;
    streamUpdated();
  });

  socket.on('date checkbox changed', checked => {
    stream.uiState.addDate = checked;
    streamUpdated();
  });

  socket.on('playlist select changed', index => {
    stream.uiState.playlist = index;
    streamUpdated();
  });

  socket.on('bookmark name changed', value => {
    stream.uiState.bookmarkName = value;
    streamUpdated();
  });
});

// bookmarks api
app.post('/api/set-bookmarks', async (req, res) => {
  if (!stream.isStreaming) {
    return res.send({
      success: false,
      error: 'not_streaming'
    });
  }

  if (typeof req.body.bookmarks !== 'object') {
    return res.send({
      success: false,
      error: 'missing_data'
    });
  }

  stream.bookmarks = req.body.bookmarks;

  res.send({
    success: true
  });

  stream.uiState.bookmarkName = '';
  streamUpdated();

  await updateTitleAndDescription(stream.title, req.body.oauthToken);
});

app.post('/api/update-stream', async (req, res) => {

  if (!stream.isStreaming) {
    return res.send({
      success: false,
      error: 'not_streaming'
    });
  }

  let { oauthToken } = req.body;

  if (!oauthToken) {
    return res.send({
      success: false,
      error: 'no_oauth_token'
    })
  }

  let data = await updateTitleAndDescription(req.body.title, oauthToken);

  if (data.error) {
    return res.send({
      success: false,
      error: data.error
    });
  }

  res.send({ success: true });

  streamUpdated();
});

// streaming apis
app.post('/api/init-stream', async (req, res) => {
  if (stream.isStreaming) {
    return res.send({ success: false, error: 'already_streaming' });
  }

  // get and validate data from frontend
  let {
    oauthToken,
    title,
    playlistId
  } = req.body;

  if (!title || !oauthToken) {
    return res.send({
      success: false,
      error: 'missing_data'
    });
  }

  stream.title = title;

  // create livestream rtmpAddr 
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + oauthToken,
  }

  let data = await fetch('https://www.googleapis.com/youtube/v3/liveStreams?part=snippet,cdn', {
    method: 'POST',
    headers: headers,
    body: JSON.stringify({
      snippet: {
        title
      },
      cdn: {
        resolution: 'variable',
        frameRate: 'variable',
        ingestionType: 'rtmp'
      }
    })
  });
  data = await data.json();

  if (data.error) {
    return res.send({ success: false, error: data.error });
  }

  // set backend state with google-provided streaming values
  stream.streamId = data.id;
  stream.rtmpAddr = data.cdn.ingestionInfo.ingestionAddress + '/' + data.cdn.ingestionInfo.streamName;


  // create livestream on youtube channel
  stream.scheduledStartTime = new Date().toISOString();
  data = await fetch('https://www.googleapis.com/youtube/v3/liveBroadcasts?part=snippet,status,contentDetails', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      snippet: {
        scheduledStartTime: stream.scheduledStartTime,
        title
      },
      status: {
        privacyStatus: 'public'
      },
      contentDetails: {
        recordFromStart: true,
        enableAutoStart: true
      }
    }),
  });
  data = await data.json();

  if (data.error) {
    return res.send({ success: false, error: data.error });
  }

  stream.youtubeId = data.id;

  // bind the youtube livestream with rtmpAddr
  data = await fetch(`https://www.googleapis.com/youtube/v3/liveBroadcasts/bind?id=${stream.youtubeId}&part=id&streamId=${stream.streamId}`, {
    method: 'POST',
    headers
  });
  data = await data.json();
  stream.startTime = Date.now();

  // add to playlist
  if (playlistId)
    await addVideoToPlaylist(stream.youtubeId, playlistId, oauthToken);


  // spin-up ffmpeg to begin feeding video and audio the rtmp url
  const webcam1 = {
    name: 'Logitech Webcam C930e',
    resolution: '1920x1080',
    framerate: 30,
  };
  const micName = 'Microphone (Realtek High Definition Audio)';
  
  /*const webcam1 = {
    name: 'HD WebCam',
    resolution: '1280x720',
    framerate: 30,
  };
  const micName = 'Microphone Array (Realtek High Definition Audio(SST))';*/

  const localVideoFilename = localVideoDirName + title.replace(/[^a-z0-9]/gi, '_').toLowerCase() + '.mkv';

  //const cmd = `ffmpeg -y -f dshow -video_size ${webcam1.resolution} -framerate ${webcam1.framerate} -i video="${webcam1.name}":audio="${micName}" -i ./img/ignition_small.png -filter_complex "[0:v]transpose=2,transpose=2[v0_upsidedown];[v0_upsidedown][1:v]overlay=W-w:H-h[vid];[vid]split=2[vid1][vid2]" -map [vid1] -map 0:a -preset veryfast ${localVideoFilename} -map [vid2] -map 0:a -copyts -c:v libx264 -preset veryfast -maxrate 1984k -bufsize 3968k -g 60 -c:a aac -b:a 128k -ar 44100 -f flv "${stream.rtmpAddr}"`;
  const cmd = `ffmpeg -y -f dshow -video_size ${webcam1.resolution} -framerate ${webcam1.framerate} -i video="${webcam1.name}":audio="${micName}" -i ./img/ignition_small.png -filter_complex "[0:v]transpose=2,transpose=2[v0_upsidedown];[v0_upsidedown][1:v]overlay=W-w:H-h[vid]" -map [vid] -map 0:a -copyts -c:v libx264 -preset veryfast -maxrate 1984k -bufsize 3968k -g 60 -c:a aac -b:a 128k -ar 44100 -f flv "${stream.rtmpAddr}"`;

  exec(cmd, (err, stdout, stderr) => {
    console.log('ffmpeg command run');

    if (err) {
      console.error(err);
    }

    console.log(stdout, stderr);
  });
  
  stream.isStreaming = true;
  res.send({
    success: true
  });

  // update initial description
  await updateTitleAndDescription(stream.title, oauthToken);

  streamUpdated();
});

app.post('/api/stop-streaming', async (req, res) => {

  if (!stream.isStreaming) {
    return res.send({
      success: false,
      error: 'not_streaming'
    })
  }

  let { oauthToken } = req.body;

  if (!oauthToken) {
    return res.send({
      success: false,
      error: 'no_oauth_token'
    })
  }

  // tell google that stream has stopped
  let data = await fetch(`https://www.googleapis.com/youtube/v3/liveBroadcasts/transition?id=${stream.youtubeId}&broadcastStatus=complete&part=id`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + oauthToken
    }
  });
  data = await data.json();

  await updateTitleAndDescription(stream.title, oauthToken);

  console.log(data);

  clearStream();
  res.send({
    success: true
  });

  exec('taskkill /im ffmpeg.exe /t /f', (err, stdout, stderr) => {
    if (err) {
      console.error(err);
    }

    console.log('stopped ffmpeg');
    console.log(stdout, stderr)
  });

  streamUpdated();
});

app.get('/api/ip', (req, res) => {
  res.send({
    success: true,
    ip: getLanIpAddress() + ':' + port
  });
});

// Delete all files older than 24 hours
var fileWatcher = new FileCleaner(localVideoDirName, 24*3600000, '* */15 * * * *', {
  start: true,
  blacklist: '/\.init/'
});

let port;
let listener = http.listen(process.env.PORT || 1266, () => {
  port = listener.address().port;
  console.log('Server listening on port', port);
});
