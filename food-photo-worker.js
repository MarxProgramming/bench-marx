import { env, pipeline } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1';

env.allowLocalModels = false;
env.backends.onnx.wasm.numThreads = 1;
let classifier;

self.onmessage = async ({data:{file}}) => {
  const url = URL.createObjectURL(file);
  try {
    classifier ||= await pipeline('image-classification', 'onnx-community/swin-finetuned-food101-ONNX', {
      device:'wasm',
      dtype:'q4',
      revision:'e5e50bf',
      progress_callback: progress => {
        if (progress.status === 'progress' && progress.file?.endsWith('.onnx')) {
          self.postMessage({progress:Math.min(100,Math.round(progress.progress))});
        }
      }
    });
    self.postMessage({looking:true});
    const results = await classifier(url,{topk:3});
    self.postMessage({results});
  } catch {
    self.postMessage({failed:true});
  } finally {
    URL.revokeObjectURL(url);
  }
};
