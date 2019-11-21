// Imports
const express = require('express');
const app = express();
const http = require('http').createServer(app);
const fetch = require('node-fetch');
const fs = require('fs');
const { exec } = require('child_process');
const { generateDescription, indexOfMultiple } = require('./helpers.js');
const { google } = require('googleapis');
const FileCleaner = require('cron-file-cleaner').FileCleaner;
const io = require('socket.io')(http);
const url = require('url');
const readline = require('readline');

// Serve static website files
app.use(express.json());
app.use(express.static(__dirname + '/static/'))

// Folder that videos will be saved at
const localVideoDirName = __dirname + '/videos/';

// Create video folder if it doesn't exist
if (!fs.existsSync(localVideoDirName)) {
  fs.mkdirSync(localVideoDirName);
}

//Initialize OAuth2
const oauth2Client = new google.auth.OAuth2(
  '946689392269-rd0qkinhi24uv8q7kf7pc981sd0vm9mf.apps.googleusercontent.com',
  'hKUROQ8-0HMbGSVnF7sxW75u',
  'http://localhost:1266/oauth2callback' //TODO: Make this NOT hardcoded
);

const authURL = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: ['https://www.googleapis.com/auth/youtube']
});

// Initialize Youtube API library
const youtube = google.youtube({
  version: 'v3',
  auth: oauth2Client
});

// Initialize stream object
let stream = null;
var webcams = [];
var mics = [];
var gotToken = false;
clearStream();
getWebcamsMics();

// Get the list of permissible webcams and mics
function getWebcamsMics() {
  const listDevicesCmd = 'ffmpeg -list_devices true -f dshow -i dummy';
  webcams = [];
  mics = [];

  exec(listDevicesCmd, (error, stdout, stderr) => {
    // Parse output for webcams and mics
    const output = error.toString();
    const videoDevicesIndex = output.indexOf('DirectShow video devices');
    const audioDevicesIndex = output.indexOf('DirectShow audio devices');

    const indices = indexOfMultiple(output, '"', videoDevicesIndex);

    for (let i = 0; i < indices.length; i++) {
      if (i+1 < indices.length) {
        const device = output.substring(indices[i]+1, indices[i+1]);
        if (indices[i] < audioDevicesIndex && indices[i+1] < audioDevicesIndex) {
          // These are video devices
          webcams.push({
            name: device,
            resolution: null,
            framerate: null,
          });
        } else {
          // These are audio devices
          mics.push(device);
        }
        // Skip the "Alternative name"
        i += 3;
      }
    }

    io.emit('update mics', { mics });  

    for (let i = 0; i < webcams.length; i++) {
      const listOptionsCmd = `ffmpeg -list_options true -f dshow -i video="${webcams[i].name}"`;
      exec(listOptionsCmd, (error, stdout, stderr) => {
        const output = error.toString();
        const deviceOptionsIndex = output.indexOf('DirectShow video device options');

        const vcodecIndex = output.indexOf('vcodec=mjpeg', deviceOptionsIndex);
        const resIndex = output.indexOf('max s=', vcodecIndex);
        const resolution = output.substring(resIndex+6, output.indexOf(' ', resIndex+6)); 
        const fpsIndex = output.indexOf('fps=', resIndex);
        const framerate = output.substring(fpsIndex+4, output.indexOf('[', fpsIndex)-1); // indexof \r or \n
        //console.log("FRAMERATE!: " + framerate);
        
        webcams[i].resolution = resolution;
        webcams[i].framerate = framerate;               

        io.emit('update webcams', { webcams });  
      });
    }
  });
}

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
    uiState: {
      title: '',
      addDate: false,
      playlist: 0,
      bookmarkName: '',
      webcam: 0,
      mic: 0,
    },

    // google provided values
    streamId: null,
    youtubeId: null,
    rtmpAddr: null,
    startTime: null,
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

// TODO: Fix playlists
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

