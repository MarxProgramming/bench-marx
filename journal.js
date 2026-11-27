// Journal resets retain a verified snapshot of this app's entries on this device.
const archivePrefix = isDan ? 'bench-dan.reset.v1.' : 'bench-marx.reset.v1.';
function storageKeys(startsWith) {
  return Array.from({length:localStorage.length},(_,i)=>localStorage.key(i))
    .filter(k=>k && k.startsWith(startsWith)).sort();
}
function activeArchivePrefix() {
  return cloudSession ? archivePrefix+'account.'+cloudScope(cloudSession) : archivePrefix;
}
function recoveryKeys() {
  const current = activeArchivePrefix();
  try { return storageKeys(current).filter(k=>cloudSession || !k.startsWith(archivePrefix+'account.')).reverse(); } catch { return []; }
}
function resetActions() {
  const archives=recoveryKeys();
  return '<div class="reset-actions"><button class="choice fresh-action" data-action="review-reset">Start fresh</button>'+
    (archives.length?'<button class="choice" data-action="restore-list">Restore a previous journal</button>':'')+'</div>';
}
function entrySummary() {
  const all=[...entries.values()], gym=all.filter(isGym).length, work=all.length-gym, days=tally(all);
  const count=(n,s)=>n+' '+s+(n===1?'':'s');
  return count(work,'exercise log')+(isDan ? '' : ' · '+count(gym,'gymnastics rep'))+' · '+count(days,'training day');
}
function journalRevision() {
  return JSON.stringify([...entries,...daily].sort(([a],[b])=>a.localeCompare(b)));
}
function reviewReset() {
  loadEntries();
  showDialog('Start fresh?', '<p class="dialog-sub">Your logs, custom exercises and insights will start fresh '+(cloudSession ? 'on all synced devices.' : 'in this browser.')+' A recovery copy will stay on this device.</p><p class="reset-count">'+entrySummary()+
    '</p><div class="dialog-actions"><button class="ghost" data-initial data-action="data">Keep journal</button><button class="primary" data-action="confirm-reset">Reset training data</button></div>',{reviewingReset:true,revision:journalRevision()});
}
function resetJournal() {
  if(!modalInfo?.reviewingReset)return;
  try {
    loadEntries();
    if(journalRevision()!==modalInfo.revision){reviewReset();return;}
    const active = journalPrefix();
    const disk=new Map(storageKeys(active).map(k=>[k,localStorage.getItem(k)]));
    const snapshot=new Map(disk);
    for(const [id,r] of unsaved) {
      if(r)snapshot.set(active+id,JSON.stringify(r));
    }
    if(!snapshot.size){closeDialog();render();notify('Your journal is already empty.');return;}
    const archived=JSON.stringify({time:Date.now(),items:[...snapshot]});
    const id=activeArchivePrefix()+Date.now()+'.'+Math.random().toString(36).slice(2);
    localStorage.setItem(id,archived);
    if(localStorage.getItem(id)!==archived)throw Error('snapshot');
    // Preserve entries which other tabs added or edited while the reset was open.
    for(const [k,value] of disk) {
      if(localStorage.getItem(k)===value)persistJournalRecord(k.slice(active.length),null);
    }
    unsaved.clear();
    loadEntries();
    closeDialog();setDay(today,'workout');
    notify(entries.size?'Reset saved. Newer entries were kept.':'Fresh journal ready.');
  } catch {
    loadEntries();
    showDialog('Reset incomplete','<p class="dialog-sub">This browser could not finish saving the reset. Export a backup and check your entries before trying again.</p><button class="primary wide" data-action="data">Back to settings</button>');
  }
}
function recoveryList() {
  const buttons=recoveryKeys().map(k=>{
    const time=Number(k.slice(activeArchivePrefix().length).split('.')[0]);
    return '<button class="choice" data-restore="'+esc(k)+'">Restore '+esc(new Date(time).toLocaleString('en-GB',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}))+'</button>';
  }).join('');
  showDialog('Previous journals','<p class="dialog-sub">Restore missing entries from a reset. Anything logged since then takes priority.</p>'+buttons+
    '<button class="ghost wide" data-action="data">Back to settings</button>');
}
function restoreJournal(id) {
  if(!recoveryKeys().includes(id))return;
  const active = journalPrefix();
  try {
    const saved=JSON.parse(localStorage.getItem(id));
    if(!Array.isArray(saved?.items)||!saved.items.every(x=>Array.isArray(x)&&x.length===2&&typeof x[0]==='string'&&x[0].startsWith(active)&&typeof x[1]==='string'))throw Error('archive');
    let count=0,conflict=false;
    for(const [k,value] of saved.items){
      const current=localStorage.getItem(k);
      if(unsaved.has(k.slice(active.length))){conflict=true;continue;}
      if(current===null){persistJournalRecord(k.slice(active.length),value);count++;}
      else if(current!==value)conflict=true;
    }
    if(!conflict && saved.items.every(([k,v])=>localStorage.getItem(k)===v))localStorage.removeItem(id);
    loadEntries();closeDialog();render();
    notify(count+' '+(count===1?'entry':'entries')+' restored.'+(conflict?' Newer entries kept.':''));
  }catch{loadEntries();showDialog('Restore incomplete','<p class="dialog-sub">The saved journal is still available. Check browser storage and try again.</p><button class="primary wide" data-action="data">Back to settings</button>');}
}
