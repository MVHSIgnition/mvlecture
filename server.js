const os = require('os');
const express = require('express');
const app = express();
const http = require('http').createServer(app);
const fetch = require('node-fetch');
const fs = require('fs');
const {
  getLanIpAddress,
  updateTitleAndDescription,
  addVideoToPlaylist,
  execp,
  log,
  printYellow
} = require('./lib/helpers.js');

const platform = os.platform();
let parseDevices;

switch (platform) {
  case 'darwin':
    parseDevices = require('./lib/parseDevicesMacOS.js');
    break;
  case 'win32':
    parseDevices = require('./lib/parseDevicesWindows.js');
    break;
  default:
    console.error('This application only works on Mac and Windows');
    process.exit(1);
}

// const FileCleaner = require('cron-file-cleaner').FileCleaner;
const io = require('socket.io')(http);

app.use(express.json());
app.use(express.static(__dirname + '/static/'))

const localVideoDirName = __dirname + '\\videos\\';

// Create video folder if it doesn't exist
if (!fs.existsSync(localVideoDirName)) {
  fs.mkdirSync(localVideoDirName);
}

let settings = {
  shouldStreamToYoutube: true,
  youtubeCompression: true,
  flipVideo: true
}

let stream = null;
clearStream();

function clearStream() {
  stream = {
    isStreaming: false,
    startTime: null,

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
    scheduledStartTime: null,
  }
}

let webcams, mics;
parseDevices().then(({ webcams: w, mics: m }) => {
  webcams = w;
  mics = m;
  io.emit('update mics', { mics });
  io.emit('update webcams', { webcams });

  //TEST DATA
  /*
  webcams.push({name: 'A cool webcam', resolution: '100x100', framerate: '30'});
  webcams.push({name: 'A cooler webcam', resolution: '100x100', framerate: '30'});
  mics.push('woahahah mic');
  mics.push('better mic');
  */

  readConfig();
});

function streamUpdated() {
  io.emit('update state', { stream });
}

function readConfig() {
  if (fs.existsSync('config.json')) {
    fs.readFile('config.json', (err, data) => {
      if (err) throw err;
      const selected = JSON.parse(data);

      settings.shouldStreamToYoutube = (typeof selected.shouldStreamToYoutube === 'boolean') ? selected.shouldStreamToYoutube : true;
      settings.youtubeCompression = (typeof selected.youtubeCompression === 'boolean') ? selected.youtubeCompression : true;
      settings.flipVideo = (typeof selected.flipVideo === 'boolean') ? selected.flipVideo : true;

      if (webcams && mics) {
        const webcamIndex = webcams.findIndex((w) => w.name === selected.webcam.name);
        const micIndex = mics.indexOf(selected.mic);
        if (webcamIndex !== -1) stream.uiState.webcam = webcamIndex;
        if (micIndex !== -1) stream.uiState.mic = micIndex;
      }
      streamUpdated();
    });
  }
}

function writeConfig() {
  fs.writeFile('config.json',
    JSON.stringify({
      webcam: webcams[stream.uiState.webcam],
      mic: mics[stream.uiState.mic],
      ...settings
    }),
    err => {
      if (err) throw err;
    }
  );
}

// socket.io
io.on('connection', (socket) => {
  streamUpdated();
  readConfig();
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
    writeConfig();
    streamUpdated();
  });

  socket.on('mic select changed', index => {
    stream.uiState.mic = index;
    writeConfig();
    streamUpdated();
  });

  socket.on('bookmark name changed', value => {
    stream.uiState.bookmarkName = value;
    streamUpdated();
  });
});

