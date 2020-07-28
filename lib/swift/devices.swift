import Foundation
import AVFoundation
// use swiftc to compile or run in shell script way

/* if #available(macOS 10.15, *) {
  let sess = AVCaptureDevice.DiscoverySession(AVCaptureDevice.DeviceType.builtInMicrophone)

} */

func maxVideoFramerate(fmt: AVCaptureDevice.Format) -> Double {
  var max: Double = 0
  for range in fmt.videoSupportedFrameRateRanges {
    if range.maxFrameRate > max {
      max = range.maxFrameRate
    }
  }
  return max
}

let videoDevices = AVCaptureDevice.devices(for: .video)
for device in videoDevices {
  var bestFormat: AVCaptureDevice.Format?
  var bestRes: CMVideoDimensions?
  var bestFps: Double = 0
  
  for format in device.formats {
    let fps = maxVideoFramerate(fmt: format)

    if fps > 23 { // require certain fps
      let desc = format.formatDescription
      let dims = CMVideoFormatDescriptionGetDimensions(desc)
      if dims.width > bestRes?.width ?? 0 && dims.height > bestRes?.height ?? 0 {
        bestRes = dims
        bestFps = fps
      }
    }
  }

  if let bestRes = bestRes {
    let data: [String: Any] = [
      "type": "webcam",
      "name": device.localizedName,
      "width": bestRes.width,
      "height": bestRes.height,
      "framerate": bestFps
    ]

    let jsonData = try JSONSerialization.data(withJSONObject: data)
    if let str = String(data: jsonData, encoding: String.Encoding.utf8) {
      print(str)
    }
  }
}

let audioDevices = AVCaptureDevice.devices(for: .audio)
var micNames: [String] = []
for device in audioDevices {
  micNames.append(device.localizedName)
}
let jsonData = try JSONSerialization.data(withJSONObject: micNames)
if let str = String(data: jsonData, encoding: String.Encoding.utf8) {
  print(str)
}

