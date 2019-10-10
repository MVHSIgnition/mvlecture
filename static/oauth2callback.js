class BookmarksManager {
    constructor() {
        this.bookmarks = [];
        this.render();
    }

    render() {
        document.getElementById('bookmarks').innerHTML = this.toHTMLString();
    }

    toHTMLString() {
        let html = '';

        for (let i = 0; i < this.bookmarks.length; i++) {
            let bookmark = this.bookmarks[i];
            html += `
                <div class="each-bookmark">
                    ${bookmark.name} — ${bookmark.time}
                    <button class="edit-btn" onclick="bookmarksManager.edit(${i})">Edit</button>
                    <button class="remove-btn" onclick="bookmarksManager.remove(${i})">X</button>
                </div>
                <br>
            `;
        }

        return html;
    }

    add(time, name) {
        this.bookmarks.push({
            time,
            name: name || 'Untitled bookmark'
        });
        
        this.save();
        this.render();
    }

    save() {
        fetch('../api/set-bookmarks', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                bookmarks: this.bookmarks,
                oauthToken: params.access_token
            })
        });
    }

    edit(i = 0) {
        let newName = prompt('What should the name of this bookmark be?', this.bookmarks[i].name);

        if (newName) {
            this.bookmarks[i].name = newName;
        }

        this.save();
        this.render();
    }

    remove(i = 0) {
        this.bookmarks.splice(i, 1);
        this.save();
        this.render();
    }

    clearAll() {
        this.bookmarks = [];
        this.save();
        this.render();
    }

    setBookmarks(bookmarks) {
        this.bookmarks = bookmarks;
        this.render();
    }
}

let bookmarksManager = new BookmarksManager();


if (!window.location.hash) { // if people go to this page without first signing into Google
    window.location.href = '/';
}

// Get url hash contents
var json_str_escaped = window.location.hash.slice(1);
var params = JSON.parse('{"' + decodeURI(json_str_escaped).replace(/"/g, '\\"').replace(/&/g, '","').replace(/=/g,'":"') + '"}');
var isStreaming;

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

        fetch('../api/state').then(res => res.json()).then(data => {
            let stream = data.stream;
            var msDif = Date.now() - stream.startTime;
            let name = document.getElementById('nameOfBookmark').value;
            document.getElementById('nameOfBookmark').value = '';

            bookmarksManager.add(getTimestamp(msDif), name);
        });       
    }
}

function checkValidToken() {
    // Validate token, print error if not valid
    if (!params.error) {
        thereIsAnError(null);
        fetch('https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=' + params.access_token)
        .then(res => res.json())
        .then(data => {
            if (data.error) {
                thereIsAnError(data.error);
            }

            // if their token has expired, and they need to sign-in again
            if (data.error === 'invalid_token') {
                window.location.href = '/';
            }
        })
        .catch(err => thereIsAnError(err));
    } else {
        thereIsAnError(params.error);
    }
}

function setStreaming(isStreaming) {
    if (isStreaming) {
        document.getElementById('startBtn').className = 'changedButton';
        document.getElementById('startBtn').innerHTML = 'Stop Streaming';
        document.getElementById('bookmarksDiv').style.display = 'block';
        document.getElementById('youtubeLinkDiv').style.display = 'block';
        document.getElementById('startBtn').disabled = false;
        document.querySelector('label').style.display = 'none';
        adfjaskdic.style.display = 'none';
        title.disabled = 'true';
        playlistSelect.style.display = 'none';
        addDate.style.display = 'none';
    } else {
        document.getElementById('startBtn').className = 'button1';
        document.getElementById('startBtn').innerHTML = 'Start Streaming';
        document.getElementById('bookmarksDiv').style.display = 'none';
        document.getElementById('youtubeLinkDiv').style.display = 'none';
        document.getElementById('startBtn').disabled = false;
        document.querySelector('label').style.display = '';
        adfjaskdic.style.display = '';
        title.disabled = '';
        playlistSelect.style.display = '';
        addDate.style.display = '';
    }
}

function startEndStream() {
    checkValidToken();
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
                oauthToken: params.access_token,
                title,
                playlistId: playlistSelect.value
            })
        }).then(res => res.json()).then(data => {
            if (!data.success) {
                thereIsAnError(data.error);
                setStreaming(false);
            }
            setState();
        });
    } else {
        document.getElementById('error').innerHTML = '';
        document.getElementById('error').style.display = 'none';
        document.getElementById('startBtn').innerHTML = 'Stopping Stream...';

        setTimeout(() => {
            // Stop the stream
            fetch('../api/stop-streaming', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    oauthToken: params.access_token
                })
            }).then(res => res.json()).then(data => {
                if (!data.success) {
                    thereIsAnError(data.error);
                } else {
                    setStreaming(false);
                }

                setState();
            });
        }, 3000);
    }
}

function setState() {
    fetch('../api/state').then(res => res.json()).then(data => {
        let stream = data.stream;
        
        isStreaming = stream.isStreaming;
        setStreaming(stream.isStreaming);
        document.getElementById('title').value = stream.title;

        if (isStreaming) {
            bookmarksManager.setBookmarks(stream.bookmarks);
        }

        
        let youtubeLink = 'https://youtu.be/' + stream.youtubeId;
        let youtubeLinkElement = document.getElementById('youtubeLink');
        youtubeLinkElement.href = youtubeLink;
        youtubeLinkElement.innerHTML = youtubeLink;
    });
}

function loadPlaylists() {
    fetch('https://www.googleapis.com/youtube/v3/playlists?part=snippet&mine=true', {
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + params.access_token,
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
}

/************************
 * Initialization stuff *
 ************************/
checkValidToken();
setState();
loadPlaylists();
