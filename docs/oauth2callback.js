// Create timestamps array based on localStorage
// https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage

var timestamps = localStorage.getItem('timestamps') ? JSON.parse(localStorage.getItem('timestamps')) : [];
updateBookmarksList();

var isStreaming = false;
var startDate;

if (!window.location.hash) { // if people go to this page without first signing into Google
    window.location.href = '/';
}

// Get url hash contents
var json_str_escaped = window.location.hash.slice(1);
var params = JSON.parse('{"' + decodeURI(json_str_escaped).replace(/"/g, '\\"').replace(/&/g, '","').replace(/=/g,'":"') + '"}');

function thereIsAnError(error) {
    console.log('Error:', error);
    document.getElementById('error').innerHTML = 'Error: ' + error;
    document.getElementById('error').style.display = 'inline-block';
}

// Validate token, print error if not valid
if (!params.error) {
    document.getElementById('error').innerHTML = '';
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

var broadcastData = {};

function markTimestamp() {
    if (isStreaming) {
        document.getElementById('error').innerHTML = '';
        document.getElementById('error').style.display = 'none';
        
        var msDif = Date.now() - startDate.getTime();
        var timestamp = getTimestamp(msDif);
        
        console.log(timestamp);
        addToBookmarksList(timestamp);
        timestamps.push(timestamp);
        localStorage.setItem('timestamps', JSON.stringify(timestamps));
    }
}

function updateYoutubeDescription() {
    document.getElementById('error').innerHTML = '';
    document.getElementById('error').style.display = 'none';
    document.getElementById('success').innerHTML = '';

    console.log('broadcastData: ', broadcastData);

    var timestampsString = 'Bookmarks:\n';
    for (var i = 0; i < timestamps.length; i++) {
        timestampsString += timestamps[i] + '\n';
    }
    timestampsString += '\nMade possible by the MVHS Ignition Club';
    console.log(timestampsString);

    var data = {
        id: broadcastData.id,
        snippet: {
            description: timestampsString,
            title: broadcastData.snippet.title,
            scheduledStartTime: broadcastData.snippet.scheduledStartTime,
        }
    };

    fetch('https://www.googleapis.com/youtube/v3/liveBroadcasts?part=id,snippet', {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + params.access_token,
        },
        body: JSON.stringify(data),
    }).then(res => res.json()).then(data => {
        if (data.error) {
            console.log(data.error);
            document.getElementById('error').innerHTML = 'An error occured when trying to update Youtube description';
            document.getElementById('error').style.display = 'inline-block';
        } else {
            document.getElementById('success').innerHTML = 'Successfully updated Youtube description';
        }
    }).catch(error => {
        console.log(error);
    });
}

function startEndStream() {
    //document.getElementById('startBtn').classList.add('transitioning');
    document.getElementById('startBtn').disabled = true;

    if (!isStreaming) {
        if (!document.getElementById('title').value) {
            document.getElementById('error').innerHTML = 'Please enter a stream name';
            document.getElementById('error').style.display = 'inline-block';
            document.getElementById('startBtn').disabled = false;
            return;
        }

        broadcastData = {};
        document.getElementById('startBtn').innerHTML = 'Starting Stream...';
        document.getElementById('error').innerHTML = '';
        document.getElementById('error').style.display = 'none';

        // Start stream
        var insertLiveStreamData = JSON.stringify({
            snippet: {
                title: "Teacher LiveStream"
            },
            cdn: {
                resolution: "720p",
                frameRate: "30fps",
                ingestionType: "rtmp"
            }
        });

        fetch('https://www.googleapis.com/youtube/v3/liveStreams?part=snippet,cdn', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + params.access_token,
            },
            body: insertLiveStreamData
        }).then(res => res.json()).then(data => {
            console.log('INSERT liveStream: ', data);

            if (data.error) {
                throw 'INSERT liveStream failed.';
            }

            broadcastData.streamId = data.id;
            broadcastData.rtmpAddr = data.cdn.ingestionInfo.ingestionAddress + '/' + data.cdn.ingestionInfo.streamName;

            var timeISOString = new Date().toISOString();
            var insertLiveBroadcastData = JSON.stringify({
                snippet: {
                    scheduledStartTime: timeISOString,
                    title: document.getElementById('title').value
                },
                status: {
                    privacyStatus: "public"
                },
                contentDetails: {
                    recordFromStart: true,
                    enableAutoStart: true
                }
            });

            return fetch('https://www.googleapis.com/youtube/v3/liveBroadcasts?part=snippet,status,contentDetails', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + params.access_token,
                },
                body: insertLiveBroadcastData,
            });
        }).then(res => res.json()).then(data => {
            console.log('INSERT liveBroadcast: ', data);

            if (data.error) {
                throw 'INSERT liveBroadcast failed.';
            }

            broadcastData = {...data, ...broadcastData}; // this merges the two objects

            //var bindLiveBroadcastURL = 'https://www.googleapis.com/youtube/v3/liveBroadcasts/bind?apix_params={"id":"' + broadcastId + '","part":"id","streamId":"' + broadcastData.streamId + '"}';
            var bindLiveBroadcastURL = 'https://www.googleapis.com/youtube/v3/liveBroadcasts/bind?id=' + broadcastData.id + '&part=id&streamId=' + broadcastData.streamId;
            //console.log(bindLiveBroadcastURL);

            return fetch(bindLiveBroadcastURL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + params.access_token,
                }
            });
        }).then(res => res.json()).then(data => {
            console.log('BIND liveBroadcast: ', data);

            if (data.error) {
                throw 'BIND liveBroadcast failed.';
            }
            
            return fetch('../start_streaming', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    rtmpAddr: broadcastData.rtmpAddr
                })
            });
        }).then(() => {
            document.getElementById('startBtn').className = 'changedButton';
            document.getElementById('startBtn').innerHTML = 'Stop Streaming';
            document.getElementById('bookmarksDiv').style.display = 'block';
            document.getElementById('startBtn').disabled = false;
            isStreaming = true;
            startDate = new Date();
        }).catch(error => {
            console.log(error);
            thereIsAnError('An error occured when starting the stream...please try refreshing the page.');
        });
    } else {
        setTimeout(() => {
            // Stop the stream
            fetch('../stop_streaming', {
                method: 'POST'
            }).then(() => {
                var transitionLiveBroadcastURL = 'https://www.googleapis.com/youtube/v3/liveBroadcasts/transition?id='+broadcastData.id+'&broadcastStatus=complete&part=id';
                return fetch(transitionLiveBroadcastURL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + params.access_token,
                    }
                });
            }).then(res => res.json()).then(data => {
                console.log('TRANSITION liveBroadcast: ', data);
                document.getElementById('startBtn').className = 'button1';
                document.getElementById('startBtn').innerHTML = 'Start Streaming';
                document.getElementById('bookmarksDiv').style.display = 'none';
                document.getElementById('startBtn').disabled = false;
                isStreaming = false;
                updateYoutubeDescription();
                clearBookmarks();
            });
        }, 3000);

        document.getElementById('error').innerHTML = '';
        document.getElementById('error').style.display = 'none';
        document.getElementById('startBtn').innerHTML = 'Stopping Stream...';
    }
}

function clearBookmarks() {
    localStorage.removeItem('timestamps');
    timestamps = [];
    updateBookmarksList();
}

function updateBookmarksList() {
    let html = ''
    for (var i = 0; i < timestamps.length; i++) {
        html += '<li>' + timestamps[i] + '</li>';
    }
    document.getElementById('bookmarks').innerHTML = html;
}

function addToBookmarksList(timestamp) {
    document.getElementById('bookmarks').innerHTML += '<li>' + timestamp + '</li>';
}

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