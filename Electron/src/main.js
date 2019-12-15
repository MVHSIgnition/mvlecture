const { app, BrowserWindow,ipcMain,shell } = require('electron');
const express = require('express');
const crypto = require('crypto');
const server = express();
const axios = require('axios');
const port = 9004;
const Store = require('electron-store');
const store = new Store();
const {
  getLanIpAddress,
  updateTitleAndDescription,
  addVideoToPlaylist,
  execp,
  printYellow
} = require('./helpers.js');
const parseDevices = require('./parseDevices.js');
if (require('electron-squirrel-startup')) { 
  //app.quit();
  return;
}
let mainWindow;
let verifier;
let token;
let settings = {
  shouldStreamToYoutube: true,
  youtubeCompression: true
}
let stream;
let webcams,mics

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences:{
      nodeIntegration: true
    }
  });
  clearStream();
  if(checkStore()){
    if(store.get('expire_seconds')+store.get('time')==(Date.now())/1000||store.get('expire_seconds')+store.get('time')>( Date.now())/1000){
      axios({
        method: 'post',
        url: 'https://oauth2.googleapis.com/token',
        data:{
          refresh_token: store.get('refresh_token'),
          client_id: '357035935465-vkm3i0f086r6i839i6ijaag1maboj7v1.apps.googleusercontent.com',
          grant_type: 'refresh_token',
        },
      }).then((response)=>{
        console.log(response.data);
        token = response.data.access_token;
        store.set('access_token',response.data.access_token);
        store.set('expire_seconds',response.data.expires_in);
        store.set('time', (Date.now())/1000);
      }).catch((err)=>{
        console.log(err);
      }); 
    }else{
      token = store.get('access_token');
    }
  }else{
    signin();
  }
  mainWindow.loadURL(`file://${__dirname}/index.html`);
  parseDevices().then(({ webcams: w, mics: m }) => {
    webcams = w;
    mics = m;
    micsUpdated();
    webcamsUpdated();
    // readConfig(); Look below 
  });
  streamUpdated();
  //readConfig(); Look above for function commented out
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
};
const base64URLEncode = (str)=> {
  return str.toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
}
const sha256 = (buffer) => {
  return crypto.createHash('sha256').update(buffer).digest();
}
const signin = () =>{
  verifier = base64URLEncode(crypto.randomBytes(32));
  let challenge = base64URLEncode(sha256(verifier));
  let url = 'https://accounts.google.com/o/oauth2/auth?' + 
					'client_id=357035935465-vkm3i0f086r6i839i6ijaag1maboj7v1.apps.googleusercontent.com&' +
					'redirect_uri=http://127.0.0.1:9004' +
					`&scope=https://www.googleapis.com/auth/youtube&response_type=code&code_challenge_method=S256&code_challenge=${challenge}`;
  shell.openExternal(encodeURI(url));
}
const getToken = (codeToken)=>{
  axios({
    method: 'post',
    url: 'https://oauth2.googleapis.com/token',
    data:{
      code: codeToken,
      client_id: '357035935465-vkm3i0f086r6i839i6ijaag1maboj7v1.apps.googleusercontent.com',
      redirect_uri: 'http://127.0.0.1:9004',
      grant_type: 'authorization_code',
      code_verifier: verifier
    },
  }).then((response)=>{
    console.log(response.data);
    token = response.data.access_token;
    store.set('access_token',response.data.access_token);
    store.set('refresh_token',response.data.refresh_token);
    store.set('expire_seconds',response.data.expires_in);
    store.set('time', (Date.now())/1000);
  }).catch((err)=>{
    console.log(err);
  });
  
}
ipcMain.handle('token', async (event)=>{
  return token;
});
const checkStore = () =>{
  return (store.has('access_token')&&store.has('refresh_token')&&store.has('expire_seconds')&&store.has('time'))==true;
}

// function readConfig() {
//   if (fs.existsSync('config.json')) {
//     fs.readFile('config.json', (err, data) => {
//       if (err) throw err;
//       const selected = JSON.parse(data);

//       settings.shouldStreamToYoutube = (typeof selected.shouldStreamToYoutube === 'boolean') ? selected.shouldStreamToYoutube : true;
//       settings.youtubeCompression = (typeof selected.youtubeCompression === 'boolean') ? selected.youtubeCompression : true;

