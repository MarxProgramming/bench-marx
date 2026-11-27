const reminderRules = {
  gapDays:3,
  gapWorkouts:2,
  neverLoggedWorkouts:3,
  longGapDays:7,
  heavyGapDays:14,
  consecutiveHeavyDays:2
};
let attentionOnly = false;

function isHeavy(record) { return (record?.level || 0) >= 2; }

function daysBetween(first,last) {
  return (Date.parse(last)-Date.parse(first))/86400000;
}

function heavyRun(id,ending) {
  let run=0;
  for(let day=ending;isHeavy(entries.get(key(day,id)));day=offset(day,-1)) run++;
  return run;
}

function reminderHistory(day) {
  const records=new Map(), trainingDays=new Set(), daysByCategory=new Map();
  for(const record of entries.values()) {
    if(record.day>day || isGym(record) || byId[record.id].retired) continue;
    if(record.day<day && activeWorkout(record)) {
      trainingDays.add(record.day);
      const group=byId[record.id].gi;
      if (!daysByCategory.has(group)) daysByCategory.set(group,new Set());
      daysByCategory.get(group).add(record.day);
    }
    const latest=records.get(record.id) || {};
    if(!latest.last || latest.last<record.day) latest.last=record.day;
    if(isHeavy(record) && (!latest.heavy || latest.heavy<record.day)) latest.heavy=record.day;
    records.set(record.id,latest);
  }
  return {records,trainingDays:[...trainingDays],daysByCategory};
}

function exerciseReminder(exercise,day,history) {
  const {last,heavy} = history.records.get(exercise.id) || {};
  const previousHeavy=heavyRun(exercise.id,offset(day,-1));
  const current=entries.get(key(day,exercise.id));
  if(previousHeavy>=reminderRules.consecutiveHeavyDays) {
    if(isHeavy(current)) {
      const days=previousHeavy+1;
      return {kind:'pause',label:'Pause heavy',detail:'Heavy or PR for '+days+' days in a row. Pause heavy work on this exercise until there’s a day without it.'};
    }
    return {kind:'pause',label:'Skip heavy today',detail:'This exercise was marked Heavy or PR for '+previousHeavy+' days in a row. Keep it light today or leave it out.'};
  }
  const heavyDays=heavy ? daysBetween(heavy,day) : 0;
  const heavyGap=!isDan && heavyDays>=reminderRules.heavyGapDays;
  if (!current) {
    const missed=history.trainingDays.filter(date=>(!last || date>last) && exerciseOn(exercise,date)).length;
    const days=last ? daysBetween(last,day) : 0;
    if(last && (days>=reminderRules.longGapDays || days>=reminderRules.gapDays && missed>=reminderRules.gapWorkouts)) {
      const label='Last done '+days+' days ago'+(heavyGap ? ' · Heavy '+heavyDays+' days ago' : '');
      return {kind:'due',label,detail:'Last workout mark on '+dateLabel(last)+'.'+(heavyGap ? ' Last Heavy or PR on '+dateLabel(heavy)+'.' : '')};
    }
    if(!last) {
      const categoryDays=[...(history.daysByCategory.get(exercise.gi) || [])]
        .filter(date=>exerciseOn(exercise,date)).length;
      if(categoryDays>=reminderRules.neverLoggedWorkouts) {
        return {kind:'due',label:'Missed '+categoryDays+' workouts',detail:'This exercise has no marks after '+categoryDays+' workouts in its category.'};
      }
    }
  }
  if (heavyGap) {
    return {kind:'heavy-gap',label:'Last heavy '+heavyDays+' days ago',detail:'Last Heavy or PR on '+dateLabel(heavy)+'.'};
  }
  return null;
}

function remindersFor(day) {
  if(day!==today || !preferences.reminders) return new Map();
  const history=reminderHistory(day);
  const reminders=new Map();
  for(const exercise of exercisesAt(day)) {
    const reminder=exerciseReminder(exercise,day,history);
    if(reminder) reminders.set(exercise.id,reminder);
  }
  return reminders;
}

function reminderMarkup(id,reminder) {
  if(!reminder) return '';
  return '<span class="row-reminder '+reminder.kind+'" id="reminder-'+id+'" title="'+esc(reminder.detail)+'">'+esc(reminder.label)+'</span>';
}

function attentionControls(reminders) {
  if(selected!==today || !preferences.reminders) return '';
  if(!reminders.size && !attentionOnly) return '';
  return '<div class="attention-controls"><button class="chip attention-filter" data-action="attention-filter" aria-pressed="'+
    attentionOnly+'">Needs attention <span>'+reminders.size+'</span></button>'+
    '<button class="text-button" data-action="reminder-help">How reminders work</button></div>';
}

function attentionHelp() {
  const heavyGap = isDan ? '' : '<li><strong>Last heavy.</strong> At least 14 days since a Heavy or PR mark on an exercise you’ve previously logged at that level.</li>';
  showDialog('Training reminders','<ul class="reminder-rules">'+
    '<li><strong>Needs attention.</strong> An exercise is highlighted after three days and two missed workouts, after seven days since the last mark, or after three workouts in its category if it has never been logged.</li>'+
    heavyGap+'<li><strong>Skip heavy today.</strong> Heavy and PR both count. After two consecutive heavy days on the same exercise, you’ll see a reminder to take a lighter day.</li>'+
    '</ul><button class="primary wide" data-action="close">Done</button>');
}

function attentionOverview() {
  if(!preferences.reminders) return '';
  const notices=remindersFor(today);
  if(!notices.size) return '';
  const order={pause:0,due:1,'heavy-gap':2};
  const rows=[...notices].sort(([,a],[,b])=>order[a.kind]-order[b.kind]).map(([id,notice])=>
    '<button class="attention-summary-row" data-find-exercise="'+id+'"><strong>'+esc(byId[id].name)+
    '</strong><span class="row-reminder '+notice.kind+'">'+esc(notice.label)+'</span></button>').join('');
  return '<section class="card chartcard attention-overview"><div class="card-head"><h2>Needs attention today</h2>'+
    '<span class="count">'+notices.size+'</span></div><div class="attention-summary">'+rows+'</div></section>';
}

function attentionFocus(id) {
  setDay(today,'workout');
  const target=document.querySelector('[data-log="'+id+'"]');
  target?.scrollIntoView?.({block:'center'});
  target?.focus({preventScroll:true});
}

function guardHeavy(day,id,level,perform) {
  if(day!==today || !preferences.reminders || level<2 || isHeavy(entries.get(key(day,id)))) {
    perform();
    return;
  }
  const streak=heavyRun(id,offset(day,-1));
  if(streak<reminderRules.consecutiveHeavyDays) {
    perform();
    return;
  }
  showDialog('Skip heavy today?', '<p class="dialog-sub">'+esc(byId[id].name)+' has been marked Heavy or PR for '+streak+
    ' days in a row. Keep today’s entry light or leave it out.</p><div class="dialog-actions">'+
    '<button class="ghost" data-initial data-action="close">Keep current entry</button>'+
    '<button class="primary" data-action="confirm-heavy">Log '+(level===3?'PR':'heavy')+' anyway</button></div>', {confirmHeavy:perform,keepOpen:level===3});
}
