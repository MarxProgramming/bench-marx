const ocrDist = 'https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/';
let scanTask, foodWorker, ocrLibrary;

function foodScanControls() {
  const choices = [['meal','Food photo'],['receipt','Receipt or label']].map(([mode,label]) => {
    const input = (kind, capture) => '<input type="file" accept="image/*" hidden id="scan-'+kind+'-'+mode+
      '" data-scan-input="'+mode+'" '+(capture?'capture="environment"':'')+'>';
    return '<div class="scan-choice"><strong>'+label+'</strong><div>'+
      '<button class="ghost" type="button" '+(mode==='meal'?'data-initial ':'')+'data-scan-pick="camera-'+mode+'">Take photo</button>'+
      '<button class="scan-file" type="button" data-scan-pick="file-'+mode+'">Choose photo</button>'+input('camera',true)+
      input('file',false)+'</div></div>';
  }).join('');
  return '<div class="scan-options">'+choices+'</div><div id="scan-review" hidden>'+
    '<p class="scan-status" role="status" aria-live="polite"></p><div class="scan-results"></div></div>';
}

function stopFoodScan() {
  const previous = scanTask;
  if (!previous) return;
  scanTask = null;
  clearTimeout(previous.timer);
  previous.cancel?.();
}

function foodOcrLibrary() {
  if (!ocrLibrary) {
    ocrLibrary = new Promise((resolve,reject) => {
      const script = document.createElement('script');
      script.src = ocrDist+'tesseract.min.js';
      script.onload = () => window.Tesseract ? resolve(window.Tesseract) : reject(Error('OCR unavailable'));
      script.onerror = () => { script.remove(); reject(Error('OCR unavailable')); };
      document.head.append(script);
    }).catch(error => {ocrLibrary = null; throw error;});
  }
  return ocrLibrary;
}

async function runReceiptScan(image, task) {
  const library = await foodOcrLibrary();
  if (task !== scanTask || task.done) return;
  const worker = await library.createWorker('eng',1,{workerPath:ocrDist+'worker.min.js'});
  if (task !== scanTask || task.done) { await worker.terminate(); return; }
  task.cancel = () => { worker.terminate().catch(()=>{}); };
  try {
    task.status.textContent = 'Reading the receipt or label…';
    const {data:{text}} = await worker.recognize(image,{rotateAuto:true});
    if (task === scanTask) showReceiptResults(text,task);
  } finally {
    if (task === scanTask) {
      task.cancel = null;
      await worker.terminate();
    }
  }
}

function runMealScan(image, task) {
  const worker = foodWorker ||= new Worker('./food-photo-worker.js?v=4.3',{type:'module'});
  task.cancel = () => {
    worker.terminate();
    foodWorker = null;
  };
  worker.onerror = () => scanFailed(task);
  worker.onmessage = ({data}) => {
    if (task !== scanTask || task.done) return;
    if (data.failed) { scanFailed(task); return; }
    if (Number.isFinite(data.progress)) task.status.textContent = 'Downloading the food scanner · '+data.progress+'%';
    if (data.looking) task.status.textContent = 'Looking for food matches…';
    if (data.results) {
      task.cancel = null;
      const choices = data.results.filter(r=>typeof r.label==='string' && r.score>=.03)
        .map(r=>({name:r.label.replaceAll('_',' ').replace(/^./,c=>c.toUpperCase())}));
      finishScan(task, choices.length ? 'Choose the closest match and enter your portion’s calories.' :
        'No clear match. Try a photo of one dish or enter it below.',choices);
    }
  };
  worker.postMessage({file:image});
}

function receiptChoices(text) {
  const lines = text.split(/\r?\n/).map(line => line.trim().replace(/\s+/g,' ')).filter(Boolean);
  const items = [];
  const add = item => {
    if (!items.some(r => r.name.toLowerCase() === item.name.toLowerCase() && r.kcal === item.kcal)) items.push(item);
  };
  const perUnit = /\bper\s*(?:100\s*[gm]l?\b|serving\b|portion\b)|\bserving size\b|\bservings? per\b/i.test(text);
  for (const line of lines) {
    // Only read calories with a printed unit or explicit label. Prices, quantities and kJ are excluded.
    const kcal = line.match(/(?:^|[^£$€\d.])([0-9]{1,5})(?:\.\d+)?\s*kcal\b/i) ||
      line.match(/\b(?:calories|kcal)\s*[:=]?\s*([0-9]{1,5})(?:\.\d+)?\b/i);
    const price = line.match(/^(.+?)\s+(?:[£$€]\s*)?\d+[.,]\d{2}\s*(?:[A-Z*])?$/);
    const candidate = kcal ? line.slice(0,kcal.index).replace(/\b(?:energy|calories|total)\b\s*$/i,'').trim()
      : price?.[1].replace(/^\d+\s*(?:x\s*)?/i,'').trim();
    if (kcal && Number(kcal[1]) <= 20000) {
      add({name:(candidate || '').slice(0,80), reading:line.slice(0,100), ...(perUnit?{}:{kcal:Number(kcal[1])})});
    } else if (candidate && /[a-z]{2}/i.test(candidate) && !/^(?:total|sub.?total|tax|vat|change|cash|card|payment|discount|balance|amount|tender|savings|tip|service|ref|date|time|store|cashier)\b/i.test(candidate)) {
      add({name:candidate.slice(0,80)});
    }
  }
  return {items:items.slice(0,12),perUnit};
}

