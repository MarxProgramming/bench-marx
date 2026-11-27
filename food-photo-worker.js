import { env, pipeline } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1';

env.allowLocalModels = false;
env.backends.onnx.wasm.numThreads = 1;

const models = {
  ingredients: {name:'Xenova/yolos-tiny', task:'object-detection', dtype:'q8', revision:'e2f9c76'},
  dishes: {name:'onnx-community/swin-finetuned-food101-ONNX', task:'image-classification', dtype:'q4', revision:'e5e50bf'}
};
let loadedModel;
let classifier;

// Filter COCO objects such as plates, furniture and cutlery out of the results.
const foodNames = new Map(Object.entries({
  banana:'Banana', apple:'Apple', sandwich:'Sandwich', orange:'Orange', broccoli:'Broccoli',
  carrot:'Carrot', 'hot dog':'Hot dog', pizza:'Pizza', donut:'Doughnut', cake:'Cake'
}));
const produce = new Set(['Banana','Apple','Orange','Carrot','Broccoli']);

async function modelFor(mode) {
  if (loadedModel === mode && classifier) return classifier;
  if (classifier) {
    await classifier.dispose();
    classifier = null;
  }
  const {name,task,...options} = models[mode];
  classifier = await pipeline(task,name,{
    ...options,device:'wasm',
    progress_callback:progress=>{
      if (progress.status==='progress' && progress.file?.endsWith('.onnx')) {
        self.postMessage({progress:Math.min(100,Math.round(progress.progress))});
      }
    }
  });
  loadedModel=mode;
  return classifier;
}

function ingredientMatches(predictions) {
  const matches=new Map();
  for (const item of predictions) {
    const label=foodNames.get(item.label.toLowerCase());
    if (label && item.score >= .46 && item.score > (matches.get(label)?.score ?? 0)) {
      matches.set(label,{label,score:item.score});
    }
  }
  return [...matches.values()].sort((a,b)=>b.score-a.score).slice(0,3);
}

self.onmessage = async ({data:{file,mode='ingredients'}}) => {
  if (!Object.hasOwn(models,mode)) return;
  const url = URL.createObjectURL(file);
  try {
    const recognise=await modelFor(mode);
    self.postMessage({looking:true});
    const predictions=await recognise(url,mode==='ingredients' ? {threshold:.46} : {topk:3});
    const results=mode==='ingredients' ? ingredientMatches(predictions) :
      predictions.filter(r=>r.score>=.52);
    self.postMessage({results, mode,
      strong:mode==='ingredients' && results.length===1 && results[0].score>=.55,
      dishOption:mode==='ingredients' && (results.length!==1 || !produce.has(results[0].label))});
  } catch {
    self.postMessage({failed:true});
  } finally {
    URL.revokeObjectURL(url);
  }
};
