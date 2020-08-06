const { indexOfMultiple, execp } = require('./helpers.js');

module.exports = async () => {
  const listDevicesCmd = 'ffmpeg -list_devices true -f dshow -i dummy';
  let webcams = [];
  let mics = [];

  let { error, stdout, stderr } = await execp(listDevicesCmd);

  // Parse output for webcams and mics
  const output = error.toString();
  const videoDevicesIndex = output.indexOf('DirectShow video devices');
  const audioDevicesIndex = output.indexOf('DirectShow audio devices');

  const indices = indexOfMultiple(output, '"', videoDevicesIndex);

  for (let i = 0; i < indices.length; i++) {
    if (i+1 < indices.length) {
      const device = output.substring(indices[i]+1, indices[i+1]);
      if (indices[i] < audioDevicesIndex && indices[i+1] < audioDevicesIndex) {
        // These are video devices
        webcams.push({
          name: device,
          resolution: null,
          framerate: null,
        });
      } else {
        // These are audio devices
        mics.push(device);
      }
      // Skip the "Alternative name"
      i += 3;
    }
  }

  for (let i = 0; i < webcams.length; i++) {
    const listOptionsCmd = `ffmpeg -list_options true -f dshow -i video="${webcams[i].name}"`;
    let { error, stdout, stderr } = await execp(listOptionsCmd);
    const output = error.toString();
    const deviceOptionsIndex = output.indexOf('DirectShow video device options');

    const resIndex = output.lastIndexOf(' s=');
    const resolution = output.substring(resIndex+3, output.indexOf(' ', resIndex+1));
    const fpsIndex = output.lastIndexOf('fps=');
    const framerate = output.substring(fpsIndex+4, output.indexOf('\r', fpsIndex));
	
    webcams[i].resolution = resolution;
    webcams[i].framerate = framerate;
  }

  return { webcams, mics }
}