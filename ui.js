const main = document.querySelector('#main'), modal = document.querySelector('#modal'),
      toast = document.querySelector('#toast');
document.querySelectorAll('[data-icon]').forEach(i => i.innerHTML = icon(i.dataset.icon));
let today = iso(), selected = today, view = 'workout', filter = -1, period = 7, month = today.slice(0, 7),
    calDay = today;
let editing = false;
let storageIssue = '', undo = null, toastTimer, modalInfo = null, returnFocus = null, pendingImport = null;
const unsaved = new Map();
let readWarning = '';
function updateStorageStatus() {
  storageIssue =
      unsaved.size ? 'Changes are in this tab only. Export a backup before closing.' : readWarning;
}
function loadEntries() {
  const loaded = new Map(), saved = new Map();
  try {
    const activePrefix = journalPrefix();
    let bad = false;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k?.startsWith(activePrefix)) continue;
      try {
        const item = JSON.parse(localStorage.getItem(k));
        saved.set(k.slice(activePrefix.length),item);
      } catch {
        bad = true
      }
    }
    if (cloudSession) {
      const queue = outboxPrefix(cloudSession);
      for (const k of storageKeys(queue)) {
        const item = JSON.parse(localStorage.getItem(k));
        saved.set(k.slice(queue.length),JSON.parse(item.encoded));
      }
    }
    daily.clear();
    for (const [id,item] of saved) {
      if (!item?.type) continue;
      const record = cleanDaily(item);
      if (record && dailyKey(record) === id) daily.set(id,record);
      else bad = true;
    }
    for (const [id,item] of unsaved) {
      if (item?.type) daily.set(id,item);
      else if (!item) daily.delete(id);
    }
    rebuildCatalogue();
    for (const [id,item] of saved) {
      if (!item || item.type) continue;
      const record = cleanRecord(item);
      if (record && key(record.day,record.id) === id) loaded.set(id,record);
      else bad = true;
    }
    entries.clear();
    for (const [k, r] of loaded) entries.set(k, r);
    readWarning = bad ? 'Some saved entries could not be read. Keep your existing backup.' : '';
  } catch {
    readWarning = 'Browser storage is unavailable. Export a backup before closing.'
  }
  for (const [k, r] of unsaved) {
    if (r && !r.type)
      entries.set(k, r);
    else
      entries.delete(k)
  }
  updateStorageStatus();
}
function storeEntry(day, id, r) {
  writeJournal(key(day,id),r,entries);
}
function writeJournal(k,r,records) {
  try {
    persistJournalRecord(k,r ? JSON.stringify(r) : null);
    unsaved.delete(k);
  } catch {
    unsaved.set(k, r || null)
  }
  if (r)
    records.set(k, r);
  else
    records.delete(k);
  updateStorageStatus();
}
function btn(action, label, glyph, cls = '') {
  return '<button class="' + cls + '" data-action="' + action + '" aria-label="' + esc(label) +
      '" title="' + esc(label) + '">' + icon(glyph) + '</button>'
}
function head(title, sub, action = '') {
  return '<div class="page-title"><div><h1>' + title + '</h1>' + (sub ? '<p>' + sub + '</p>' : '') +
      '</div>' + action + '</div>'
}
function controls() {
  return '<div class="date-controls">' + ('<button class="chev" data-action="prev" aria-label="Previous day" '+(selected<='1900-01-01'?'disabled':'')+'>'+icon('prev')+'</button>') +
      '<button class="date-button" data-action="date">' + icon('cal') +
      (selected === today ? 'Today' : fmt(selected, {day: 'numeric', month: 'short'})) +
      '</button><button class="chev" aria-label="Next day" data-action="next" ' +
      (selected >= today ? 'disabled' : '') + '>' + icon('next') + '</button></div>'
}
function segment(n,target) {
  return Array.from({length:target}, (_, i) => '<b class="' + (i < n ? 'on' : '') + '"></b>').join('')
}
function hero() {
  const n = dayItems(selected).length, target=exercisesAt(selected).length;
  return '<section class="hero card" aria-label="Session wave progress">' + waveArt(target) +
      '<div class="hero-label">' + icon('wave') +
      'Session wave</div>'+weightButton(selected)+'<div class="stat"><span id="done-count" data-counter="' + n + '">' + n +
      '</span><small>/ ' + target + '</small></div><div class="descriptor">exercises logged</div><div class="meterline"><span class="segs" aria-hidden="true">' +
      segment(n,target) + '</span><span class="pct" data-counter="' + percentage(n,target) + '" data-suffix="%">' + percentage(n,target) + '%</span></div></section>'
}
function paintWave() {
  const records = dayItems(selected);
  const m = new Map(records.map(r => [r.id, r]));
  const list = exercisesAt(selected);
  document.querySelectorAll('[data-ridge]').forEach(g => {
    const r = m.get(list[Number(g.dataset.ridge)].id);
    g.style.transform = 'translateY(' + (r ? -3 - r.level * 3 : 0) + 'px)';
    const crest = g.querySelector('.crest');
    crest.style.stroke = r ? 'var(--' + ['', 'green', 'orange', 'red'][r.level] + ')' : '';
    crest.style.strokeWidth = r ? '2.8' : ''
  })
}
function week(gym=false) {
  const getRecords=gym?gymOn:dayItems;
  const start = monday(selected), ds = Array.from({length: 7}, (_, i) => offset(start, i)),
        active = ds.filter(d => getRecords(d).length).length;
  return '<div class="card-head"><h2>Weekly activity</h2>' + icon('weekly') + '</div><p class="subline">' +
      active + ' training ' + (active === 1 ? 'day' : 'days') + ' this week</p><div class="weekdays">' +
      ds.map(d => {
          const n = getRecords(d).length;
          return '<button class="weekcol" data-day="' + d + '" ' +
              (d === selected ? 'aria-current="date" ' : '') + (d > today ? 'disabled ' : '') +
              'aria-label="' + fmt(d, {weekday: 'long', day: 'numeric', month: 'long'}) + ', ' + n +
              (gym?' reps':' exercises')+'"><span class="stack" aria-hidden="true">' +
              Array
                  .from({length: 6}, (_, j) => '<b class="' + (j < Math.ceil(6*n/(gym?coreTarget:Math.max(1,exercisesAt(d).length))) ? 'on' : '') + '"></b>')
                  .join('') +
              '</span><span>' + fmt(d, {weekday: 'short'}).slice(0, 2) + '</span></button>'
        }).join('') +
      '</div>'
}
function balance(records, list=exercises) {
  return groups
      .map(g => {
        const i=g.ref;
        const pool = records.filter(r => byId[r.id].gi === i), n = new Set(pool.map(r => r.id)).size,
              total = list.filter(e => e.gi === i).length;
        if (!total) return '';
        return '<div class="balance-line"><div class="label-line"><span>' + esc(g.name) + '</span><span>' + n +
            ' / ' + total + '</span></div><div class="bartrack"><em style="--c:' + g.colour +
            ';width:' + 100 * n / total + '%"></em></div></div>'
      })
      .join('')
}
function balanceCard() {
  return '<div class="card-head"><h2>Session balance</h2>' + icon('layers') +
      '</div><p class="subline">Coverage by exercise group</p>' + balance(dayItems(selected),exercisesAt(selected))
}
function row(e,reminder=remindersFor(selected).get(e.id)) {
  const r = entries.get(key(selected, e.id)), l = r?.level || 0;
  const action = editing ? 'Edit exercise' :
      l === 3            ? 'Edit personal record' :
                           'Mark ' + ['Done', 'Heavy', 'PR'][l];
  const extra = l === 3 ? r.result + ' · ' + r.reps + ' ' + (r.reps === 1 ? 'rep' : 'reps') : e.detail;
  const indicator = editing ? 'edit' : ['plus', 'check', 'heavy', 'trophy'][l];
  return '<div class="exercise ' + colours[l] + (reminder ? ' has-reminder reminder-'+reminder.kind : '')+ '" data-row="' + e.id + '" data-level="' + l +
      '"><button class="log" data-log="' + e.id + '" aria-label="' +
      esc(e.name + ', ' + levels[l] + '. ' + action) + '"'+(reminder ? ' aria-describedby="reminder-'+e.id+'"' : '')+'><span class="exc-text"><span class="exname">' +
      esc(e.name) + '</span>' + (extra ? '<span class="detail">' + esc(extra) + '</span>' : '') + reminderMarkup(e.id,reminder)+'</span>' +
      (l ? '<span class="status">' + levels[l] + '</span>' : '') + '<span class="plus">' + icon(indicator) +
      '</span></button>'+ (l?clearControl(e.id,e.name):'')+'</div>';
}
function clearControl(id,label){
  return '<button class="untick" data-untick="'+id+'" aria-label="Untick '+esc(label)+'">Untick</button>';
}
function groupList(reminders=remindersFor(selected)) {
  const available=groupsAt(selected);
  const visible=available.filter(group=>filter===-1 || group.ref===filter);
  return (attentionOnly ? available : visible.length ? visible : available).map(g => {
    const i=g.ref;
    const es=exercisesAt(selected).filter(e => e.gi===i);
    const n=es.filter(e=>entries.has(key(selected,e.id))).length;
    const shown=attentionOnly ? es.filter(exercise=>reminders.has(exercise.id)) : es;
    if(attentionOnly && !shown.length) return '';
    return '<section class="ex-group"><div class="group-label" style="--group-colour:'+g.colour+
      '"><h3>'+esc(g.name)+'</h3><span data-groupcount="'+i+'" class="count">'+n+' / '+es.length+'</span>'+
      '<button class="category-edit" data-edit-category="'+i+'" aria-label="Rename '+esc(g.name)+'">'+icon('edit')+'<span>Rename</span></button>'+
      '</div>'+shown.map(exercise=>row(exercise,reminders.get(exercise.id) || null)).join('')+'<button class="add-exercise" data-add-exercise="'+i+'" aria-label="Add exercise to '+
      esc(g.name)+'">'+icon('plus')+' Add exercise</button></section>';
  }).join('')+(attentionOnly && !reminders.size ? '<p class="empty-copy attention-empty">No exercises need attention today.</p>' : '')+'<div class="add-category-line"><button class="add-exercise" data-action="add-category">'+icon('plus')+
    ' Add category</button></div>';
}
function filterBtns() {
  return [[-1,'All'],...groupsAt(selected).map(g=>[g.ref,g.short])].map(([ref,label])=>
    '<button class="chip" data-filter="'+ref+'" aria-pressed="'+(!attentionOnly && filter===ref)+'">'+esc(label)+'</button>').join('');
}
function prList(records, limit = Infinity) {
  return records.filter(r => r.level === 3)
      .sort(
          (a, b) => b.day.localeCompare(a.day) || (b.recordedAt || 0) - (a.recordedAt || 0) ||
              byId[a.id].name.localeCompare(byId[b.id].name))
      .slice(0, limit)
}
function recordRow(r) {
  return '<button class="record-row" data-record="' + key(r.day, r.id) + '"><span class="record-icon">' +
      icon('trophy') + '</span><span><strong>' + esc(byId[r.id].name) + '</strong><span class="detail">' +
      esc(r.result) + ' · ' + r.reps + ' ' + (r.reps === 1 ? 'rep' : 'reps') +
      '</span><span class="fine">' + fmt(r.day, {day: 'numeric', month: 'short', year: 'numeric'}) +
      '</span></span></button>'
}
function recent() {
  const r = prList([...entries.values()].filter(r => r.day <= selected), 1)[0];
  return '<div class="card-head"><h2>Latest PR</h2>' + icon('trophy') + '</div>' +
      (r ? recordRow(r) :
           '<p class="empty-copy">Save a weight, height or other result on your third tap.</p>')
}
function footer() {
  return '<div class="page-end"><div class="device-cloud"><button class="inline sync-button" data-action="cloud-copy">'+
      icon('disk')+'Upload device data</button><span class="fine" data-cloud-label role="status">'+esc(cloudLabel())+
      '</span></div><button data-action="data">Settings &amp; backups</button></div>'
}
function workout() {
  const reminders=remindersFor(selected);
  const sub = fmt(selected, {weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'});
  return head('Workout log', sub, controls()) + '<div class="work-grid">' + hero() +
      '<section class="card weekly" id="week">' + week() +
      '</section><section class="card sheet"><div class="sheet-top"><div class="sheet-title"><h2>Exercise log</h2><button class="sheet-edit" data-action="edit-mode" aria-pressed="' +
      editing + '">' + icon(editing ? 'check' : 'edit') + (editing ? 'Finish editing' : 'Edit') +
      '</button></div><div class="legend" ' + (editing ? 'hidden' : '') +
      ' aria-label="Tap an exercise to change its level"><span class="done"><i class="dot"></i>1 tap · Done</span><span class="heavy"><i class="dot"></i>2 taps · Heavy</span><span class="pr"><i class="dot"></i>3 taps · PR</span></div>' +
      (editing ? '<p class="subline">Choose an exercise to change or clear its entry.</p>' : '') +
      '<div class="filters" aria-label="Filter by group">' + filterBtns() +
      '</div><div id="attention-controls">'+attentionControls(reminders)+'</div></div><div id="groups">' + groupList(reminders) +
      '</div></section><aside class="side"><section class="card balance" id="balance">' + balanceCard() +
      '</section><section class="card latest" id="recent">' + recent() + '</section></aside></div>'
}
function monthly() {
  let first = month + '-01', start = monday(first), nextDate = dateObj(first);
  nextDate.setMonth(nextDate.getMonth() + 1);
  let nextMonth = iso(nextDate);
  const ds = [];
  for (let d = start; d < nextMonth || ds.length % 7; d = offset(d, 1)) ds.push(d);
  return '<div class="card-head"><h2>' + fmt(first, {month: 'long', year: 'numeric'}) +
      '</h2><div class="pair">' + btn('prev-month', 'Previous month', 'prev', 'chev') +
      '<button class="chev" data-action="next-month" aria-label="Next month" ' +
      (month >= today.slice(0, 7) ? 'disabled' : '') + '>' + icon('next') +
      '</button></div></div><div class="calendar">' +
      ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map(w => '<span class="weekday">' + w + '</span>').join('') +
      ds.map(d => {
          if (d.slice(0, 7) !== month) return '<span></span>';
          const rs = [...dayItems(d), ...archivedDay(d)], gs=gymOn(d);
          return '<button data-calday="' + d + '" aria-label="' +
              fmt(d, {weekday: 'long', day: 'numeric', month: 'long'}) + ', ' + rs.length + ' exercises' + (isDan ? '' : ', '+gs.length+' gym reps') + '" aria-pressed="' + (d === calDay) + '" class="cal-cell ' +
              (d === today ? 'is-today' : '') + '" ' + (d > today ? 'disabled' : '') + '>' +
              Number(d.slice(-2)) + '<span class="cal-dots">' +
              [1, 2, 3]
                  .filter(l => rs.some(r => r.level === l))
                  .map(l => '<i class="dot ' + colours[l] + '"></i>')
                  .join('') +
              (gs.length?'<i class="dot gym-dot"></i>':'') + '</span></button>'
        }).join('') +
      '</div>'
}
function historicDay() {
  const rs = [...dayItems(calDay), ...archivedDay(calDay)], gs=gymOn(calDay);
  return '<div class="card-head"><h2>' + fmt(calDay, {weekday: 'short', day: 'numeric', month: 'short'}) +
      '</h2><span class="count">' + rs.length + ' exercise logs</span></div>' +
      (rs.length ? '<div class="history-log">' +
               rs.map(
                     r => '<div><span>' + esc(byId[r.id].name) +
                         (r.level === 3 ?
                              '<span class="detail">' + esc(r.result) + ' · ' + r.reps + ' reps</span>' :
                              '') +
                         '</span><span class="status ' + colours[r.level] + '">' + levels[r.level] +
                         '</span></div>')
                   .join('') +
               '</div>' :
                   '<p class="empty-copy">No exercises logged for this day.</p>') +
      '<button class="ghost wide" data-day="' + calDay + '">' +
      (rs.length ? 'Edit workout' : 'Open workout log') + '</button>'+
      (gs.length ? '<div class="history-gym"><h3>Gymnastics</h3>'+skills.map(skill=>{
        const reps=skillOn(calDay,skill.id),q=qualityStats(reps);
        return reps.length?'<div class="gap"><span>'+skill.name+'</span><b>'+q.total+'/5 · '+q.great+' great</b></div>':'';
      }).join('')+'</div>':'')+
      (isDan ? '<button class="ghost wide" data-open-log="calories" data-session="'+calDay+'">Open calorie log</button>' :
        '<button class="ghost wide" data-open-log="gymnastics" data-session="'+calDay+'">'+(gs.length?'Edit gymnastics':'Open gymnastics log')+'</button>')
}
let prLimit = 10;
let historyMode = 'calendar', chartUntick = false;
function chartWeek() {
  const start = monday(calDay), ds = Array.from({length: 7}, (_, i) => offset(start, i));
  const label = fmt(start, {day: 'numeric', month: 'short'}) + ' – ' +
      fmt(ds[6], {day: 'numeric', month: 'short', year: 'numeric'});
  const top = '<div class="card-head"><h2>' + label + '</h2><div class="pair">' +
      btn('prev-week', 'Previous week', 'prev', 'chev') +
      '<button class="chev" data-action="next-week" aria-label="Next week" ' +
      (ds[6] >= today ? 'disabled' : '') + '>' + icon('next') + '</button></div></div>';
  const header = '<thead><tr><th scope="col">Exercise</th>' +
      ds.map(
            d => '<th scope="col">' + fmt(d, {weekday: 'short'}) + '<small>' + Number(d.slice(-2)) +
                '</small></th>')
          .join('') +
      '</tr></thead>';
  const rows =
      groups
          .map(
              group => '<tbody><tr class="matrix-group"><th colspan="8">' + esc(group.name) +
                  '</th></tr>' +
                  exercises.filter(e => e.gi === group.ref)
                      .map(
                          e => '<tr><th scope="row">' + esc(e.name) + '</th>' +
                              ds.map(d => {
                                  const r = entries.get(key(d, e.id)), l = r?.level || 0,
                                        title = e.name + ' · ' +
                                      fmt(d, {weekday: 'long', day: 'numeric', month: 'short'}) + ' · ' +
                                      levels[l];
                                  return '<td><button class="cell ' + colours[l] + '" data-cell="' +
                                      key(d, e.id) + '" aria-label="' + esc(title) + '" title="' +
                                      esc(title) + '" ' + (d > today || (chartUntick && !l) || (!exerciseOn(e,d) && !l) ? 'disabled' : '') + '>' +
                                      icon(['plus', 'check', 'heavy', 'trophy'][l]) + '</button></td>';
                                }).join('') +
                              '</tr>')
                      .join('') +
                  '</tbody>')
          .join('');
  return '<section class="card chartcard matrix-card">' + top +
      '<p class="subline">'+(chartUntick?'Tap a marked cell to untick it.':'Tap a cell to log an exercise for that day.')+'</p><button class="sheet-edit chart-untick" data-action="chart-untick" aria-pressed="'+chartUntick+'">Untick cells</button><div class="legend"><span class="done"><i class="dot"></i>1 tap · Done</span><span class="heavy"><i class="dot"></i>2 taps · Heavy</span><span class="pr"><i class="dot"></i>3 taps · PR</span></div><div class="matrix-scroll" tabindex="0" aria-label="Scrollable exercise chart"><table class="matrix">' +
      header + rows + '</table></div></section>';
}
function historyScreen() {
  const prs = prList([...entries.values()]);
  return head(
             'History', isDan ? 'Workouts and personal records.' : 'Workouts, gymnastics and personal records.',
             '<div class="periods"><button data-mode="calendar" aria-pressed="' +
                 (historyMode === 'calendar') +
                 '">Calendar</button><button data-mode="chart" aria-pressed="' + (historyMode === 'chart') +
                 '">Weekly chart</button></div>') +
      (historyMode === 'chart' ? chartWeek() :
                                 '<div class="two-col"><section class="card calendar-card">' + monthly() +
               '</section><section class="card calendar-card">' + historicDay() + '</section></div>') +
      '<section class="card pr-card separate"><div class="card-head"><h2>Personal records</h2><span class="count">' +
      prs.length + ' logged</span></div>' +
      (prs.length ?
           prs.slice(0, prLimit).map(recordRow).join('') +
               (prs.length > prLimit ?
                    '<button class="ghost wide" data-action="more-pr">Show more records</button>' :
                    '') :
           '<p class="empty-copy">Tap an exercise three times and save the result to start your record book.</p>') +
      '</section>'
}
function trend(rs) {
  const step = period === 7 ? 1 :
      period === 28         ? 4 :
                              10,
        bins = Math.ceil(period / step), start = offset(today, 1 - period), data = [];
  for (let i = 0; i < bins; i++) {
    const a = offset(start, i * step), b = offset(a, step - 1),
          inBin = rs.filter(r => r.day >= a && r.day <= b);
    data.push({a, b, ns: [1, 2, 3].map(l => inBin.filter(r => r.level === l).length), n: inBin.length})
  }
  const max = Math.max(...data.map(x => x.n), 1);
  return '<div class="chart-scroll"><div class="bar-chart">' +
      data.map(
              x => '<div class="chart-col" title="' + fmt(x.a, {day: 'numeric', month: 'short'}) + ' · ' +
                  x.n + ' exercise logs"><span class="chart-num">' + x.n +
                  '</span><div class="bar-area"><div class="barfill" style="height:' + x.n / max * 100 +
                  '%">' +
                  x.ns.map(
                          (n, i) =>
                              n ? '<i class="' + colours[i + 1] + '" style="flex:' + n + '"></i>' : '')
                      .join('') +
                  '</div></div><span class="chart-x">' +
                  (period === 7 ? fmt(x.a, {weekday: 'short'}) :
                                  fmt(x.a, {month: 'short', day: 'numeric'})) +
                  '</span></div>')
          .join('') +
      '</div></div>'
}
let gapsExpanded = false;
function gaps(records) {
  const rs = records.filter(record => record.day < today), n = tally(rs);
  if (!n)
    return '<p class="empty-copy">After your first training day, this shows which exercises you left out. Today is still in progress.</p>';
  const days = [...new Set(rs.map(r=>r.day))];
  const rankedList = ranked(rs).map(e => ({...e, eligible:days.filter(d =>
    exerciseOn(e,d)).length}))
    .filter(x => x.n < x.eligible).sort((a,b) => (b.eligible-b.n)-(a.eligible-a.n));
  if (!rankedList.length)
    return '<p class="empty-copy">You covered every exercise in every logged session in this period.</p>';
  return '<p class="subline">Across ' + n + ' earlier training ' + (n === 1 ? 'day' : 'days') +
      '. Rest days and today are excluded.</p>' +
      rankedList.slice(0, gapsExpanded ? rankedList.length : 5)
          .map(
              e => '<div class="gap"><span>' + esc(e.name) + '<small>' + e.n + ' of ' + e.eligible +
                  ' sessions logged</small></span><b>' + (e.eligible - e.n) + ' missed</b></div>')
          .join('') +
      (rankedList.length > 5 ? '<button class="small-link" data-action="gaps">' +
               (gapsExpanded ? 'Show fewer' : 'Show all ' + rankedList.length) + '</button>' :
                               '')
}
function workoutInsights() {
  const rs = windowItems(today, period).filter(activeWorkout), n = tally(rs), unique = new Set(rs.map(r => r.id)).size;
  return '<div class="metrics">' +
      [
        [n, 'Training days', 'cal'], [rs.length, 'Exercise logs', 'layers'],
        [unique + ' / ' + exercises.length, 'Exercises covered', 'target'],
        [rs.filter(r => r.level === 3).length, 'Personal records', 'trophy']
      ]
          .map(
              ([n, label, g]) => '<div class="card metric"><div>' + icon(g) + '<span>' + label +
                  '</span></div><strong>' + n + '</strong></div>')
          .join('') +
      '</div><div class="two-col insight-grid"><section class="card chartcard"><div class="card-head"><h2>Exercise frequency</h2>' +
      icon('insight') + '</div><p class="subline">Exercises logged per ' +
      (period === 7      ? 'day' :
           period === 28 ? '4-day block' :
                           '10-day block') +
      '</p>' + trend(rs) + '<div class="legend">' +
      [1, 2, 3]
          .map(l => '<span class="' + colours[l] + '"><i class="dot"></i>' + levels[l] + '</span>')
          .join('') +
      '</div></section><section class="card balance"><div class="card-head"><h2>Exercise coverage</h2>' +
      icon('layers') + '</div><p class="subline">Different exercises logged at least once</p>' +
      balance(rs) +
      '</section><section class="card focuscard"><div class="card-head"><h2>Frequently missed</h2>' +
      icon('target') + '</div>' + gaps(rs) +
      '</section><section class="card focuscard"><div class="card-head"><h2>Most consistent</h2>' +
      icon('check') + '</div>' +
      (n ? ranked(rs)
               .filter(e => e.n)
               .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name))
               .slice(0, 4)
               .map(
                   e => '<div class="gap"><span>' + esc(e.name) + '</span><b>' + e.n + ' / ' + n +
                       ' days</b></div>')
               .join('') :
           '<p class="empty-copy">Your most frequently logged exercises will appear here.</p>') +
      '</section></div>'
}
function render(animate=false) {
  stopCounters();
  if (filter!==-1 && !groupsAt(selected).some(g=>g.ref===filter)) filter=-1;
  document.querySelectorAll('nav [data-view]').forEach(b => {
    if (b.dataset.view === view)
      b.setAttribute('aria-current', 'page');
    else
      b.removeAttribute('aria-current')
  });
  document.title =
      appName + ' · ' + ({calories:'Calories',workout: 'Workout log', gymnastics:'Gymnastics log', history: 'History', insights: 'Insights'}[view]);
  main.innerHTML =
      (storageIssue ? '<div role="alert" class="warning">' + esc(storageIssue) + '</div>' : '') +
      deviceMigrationNotice()+({workout, gymnastics, calories, history:historyScreen, insights}[view])() + footer();
  if (view === 'workout') paintWave();
  if(animate)enterScreen();
}