function showReceiptResults(text, task) {
  const {items,perUnit} = receiptChoices(text);
  let message = 'Choose a line and confirm its calories.';
  if (!items.length) message = 'No food lines found. Try a sharper photo or enter the food below.';
  else if (perUnit) message = 'Check the label’s serving size and enter the calories for the amount you had.';
  else if (!items.some(item=>item.kcal !== undefined)) message = 'Food lines found. Enter calories for your portion.';
  finishScan(task,message,items,text.trim());
}

function finishScan(task, message, choices, text = '') {
  if (task !== scanTask || task.done) return;
  clearTimeout(task.timer);
  task.done = true;
  task.choices = choices;
  task.status.textContent = message;
  task.results.innerHTML = choices.map((choice,index) =>
    '<button class="scan-result" type="button" data-scan-use="'+index+'"><span>'+esc(choice.name || choice.reading || 'Calorie reading')+
    '</span>'+(choice.kcal === undefined?'':'<strong>'+choice.kcal+' kcal</strong>')+'</button>').join('')+
    (text ? '<details class="scan-text"><summary>Read scanned text</summary><pre>'+esc(text.slice(0,8000))+'</pre></details>' : '');
}

function scanFailed(task) {
  if (task !== scanTask || task.done) return;
  task.cancel?.();
  task.cancel = null;
  finishScan(task,'The scan could not finish. You can try another photo or add the food manually.',[]);
}

async function scanImage(file, mode) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const limit = mode === 'meal' ? 672 : 2200;
    const scale = Math.min(1,limit/Math.max(img.naturalWidth,img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1,Math.round(img.naturalWidth*scale));
    canvas.height = Math.max(1,Math.round(img.naturalHeight*scale));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(img,0,0,canvas.width,canvas.height);
    return await new Promise((resolve,reject)=>canvas.toBlob(blob=>blob ? resolve(blob) : reject(Error('Image unavailable')),'image/jpeg',.94));
  } finally { URL.revokeObjectURL(url); }
}

async function scanFood(input) {
  const file = input.files?.[0];
  if (!file) return;
  const form = input.form;
  if (!form) return;
  input.value = '';
  const prefilledKcal = scanTask?.form===form ? scanTask.prefilledKcal : undefined;
  stopFoodScan();
  const review = form.querySelector('#scan-review');
  review.hidden = false;
  const task = {form,status:review.querySelector('.scan-status'),results:review.querySelector('.scan-results'), choices:[], prefilledKcal};
  scanTask = task;
  task.results.replaceChildren();
  if ((file.type && !file.type.startsWith('image/')) || file.size > 25*1024*1024) {
    finishScan(task,'Choose an image under 25 MB.',[]);
    return;
  }
  const mode = input.dataset.scanInput;
  task.status.textContent = mode === 'meal' ? 'Opening food scanner. The first download is about 60 MB.' : 'Opening receipt scanner…';
  task.timer = setTimeout(()=>scanFailed(task),90000);
  try {
    const image = await scanImage(file,mode);
    if (task !== scanTask || task.done) return;
    if (mode === 'receipt') await runReceiptScan(image,task);
    else runMealScan(image,task);
  } catch { scanFailed(task); }
}

function useScanChoice(index) {
  const task = scanTask;
  const choice = task?.choices[index];
  if (!choice || !task.form.isConnected) return;
  const name = task.form.elements.name;
  const kcal = task.form.elements.kcal;
  if (choice.name) name.value = choice.name;
  const recent = recentFoods().find(item => item.name.toLowerCase() === name.value.trim().toLowerCase());
  if (choice.kcal !== undefined || recent || kcal.value === task.prefilledKcal) {
    kcal.value = choice.kcal ?? recent?.kcal ?? '';
    task.prefilledKcal = kcal.value;
  }
  task.status.textContent = 'Check the food and calories below before saving.';
  (name.value ? kcal : name).focus({preventScroll:true});
}