//       if (webcams && mics) {
//         const webcamIndex = webcams.findIndex((w) => w.name === selected.webcam.name);
//         const micIndex = mics.indexOf(selected.mic);
//         if (webcamIndex !== -1) stream.uiState.webcam = webcamIndex;
//         if (micIndex !== -1) stream.uiState.mic = micIndex;
//       }
//       streamUpdated();
//     });
//   }
// }

// function writeConfig() {
//   fs.writeFile('config.json', 
//     JSON.stringify({
//       webcam: webcams[stream.uiState.webcam],
//       mic: mics[stream.uiState.mic],
//       ...settings
//     }), 
//     err => {
//       if (err) throw err;
//     }
//   );
// }

const streamUpdated = () =>{
  mainWindow.webContents.send('update state',stream);
}
const micsUpdated = () =>{
  mainWindow.webContents.send('update mics',mics);
}
const webcamsUpdated = () =>{
  mainWindow.webContents.send('update webcams',webcams);
}
ipcMain.on('title changed',(event,title)=>{
  stream.uiState.title = title;
  streamUpdated();
});

ipcMain.on('date checkbox changed',(event,checked)=>{
  stream.uiState.addDate = checked;
  streamUpdated();
});

ipcMain.on('playlist select changed',(event,index)=>{
  stream.uiState.playlist = index;
  streamUpdated();
});

ipcMain.on('webcam select changed',(event,index)=>{
  stream.uiState.webcam = index;
  //writeConfig(); Look above for function commented out
  streamUpdated();
});

ipcMain.on('mic select changed',(event,index)=>{
  stream.uiState.mic = index;
  //writeConfig(); Look above for function commented out
  streamUpdated();
});

ipcMain.on('bookmark name changed',(event,value)=>{
  stream.uiState.bookmarkName = value;
  streamUpdated();
});

ipcMain.on('set bookmarks',async (event,bookmarks)=>{
  stream.bookmarks = bookmarks;
  stream.uiState.bookmarkName = '';
  streamUpdated();
  await updateTitleAndDescription(stream, stream.title, token);
});

