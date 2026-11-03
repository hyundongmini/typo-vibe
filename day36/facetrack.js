// Finds your face in the webcam frame so the round face can zoom in on it.
// Runs MediaPipe's face detector locally in the browser; frames never leave the page.
import { FilesetResolver, FaceDetector } from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs';

const WASM_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
const MODEL = 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite';
const INTERVAL_MS = 120;

let detector = null;
let timer = null;

async function load() {
  if (detector) return detector;
  const vision = await FilesetResolver.forVisionTasks(WASM_BASE);
  detector = await FaceDetector.createFromOptions(vision, {
    baseOptions: { modelAssetPath: MODEL, delegate: 'GPU' },
    runningMode: 'VIDEO',
    minDetectionConfidence: 0.5,
  });
  return detector;
}

// onBox({ x, y, w, h } in video pixels) on each detection, onBox(null) when no face is found
async function start(video, onBox) {
  stop();
  const d = await load();
  timer = setInterval(() => {
    if (video.readyState < 2) return;
    const result = d.detectForVideo(video, performance.now());
    const box = result.detections[0]?.boundingBox;
    onBox(box ? { x: box.originX, y: box.originY, w: box.width, h: box.height } : null);
  }, INTERVAL_MS);
}

function stop() {
  clearInterval(timer);
  timer = null;
}

window.FaceTrack = { start, stop };