// bookmarks api
app.post('/api/set-bookmarks', async (req, res) => {
  if (!stream.isStreaming || !settings.shouldStreamToYoutube) {
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

  await updateTitleAndDescription(stream, stream.title, req.body.oauthToken);
});

app.post('/api/update-stream', async (req, res) => {

  if (!stream.isStreaming || !settings.shouldStreamToYoutube) {
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

  let data = await updateTitleAndDescription(stream, req.body.title, oauthToken);

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

  log('Starting stream', true);

  if (settings.shouldStreamToYoutube) {

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
      log(data.error);
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
      log(data.error);
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

  }

  // spin-up ffmpeg to begin feeding video and audio the rtmp url
  const webcam = webcams[stream.uiState.webcam];
  const micName = mics[stream.uiState.mic];
  const localVideoFilename = localVideoDirName + title.replace(/[^a-z0-9]/gi, '_').toLowerCase() + '.mkv';
  // const localVideoFilename = title.replace(/[^a-z0-9]/gi, '_').toLowerCase() + '.mkv';

  const filter = '[0:v]transpose=2,transpose=2[v0_upsidedown];[v0_upsidedown][1:v]overlay=W-w:H-h[vid]';
  const compressionQuality = 'fast';
  const filterCode = settings.flipVideo ? `-i ./img/ignition_small.png -filter_complex "${filter}" -map [vid] -map 0:a` : '';
  let cmd;

  if (platform === 'win32') {
    cmd = `ffmpeg -y -f dshow -rtbufsize 1024M -video_size ${webcam.resolution} -framerate ${webcam.framerate} -i video="${webcam.name}":audio="${micName}" ${filterCode} -preset ${compressionQuality} `;

    // https://support.google.com/youtube/answer/2853702?hl=en - youtube recommends 3M to 6M
    if (settings.shouldStreamToYoutube) {
      cmd += `-copyts -c:v libx264 ${settings.youtubeCompression ? '-maxrate 6000k -bufsize 6000k' : ''} -g ${webcam.framerate * 2} -c:a aac -b:a 128k -ar 44100 -f flv "${stream.rtmpAddr}"`;
    } else {
      cmd += `"${localVideoFilename}"`;
    }
  } else if (platform === 'darwin') {
    let vidMic = stream.uiState.webcam + ':' + stream.uiState.mic;
    cmd = `./ffmpeg -f avfoundation -framerate ${webcam.framerate} -video_size ${webcam.resolution} -i "${vidMic}" ${filterCode} -vcodec libx264 -g ${webcam.framerate * 2} -preset ${compressionQuality} -c:a mp3 -b:a 128k -ar 44100 -f flv "${stream.rtmpAddr}"`;
  }

  log('Starting up ffmpeg', true);
  execp(cmd).then(({ err, stdout, stderr }) => {
    if (err) {
      log(err);
    }

    // only gets here when ffmpeg stops spitting out stuff (aka when it stops)
    log('ffmpeg has stopped');
    log(stdout);
    log(stderr);
  });

  stream.isStreaming = true;
  res.send({
    success: true
  });

  // update initial description
  if (settings.shouldStreamToYoutube) await updateTitleAndDescription(stream, stream.title, oauthToken);

  streamUpdated();
});

app.post('/api/stop-streaming', async (req, res) => {
  let killCmd = platform === 'darwin' ? 'killall ffmpeg' : 'taskkill /im ffmpeg.exe /t /f';

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
    });
  }

  if (!settings.shouldStreamToYoutube) {
    execp(killCmd);
    return res.send({
      success: true
    });
  }

  await updateTitleAndDescription(stream, stream.title, oauthToken);

  res.send({
    success: true
  });

  streamUpdated();

  log('Stopping stream', true);

  let data;
  try {
    // tell google that stream has stopped
    data = await fetch(`https://www.googleapis.com/youtube/v3/liveBroadcasts/transition?id=${stream.youtubeId}&broadcastStatus=complete&part=id`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + oauthToken
      }
    });
    data = await data.json();
  } catch (e) {
    log(JSON.stringify(e));
  }


  if (data.error)
    log(data.error);

  log('Stopping ffmpeg', true);
  execp(killCmd).then(({ err, stdout, stderr }) => {
    if (err) {
      log(err);
    }

    log(stdout);
    log(stderr);
  });

  clearStream();

  printYellow('It is OK to close the terminal now. Your video has been completely uploaded!');
});

app.get('/api/ip', (req, res) => {
  res.send({
    success: true,
    ip: getLanIpAddress() + ':' + port
  });
});

// Delete all files older than 24 hours
//const fileWatcher = new FileCleaner(localVideoDirName, 24*3600000, '* */15 * * * *', {
/*start: true,
blacklist: '/\.init/'
});*/

let port;
let listener = http.listen(process.env.PORT || 1266, () => {
  port = listener.address().port;
  log('Server listening on port', port);
});
