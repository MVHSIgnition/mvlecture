if (!window.location.hash) { // if people go to this page without first signing into Google
    window.location.href = '/';
}

// Get url hash contents
var json_str_escaped = window.location.hash.slice(1);
var params = JSON.parse('{"' + decodeURI(json_str_escaped).replace(/"/g, '\\"').replace(/&/g, '","').replace(/=/g,'":"') + '"}');

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
checkValidToken();

function startEndStream() {
    document.getElementById('startBtn').disabled = true;

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
    })
}

