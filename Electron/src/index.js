const { app, BrowserWindow,ipcMain,shell } = require('electron');
const express = require('express');
const crypto = require('crypto');
const server = express();
const axios = require('axios');
const port = 9004;
if (require('electron-squirrel-startup')) { 
  //app.quit();
  return;
}
let mainWindow;
let verifier;
let token;
const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences:{
      nodeIntegration: true
    }
  });
  mainWindow.loadURL(`file://${__dirname}/index.html`);
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
ipcMain.on("signin",async (event) =>{
  signin();
});
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
  }).catch((err)=>{
    console.log(err);
  })
  
}
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


//express stuff
server.get('/',(req,res)=>{
  console.log(req.query);
  res.sendFile(__dirname+'\\main.html');
  getToken(req.query.code);
});
const serverClose = server.listen(port,()=>console.log(`Server is running on port ${port}`));