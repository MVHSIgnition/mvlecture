const express = require('express');
const fetch = require('node-fetch');
const { exec } = require('child_process');
const { getTimeout } = require('./helpers.js');
const FileCleaner = require('cron-file-cleaner').FileCleaner;

const app = express();

app.use(express.json());
app.use(express.static(__dirname + '/static/'))

const localVideoDirName = __dirname + '/videos/';
let stream = null;
clearStream();

function clearStream() {
  stream = {
    isStreaming: false,

    // user provided values
    title: null,
    description: null,
    bookmarks: [],

    // google provided values
    oauthToken: null,
    streamId: null,
    youtubeId: null,
    rtmpAddr: null,
    startTime: null
  }
}

// bookmarks api
app.post('/api/create-bookmark', (req, res) => {
  if (!stream.isStreaming) {
    return res.send({
      success: false,
      error: 'not_streaming'
    });
  }

  stream.bookmarks.push({
    time: getTimeout(Date.now() - stream.startTime),
    name: req.body.name || 'Untitled bookmark'
  });

  res.send({
    success: false
  });
});


app.post('/api/delete-bookmark', (req, res) => {
  if (!stream.isStreaming) {
    return res.send({
      success: false,
      error: 'not_streaming'
    });
  }

  if (typeof req.body.time !== 'number') {
    return res.send({
      success: false,
      error: 'bad_data'
    });
  }

  stream.bookmarks = stream.bookmarks.filter(a => a.time !== req.body.time);

  res.send({
    success: true
  });
});

// state stuff
app.get('/api/state', (req, res) => {
  res.send({
    success: true,
    stream: stream
  });
});

app.post('/api/update-stream', async (req, res) => {

  if (!stream.isStreaming) {
    return res.send({
      success: false,
      error: 'not_streaming'
    })
  }

  let { title, description } = req.body;

  let data = await fetch('https://www.googleapis.com/youtube/v3/liveBroadcasts?part=id,snippet', {
    method: 'PUT',
    headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + stream.oauthToken,
    },
    body: JSON.stringify({
      id: stream.youtubeId,
      snippet: {
        description,
        title,
        scheduledStartTime: stream.scheduledStartTime,
      }
    })
  });
  data = data.json();

  if (data.error) {
    return res.send({
      success: false,
      error: data.error
    });
  }

  stream.title = title;
  stream.description = description;

  res.send({ success: true });
});

// streaming apis
app.post('/api/init-stream', async (req, res) => {
  if (stream.isStreaming) {
    return res.send({ success: false, error: 'already_streaming' });
  }

  // get and validate data from frontend
  let {
    oauthToken,
    title
  } = req.body;

  if (!title || !oauthToken) {
    return res.send({
      success: false,
      error: 'missing_data'
    });
  }

  stream.title = title;
  stream.oauthToken = oauthToken;

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

  // spin-up ffmpeg to begin feeding video and audio the rtmp url

  /*const webcam1 = {
    name: 'Logitech Webcam C930e',
    resolution: '1920x1080',
    framerate: 30,
  };
  const micName = 'Microphone (Realtek High Definition Audio)';*/
  const webcam1 = {
    name: 'HD WebCam',
    resolution: '1280x720',
    framerate: 30,
  };
  const micName = 'Microphone Array (Realtek High Definition Audio(SST))';

  const localVideoFilename = localVideoDirName + title.replace(/[^a-z0-9]/gi, '_').toLowerCase() + '.mp4';

  const cmd = `ffmpeg -y -f dshow -video_size ${webcam1.resolution} -framerate ${webcam1.framerate} -i video="${webcam1.name}":audio="${micName}" -i ./ignition.png -filter_complex "[0:v]transpose=2,transpose=2[v0_upsidedown];[v0_upsidedown][1:v]overlay=W-w:H-h[vid];[vid]split=2[vid1][vid2]" -map [vid1] -map 0:a -c:v libx264 -preset veryfast ${localVideoFilename} -map [vid2] -map 0:a -copyts -c:v libx264 -preset veryfast -maxrate 1984k -bufsize 3968k -g 60 -c:a aac -b:a 128k -ar 44100 -f flv "${stream.rtmpAddr}"`;

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
});

app.post('/api/stop-streaming', async (req, res) => {
  console.log('RECEIVED STOP COMMAND');
  if (!stream.isStreaming) {
    return res.send({
      success: false,
      error: 'not_streaming'
    })
  }

  console.log('RUNNING TASKKILL');
  exec('taskkill /im ffmpeg.exe /t /f', (err, stdout, stderr) => {
    if (err) {
      console.error(err);
      return res.send({ success: false, error: err });
    }

    console.log('stopped ffmpeg');
    console.log(stdout, stderr)
  });
  console.log('RAN TASKKILL');

  // tell google that stream has stopped
  let data = await fetch(`https://www.googleapis.com/youtube/v3/liveBroadcasts/transition?id=${stream.youtubeId}&broadcastStatus=complete&part=id`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + stream.oauthToken
    }
  });
  data = await data.json();

  console.log('GOT DATA FROM GOOGLE');

  console.log(data);

  clearStream();
  res.send({
    success: true
  });
});

// Delete all files older than 24 hours
var fileWatcher = new FileCleaner(localVideoDirName, 24*3600000, '* */15 * * * *', {
  start: true,
  blacklist: '/\.init/'
});

let listener = app.listen(process.env.PORT || 1266, () => {
  let port = listener.address().port;
  console.log('Server listening on port', port);
});