// Separate shared journals for the two apps. The client has no direct table access.
const cloudJournal = isDan ? 'dan' : 'marx';
const cloudProject = {"endpoint":"https://abksqxqqtwespzemvtqv.supabase.co","apiKey":"sb_publishable_UpYWu1uNrSa7MJtfdYWjDQ_2bJ8O9ga"};
const oldSessionKey = 'bench-'+cloudJournal+'.cloud-session';
const migrationKey = 'bench-'+cloudJournal+'.shared-device-migrated';
const cloudSession = window.location && window.fetch ? {journal:cloudJournal} : null;
let cloudSyncing, cloudTimer;
let cloudStatus = '', cloudMessage = '', cloudNeedsPaint = false;
let legacyCloudSession;
try {
  const saved = JSON.parse(sessionStorage.getItem(oldSessionKey));
  if (saved?.endpoint === cloudProject.endpoint && /^[0-9a-f-]{36}$/i.test(saved.owner) &&
      saved.token && saved.refresh) legacyCloudSession = saved;
} catch {}

function cloudScope(session) {
  return session.owner ? session.endpoint.split('/')[2]+'.'+session.owner+'.' : 'shared.';
}
function journalPrefix(session = cloudSession) {
  return session ? 'bench-'+cloudJournal+'.account.'+cloudScope(session) : prefix;
}
function outboxPrefix(session) {
  return 'bench-'+cloudJournal+'.outbox.'+cloudScope(session);
}
function cloudLabel() {
  if (storageIssue) return 'Storage needs attention';
  if (!cloudSession) return 'Saved on this device';
  if (cloudStatus === 'error') return 'Cloud sync paused';
  if (cloudStatus === 'saved') return 'Saved to cloud';
  return 'Syncing to cloud';
}
function setCloudStatus(status, message = '') {
  cloudStatus = status;
  cloudMessage = message;
  const label = document.querySelector('[data-cloud-label]');
  if (label) label.textContent = cloudLabel();
  const note = document.querySelector('[data-cloud-note]');
  if (note) note.textContent = cloudMessage || cloudLabel();
}
function deviceRecords() {
  const records = new Map();
  for (const source of [prefix, ...(legacyCloudSession ? [journalPrefix(legacyCloudSession)] : [])]) {
    for (const k of storageKeys(source)) records.set(k.slice(source.length),localStorage.getItem(k));
  }
  if (legacyCloudSession) {
    const queue = outboxPrefix(legacyCloudSession);
    for (const k of storageKeys(queue)) {
      const item = JSON.parse(localStorage.getItem(k));
      records.set(k.slice(queue.length),item.encoded);
    }
  }
  return records;
}
function deviceMigrationNotice() {
  if (!cloudSession) return '';
  try {
    if (!localStorage.getItem(migrationKey) && [...deviceRecords().values()].some(v=>v!==null))
      return '<div class="warning device-migration"><span>Earlier logs are still stored on this device.</span>'+
        '<button data-action="cloud-copy">Upload device data</button></div>';
  } catch {}
  return '';
}
function cloudDialog(message = '', uploadDevice = false) {
  const note = message ? '<p class="dialog-sub" role="status">'+esc(message)+'</p>' : '';
  if (uploadDevice) {
    const count = [...deviceRecords().values()].filter(v=>v!==null).length;
    showDialog('Upload device data',note+(count
      ? '<p class="dialog-sub">Publish '+count+' '+(count === 1 ? 'saved entry' : 'saved entries')+' from this device to the public '+appName+
        ' journal. Anyone can view or edit shared entries. Entries already in the cloud take priority.</p>'+
        '<button class="primary wide" data-action="cloud-copy-confirm">Publish saved entries</button>'
      : '<p class="dialog-sub">There are no earlier entries stored in this browser to upload. New entries sync automatically.</p>')+
      '<button class="ghost wide" data-action="cloud">Back to cloud sync</button>');
    return;
  }
  showDialog('Cloud sync',note+'<p class="dialog-sub">'+appName+' has a public journal. Everyone opening this app can view and edit it. Changes save automatically.</p>'+
    '<p class="note" data-cloud-note role="status">'+esc(cloudMessage || cloudLabel())+'</p>'+
    '<button class="primary wide" data-action="cloud-retry">Sync now</button>'+
    '<button class="choice" data-action="cloud-copy">Upload device data</button>'+
    '<button class="choice" data-action="cloud-legacy">Recover logs from an older account</button>');
}
function legacyDialog(message = '') {
  showDialog('Recover older logs','<p class="dialog-sub">'+esc(message ||
    'Use your previous Bench account only if you have logs stored there. You will review the entries before publishing them to the shared journal.')+'</p>'+
    '<form id="cloud-form"><label class="field">Email<input name="email" type="email" autocomplete="username" required></label>'+
    '<label class="field">Password<input name="password" type="password" autocomplete="current-password" required></label>'+
    '<div class="dialog-actions"><button class="primary">Find older logs</button></div></form>');
}

