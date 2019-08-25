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

            /*var firstQuote = stderr.indexOf('"');
            var secondQuote = stderr.indexOf('"', firstQuote+1);
            var inputVidName = stderr.substring(firstQuote+1, secondQuote);
            console.log('input vid: ', inputVidName);

            var audio = stderr.indexOf('DirectShow audio devices');
            var thirdQuote = stderr.indexOf('"', audio);
            var fourthQuote = stderr.indexOf('"', thirdQuote+1);
            var micName = stderr.substring(thirdQuote+1, fourthQuote);
            console.log('mic: ', micName);*/

            const webcam1 = {
                name: 'USB Camera',
                resolution: '1920x1080',
                framerate: '30',
            };
            const webcam2 = {
                name: 'USB_Camera',
                resolution: '1920x1080',
                framerate: '30',
            };
            const micName = 'Microphone Array (Realtek High Definition Audio(SST))';
            
            // horizontalStackCmd stacks the view from webcam1 to the left of the view from webcam2
            const horizontalStackCmd = 'ffmpeg -y -f dshow -video_size '+ webcam1.resolution +' -framerate '+ webcam1.framerate +' -i video="'+ webcam1.name +'":audio="'+ micName +'" -f dshow -video_size '+ webcam2.resolution +' -framerate '+ webcam2.framerate +' -i video="'+ webcam2.name +'" -i ./img/ignition.png -filter_complex "[0:v]pad=iw+1280:ih[int];[int][1:v]overlay=W-w:0[int2];[int2][2:v]overlay=W-w:H-h[vid]" -map [vid] -map 0:a -copyts -c:v libx264 -preset veryfast -maxrate 1984k -bufsize 3968k -g 60 -c:a aac -b:a 128k -ar 44100 -f flv "'+ req.body.rtmpAddr +'"';
            // middleSplitCmd splits the view from webcam1 and puts it to the sides of the video, and places the view from webcam2 in the middle
            const middleSplitCmd = 'ffmpeg -y -f dshow -video_size '+ webcam1.resolution +' -framerate '+ webcam1.framerate +' -i video="'+ webcam1.name +'":audio="'+ micName +'" -f dshow -video_size '+ webcam2.resolution +' -framerate '+ webcam2.framerate +' -i video="'+ webcam2.name +'" -i ./img/ignition_small.png -filter_complex "[0:v]crop=iw/3:ih:0:0[v0_left];[0:v]crop=iw/3:ih:2*iw/3:0[v0_right];[v0_left]pad=5*iw:ih[int];[1:v]scale=1920x1080[v1];[int][v1]overlay=w/3:0[int2];[int2][v0_right]overlay=4*W/5:0[int3];[int3][2:v]overlay=W-w:H-h[vid]" -map [vid] -map 0:a -copyts -c:v libx264 -preset veryfast -maxrate 1984k -bufsize 3968k -g 60 -c:a aac -b:a 128k -ar 44100 -f flv "'+ req.body.rtmpAddr +'"';
            // upsideDownCmd turns the webcam1 view 180 degrees
            const upsideDownCmd = 'ffmpeg -y -f dshow -video_size '+ webcam1.resolution +' -framerate '+ webcam1.framerate +' -i video="'+ webcam1.name +'":audio="'+ micName +'" -i ./img/ignition_small.png -filter_complex "[0:v]transpose=2,transpose=2[v0_upsidedown];[v0_upsidedown][1:v]overlay=W-w:H-h[vid]" -map [vid] -map 0:a -copyts -c:v libx264 -preset veryfast -maxrate 1984k -bufsize 3968k -g 60 -c:a aac -b:a 128k -ar 44100 -f flv "'+ req.body.rtmpAddr +'"';;

            exec(upsideDownCmd, 
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
Ending should be:
-map [vid] -map 0:a -copyts -c:v libx264 -preset veryfast -maxrate 1984k -bufsize 3968k -g 60 -c:a aac -b:a 128k -ar 44100

Test command:

ffmpeg -y -f dshow -video_size 1920x1080 -rtbufsize 702000k -framerate 30 -i video="USB_Camera":audio="Microphone Array (Realtek High Definition Audio(SST))" -f dshow -video_size 1280x720 -rtbufsize 702000k -framerate 30 -i video="USB Video Device" -i ./img/ignition_small.png -filter_complex "[0:v]crop=iw/3:ih:0:0[v0_left];[0:v]crop=iw/3:ih:2*iw/3:0[v0_right];[v0_left]pad=5*iw:ih[int];[1:v]scale=1920x1080[v1];[int][v1]overlay=w/3:0[int2];[int2][v0_right]overlay=4*W/5:0[int3];[int3][2:v]overlay=W-w:H-h[vid]" -map [vid] -map 0:a -copyts -c:v libx264 -preset veryfast -maxrate 1984k -bufsize 3968k -g 60 -c:a aac -b:a 128k -ar 44100 output.mp4 
ffmpeg -y -f dshow -video_size 1920x1080 -i video="USB_Camera":audio="Microphone (C-Media USB Audio Device   )" -profile:v high -pix_fmt yuvj420p -level:v 4.1 -preset ultrafast -tune zerolatency -vcodec libx264 -r 10 -b:v 2M -acodec aac -ac 2 -ab 32k -ar 44100 output1.mp4
ffmpeg -y -f dshow -i video="USB_Camera":audio="Microphone (C-Media USB Audio Device   )" -profile:v high -pix_fmt yuvj420p -level:v 4.1 -preset ultrafast -tune zerolatency -vcodec libx264 -r 10 -b:v 2M -acodec aac -ac 2 -ab 32k -ar 44100 output2.mp4
ffmpeg -y -f dshow -video_size 1280x720 -i video="USB Video Device":audio="Microphone (C-Media USB Audio Device   )" -profile:v high -pix_fmt yuvj420p -level:v 4.1 -preset ultrafast -tune zerolatency -vcodec libx264 -r 10 -b:v 2M -acodec aac -ac 2 -ab 32k -ar 44100 output3.mp4

*/