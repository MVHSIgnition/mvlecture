const express = require('express');
const app = express();
const { exec } = require('child_process');

app.use(express.json()); // to support JSON-encoded bodies

app.use(express.static(__dirname + '/docs/'));

/*app.get('/', (req, res) => {
    var url = 'https://accounts.google.com/o/oauth2/auth?' + 
					'client_id=946689392269-rd0qkinhi24uv8q7kf7pc981sd0vm9mf.apps.googleusercontent.com&' +
					'redirect_uri=http%3A%2F%2F' + window.location.host + '%2Foauth2callback&' + 
					'scope=https://www.googleapis.com/auth/youtube&response_type=token';
    res.redirect(url);
    //res.sendFile(__dirname + '/www/index.html');
});

app.get('/oauth2callback', (req, res) => {
    res.sendFile(__dirname + '/www/index.html');
    console.log(req);
    console.log(req.originalUrl);
    console.log(url.parse(req.originalUrl));
});
*/

app.post('/start_streaming', (req, res) => {
    console.log(req.body);
    exec('ffmpeg -list_devices true -f dshow -i dummy', (err, stdout, stderr) => {
        if (err) {
            console.log(err);

            var firstQuote = stderr.indexOf('"');
            var secondQuote = stderr.indexOf('"', firstQuote+1);
            var inputVidName = stderr.substring(firstQuote+1, secondQuote);
            console.log('input vid: ', inputVidName);

            var audio = stderr.indexOf('DirectShow audio devices');
            var thirdQuote = stderr.indexOf('"', audio);
            var fourthQuote = stderr.indexOf('"', thirdQuote+1);
            var micName = stderr.substring(thirdQuote+1, fourthQuote);
            console.log('mic: ', micName);

            exec('ffmpeg -f dshow -i video="'+ inputVidName +'":audio="'+ micName +'" -profile:v high -pix_fmt yuvj420p -level:v 4.1 -preset ultrafast -tune zerolatency -vcodec libx264 -r 10 -b:v 512k -s 640x360 -acodec aac -ac 2 -ab 32k -ar 44100 -f flv "'+ req.body.rtmpAddr +'"', 
                (err, stdout, stderr) => {
                    console.log('*****************************************************************\nREACHED THIS POINT\n******************************************************');
                    
                    if (err) {
                        console.log(err);
                    }
                    console.log(`stdout: ${stdout}`);
                    console.log(`stderr: ${stderr}`);
                });
        }
    });
    
    res.end();
});

app.post('/stop_streaming', (req, res) => {
    exec('taskkill /im ffmpeg.exe /t /f', (err, stdout, stderr) => {
        if (err) {
            console.log(err);
        }
        console.log('*****************************************************************\nENDED STREAM\n******************************************************');
        console.log(`stdout: ${stdout}`);
        console.log(`stderr: ${stderr}`);
    });
    res.end();
});

let listener = app.listen(process.env.PORT || 1266, () => {
    let port = listener.address().port;
    console.log('Server listening on port', port);
});