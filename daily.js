const daily = new Map();
const customPattern = /^custom_[a-z0-9]{8,40}$/;
const foodPattern = /^food_[a-z0-9]{8,40}$/;

function cleanDaily(item) {
  if (!item) return null;
  if (item.type === 'exercise') {
    const name = typeof item.name === 'string' ? item.name.trim() : '';
    return customPattern.test(item.id) && Number.isInteger(item.group) && groups[item.group] &&
      name && name.length <= 80 && validDay(item.created)
      ? {type:'exercise', id:item.id, name, group:item.group, created:item.created,
         ...(validDay(item.archived) && item.archived >= item.created ? {archived:item.archived} : {})} : null;
  }
  if (!validDay(item.day)) return null;
  if (item.type === 'weight' && item.id === 'weight' && Number.isFinite(item.kg) &&
      item.kg >= 0.01 && item.kg <= 1000) {
    return {type:'weight', id:'weight', day:item.day, kg:Math.round(item.kg * 100) / 100};
  }
  if (isDan && item.type === 'food' && foodPattern.test(item.id) &&
      typeof item.name === 'string' && item.name.trim() && item.name.trim().length <= 80 &&
      Number.isInteger(item.kcal) && item.kcal >= 0 && item.kcal <= 20000) {
    return {type:'food', id:item.id, day:item.day, name:item.name.trim(), kcal:item.kcal};
  }
  return null;
}

function dailyKey(item) {
  return key(item.type === 'exercise' ? 'catalogue' : item.day, item.id);
}

function rebuildCatalogue() {
  for (const exercise of exercises.splice(baseExerciseCount)) delete byId[exercise.id];
  for (const item of daily.values()) {
    if (item.type !== 'exercise') continue;
    const exercise = {id:item.id, name:item.name, gi:item.group, created:item.created, archived:item.archived};
    exercises.push(exercise);
    byId[item.id] = exercise;
  }
}

function weightButton(day) {
  const weight = daily.get(key(day,'weight'));
  const label = weight ? weight.kg+' kg' : day === today ? 'Weigh in today' : 'Log weight';
  return '<button class="weigh-in '+(weight ? 'weighed' : 'weigh-due')+'" data-weigh="'+day+
    '" aria-label="'+(weight ? 'Edit weight, '+label : label)+'">'+icon('scale')+label+'</button>';
}

function weightDialog(day) {
  const old = daily.get(key(day,'weight'));
  showDialog(old ? 'Edit weigh-in' : 'Log your weight',
    '<p class="dialog-sub">'+dateLabel(day)+'</p><form id="weight-form"><label class="field">Body weight (kg)'+
    '<input name="kg" type="number" inputmode="decimal" min="0.01" max="1000" step="0.01" required value="'+
    (old?.kg ?? '')+'"></label><div class="dialog-actions">'+
    (old ? '<button type="button" class="ghost" data-remove-daily="'+dailyKey(old)+'">Remove</button>' : '')+
    '<button class="primary">Save weight</button></div></form>', {day});
}

function addExerciseDialog(group, id) {
  if (!groups[group]) return;
  const existing = id ? byId[id] : null;
  showDialog(existing ? 'Rename exercise' : 'Add exercise', '<p class="dialog-sub">'+groups[group].name+
    '</p><form id="exercise-form"><label class="field">Exercise name<input name="name" maxlength="80" required value="'+esc(existing?.name)+'"></label>'+
    '<div class="dialog-actions"><button class="primary">'+(existing ? 'Save name' : 'Add exercise')+'</button></div></form>', {group,id});
}

function localId(prefix) {
  return prefix + (window.crypto?.randomUUID?.().replaceAll('-','') ||
    Date.now().toString(36)+Math.random().toString(36).slice(2));
}

function foodOn(day) {
  return [...daily.values()].filter(item => item.type === 'food' && item.day === day);
}

function recentFoods() {
  const latest = new Map();
  for (const meal of [...daily.values()].filter(item=>item.type==='food').sort((a,b)=>b.day.localeCompare(a.day))) {
    const name=meal.name.toLowerCase();
    if (!latest.has(name)) latest.set(name,meal);
  }
  return [...latest.values()].slice(0,5);
}

