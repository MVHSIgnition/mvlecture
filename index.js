const express = require('express');
const app = express();
const http = require('http').Server(app);
const { exec } = require('child_process');

const bodyParser = require('body-parser')
app.use( bodyParser.json() );       // to support JSON-encoded bodies
app.use(express.json());       // to support JSON-encoded bodies

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
    exec('ffmpeg -list_devices true -f dshow -i dummy', 
        (err, stdout, stderr) => {
            if (err) {
                console.log(err);
                return;
            }

            String.raw(stdout);
            //console.log(`stdout: ${stdout}`);
            //console.log(`stderr: ${stderr}`);
        });
    /*exec('ffmpeg -f dshow -i video="Logitech HD Webcam C270":audio="Microphone (HD Webcam C270)" -profile:v high -pix_fmt yuvj420p -level:v 4.1 -preset ultrafast -tune zerolatency -vcodec libx264 -r 10 -b:v 512k -s 640x360 -acodec aac -ac 2 -ab 32k -ar 44100 -f flv "rtmp://a.rtmp.youtube.com/live2/pxeg-0uqs-eu2t-3g28"', 
        (err, stdout, stderr) => {
            if (err) {
                console.log(err);
                return;
            }

            console.log(`stdout: ${stdout}`);
            console.log(`stderr: ${stderr}`);
        });*/
    res.end();
});

http.listen(process.env.PORT || 1266, function() {
    var port = http.address().port;
    console.log('Server listening on port ', port)
});