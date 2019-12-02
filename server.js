const express = require('express');
const app = express();
const http = require('http').createServer(app);
const fetch = require('node-fetch');
const fs = require('fs');
const {
  generateDescription,
  getLanIpAddress,
  updateTitleAndDescription,
  addVideoToPlaylist,
  execp,
  log,
  printYellow
} = require('./lib/helpers.js');
const parseDevices = require('./lib/parseDevices.js');

const FileCleaner = require('cron-file-cleaner').FileCleaner;
const io = require('socket.io')(http);

app.use(express.json());
app.use(express.static(__dirname + '/static/'))

const localVideoDirName = __dirname + '/videos/';

// Create video folder if it doesn't exist
if (!fs.existsSync(localVideoDirName)) {
  fs.mkdirSync(localVideoDirName);
}


let shouldStreamToYoutube = true;

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

      shouldStreamToYoutube = (typeof selected.shouldStreamToYoutube === 'boolean') ? selected.shouldStreamToYoutube : true;

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
      webcam: webcams[stream.uiState.webcam]
      mic: mics[stream.uiState.mic],
      shouldStreamToYoutube
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
  if (!stream.isStreaming || !shouldStreamToYoutube) {
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

  if (!stream.isStreaming || !shouldStreamToYoutube) {
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

  if (shouldStreamToYoutube) {

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

  let cmd = `ffmpeg -y -f dshow -video_size ${webcam.resolution} -framerate ${webcam.framerate} -i video="${webcam.name}":audio="${micName}" -i ./img/ignition_small.png -filter_complex "[0:v]transpose=2,transpose=2[v0_upsidedown];[v0_upsidedown][1:v]overlay=W-w:H-h[vid];[vid]split=2[vid1][vid2]" -map [vid1] -map 0:a -preset veryfast ${localVideoFilename}`;

  if (shouldStreamToYoutube)
    cmd += ` -map [vid2] -map 0:a -copyts -c:v libx264 -preset veryfast -maxrate 3000k -bufsize 6000k -g 60 -c:a aac -b:a 128k -ar 44100 -f flv "${stream.rtmpAddr}"`;

  execp(cmd).then(({ err, stdout, stderr }) => {
    log('ffmpeg started up', true);

    if (err) {
      log(err);
    }

    log(stdout);
    log(stderr);
  });
  
  stream.isStreaming = true;
  res.send({
    success: true
  });

  // update initial description
  if (shouldStreamToYoutube) await updateTitleAndDescription(stream, stream.title, oauthToken);

  streamUpdated();
});

app.post('/api/stop-streaming', async (req, res) => {

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

  if (!shouldStreamToYoutube) {
    execp('taskkill /im ffmpeg.exe /t /f');
    return res.send({
      success: true
    });
  }

  let streamDesiredLength = Date.now() - stream.startTime;

  await updateTitleAndDescription(stream, stream.title, oauthToken);

  res.send({
    success: true
  });

  streamUpdated();

  // check to see how long the stream has been going on for
  let data = await fetch(`https://www.googleapis.com/youtube/v3/liveBroadcasts?part=snippet&id=${stream.youtubeId}`,
  {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + oauthToken
    }
  });
  data = await data.json();
  let actualStartTime = (new Date(data.items[0].snippet.actualStartTime)).getTime();

  stop();

  async function stop() {
    if (Date.now() - actualStartTime < streamDesiredLength) {
      console.log('\n');
      printYellow('DO NOT close the terminal yet. Still uploading your video.');
      printYellow('Only uploaded ' + 100 * ((Date.now() - actualStartTime) / streamDesiredLength) + '% of video');
      return setTimeout(stop, 2000);
    }

    log('Stopping stream', true);

    // tell google that stream has stopped
    let data = await fetch(`https://www.googleapis.com/youtube/v3/liveBroadcasts/transition?id=${stream.youtubeId}&broadcastStatus=complete&part=id`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + oauthToken
      }
    });
    data = await data.json();

    if (data.error)
      log(data.error);

    log('Stopping ffmpeg', true);
    execp('taskkill /im ffmpeg.exe /t /f').then(({ err, stdout, stderr }) => {
      if (err) {
        log(err);
      }

      log(stdout);
      log(stderr);
    });

    clearStream();

    printYellow('It is OK to close the terminal now. Your video has been completely uploaded!');
  }
  
});

app.get('/api/ip', (req, res) => {
  res.send({
    success: true,
    ip: getLanIpAddress() + ':' + port
  });
});

// Delete all files older than 24 hours
const fileWatcher = new FileCleaner(localVideoDirName, 24*3600000, '* */15 * * * *', {
  start: true,
  blacklist: '/\.init/'
});

let port;
let listener = http.listen(process.env.PORT || 1266, () => {
  port = listener.address().port;
  log('Server listening on port', port);
});