function calorieDialog(day, id, copyKey) {
  const old = id ? daily.get(key(day,id)) : null;
  const source = old || (copyKey ? daily.get(copyKey) : null);
  const suggestions = old ? '' : recentFoods().map(r => '<option value="'+esc(r.name)+'"></option>').join('');
  showDialog(old ? 'Edit food' : 'Add food', '<p class="dialog-sub">'+dateLabel(day)+
    '</p><form id="food-form"><label class="field">Food or drink<input name="name" maxlength="80" required list="recent-food" value="'+
    esc(source?.name)+'"></label><datalist id="recent-food">'+suggestions+'</datalist><label class="field">Calories (kcal)<input name="kcal" type="number" min="0" max="20000" step="1" inputmode="numeric" required value="'+
    (source?.kcal ?? '')+'"></label><div class="dialog-actions">'+
    (old ? '<button type="button" class="ghost" data-remove-daily="'+dailyKey(old)+'">Remove</button>' : '')+
    '<button class="primary">Save food</button></div></form>', {day, id});
}

function calories() {
  const meals = foodOn(selected);
  const total = meals.reduce((sum,item) => sum + item.kcal, 0);
  const weekDays = Array.from({length:7},(_,i)=>offset(selected,i-6));
  const max = Math.max(1,...weekDays.map(day=>foodOn(day).reduce((n,r)=>n+r.kcal,0)));
  const weekRows = weekDays.map(day => {
    const items=foodOn(day);
    const amount = items.reduce((sum,item) => sum+item.kcal,0);
    const text = items.length ? amount.toLocaleString('en-GB')+' kcal' : 'No entries';
    return '<button class="food-row" data-open-log="calories" data-session="'+day+'"><span>'+dateLabel(day)+'</span><span class="calorie-bar" aria-hidden="true"><i style="width:'+percentage(amount,max)+'%"></i></span><strong>'+text+'</strong></button>';
  }).join('');
  const recent = recentFoods();
  const shortcuts = recent.length ? panel('Recent foods','Tap an item to reuse its last portion.',recent.map(item =>
    '<button class="food-row" data-food-day="'+selected+'" data-copy-food="'+dailyKey(item)+'"><span>'+esc(item.name)+
    '</span><strong>'+item.kcal+' kcal</strong></button>').join('')) : '';
  return head('Calories',fmt(selected,{weekday:'long',day:'numeric',month:'long',year:'numeric'}),controls())+
    '<div class="two-col"><section class="card hero calorie-hero"><div class="hero-label">Daily intake</div>'+
    '<div class="stat">'+total.toLocaleString('en-GB')+' <small>kcal</small></div><button class="primary" data-food-day="'+
    selected+'">'+icon('plus')+' Add food</button></section>'+
    panel('Food log','',meals.length ? meals.map(item => '<button class="food-row" data-food-day="'+item.day+
    '" data-food-id="'+item.id+'"><span>'+esc(item.name)+'</span><strong>'+item.kcal.toLocaleString('en-GB')+
    ' kcal</strong></button>').join('') : blank('Add a food or drink and enter its calories.'))+panel('Last 7 days','',weekRows)+shortcuts+'</div>';
}

