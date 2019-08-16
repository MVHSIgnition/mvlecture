const express = require('express');
const app = express();
const { exec } = require('child_process');

app.use(express.json()); // to support JSON-encoded bodies

app.use(express.static(__dirname + '/docs/'));

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
            
            exec('ffmpeg -y -f dshow -video_size 1920x1080 -framerate 30 -i video="USB_Camera":audio="'+ micName +'" -f dshow -video_size 1280x720 -framerate 30 -i video="Logitech HD Webcam C270" -filter_complex "[0:v]pad=iw+1280:ih[int];[int][1:v]overlay=W-w:0[vid]" -map [vid] -map 0:a -r 10 -copyts -profile:v high -pix_fmt yuvj420p -level:v 4.1 -preset veryslow -crf 37 -tune zerolatency -vcodec libx264 -b:v 512k -acodec aac -ac 2 -ab 32k -ar 44100 -f flv "'+ req.body.rtmpAddr +'"', 
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

/*
Test command:

ffmpeg -y -f dshow -video_size 1920x1080 -framerate 30 -i video="USB_Camera":audio="Microphone (C-Media USB Audio Device   )" -f dshow -video_size 1280x720 -framerate 30 -i video="Logitech HD Webcam C270" -filter_complex "[0:v]pad=iw+1280:ih[int];[int][1:v]overlay=W-w:0[vid]" -map [vid] -map 0:a -r 10 -copyts -profile:v high -pix_fmt yuvj420p -level:v 4.1 -preset veryslow -crf 37 -tune zerolatency -vcodec libx264 -b:v 512k -acodec aac -ac 2 -ab 32k -ar 44100 output.mp4
ffmpeg -y -f dshow -video_size 1920x1080 -i video="USB_Camera":audio="Microphone (C-Media USB Audio Device   )" -profile:v high -pix_fmt yuvj420p -level:v 4.1 -preset ultrafast -tune zerolatency -vcodec libx264 -r 10 -b:v 2M -acodec aac -ac 2 -ab 32k -ar 44100 output1.mp4
ffmpeg -y -f dshow -i video="USB_Camera":audio="Microphone (C-Media USB Audio Device   )" -profile:v high -pix_fmt yuvj420p -level:v 4.1 -preset ultrafast -tune zerolatency -vcodec libx264 -r 10 -b:v 2M -acodec aac -ac 2 -ab 32k -ar 44100 output2.mp4
ffmpeg -y -f dshow -video_size 1280x720 -i video="USB Video Device":audio="Microphone (C-Media USB Audio Device   )" -profile:v high -pix_fmt yuvj420p -level:v 4.1 -preset ultrafast -tune zerolatency -vcodec libx264 -r 10 -b:v 2M -acodec aac -ac 2 -ab 32k -ar 44100 output3.mp4

*/