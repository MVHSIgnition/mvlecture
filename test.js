const parseDevices = require('./lib/parseDevicesMacOS.js');

parseDevices().then(val => {
  console.log(val);
});