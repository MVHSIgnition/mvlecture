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
var playlists = [];
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
    playlistId: null,
  }
}

async function getPlaylists() {
  const res = await youtube.playlists.list({
    part: 'snippet',
    mine: true
  });

  let { items } = res.data;
  playlists = [];
  for (let i = 0; i < items.length; i++) {
    playlists.push({
      id: items[i].id, 
      title: items[i].snippet.title
    });
  }

  io.emit('update playlists', { playlists });
}

async function addVideoToPlaylist(videoId, playlistId) {
  console.log(`videoId: ${videoId}, playlistId: ${playlistId}`);
  const res = await youtube.playlistItems.insert({
    part: 'snippet',
    requestBody: {
      snippet: {
        playlistId,
        resourceId: {
          kind: 'youtube#video',
          videoId
        }
      }
    }
  });

  console.log('Added to playlist!');
  console.log(res.data);
}

async function updateTitleAndDescription(title) {
  console.log('update title and description');
  console.log(stream.youtubeId);
  console.log(stream.scheduledStartTime);
  /*const res = await youtube.liveBroadcasts.update({
    part: 'id,snippet',
    Id: stream.youtubeId,
    responseBody: {
      snippet: {
        title,
        description: generateDescription(stream.bookmarks),
        scheduledStartTime: stream.scheduledStartTime,
      }
    }
  });

  console.log('RESSS: ', res);

  if (!res.data.error) {
    stream.title = title;
  }

  return res.data;
  */
 console.log('rip');
}

async function uploadVideo(stream) {
  const { localVideoFilename, bookmarks, title, playlistId } = stream;

  const fileSize = fs.statSync(localVideoFilename).size;
  const res = await youtube.videos.insert(
  {
    part: 'id,snippet,status',
    notifySubscribers: true,
    requestBody: {
      snippet: {
        title: title,
        description: generateDescription(bookmarks),
        categoryId: 27,
      },
      status: {
        privacyStatus: 'public',
      } 
    },
    media: {
      body: fs.createReadStream(localVideoFilename)
    }
  },
  {
    onUploadProgress: evt => {
      // TODO: Make this an acutal progress bar
      const progress = (evt.bytesRead / fileSize) * 100;
      readline.clearLine(process.stdout, 0);
      readline.cursorTo(process.stdout, 0, null);
      process.stdout.write(`${Math.round(progress)}% complete`);
      io.emit('update progress', { title: title, progress: Math.round(progress) });
    }
  }).catch(error => {
    // TODO: Handle if token not set
    console.log('THERE WAS AN ERROR');
    console.log(error);
  });

  if (playlistId) {
    console.log('adding to playlist...');
    addVideoToPlaylist(res.data.id, playlistId);
  }

  console.log('\n\n');
  console.log(res.data);
}

function streamUpdated() {
  io.emit('update state', { stream });  
}

// socket.io
io.on('connection', (socket) => {
  io.emit('is authenticated', { authenticated: gotToken });
  if (gotToken) {
    getPlaylists();
    streamUpdated();
    getWebcamsMics();
    io.emit('update mics', { mics });  
    io.emit('update webcams', { webcams });  
    io.emit('update playlists', { playlists });

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
  }
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

  await updateTitleAndDescription(stream.title);
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

  let data = await updateTitleAndDescription(req.body.title);

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
  stream.playlistId = playlistId;
  
  //
  // Create new livestream
  //
  let data;
  console.log('Creating livestream...');
  ({ data } = await youtube.liveStreams.insert({
    part: 'snippet,cdn',
    requestBody: {
      snippet: {	
        title	
      },	
      cdn: {	
        resolution: 'variable',	
        frameRate: 'variable',	
        ingestionType: 'rtmp'	
      }	
    }
  }));

  if (data.error) {	
    return res.send({ success: false, error: data.error });	
  }	

  // Set backend state with google-provided streaming values	
  stream.streamId = data.id;	
  stream.rtmpAddr = data.cdn.ingestionInfo.ingestionAddress + '/' + data.cdn.ingestionInfo.streamName;	

  //
  // Create new livebroadcast
  //
  console.log('Creating livebroadcast...');
  stream.scheduledStartTime = new Date().toISOString();	
  ({ data } = await youtube.liveBroadcasts.insert({
    part: 'snippet,status,contentDetails',
    requestBody: {
      snippet: {	
        scheduledStartTime: stream.scheduledStartTime,	
        title	
      },	
      status: {	
        privacyStatus: 'public'	
      },	
      contentDetails: {	
        recordFromStart: true,	// MAYBE THESE ARE CAUSING THE ERRORS WE HAVE?!??
        enableAutoStart: true	
      }	
    }
  }));

  if (data.error) {	
    return res.send({ success: false, error: data.error });	
  }

  stream.youtubeId = data.id;	

  //
  // Bind livestream to livebroadcast
  //
  console.log(`Binding livebroadcast...`);
  ({ data } = await youtube.liveBroadcasts.bind({
    id: stream.youtubeId,
    part: 'id',
    streamId: stream.streamId
  }));

  if (data.error) {	
    return res.send({ success: false, error: data.error });	
  }

  stream.startTime = Date.now();

  // Add video to playlist, if specified
  if (playlistId) {
    await addVideoToPlaylist(stream.youtubeId, playlistId);
  }

  // Start streaming video with ffmpeg
  const webcam = webcams[stream.uiState.webcam];
  const micName = mics[stream.uiState.mic];

  stream.localVideoFilename = localVideoDirName + title.replace(/[^a-z0-9]/gi, '_').toLowerCase() + '.mkv';

  const cmd = `ffmpeg -y -f dshow -video_size ${webcam.resolution} -framerate ${webcam.framerate} -i video="${webcam.name}":audio="${micName}" -i ./img/ignition_small.png -filter_complex "[0:v]transpose=2,transpose=2[v0_upsidedown];[v0_upsidedown][1:v]overlay=W-w:H-h[vid];[vid]split=2[vid1][vid2]" -map [vid1] -map 0:a -c:v libx264 -preset veryfast -maxrate 1984k -bufsize 3968k -g ${webcam.framerate*2} -c:a aac -b:a 128k -ar 44100 -f flv ${stream.rtmpAddr} -map [vid2] -map 0:a -c:v libx264 -preset veryfast -maxrate 1984k -bufsize 3968k -g ${webcam.framerate*2} -c:a aac -b:a 128k -ar 44100 ${stream.localVideoFilename}`;

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
  await updateTitleAndDescription(stream.title);
  console.log('done');

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
