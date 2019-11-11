let bookmarksManager = new BookmarksManager();

/*if (!window.location.search) { // if people go to this page without first signing into Google
    window.location.href = '/';
}*/

var socket = io();
// Get url hash contents
var isStreaming;
let stream = null;

/*************
 * FUNCTIONS *
 *************/
function getTimestamp(ms) {
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

function thereIsAnError(error) {
    if (error) {
        console.log('Error:', error);
        document.getElementById('error').innerHTML = 'Error: ' + error;
        document.getElementById('error').style.display = 'inline-block';
    } else {
        document.getElementById('error').innerHTML = '';
        document.getElementById('error').style.display = 'none';
    }
}

function createBookmark() {
    if (isStreaming) {
        thereIsAnError(null);

        var msDif = Date.now() - stream.startTime;
        let name = document.getElementById('nameOfBookmark').value;
        document.getElementById('nameOfBookmark').value = '';

        bookmarksManager.add(getTimestamp(msDif), name);   
    }
}

function setStreaming(isStreaming) {
    if (isStreaming) {
        document.getElementById('startBtn').className = 'changedButton';
        document.getElementById('startBtn').innerHTML = 'Stop Streaming';
        document.getElementById('bookmarksDiv').style.display = 'block';
        document.getElementById('youtubeLinkDiv').style.display = 'block';
        document.getElementById('startBtn').disabled = false;
        title.disabled = 'true';

        optionsDiv.style.display = 'none';
    } else {
        document.getElementById('startBtn').className = 'button1';
        document.getElementById('startBtn').innerHTML = 'Start Streaming';
        document.getElementById('bookmarksDiv').style.display = 'none';
        document.getElementById('youtubeLinkDiv').style.display = 'none';
        document.getElementById('startBtn').disabled = false;
        title.disabled = '';

        optionsDiv.style.display = 'block';
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

        fetch('../api/init-stream', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                title,
                playlistId: playlistSelect.value
            })
        }).then(res => res.json()).then(data => {
            if (!data.success) {
                thereIsAnError(data.error);
                setStreaming(false);
            }
            //setState();
        });
    } else {
        document.getElementById('error').innerHTML = '';
        document.getElementById('error').style.display = 'none';
        document.getElementById('startBtn').innerHTML = 'Stopping Stream...';

        setTimeout(() => {
            // Stop the stream
            fetch('../api/stop-streaming', {
                method: 'POST',
            }).then(res => res.json()).then(data => {
                if (!data.success) {
                    thereIsAnError(data.error);
                } else {
                    setStreaming(false);
                }

                //setState();
            });
        }, 3000);
    }
}

/************************
 * Initialization stuff *
 ************************/

fetch('../api/ip').then(res => res.json()).then(data => {
    let { ip } = data;
    let link = 'http://' + ip + location.pathname + location.hash;
    document.querySelector('#qrCodeDiv img').src = `https://chart.googleapis.com/chart?cht=qr&chs=300x300&chl=${encodeURIComponent(link)}`;
});

/****************
 * Socket stuff *
 ****************/
socket.on('is authenticated', data => {
    if (!data.authenticated) {
        window.location.href = '/';
    }
});

socket.on('update progress', data => {
    uploadVidName.innerHTML = data.title;
    uploadProgress.innerHTML = data.progress;
});

socket.on('update state', data => {
    stream = data.stream;

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
        bookmarksManager.setBookmarks(stream.bookmarks);
        let link = 'https://youtu.be/' + stream.youtubeId;
        youtubeLink.href = link;
        youtubeLink.innerHTML = link;
        nameOfBookmark.value = stream.uiState.bookmarkName;
    }

    isStreaming = stream.isStreaming;
    setStreaming(stream.isStreaming);
});

socket.on('update mics', data => {
    const { mics } = data;
    micSelect.length = 0;
    for (let i = 0; i < mics.length; i++) {
        let opt = document.createElement('option');
        opt.value = i;
        opt.innerText = mics[i];
        micSelect.appendChild(opt);
    }
});

socket.on('update webcams', data => {
    const { webcams } = data;
    webcamSelect.length = 0;
    for (let i = 0; i < webcams.length; i++) {
        let opt = document.createElement('option');
        opt.value = i;
        opt.innerText = webcams[i].name;
        webcamSelect.appendChild(opt);
    }
});

socket.on('update playlists', data => {
    const { playlists } = data;
    playlistSelect.length = 0;
    playlistSelect.innerHTML = '<option value="">None</option>';
    for (let i = 0; i < playlists.length; i++) {
        let opt = document.createElement('option');
        opt.value = playlists[i].id;
        opt.innerText = playlists[i].title;
        playlistSelect.appendChild(opt);
    }
});

title.addEventListener('input', () => {
    socket.emit('title changed', title.value);
});
addDate.addEventListener('change', () => {
    socket.emit('date checkbox changed', addDate.checked);
});
playlistSelect.addEventListener('change', () => {
    socket.emit('playlist select changed', playlistSelect.selectedIndex);
});
webcamSelect.addEventListener('change', () => {
    socket.emit('webcam select changed', webcamSelect.selectedIndex);
});
micSelect.addEventListener('change', () => {
    socket.emit('mic select changed', micSelect.selectedIndex);
});
nameOfBookmark.addEventListener('input', () => {
    socket.emit('bookmark name changed', nameOfBookmark.value);
});

