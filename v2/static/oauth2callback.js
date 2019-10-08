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
    } else {
        document.getElementById('startBtn').className = 'button1';
        document.getElementById('startBtn').innerHTML = 'Start Streaming';
        document.getElementById('bookmarksDiv').style.display = 'none';
        document.getElementById('youtubeLinkDiv').style.display = 'none';
        document.getElementById('startBtn').disabled = false;
    }
}

function updateYoutubeDescription() {
    let title = document.getElementById('title').value;
    let credits = 'Written by the MVHS Ignition Club\n\nMain project leads:\n    Jonathan Liu and Erik Zhang\nProject Manager:\n    Erik Zhang\nSoftware backend:\n    Jonathan Liu\nUser interface + bookmarks:\n    Arjun Patrawala\nHardware:\n    Ian Schneider';
    let description = `Bookmarks: \n\n${credits}`;

    return fetch('../api/update-stream', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            title: title,
            description: description
        })
    }).then(res => res.json()).then(data => {
        if (!data.success) {
            thereIsAnError(data.error);
        }
    });
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
                title: title
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
            updateYoutubeDescription().then(() => {
                fetch('../api/stop-streaming', {
                    method: 'POST'
                }).then(res => res.json()).then(data => {
                    if (!data.success) {
                        thereIsAnError(data.error);
                    } else {
                        setStreaming(false);
                    }

                    setState();
                });
            });
        }, 3000);
    }
}

function setState() {
    fetch('../api/state', {
        method: 'GET'
    }).then(res => res.json()).then(data => {
        let stream = data.stream;
        
        isStreaming = stream.isStreaming;
        setStreaming(stream.isStreaming);
        document.getElementById('title').value = stream.title;
        
        let youtubeLink = 'https://youtu.be/' + stream.youtubeId;
        let youtubeLinkElement = document.getElementById('youtubeLink');
        youtubeLinkElement.href = youtubeLink;
        youtubeLinkElement.innerHTML = youtubeLink;
    });
}

/************************
 * Initialization stuff *
 ************************/
checkValidToken();
setState();