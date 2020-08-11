# MVLecture

MVLecture is a software package built on top of Node.js and ffmpeg that can easily and simply stream your choice of webcam and mic to a YouTube account. It includes features for flipping the webcam (if it's upside-down), among others. It runs on both Mac and Windows, but currently runs best on Windows.

## Getting Started

### Clone this repository and install dependencies

```bash
$ git clone https://github.com/mvhsignition/mvlecture.git && cd mvlecture && npm install
```

Node.js must be installed for this to work. The ffmpeg executable is included in this Git repository, so you don't need to download that.

### Start server

```bash
node server.js
```

This will start the server at port 1266. Open that in any browser to start streaming from your YouTube account.

### Config file

For some additional configuration, you can create a config file called config.json. Here are the options you have to adjust:

```javascript
{
  "shouldStreamToYoutube": true, // (Windows) [true by default] false will save the recording to a local file
  "youtubeCompression": true, // (Windows) [true by default] false will turn of compression; less CPU but more network required
  "flipVideo": true // (Mac and Windows) [true by default] will flip the video 180deg
}
```

## Contributing

The code currently works best on Windows computers. If you'd like to add more features or improve Mac support, please submit a pull request.
