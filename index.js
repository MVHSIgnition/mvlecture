const express = require('express');
const app = express();
const http = require('http').Server(app);
const url = require('url');

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

http.listen(process.env.PORT || 1266, function() {
    var port = http.address().port;
    console.log('Server listening on port ', port)
});