async function uploadVideo(stream) {
  const fileSize = fs.statSync(stream.localVideoFilename).size;
  const res = await youtube.videos.insert(
  {
    part: 'id,snippet,status',
    notifySubscribers: true,
    requestBody: {
      snippet: {
        title: stream.title,
        description: generateDescription(stream.bookmarks),
        categoryId: 27,
      },
      status: {
        privacyStatus: 'public',
      } 
    },
    media: {
      body: fs.createReadStream(stream.localVideoFilename)
    }
  },
  {
    onUploadProgress: evt => {
      // TODO: Make this an acutal progress bar
      const progress = (evt.bytesRead / fileSize) * 100;
      readline.clearLine(process.stdout, 0);
      readline.cursorTo(process.stdout, 0, null);
      process.stdout.write(`${Math.round(progress)}% complete`);
      io.emit('update progress', { title: stream.title, progress: Math.round(progress) });
    }
  }).catch(error => {
    // TODO: Handle if token not set
    console.log('THERE WAS AN ERROR');
    console.log(error);
  });

  console.log('\n\n');
  console.log(res.data);
}

function streamUpdated() {
  io.emit('update state', { stream });  
}

// socket.io
io.on('connection', (socket) => {
  streamUpdated();
  getWebcamsMics();
  io.emit('is authenticated', { authenticated: gotToken });
  io.emit('update mics', { mics });  
  io.emit('update webcams', { webcams });  

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

  socket.on('webcam select changed', index => {
    stream.uiState.webcam = index;
    streamUpdated();
  });

  socket.on('mic select changed', index => {
    stream.uiState.mic = index;
    streamUpdated();
  });

  socket.on('bookmark name changed', value => {
    stream.uiState.bookmarkName = value;
    streamUpdated();
  });
});

app.get('/', (req, res) => {
  return res.redirect(authURL);
});

// OAuth2 callback
app.get('/oauth2callback', async (req, res) => {
  const q = url.parse(req.url, true);
  const { tokens } = await oauth2Client.getToken(q.query.code);
  oauth2Client.setCredentials(tokens); 
  gotToken = true;

  return res.redirect('/oauth2callback.html');
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
    title,
    playlistId
  } = req.body;

  if (!title) {
    return res.send({
      success: false,
      error: 'missing_data'
    });
  }

  stream.title = title;

  // add to playlist
  // TODO: Reimplement
  //if (playlistId)
  //  await addVideoToPlaylist(stream.youtubeId, playlistId, oauthToken);


  // spin-up ffmpeg to begin feeding video and audio the rtmp url
  const webcam = webcams[stream.uiState.webcam];
  const micName = mics[stream.uiState.mic];

  stream.localVideoFilename = localVideoDirName + title.replace(/[^a-z0-9]/gi, '_').toLowerCase() + '.mkv';

  const cmd = `ffmpeg -y -f dshow -video_size ${webcam.resolution} -framerate ${webcam.framerate} -i video="${webcam.name}":audio="${micName}" -i ./img/ignition_small.png -filter_complex "[0:v]transpose=2,transpose=2[v0_upsidedown];[v0_upsidedown][1:v]overlay=W-w:H-h[vid]" -map [vid] -map 0:a -c:v libx264 -preset veryfast -maxrate 1984k -bufsize 3968k -g ${webcam.framerate*2} -c:a aac -b:a 128k -ar 44100 ${stream.localVideoFilename}`;

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

  streamUpdated();
});

app.post('/api/stop-streaming', async (req, res) => {

  if (!stream.isStreaming) {
    return res.send({
      success: false,
      error: 'not_streaming'
    })
  }

  res.send({
    success: true
  });

  exec('taskkill /im ffmpeg.exe /t /f', (err, stdout, stderr) => {
    if (err) {
      console.error(err);
    }

    uploadVideo(stream);
    clearStream();
    streamUpdated();
    console.log('stopped ffmpeg');
    console.log(stdout, stderr)
  });
});

app.get('/api/ip', (req, res) => {
  res.send({
    success: true,
    ip: getLanIpAddress() + ':' + port
  });
});

// Delete all files older than 24 hours
const fileWatcher = new FileCleaner(localVideoDirName, 24*3600000, '* */15 * * * *', {
  start: true
});

// Start server
let port;
let listener = http.listen(process.env.PORT || 1266, () => {
  port = listener.address().port;
  console.log('Server listening on port', port);
});
