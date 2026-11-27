import { env, pipeline } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1';

env.allowLocalModels = false;
env.backends.onnx.wasm.numThreads = 1;

const models = {
  ingredients: {name:'onnx-community/mobilenet_v2_1.0_224', dtype:'q8', revision:'c5903ea'},
  dishes: {name:'onnx-community/swin-finetuned-food101-ONNX', dtype:'q4', revision:'e5e50bf'}
};
let loadedModel;
let classifier;

// ImageNet contains both food and household objects. Only recognised food labels become suggestions.
const ingredientNames = new Map(Object.entries({
  'granny smith':'Apple', banana:'Banana', orange:'Orange', lemon:'Lemon', fig:'Fig',
  pineapple:'Pineapple', strawberry:'Strawberry', pomegranate:'Pomegranate',
  cucumber:'Cucumber', zucchini:'Courgette', broccoli:'Broccoli', cauliflower:'Cauliflower',
  'bell pepper':'Pepper', mushroom:'Mushroom', artichoke:'Artichoke', 'head cabbage':'Cabbage',
  'butternut squash':'Butternut squash', 'acorn squash':'Acorn squash', 'spaghetti squash':'Spaghetti squash',
  'ear, spike, capitulum':'Corn on the cob', 'corn':'Corn', 'mashed potato':'Mashed potato',
  'french loaf':'Bread', bagel:'Bagel', pretzel:'Pretzel', 'cheeseburger':'Cheeseburger',
  'hotdog, hot dog, red hot':'Hot dog', 'pizza, pizza pie':'Pizza', 'burrito':'Burrito',
  guacamole:'Guacamole', 'ice cream, icecream':'Ice cream', 'ice lolly, lolly, lollipop, popsicle':'Ice lolly',
  'chocolate sauce, chocolate syrup':'Chocolate sauce', 'espresso':'Espresso', 'eggnog':'Eggnog',
  'dough':'Dough', 'trifle':'Trifle'
}));

async function modelFor(mode) {
  if (loadedModel === mode && classifier) return classifier;
  if (classifier) {
    await classifier.dispose();
    classifier = null;
  }
  const {name,...options} = models[mode];
  classifier = await pipeline('image-classification',name,{
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
  const best=predictions[0];
  const known=label=>ingredientNames.get(label.toLowerCase()) ??
    ingredientNames.get(label.split(',')[0].toLowerCase());
  if (!best || best.score<.35 || !known(best.label)) return [];
  return predictions.filter(p=>p.score>=.16 && known(p.label))
    .map(p=>({label:known(p.label), score:p.score}));
}

self.onmessage = async ({data:{file,mode='ingredients'}}) => {
  if (!Object.hasOwn(models,mode)) return;
  const url = URL.createObjectURL(file);
  try {
    const recognise=await modelFor(mode);
    self.postMessage({looking:true});
    const predictions=await recognise(url,{topk:3});
    const results=mode==='ingredients' ? ingredientMatches(predictions) :
      predictions.filter(r=>r.score>=.52);
    self.postMessage({results, mode, strong:mode==='ingredients' && results[0]?.score>=.8 &&
      predictions[0].score-(predictions[1]?.score || 0)>=.35});
  } catch {
    self.postMessage({failed:true});
  } finally {
    URL.revokeObjectURL(url);
  }
};
