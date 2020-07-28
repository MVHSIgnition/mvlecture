const { execp } = require('./helpers.js');
const avFounRegEx = /\[AVFoundation indev @ 0x[a-f0-9]*] \[[0-9]*] /;

async function parseDevices(output) {
  let webcams = [];
  let mics = [];

  // Parse output for webcams and mics
  output = output.split('\n');
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

module.exports = async () => {
  const listDevicesCmd = `./ffmpeg -f avfoundation -list_devices true -i ""`;
  let { error, stdout, stderr } = await execp(listDevicesCmd);
  return parseDevices(error.toString())
}