function cloudFetch(path, options = {}, token) {
  const headers = {apikey:cloudProject.apiKey,'Content-Type':'application/json',...options.headers};
  if (token) headers.Authorization = 'Bearer '+token;
  return window.fetch(cloudProject.endpoint+path,{...options,headers});
}
async function sharedRequest(action, fields) {
  const result = await cloudFetch('/rest/v1/rpc/bench_shared_'+action,{
    method:'POST',body:JSON.stringify({p_journal:cloudJournal,...fields})
  });
  if (!result.ok) throw Error('The server could not sync this entry. Your changes are queued on this device.');
  return result.json();
}

async function cloudSignIn(form) {
  const data = new FormData(form);
  const response = await cloudFetch('/auth/v1/token?grant_type=password',{
    method:'POST',body:JSON.stringify({email:data.get('email').trim(),password:data.get('password')})
  });
  if (!response.ok) throw Error('That older account could not be opened. Check the email and password.');
  const session = await response.json();
  if (!session.access_token || !session.user?.id) throw Error('The older account did not return a valid session.');
  const backup = {app:appName,version:3,entries:[],daily:[]};
  const owner = session.user.id, token = session.access_token;
  const responseBackup = await cloudFetch('/rest/v1/bench_journals?journal=eq.'+cloudJournal+'&owner=eq.'+owner+'&select=payload',{},token);
  if (responseBackup.ok) {
    const [row] = await responseBackup.json();
    if (row?.payload?.app === appName) {
      backup.entries = row.payload.entries || [];
      backup.daily = row.payload.daily || [];
    }
  }
  const previous = new Map([...backup.daily.map(row=>[dailyKey(row),row]),...backup.entries.map(row=>[key(row.day,row.id),row])]);
  let after = '';
  for (;;) {
    const params = new URLSearchParams({owner:'eq.'+owner,journal:'eq.'+cloudJournal,select:'entry_key,payload',
      order:'entry_key.asc',limit:'200'});
    if (after) params.set('entry_key','gt.'+after);
    const page = await cloudFetch('/rest/v1/bench_sync_entries?'+params,{},token);
    if (!page.ok) throw Error('The older journal could not be read.');
    const rows = await page.json();
    for (const row of rows) previous.set(row.entry_key,row.payload);
    if (rows.length < 200) break;
    after = rows.at(-1).entry_key;
  }
  const savedScope = {endpoint:cloudProject.endpoint,owner};
  for (const k of storageKeys(outboxPrefix(savedScope))) {
    const {encoded} = JSON.parse(localStorage.getItem(k));
    previous.set(k.slice(outboxPrefix(savedScope).length),JSON.parse(encoded));
  }
  backup.entries = [...previous.values()].filter(row=>row && !row.type);
  backup.daily = [...previous.values()].filter(row=>row?.type);
  await previewImport({size:0,text:async()=>JSON.stringify(backup)});
}

// Store each change before updating its cached value. Null is a shared deletion.
function persistJournalRecord(k, encoded, {onlyMissing = false} = {}) {
  if (cloudSession) localStorage.setItem(outboxPrefix(cloudSession)+k,JSON.stringify({
    id:window.crypto.randomUUID(),encoded,onlyMissing
  }));
  if (encoded === null) localStorage.removeItem(journalPrefix()+k);
  else localStorage.setItem(journalPrefix()+k,encoded);
  if (cloudSession) planCloudSync();
}
function planCloudSync() {
  setCloudStatus('syncing');
  clearTimeout(cloudTimer);
  cloudTimer = setTimeout(syncJournal,350);
}

