const { execp } = require('./helpers.js');
const avFounRegEx = /\[AVFoundation indev @ 0x[a-f0-9]*] \[[0-9]*] /;

async function parseDevices() {
  const listDevicesCmd = `./ffmpeg -f avfoundation -list_devices true -i ""`;
  let { error, stdout, stderr } = await execp(listDevicesCmd);

  let webcams = [];
  let mics = [];

  // Parse output for webcams and mics
  let output = error.toString().split('\n');
  let line = 0;
  while (line < output.length && !output[line].includes('AVFoundation video devices:'))
    line++;

  if (!output[line].includes('AVFoundation video devices:'))
    throw new Error("Parse error");

  while (++line < output.length && !output[line].includes('AVFoundation audio devices:')) {
    if (output[line].match(avFounRegEx)) // has any matches
      webcams.push(output[line].replace(avFounRegEx, '')); // removes the bad part
  }

  while (++line < output.length) {
    if (output[line].match(avFounRegEx)) // has any matches
      mics.push(output[line].replace(avFounRegEx, '')); // removes the bad part
  }

  return { webcams, mics }
}

async function parseDevicesSwift() {
  let { error, stdout, stderr } = await execp('./lib/swift/devices');
  let output = stdout.toString().split('\n');

  let webcams = [];
  let mics = JSON.parse(output[output.length - 1]);
  for (let i = 0; i < output.length - 1; i++) {
    webcams.push(JSON.parse(output[i]));
  }

  return { webcams, mics }
}

module.exports = parseDevicesSwift