function weightInsights() {
  const start = offset(today, 1-period);
  const points = [...daily.values()].filter(item => item.type === 'weight' && item.day >= start && item.day <= today)
    .sort((a,b) => a.day.localeCompare(b.day));
  if (!points.length) return panel('Body weight','',blank('Log a weigh-in to see your weight here.')+weightButton(today));
  const first = points[0], last = points.at(-1);
  const changeInKg = Math.round((last.kg-first.kg)*100)/100;
  const low = Math.min(...points.map(x=>x.kg))-.5;
  const high = Math.max(...points.map(x=>x.kg))+.5;
  const mid = (high+low)/2;
  const daysFromStart = day => (Date.parse(day)-Date.parse(start))/86400000;
  const coordinates = points.map(p => ({
    x:56 + 412*daysFromStart(p.day)/(period-1),
    y:22+116*(high-p.kg)/(high-low),
    ...p
  }));
  const axes = [high,mid,low].map((kg,i) => {
    const y=22+i*58;
    return '<line x1="56" x2="468" y1="'+y+'" y2="'+y+'"/><text x="49" y="'+(y+4)+
      '" text-anchor="end">'+Number(kg.toFixed(2))+'</text>';
  }).join('');
  const chart = '<svg class="weight-chart" viewBox="0 0 488 168" role="img" aria-label="Body weight in kilograms over the selected period">'+
    axes+'<polyline points="'+coordinates.map(p=>p.x+','+p.y).join(' ')+'"/>'+
    coordinates.map(p=>'<circle cx="'+p.x+'" cy="'+p.y+'" r="3.7"><title>'+dateLabel(p.day)+
      ' · '+p.kg+' kg</title></circle>').join('')+'<text x="56" y="160">'+dateLabel(start)+
    '</text><text x="468" y="160" text-anchor="end">'+dateLabel(today)+'</text></svg>';
  return metricCards([[last.kg+' kg','Latest weigh-in'],[points.length,'Weigh-ins'],
    [points.length>1 ? (changeInKg > 0 ? '+' : '')+changeInKg+' kg' : '—','Change across weigh-ins']])+
    panel('Body weight','Scale readings in kg',chart+
      '<details class="weight-table"><summary>View weigh-ins</summary>'+points.toReversed().map(p=>
        '<div class="fact-line"><span>'+dateLabel(p.day)+'</span>'+weightButton(p.day)+'</div>').join('')+
      '</details>');
}

function saveDailyForm(event) {
  const form = event.target;
  if (!['exercise-form','weight-form','food-form'].includes(form.id)) return;
  event.preventDefault();
  const data = new FormData(form);
  const {day, group, id} = modalInfo;
  let item;
  if (form.id === 'exercise-form') {
    const name = data.get('name').trim();
    if (exercises.some(exercise => exercise.id !== id && exercise.gi === group && exercise.name.toLowerCase() === name.toLowerCase())) {
      notify('That exercise already exists in this group.');
      return;
    }
    item = {type:'exercise',id:id || localId('custom_'),group,name,created:byId[id]?.created || selected,archived:byId[id]?.archived};
  } else if (form.id === 'weight-form') {
    item = {type:'weight',id:'weight',day,kg:Number(data.get('kg'))};
  } else {
    item = {type:'food',id:id || localId('food_'),day,name:data.get('name'),kcal:Number(data.get('kcal'))};
  }
  const record = cleanDaily(item);
  if (!record) { notify('Check the details and try again.'); return; }
  writeJournal(dailyKey(record), record, daily);
  if (record.type === 'exercise') rebuildCatalogue();
  closeDialog();
  render();
  notify(storageIssue || {weight:'Weight saved', exercise:'Exercise added', food:'Food saved'}[record.type]);
  if (record.type === 'exercise') document.querySelector('[data-log="'+record.id+'"]')?.focus({preventScroll:true});
}

function removeDaily(id) {
  const old = daily.get(id);
  if (!old || old.type === 'exercise') return;
  writeJournal(id,null,daily);
  closeDialog();
  render();
  notify(storageIssue || 'Entry removed', () => {
    if (daily.has(id)) return;
    writeJournal(id,old,daily);
    render();
    notify(storageIssue || 'Entry restored');
  });
}


function archivedExercises() {
  const archived=exercises.filter(e=>e.archived);
  const choices=archived.map(e=>'<button class="choice" data-restore-exercise="'+e.id+'">'+esc(e.name)+
    '<small>Restore</small></button>').join('');
  showDialog('Archived exercises',choices || blank('No custom exercises have been archived.'));
}

function setExerciseArchived(id, archive) {
  const item=daily.get(key('catalogue',id));
  if (!item) return;
  const next={...item};
  if (archive) next.archived = today < next.created ? next.created : today;
  else delete next.archived;
  writeJournal(dailyKey(next),next,daily);
  rebuildCatalogue();
  if (view==='insights' && !exercisesAt(today).some(e=>e.id===selectedExercise)) selectedExercise=exercises[0].id;
  closeDialog();
  render();
  notify(storageIssue || (archive ? 'Exercise archived. Its history is kept.' : 'Exercise restored.'));
}
