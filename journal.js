// Journal resets retain a verified snapshot of this app's entries on this device.
const archivePrefix = isDan ? 'bench-dan.reset.v1.' : 'bench-marx.reset.v1.';
function storageKeys(startsWith) {
  return Array.from({length:localStorage.length},(_,i)=>localStorage.key(i))
    .filter(k=>k && k.startsWith(startsWith)).sort();
}
function recoveryKeys() {
  try { return storageKeys(archivePrefix).reverse(); } catch { return []; }
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
  showDialog('Start fresh?', '<p class="dialog-sub">Your logs, custom exercises and insights will start fresh in this browser. You can restore this journal from Settings.</p><p class="reset-count">'+entrySummary()+
    '</p><div class="dialog-actions"><button class="ghost" data-initial data-action="data">Keep journal</button><button class="primary" data-action="confirm-reset">Reset training data</button></div>',{reviewingReset:true,revision:journalRevision()});
}
function resetJournal() {
  if(!modalInfo?.reviewingReset)return;
  try {
    loadEntries();
    if(journalRevision()!==modalInfo.revision){reviewReset();return;}
    const disk=new Map(storageKeys(prefix).map(k=>[k,localStorage.getItem(k)]));
    const snapshot=new Map(disk);
    for(const [id,r] of unsaved) {
      if(r)snapshot.set(prefix+id,JSON.stringify(r));
    }
    if(!snapshot.size){closeDialog();render();notify('Your journal is already empty.');return;}
    const archived=JSON.stringify({time:Date.now(),items:[...snapshot]});
    const id=archivePrefix+Date.now()+'.'+Math.random().toString(36).slice(2);
    localStorage.setItem(id,archived);
    if(localStorage.getItem(id)!==archived)throw Error('snapshot');
    // Preserve entries which other tabs added or edited while the reset was open.
    for(const [k,value] of disk) {
      if(localStorage.getItem(k)===value)localStorage.removeItem(k);
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
    const time=Number(k.slice(archivePrefix.length).split('.')[0]);
    return '<button class="choice" data-restore="'+esc(k)+'">Restore '+esc(new Date(time).toLocaleString('en-GB',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}))+'</button>';
  }).join('');
  showDialog('Previous journals','<p class="dialog-sub">Restore missing entries from a reset. Anything logged since then takes priority.</p>'+buttons+
    '<button class="ghost wide" data-action="data">Back to settings</button>');
}
function restoreJournal(id) {
  if(!id.startsWith(archivePrefix))return;
  try {
    const saved=JSON.parse(localStorage.getItem(id));
    if(!Array.isArray(saved?.items)||!saved.items.every(x=>Array.isArray(x)&&x.length===2&&typeof x[0]==='string'&&x[0].startsWith(prefix)&&typeof x[1]==='string'))throw Error('archive');
    let count=0,conflict=false;
    for(const [k,value] of saved.items){
      const current=localStorage.getItem(k);
      if(unsaved.has(k.slice(prefix.length))){conflict=true;continue;}
      if(current===null){localStorage.setItem(k,value);count++;}
      else if(current!==value)conflict=true;
    }
    if(!conflict && saved.items.every(([k,v])=>localStorage.getItem(k)===v))localStorage.removeItem(id);
    loadEntries();closeDialog();render();
    notify(count+' '+(count===1?'entry':'entries')+' restored.'+(conflict?' Newer entries kept.':''));
  }catch{loadEntries();showDialog('Restore incomplete','<p class="dialog-sub">The saved journal is still available. Check browser storage and try again.</p><button class="primary wide" data-action="data">Back to settings</button>');}
}
