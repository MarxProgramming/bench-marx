function hideToast() {
  clearTimeout(toastTimer);
  toast.classList.remove('visible');
  toast.replaceChildren();
  undo = null
}
function notify(message, undoFn) {
  hideToast();
  undo = undoFn;
  toast.textContent = message;
  if (undo) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = 'Undo';
    b.dataset.action = 'undo';
    toast.append(b)
  }
  toast.classList.add('visible');
  toastTimer = setTimeout(hideToast, undo ? 6500 : 3200)
}
function change(day, id, record) {
  const k = key(day, id), before = entries.get(k);
  storeEntry(day, id, record);
  refreshLog(day, id);
  const skill=byId[id].skill;
  const set=skill ? skillOn(day,skill) : [];
  const finishedSet=skill && record && ((!before && set.length===repsPerSkill) || (record.level===2 && set.length===repsPerSkill && set.every(r=>r.level===2)));
  if(finishedSet)document.querySelector('[data-skill-row="'+skill+'"]')?.classList.add('set-complete');
  const completed=(!before && record && ((skill && !byId[id].optional && gymOn(day).filter(r=>!byId[r.id].optional).length===coreTarget) || (!skill && activeWorkout(record) && dayItems(day).length===exercisesAt(day).length)));
  if(record)playNotes(completed?[392,495,587,784]:finishedSet?[495,587,740]:[record.level===1?440:record.level===2?554:660]);
  const milestone=completed ? 'Session complete · ' : finishedSet ? (set.every(r=>r.level===2)?'Five great reps · ':'Set of five · ') : '';
  notify(storageIssue || (milestone+(record ? (byId[id].skill ? repNames[record.level] : levels[record.level]) + ' · ' : 'Cleared · ') + byId[id].name + (byId[id].skill?' · rep '+byId[id].rep:'')), () => {
    if (JSON.stringify(entries.get(k)) !== JSON.stringify(record || undefined)) {
      notify('This entry has since changed.');
      return
    }
    storeEntry(day, id, before);
    refreshLog(day, id);
    notify('Change undone')
  })
}
function refreshLog(day, id) {
  stopCounters();
  if(view==='gymnastics' && day===selected && byId[id].skill && !storageIssue){repaintGym(day,id);return}
  if (view !== 'workout' || day !== selected || storageIssue || byId[id].retired || byId[id].skill) {
    render();
    return
  }
  const r = document.querySelector('[data-row="' + id + '"]');
  if (r) {
    const focused = r.contains(document.activeElement);
    r.outerHTML = row(byId[id]);
    const nr = document.querySelector('[data-row="' + id + '"]');
    nr.classList.add('pulse');
    if (focused) nr.querySelector('.log').focus({preventScroll: true})
  }
  const rs = dayItems(selected), n = rs.length;
  document.querySelector('#done-count').textContent = n;
  document.querySelector('.pct').textContent = percentage(n,exercisesAt(selected).length) + '%';
  document.querySelectorAll('.segs b').forEach((el, i) => el.classList.toggle('on', i < n));
  paintWave();
  document.querySelectorAll('[data-groupcount]').forEach(c => {
    const i = Number(c.dataset.groupcount);
    c.textContent = rs.filter(r => byId[r.id].gi === i).length + ' / ' + exercisesAt(selected).filter(e => e.gi === i).length
  });
  document.querySelector('#week').innerHTML = week();
  document.querySelector('#balance').innerHTML = balanceCard();
  document.querySelector('#recent').innerHTML = recent()
}
function showDialog(title, body, info = {}, mark = '') {
  if (!modal.open) returnFocus = document.activeElement;
  modalInfo = info;
  document.querySelector('#dialog-body').innerHTML = mark +
      '<div class="dialog-head"><h2 id="dialog-title">' + title + '</h2>' +
      btn('close', 'Close dialog', 'close', 'round') + '</div>' + body;
  if (!modal.open) modal.showModal();
  const field = modal.querySelector('input:not([type=file]),[data-initial]');
  if (field) field.focus({preventScroll: true})
}
function closeDialog() {
  modal.close();
  modalInfo = null;
  pendingImport = null
}
modal.addEventListener('close', () => {
  modalInfo = null;
  pendingImport = null;
  if (returnFocus?.isConnected) returnFocus.focus({preventScroll: true});
  returnFocus = null
});
function options(day, id) {
  const r = entries.get(key(day, id));
  showDialog(
      'Edit exercise',
      '<p class="dialog-sub">' + esc(byId[id].name) + ' · ' + fmt(day, {day: 'numeric', month: 'short'}) +
          '</p>' +
          levels
              .map(
                  (l, i) => '<button class="choice ' + colours[i] + '" data-set="' + i + '">' +
                      icon(['close', 'check', 'heavy', 'trophy'][i]) + l +
                      ((r?.level || 0) === i ? '<small>Current</small>' : '') + '</button>')
              .join('') + (byId[id].created ? '<button class="ghost wide" data-rename-exercise="'+id+'">Rename exercise</button><button class="ghost wide" data-archive-exercise="'+id+'">Archive exercise</button>' : ''),
      {day, id})
}
function prForm(day, id) {
  const r = entries.get(key(day, id)), old = r?.level === 3 ? r : null;
  const last = prList([...entries.values()].filter(x => x.id === id && x.day < day), 1)[0];
  showDialog(
      old ? 'Edit personal record' : 'Log a personal record',
      '<p class="dialog-sub">' + esc(byId[id].name) + ' · ' + fmt(day, {day: 'numeric', month: 'short'}) +
          '</p><form id="pr-form"><label class="field">What did you do?<input name="result" maxlength="140" required placeholder="e.g. 32.5 kg per arm" value="' +
          esc(old?.result) +
          '"></label><label class="field">Reps<input type="number" name="reps" inputmode="numeric" min="1" max="9999" step="1" required placeholder="e.g. 5" value="' +
          esc(old?.reps) +
          '"></label><label class="field">Notes (optional)<textarea name="note" maxlength="300" placeholder="Anything worth remembering">' +
          esc(old?.note) + '</textarea></label>' +
          (last ? '<p class="note">Previous PR · ' + esc(last.result) + ' × ' + last.reps + ' on ' +
                   fmt(last.day, {day: 'numeric', month: 'short', year: 'numeric'}) + '</p>' :
                  '') +
          (old ?
               '<button class="secondary-link" type="button" data-action="change-level">Change level or clear entry</button>' :
               '') +
          '<div class="dialog-actions"><button class="ghost" type="button" data-action="close">Cancel</button><button class="primary" type="submit">Save PR</button></div></form>',
      {day, id}, '<span class="prmark">' + icon('trophy') + '</span>')
}
function setDay(day, target = ['gymnastics','calories'].includes(view) ? view : 'workout') {
  if (!validDay(day) || day > today) return;
  selected = day;
  editing = false;
  view = target;
  syncRoute();
  calDay = day;
  month = day.slice(0, 7);
  hideToast();
  render(true);
  if(view==='workout'||view==='gymnastics')playNotes([392,495,587]);
  window.scrollTo(0, 0)
}
function selectView(v) {
  view = v;
  syncRoute();
  editing = false;
  if (['workout','gymnastics','calories'].includes(v)) {
    selected = today;
    filter = -1
  }
  if (v === 'history') {
    calDay = selected;
    month = calDay.slice(0, 7)
  }
  hideToast();
  render(true);
  if(view==='workout'||view==='gymnastics')playNotes([392,495,587]);
  window.scrollTo(0, 0)
}
function dateDialog() {
  showDialog(
      'Choose a log date',
      '<form id="date-form"><label class="field">Log date<input name="day" type="date" required min="1900-01-01" max="' +
          today + '" value="' + selected +
          '"></label><div class="dialog-actions"><button type="button" class="ghost" data-action="today">Today</button><button class="primary" type="submit">Open log</button></div></form>')
}
function dataDialog() {
  showDialog(
      'Preferences &amp; backups',
      preferenceControls()+'<p class="dialog-sub">Your journal is saved in this browser. Export a backup to move your logs to another device.</p><button class="choice" data-action="export">' +
          icon('download') + 'Export backup</button><button class="choice" data-action="import">' +
          icon('history') +
          'Import backup</button><input class="file-input" id="import-file" type="file" accept=".json,application/json"><p class="note">' +
          entrySummary()+'</p><button class="choice" data-action="cloud">Supabase backup</button>'+
          (exercises.some(e=>e.archived) ? '<button class="choice" data-action="archived-exercises">Archived exercises</button>' : '')+resetActions())
}
function backupPayload() {
  return {
        app: appName,
        version: 3,
        daily: [...daily.values()],
        exportedAt: new Date().toISOString(),
        entries:
            [...entries.values()].sort((a, b) => a.day.localeCompare(b.day) || a.id.localeCompare(b.id))
  };
}
function exportFile() {
  const data = JSON.stringify(backupPayload(),null,2);
  const url = URL.createObjectURL(new Blob([data], {type: 'application/json'})),
        a = document.createElement('a');
  a.href = url;
  a.download = appName.replace(' ','-') + '-' + today + '.json';
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}
async function previewImport(file) {
  if (!file) return;
  try {
    if (file.size > 25000000) throw Error('This backup is too large to import.');
    const data = JSON.parse(await file.text());
    const supported = data.app === appName || (!isDan && data.app === 'Formlog');
    if (!supported || ![1,2,3].includes(data.version) || !Array.isArray(data.entries) ||
        (data.version === 3 && !Array.isArray(data.daily)))
      throw Error('Choose a '+appName+' JSON backup.');
    const incomingDaily = new Map();
    const catalogue = {...byId};
    for (const item of data.daily || []) {
      const record = cleanDaily(item);
      if (!record || (record.day || record.created) > today || incomingDaily.has(dailyKey(record)))
        throw Error('The backup contains an invalid or duplicate daily entry.');
      incomingDaily.set(dailyKey(record),record);
      if (record.type === 'exercise') catalogue[record.id] = record;
    }
    const incoming = new Map();
    for (const item of data.entries) {
      const r = cleanRecord(item,catalogue);
      if (!r || r.day > today) throw Error('The backup contains an invalid workout entry.');
      const k = key(r.day, r.id);
      if (incoming.has(k)) throw Error('The backup contains duplicate entries.');
      incoming.set(k, r)
    }
    const fresh = [...incoming.entries()].filter(([k]) => !entries.has(k)).map(([, r]) => r);
    const freshDaily = [...incomingDaily.values()].filter(r => !daily.has(dailyKey(r)));
    pendingImport = [...freshDaily,...fresh];
    showDialog(
        'Import backup',
        '<p class="dialog-sub">' + pendingImport.length + ' new log entries can be added. ' +
            (incoming.size + incomingDaily.size - pendingImport.length) +
            ' existing entries will be kept as they are.</p><div class="dialog-actions"><button class="ghost" data-action="close">Cancel</button><button class="primary" data-action="merge" ' +
            (!pendingImport.length ? 'disabled' : '') + '>Import logs</button></div>');
  } catch (err) {
    showDialog(
        'Import failed',
        '<p class="dialog-sub">' +
            esc(err instanceof SyntaxError ? 'Choose a valid Bench Marx or Formlog JSON backup.' :
                                             err.message) +
            '</p><button class="ghost wide" data-action="data">Back to backups</button>')
  }
}
function help() {
  if (view === 'calories') {
    showDialog('Logging calories','<p class="dialog-sub">Enter the calories for the portion you ate. Tap a saved item to edit or remove it.</p><button class="primary wide" data-action="close">Got it</button>');
    return;
  }
  if(view==='insights'||view==='history'){
    const message=isDan ? (view==='history'?'Choose a date to see its workout or calorie log.':'Choose Workout or Weight and a date range.') : view==='history'?'Choose a date to see both logs. Use Weekly chart to edit a workout across seven days.':'Pick Workout, Gymnastics or Patterns, then choose 7, 28 or 90 days. Each comparison uses the immediately preceding period of the same length.';
    showDialog(view==='history'?'Using history':'Reading insights','<p class="dialog-sub">'+message+'</p><button class="primary wide" data-action="close">Got it</button>');
    return;
  }
  if(view==='gymnastics'){
    showDialog('How to log gymnastics','<p class="dialog-sub">Each skill has five numbered rep boxes. Tap a box once for achieved, again for great, and a third time to clear it. The Untick button underneath clears either mark immediately.</p><p class="note">Both marks count once towards your five. Optional basics are kept outside the 25-rep target. Use Undo to reverse your last tap.</p><button class="primary wide" data-action="close">Got it</button>');
    return;
  }
  showDialog(
      'How to log a workout',
      '<p class="dialog-sub">Tap anywhere on an exercise row.</p>' +
          [
            '<strong>One tap</strong> marks it done.', '<strong>Two taps</strong> marks it heavy.',
            '<strong>Three taps</strong> opens a PR entry for your result and reps.'
          ]
              .map(
                  (t, i) => '<div class="help-row ' + colours[i + 1] + '"><i class="dot"></i><span>' + t +
                      '</span></div>')
              .join('') +
          '<p class="note">Each ridge on the session wave represents one exercise. It lifts and changes colour when you log it.</p><p class="note">Use Untick beside a logged exercise to clear it. Use Undo after a tap, or choose Edit above the exercise list to change an earlier entry. Tap a saved PR to edit it. A new log opens each day, and past workouts stay in History.</p><button class="primary wide" data-action="close">Got it</button>')
}
function rollover() {
  const now = iso();
  if (today === now) return;
  const old = today;
  today = now;
  if (selected === old) selected = now;
  if (calDay === old) {
    calDay = now;
    month = now.slice(0, 7)
  }
  render()
}
document.addEventListener('click', event => {
  const el = event.target.closest('button');
  if (!el || el.disabled) return;
  const d = el.dataset;
  if (d.archiveExercise) { setExerciseArchived(d.archiveExercise,true); return; }
  if (d.restoreExercise) { setExerciseArchived(d.restoreExercise,false); return; }
  if (d.renameExercise) { addExerciseDialog(byId[d.renameExercise].gi,d.renameExercise); return; }
  if (d.weigh) { weightDialog(d.weigh); return; }
  if (d.addExercise !== undefined) { addExerciseDialog(Number(d.addExercise)); return; }
  if (d.foodDay && isDan) { calorieDialog(d.foodDay, d.foodId,d.copyFood); return; }
  if (d.removeDaily) { removeDaily(d.removeDaily); return; }
  if(d.untick){if(entries.has(key(selected,d.untick)))change(selected,d.untick,null);return;}
  if(d.restore){restoreJournal(d.restore);return;}
  if(d.pref){changePreference(d.pref,el);return}
  if (d.view) {
    rollover();
    selectView(d.view);
    return
  }
  if(d.rep){rollover();tapRep(d.rep);return}
  if(d.openLog && d.session){setDay(d.session,d.openLog);return}
  if (d.log) {
    rollover();
    if (editing) {
      options(selected, d.log);
      return
    }
    const l = entries.get(key(selected, d.log))?.level || 0;
    if (l >= 2)
      prForm(selected, d.log);
    else
      change(selected, d.log, {day: selected, id: d.log, level: l + 1});
    return
  }
  if(d.analysis){analysisMode=d.analysis;render(true);document.querySelector('[data-analysis="'+analysisMode+'"]')?.focus({preventScroll:true});return}
  if(d.daySummary){openDaySummary(d.daySummary);return}
  if (d.mode) {
    historyMode = d.mode;
    render();
    document.querySelector('[data-mode="' + historyMode + '"]').focus({preventScroll: true});
    return
  }
  if (d.cell) {
    const [day, id] = d.cell.split('.'), l = entries.get(d.cell)?.level || 0;
    if(chartUntick){if(l)change(day,id,null);return;}
    if (l >= 2) {
      prForm(day, id);
      return
    }
    change(day, id, {day, id, level: l + 1});
    document.querySelector('[data-cell="' + d.cell + '"]')?.focus({preventScroll: true});
    return
  }

  if (d.set !== undefined) {
    const {day, id} = modalInfo, l = Number(d.set);
    if (l === 3) {
      prForm(day, id);
      return
    }
    closeDialog();
    change(day, id, l ? {day, id, level: l} : null);
    return
  }
  if (d.day) {
    setDay(d.day);
    return
  }
  if (d.record) {
    const r = entries.get(d.record);
    if (r) prForm(r.day, r.id);
    return
  }
  if (d.filter !== undefined) {
    filter = Number(d.filter);
    document.querySelectorAll('[data-filter]')
        .forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.filter) === filter)));
    document.querySelector('#groups').innerHTML = groupList();
    return
  }
  if (d.period) {
    period = Number(d.period);
    gapsExpanded = false;
    render(true);
    document.querySelector('[data-period="' + period + '"]').focus({preventScroll: true});
    return
  }
  if (d.calday) {
    calDay = d.calday;
    render();
    document.querySelector('[data-calday="' + calDay + '"]').focus({preventScroll: true});
    return
  }
  switch (d.action) {
    case 'archived-exercises':archivedExercises();break;
    case 'cloud':cloudDialog();break;
    case 'cloud-review':
    case 'cloud-save':
    case 'cloud-sign-out':runCloud(el);break;
    case 'review-reset':reviewReset();break;
    case 'confirm-reset':resetJournal();break;
    case 'restore-list':recoveryList();break;
    case 'chart-untick':chartUntick=!chartUntick;render();document.querySelector('.chart-untick')?.focus();break;
    case 'prev':
      setDay(offset(selected, -1));
      break;
    case 'next':
      setDay(offset(selected, 1));
      break;
    case 'date':
      dateDialog();
      break;
    case 'today':
      closeDialog();
      setDay(today);
      break;
    case 'close':
      closeDialog();
      break;
    case 'help':
      help();
      break;
    case 'data':
      dataDialog();
      break;
    case 'export':
      exportFile();
      break;
    case 'import':
      document.querySelector('#import-file').click();
      break;
    case 'merge': {
      const incoming = pendingImport || [];
      loadEntries();
      for (const r of incoming) {
        if (r.type && !daily.has(dailyKey(r))) writeJournal(dailyKey(r),r,daily);
        if (!r.type && !entries.has(key(r.day,r.id))) storeEntry(r.day,r.id,r);
      }
      rebuildCatalogue();
      closeDialog();
      render();
      notify(storageIssue || 'Backup imported');
      break
    }
    case 'edit-mode':
      editing = !editing;
      render();
      document.querySelector('.sheet-edit').focus({preventScroll: true});
      break;
    case 'undo':
      if (undo) undo();
      break;
    case 'change-level':
      options(modalInfo.day, modalInfo.id);
      break;
    case 'gaps':
      gapsExpanded = !gapsExpanded;
      render();
      break;
    case 'more-pr':
      prLimit += 20;
      render();
      break;
    case 'prev-week':
    case 'next-week': {
      const next = offset(monday(calDay), d.action === 'prev-week' ? -7 : 7);
      if (next > today || next < '1900-01-01') return;
      calDay = next;
      month = next.slice(0, 7);
      render();
      break
    }
    case 'prev-month':
    case 'next-month': {
      const m = dateObj(month + '-01');
      m.setMonth(m.getMonth() + (d.action === 'next-month' ? 1 : -1));
      if (iso(m) < '1900-01-01') return;
      month = iso(m).slice(0, 7);
      calDay = month === today.slice(0, 7) ? today : month + '-01';
      render();
      break
    }
  }
});
document.addEventListener('submit', e => {
  saveDailyForm(e);
  if (e.target.id === 'cloud-form') {e.preventDefault();runCloud(()=>cloudSignIn(e.target));}
  if (e.target.id === 'pr-form') {
    e.preventDefault();
    const form = e.target, data = new FormData(form), {day, id} = modalInfo;
    const r = cleanRecord({
      day,
      id,
      level: 3,
      result: data.get('result'),
      reps: Number(data.get('reps')),
      note: data.get('note')
    });
    if (!r) {
      form.elements.result.setCustomValidity('Enter a result, such as a weight or height.');
      form.elements.result.reportValidity();
      return
    }
    r.recordedAt = entries.get(key(day, id))?.recordedAt || Date.now();
    closeDialog();
    change(day, id, r);
    celebrateRecord()
  }
  if (e.target.id === 'date-form') {
    e.preventDefault();
    const day = new FormData(e.target).get('day');
    if (validDay(day) && day <= today) {
      closeDialog();
      setDay(day)
    }
  }
});
document.addEventListener('toggle',e=>{if(e.target.id==='optional-skills')basicsExpanded=e.target.open},true);
document.addEventListener('input', e => {
  if (e.target.name === 'result') e.target.setCustomValidity('')
});
document.addEventListener('change', e => {
  if(e.target.id==='skill-detail'||e.target.id==='exercise-detail'){
    const id=e.target.id;
    if(id==='skill-detail')selectedSkill=e.target.value;else selectedExercise=e.target.value;
    render();document.querySelector('#'+id)?.focus({preventScroll:true});return;
  }
  if (e.target.id === 'import-file') previewImport(e.target.files[0])
});
window.addEventListener('storage', e => {
  if (e.key === null || e.key.startsWith(prefix)) {
    loadEntries();
    render();
    hideToast()
  }
});
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) rollover()
});
window.addEventListener('focus', rollover);
function scheduleMidnight() {
  const now = new Date(), midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  setTimeout(() => {
    rollover();
    scheduleMidnight()
  }, midnight.getTime() - now.getTime() + 100);
}
function syncRoute() {
  if(window.history?.replaceState && window.location.hash !== '#'+view)
    window.history.replaceState(null,'','#'+view);
}
function linkedView(){return window.location?.hash.slice(1) || 'workout';}
function knownView(v){return ['workout','history','insights',isDan?'calories':'gymnastics'].includes(v);}
window.addEventListener('hashchange',()=>{const v=linkedView();if(knownView(v)&&v!==view)selectView(v);});
scheduleMidnight();
loadEntries();
if(knownView(linkedView()))view=linkedView();
render(true);

function celebrateRecord() {
  if (!motionAllowed()) return;
  const fx = document.createElement('span');
  fx.className = 'pr-spark';
  fx.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < 8; i++) {
    const bit = document.createElement('i'), angle = Math.PI * (i + 0.5) / 8;
    bit.style.setProperty('--dx', Math.round(Math.cos(angle) * 55) + 'px');
    bit.style.setProperty('--dy', Math.round(-Math.sin(angle) * 48) + 'px');
    fx.append(bit);
  }
  toast.append(fx);
  setTimeout(() => fx.remove(), 700);
}
