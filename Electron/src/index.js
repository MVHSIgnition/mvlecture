const {ipcRenderer} = require('electron');
let isStreaming;
let bookmarksManager = new BookmarksManager();
let stream;
//ipcRenderer.on('auth') => delete particle.js
const getTimestamp=(ms)=> {
    if (ms > 0) {
        var s, m, h;
        s = Math.floor(ms / 1000);
        m = Math.floor(s / 60);
        h = Math.floor(m / 60);
        s %= 60;
        m %= 60;

        var fmt = '';
        if (Math.floor(h / 10) == 0)
            fmt += '0';
        fmt += h + ':';
        if (Math.floor(m / 10) == 0)
            fmt += '0';
        fmt += m + ':';
        if (Math.floor(s / 10) == 0)
            fmt += '0';
        fmt += s;
        
        return fmt;
    } else {
        return '00:00:00';
    }
}
const thereIsAnError = (error)=> {
    if (error) {
        console.log('Error:', error);
        document.getElementById('error').innerHTML = 'Error: ' + error;
        document.getElementById('error').style.display = 'inline-block';
    } else {
        document.getElementById('error').innerHTML = '';
        document.getElementById('error').style.display = 'none';
    }
}

const setStreaming = (isStreaming)=> {
    if (isStreaming) {
        document.getElementById('startBtn').className = 'changedButton';
        document.getElementById('startBtn').innerHTML = 'Stop Streaming';
        document.getElementById('youtubeLinkDiv').style.display = 'block';
        document.getElementById('startBtn').disabled = false;
        title.disabled = 'true';

        optionsDiv.style.display = 'none';
    } else {
        document.getElementById('startBtn').className = 'button1';
        document.getElementById('startBtn').innerHTML = 'Start Streaming';
        document.getElementById('youtubeLinkDiv').style.display = 'none';
        document.getElementById('startBtn').disabled = false;
        title.disabled = '';

        optionsDiv.style.display = 'block';
    }
}
const createBookmark=()=> {
    if (isStreaming) {
        thereIsAnError(null);

        var msDif = Date.now() - stream.startTime;
        let name = document.getElementById('nameOfBookmark').value;
        document.getElementById('nameOfBookmark').value = '';

        bookmarksManager.add(getTimestamp(msDif), name);   
    }
}

function startEndStream() {
    document.getElementById('startBtn').disabled = true;

    if (!isStreaming) {
        let title = document.getElementById('title').value;
        if (!title) {
            thereIsAnError('Please enter a stream name');
            document.getElementById('startBtn').disabled = false;
            return;
        }

        if (addDate.checked) {
            title = title.trim() + ' (' + new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ')';
        }

        document.getElementById('title').value = title;

        broadcastData = {};
        document.getElementById('startBtn').innerHTML = 'Starting Stream...';
        thereIsAnError(null);
        ipcRenderer.invoke('init-stream',title,playlistSelect.value).then((res)=>{
            if(!res.success){
                thereIsAnError(res.error);
                setStreaming(false);
            }
        });
    } else {
        document.getElementById('error').innerHTML = '';
        document.getElementById('error').style.display = 'none';
        document.getElementById('startBtn').innerHTML = 'Stopping Stream...';

        setTimeout(() => {
            // Stop the stream
            ipcRenderer.invoke('stop-streaming').then((res)=>{
                if (!res.success) {
                    thereIsAnError(res.error);
                } else {
                    setStreaming(false);
                }
            });
        }, 3000);
    }
}

function loadPlaylists() {
    ipcRenderer.invoke('token').then((token)=>{
        fetch('https://www.googleapis.com/youtube/v3/playlists?part=snippet&mine=true', {
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token,
        }
    }).then(res => res.json()).then(res => {
        let { items } = res;

        for (let i = 0; i < items.length; i++) {
            let opt = document.createElement('option');
            opt.value = items[i].id;
            opt.innerText = items[i].snippet.title;
            playlistSelect.appendChild(opt);
        }
    });
    });
}
loadPlaylists();
//For a later point in time
// fetch('../api/ip').then(res => res.json()).then(data => {
//     let { ip } = data;
//     let link = 'http://' + ip + location.pathname + location.hash;
//     document.querySelector('#qrCodeDiv img').src = `https://chart.googleapis.com/chart?cht=qr&chs=300x300&chl=${encodeURIComponent(link)}`;
// });
ipcRenderer.on('update state',(event,incomingstream)=>{
    stream = incomingstream;
    if (!stream.isStreaming) {
        document.getElementById('title').value = stream.uiState.title;
        document.getElementById('addDate').checked = stream.uiState.addDate;
        setTimeout(() => { // needs a second to load playlists
            document.getElementById('playlistSelect').selectedIndex = stream.uiState.playlist;
        }, 500);
        webcamSelect.selectedIndex = stream.uiState.webcam;
        micSelect.selectedIndex = stream.uiState.mic;
    } else {
        title.value = stream.title;
        let link = 'https://youtu.be/' + stream.youtubeId;
        youtubeLink.href = link;
        youtubeLink.innerHTML = link;
    }

    isStreaming = stream.isStreaming;
    setStreaming(stream.isStreaming);
});
ipcRenderer.on('update mics',(event,mics)=>{
    micSelect.length = 0;
    for (let i = 0; i < mics.length; i++) {
        let opt = document.createElement('option');
        opt.value = i;
        opt.innerText = mics[i];
        micSelect.appendChild(opt);
    }
});
ipcRenderer.on('update webcams',(event,webcams)=>{
    webcamSelect.length = 0;
    for (let i = 0; i < webcams.length; i++) {
        let opt = document.createElement('option');
        opt.value = i;
        opt.innerText = webcams[i].name;
        webcamSelect.appendChild(opt);
    }
});


title.addEventListener('input', () => {
    ipcRenderer.send('title changed', title.value);
});
addDate.addEventListener('change', () => {
    ipcRenderer.send('date checkbox changed', addDate.checked);
});
playlistSelect.addEventListener('change', () => {
    ipcRenderer.send('playlist select changed', playlistSelect.selectedIndex);
});
webcamSelect.addEventListener('change', () => {
    ipcRenderer.send('webcam select changed', webcamSelect.selectedIndex);
});
micSelect.addEventListener('change', () => {
    ipcRenderer.send('mic select changed', micSelect.selectedIndex);
});
nameOfBookmark.addEventListener('input', () => {
    ipcRenderer.send('bookmark name changed', nameOfBookmark.value);
});