async function syncEntries(session) {
  const cached = journalPrefix(session), outbox = outboxPrefix(session);
  const pending = storageKeys(outbox).map(k=>[k,localStorage.getItem(k)]).filter(([,v])=>v!==null);
  const changes = pending.map(([k,value])=>({key:k.slice(outbox.length),...JSON.parse(value)}));
  for (const onlyMissing of [false,true]) {
    const group = changes.filter(change=>Boolean(change.onlyMissing) === onlyMissing);
    for (let i=0;i<group.length;i+=100) {
      const rows = group.slice(i,i+100).map(({key,encoded})=>({entry_key:key,payload:JSON.parse(encoded)}));
      await sharedRequest('push',{p_entries:rows,p_only_missing:onlyMissing});
    }
  }

  const remote = new Map();
  let after = '';
  for (;;) {
    const rows = await sharedRequest('pull',{p_after:after});
    for (const row of rows) if (row.payload !== null) remote.set(cached+row.entry_key,JSON.stringify(row.payload));
    if (rows.length < 200) break;
    after = rows.at(-1).entry_key;
  }

  for (const [k,sent] of pending) if (localStorage.getItem(k) === sent) localStorage.removeItem(k);
  const unsent = new Set(storageKeys(outbox).map(k=>cached+k.slice(outbox.length)));
  let changed = false;
  for (const k of storageKeys(cached)) {
    if (!remote.has(k) && !unsent.has(k)) {
      localStorage.removeItem(k);
      changed = true;
    }
  }
  for (const [k,value] of remote) {
    if (!unsent.has(k) && localStorage.getItem(k)!==value) {
      localStorage.setItem(k,value);
      changed = true;
    }
  }
  if (changed) {
    loadEntries();
    if (modal.open) cloudNeedsPaint = true;
    else render();
  }
  setCloudStatus(unsent.size ? 'syncing' : 'saved');
  if (unsent.size) planCloudSync();
}

function syncJournal() {
  if (!cloudSession || cloudSyncing) return cloudSyncing;
  const locks = window.navigator?.locks;
  const work = () => syncEntries(cloudSession);
  cloudSyncing = Promise.resolve()
    .then(()=>locks ? locks.request(outboxPrefix(cloudSession),work) : work())
    .catch(error=>setCloudStatus('error',error.message || 'Connection interrupted. Sync will retry.'))
    .finally(()=>{cloudSyncing = null;});
  return cloudSyncing;
}
async function cloudAction(action) {
  if (action === 'cloud-copy') {cloudDialog('',true);return;}
  if (action === 'cloud-retry') {
    setCloudStatus('syncing');
    await syncJournal();
    return;
  }
  if (action === 'cloud-legacy') {legacyDialog();return;}
  if (action === 'cloud-copy-confirm') {
    await syncJournal();
    if (cloudStatus === 'error') {cloudDialog('Connect to the cloud before uploading your earlier entries.',true);return;}
    const scoped = journalPrefix();
    for (const [k,encoded] of deviceRecords()) {
      if (encoded !== null && localStorage.getItem(scoped+k) === null) persistJournalRecord(k,encoded,{onlyMissing:true});
    }
    loadEntries();
    await syncJournal();
    if (cloudStatus === 'saved') localStorage.setItem(migrationKey,'1');
    render();
    cloudDialog(cloudStatus === 'saved' ? 'Device entries checked and synced.' : 'Device entries queued for sync.');
  }
}
async function runCloud(action) {
  if (typeof action !== 'function') action.disabled = true;
  try { await (typeof action === 'function' ? action() : cloudAction(action.dataset.action)); }
  catch (error) {
    if (typeof action === 'function') legacyDialog(error.message);
    else cloudDialog(error.message || 'The cloud request failed.',action.dataset.action.startsWith('cloud-copy'));
  }
  finally {if(typeof action !== 'function') action.disabled = false;}
}
function startCloudSync() {
  if (cloudSession) syncJournal();
  window.addEventListener('online',syncJournal);
  if (typeof setInterval === 'function') setInterval(()=>{if(!document.hidden) syncJournal();},20000);
}