ipcMain.handle('init-stream', async (event, title, playlistId) => {
  if (stream.isStreaming) {
    return { success: false, error: 'already_streaming' };
  }
  if (!title) {
    return {
      success: false,
      error: 'missing_data'
    };
  }

  stream.title = title;

  if (settings.shouldStreamToYoutube) {

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token,
    }

    let data = await axios('https://www.googleapis.com/youtube/v3/liveStreams?part=snippet,cdn', {
      method: 'POST',
      headers: headers,
      data: {
        snippet: {
          title
        },
        cdn: {
          resolution: 'variable',
          frameRate: 'variable',
          ingestionType: 'rtmp'
        }
      }
    });
    console.log(data);

    if (data.error) {
      return { success: false, error: data.error };
    }
    data = data.data
    // set backend state with google-provided streaming values
    stream.streamId = data.id;
    stream.rtmpAddr = data.cdn.ingestionInfo.ingestionAddress + '/' + data.cdn.ingestionInfo.streamName;


    // create livestream on youtube channel
    stream.scheduledStartTime = new Date().toISOString();
    data = await axios('https://www.googleapis.com/youtube/v3/liveBroadcasts?part=snippet,status,contentDetails', {
      method: 'POST',
      headers,
      data: {
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
      },
    });

    if (data.error) {
      return { success: false, error: data.error };
    }
    data= data.data
    stream.youtubeId = data.id;

    await axios(`https://www.googleapis.com/youtube/v3/liveBroadcasts/bind?id=${stream.youtubeId}&part=id&streamId=${stream.streamId}`, {
      method: 'POST',
      headers
    });
    stream.startTime = Date.now();

    if (playlistId)
      await addVideoToPlaylist(stream.youtubeId, playlistId, token);

  }

  const webcam = webcams[stream.uiState.webcam];
  const micName = mics[stream.uiState.mic];
  // const localVideoFilename = localVideoDirName + title.replace(/[^a-z0-9]/gi, '_').toLowerCase() + '.mkv';
  // const localVideoFilename = title.replace(/[^a-z0-9]/gi, '_').toLowerCase() + '.mkv';

  let cmd = `-y -f dshow -rtbufsize 1024M -video_size ${webcam.resolution} -framerate ${webcam.framerate} -i video="${webcam.name}":audio="${micName}" -i ./ignition_small.png -filter_complex `;

  const filter = '[0:v]transpose=2,transpose=2[v0_upsidedown];[v0_upsidedown][1:v]overlay=W-w:H-h[vid]';
  const compressionQuality = 'fast';

  // https://support.google.com/youtube/answer/2853702?hl=en - youtube recommends 3M to 6M
  if (settings.shouldStreamToYoutube) {
    cmd += `"${filter}" -map [vid] -map 0:a -copyts -c:v libx264 -preset ${compressionQuality} ${settings.youtubeCompression ? '-maxrate 6000k -bufsize 6000k' : ''} -g ${webcam.framerate * 2} -c:a aac -b:a 128k -ar 44100 -f flv "${stream.rtmpAddr}"`;
  } else {
    cmd += `"${filter}" -map [vid] -map 0:a -preset ${compressionQuality} "${localVideoFilename}"`;
  }
  let listcmd = cmd.split("-");
  execp('ffmpeg',listcmd).then(({ err, stdout, stderr }) => {
    if (err) {
      //rewrite for electron
    }
  });
  
  stream.isStreaming = true;

  // update initial description
  if (settings.shouldStreamToYoutube) await updateTitleAndDescription(stream, stream.title, token);

  streamUpdated();
  return {success: true};
});
ipcMain.handle('stop-streaming', async (event)=>{

  if (!stream.isStreaming) {
    return {
      success: false,
      error: 'not_streaming'
    };
  }

  if (!settings.shouldStreamToYoutube) {
    execp('taskkill', ['/im ffmpeg.exe', '/t', '/f']);
    return {
      success: true
    };
  }

  let streamDesiredLength = Date.now() - stream.startTime;

  await updateTitleAndDescription(stream, stream.title, token);

  streamUpdated();

  // check to see how long the stream has been going on for
  let data = await axios(`https://www.googleapis.com/youtube/v3/liveBroadcasts?part=snippet&id=${stream.youtubeId}`,
  {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token
    },
    method:'GET'
  });
  data = await data.json();
  let actualStartTime = (new Date(data.items[0].snippet.actualStartTime)).getTime();

  stop();

  async function stop() {
    if (Date.now() - actualStartTime < streamDesiredLength) {
      let note = 'DO NOT close the terminal yet. Still uploading your video.\nOnly uploaded ' + 100 * ((Date.now() - actualStartTime) / streamDesiredLength) + '% of video'
      printYellow(note);
      return setTimeout(stop, 2000);
    }


    // tell google that stream has stopped
    let data = await axios(`https://www.googleapis.com/youtube/v3/liveBroadcasts/transition?id=${stream.youtubeId}&broadcastStatus=complete&part=id`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      }
    });
    data = await data.json();

    if (data.error)
      //rewrite for electron

    execp('taskkill', ['/im ffmpeg.exe', '/t', '/f']).then(({ err, stdout, stderr }) => {
      if (err) {
        //rewrite for electron
      }

    });

    clearStream();

    printYellow('It is OK to close the terminal now. Your video has been completely uploaded!');
  }
  return { success: true };
});

//Once I get around to implementing QRCodes
// app.get('/api/ip', (req, res) => {
//   res.send({
//     success: true,
//     ip: getLanIpAddress() + ':' + port
//   });
// });

app.on('ready', createWindow);
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    serverClose.close();
    app.quit();
  }
});
app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});
const clearStream = () =>{
  stream = {
    isStreaming: false,
    startTime: null,
    bookmarks: [],
    uiState: {
      title: '',
      addDate: false,
      playlist: 0,
      bookmarkName: '',
      webcam: 0,
      mic: 0,
    },
    streamId: null,
    youtubeId: null,
    rtmpAddr: null,
    scheduledStartTime: null,
  }
}

//express stuff
server.get('/',(req,res)=>{
  console.log(req.query);
  res.sendFile(__dirname+'\\completion.html');
  getToken(req.query.code);
});
const serverClose = server.listen(port,()=>console.log(`Server is running on port ${port}`));