// Journal records and pending writes are scoped to the app, project and account.
const cloudJournal = isDan ? 'dan' : 'marx';
const cloudConfigKey = 'bench-'+cloudJournal+'.cloud-config';
const cloudSessionKey = 'bench-'+cloudJournal+'.cloud-session';
// The publishable key identifies this app. Supabase Auth controls journal access.
const cloudProject = {"endpoint":"https://abksqxqqtwespzemvtqv.supabase.co","apiKey":"sb_publishable_UpYWu1uNrSa7MJtfdYWjDQ_2bJ8O9ga"};
let cloudConfig = cloudProject, cloudSession, cloudSyncing, cloudTimer;
let cloudStatus = '', cloudMessage = '', cloudNeedsPaint = false;

function validCloudConfig(config) {
  return /^https:\/\/[a-z0-9]+\.supabase\.co$/.test(config?.endpoint) &&
    /^sb_publishable_[a-zA-Z0-9_-]+$/.test(config.apiKey);
}
try {
  const saved = JSON.parse(localStorage.getItem(cloudConfigKey));
  if (!cloudConfig && validCloudConfig(saved)) cloudConfig = saved;
  const session = JSON.parse(sessionStorage.getItem(cloudSessionKey));
  if (session?.endpoint === cloudConfig?.endpoint && /^[0-9a-f-]{36}$/i.test(session?.owner || '') &&
      session.token && session.refresh) cloudSession = session;
} catch {}

function cloudScope(session) {
  return session.endpoint.split('/')[2]+'.'+session.owner+'.';
}
function journalPrefix(session = cloudSession) {
  return session ? 'bench-'+cloudJournal+'.account.'+cloudScope(session) : prefix;
}
function outboxPrefix(session) {
  return 'bench-'+cloudJournal+'.outbox.'+cloudScope(session);
}
function cloudLabel() {
  if (storageIssue) return 'Storage needs attention';
  if (!cloudSession) return cloudConfig ? 'Sign in to sync' : 'Set up cloud sync';
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
function deviceDataKeys() {
  return storageKeys(prefix);
}
function cloudDialog(message = '', uploadDevice = false) {
  const note = message ? '<p class="dialog-sub" role="status">'+esc(message)+'</p>' : '';
  if (cloudSession && uploadDevice) {
    const count = deviceDataKeys().length;
    showDialog('Upload device data',note+(count
      ? '<p class="dialog-sub">Copy '+count+' '+(count === 1 ? 'saved entry' : 'saved entries')+' from this device’s '+appName+
        ' journal into your signed-in account. Your cloud journal keeps any entries it already has.</p>'+
        '<button class="primary wide" data-action="cloud-copy-confirm">Upload saved entries</button>'
      : '<p class="dialog-sub">There’s no earlier '+appName+' data saved in this browser to upload. New entries sync automatically while you’re signed in.</p>')+
      '<button class="ghost wide" data-action="cloud">Back to cloud sync</button>');
    return;
  }
  if (cloudSession) {
    showDialog('Cloud sync', note+'<p class="dialog-sub">Changes to '+appName+
      ' sync automatically. Sign in to the same account on another device to open your journal.</p>'+
      '<p class="note" data-cloud-note role="status">'+esc(cloudMessage || cloudLabel())+'</p>'+
      '<button class="choice" data-action="cloud-retry">Sync now</button>'+
      '<button class="choice" data-action="cloud-copy">Upload device data</button>'+
      '<button class="choice" data-action="cloud-review">Review an older cloud backup</button>'+
      '<button class="ghost wide" data-action="cloud-sign-out">Sign out</button>');
    return;
  }
  const setup = !cloudProject && !cloudConfig;
  showDialog(uploadDevice ? 'Upload device data' : 'Cloud sync', note+
    '<p class="dialog-sub">'+(setup
      ? 'Connect an existing Bench training project to start syncing. Until then, entries are saved in this browser.'
      : uploadDevice ? 'Sign in to choose where to upload this device’s '+appName+' data.' :
      'Sign in to open your private '+appName+' journal. Use the same account on each device.')+'</p>'+
    '<form id="cloud-form" data-upload-device="'+uploadDevice+'">'+(!cloudProject ?
    '<details class="cloud-setup"'+(setup?' open':'')+'><summary>Supabase project settings</summary>'+
    '<label class="field">Project URL<input name="endpoint" type="url" required value="'+esc(cloudConfig?.endpoint)+
    '" placeholder="https://your-project.supabase.co"></label><label class="field">Publishable key<input name="apiKey" required value="'+
    esc(cloudConfig?.apiKey)+'"></label></details>':'')+
    '<label class="field">Email<input name="email" type="email" autocomplete="username" required></label>'+
    '<label class="field">Password<input name="password" type="password" autocomplete="current-password" required></label>'+
    '<div class="dialog-actions"><button class="primary">Sign in</button></div></form>');
}

async function cloudFetch(config, path, options = {}, token) {
  const headers = {apikey:config.apiKey,'Content-Type':'application/json',...options.headers};
  if (token) headers.Authorization = 'Bearer '+token;
  return window.fetch(config.endpoint+path,{...options,headers});
}

function saveCloudSession(session, result) {
  session.token = result.access_token;
  session.refresh = result.refresh_token;
  try { sessionStorage.setItem(cloudSessionKey,JSON.stringify(session)); } catch {}
}
async function cloudRequest(session, path, options = {}) {
  const config = cloudConfig;
  let response = await cloudFetch(config,path,options,session.token);
  if (response.status === 401) {
    if (session !== cloudSession) throw Error('This cloud session has ended.');
    const refresh = await cloudFetch(config,'/auth/v1/token?grant_type=refresh_token',{
      method:'POST',body:JSON.stringify({refresh_token:session.refresh})
    });
    if (!refresh.ok) throw Error('Your session has expired. Sign out and sign back in to resume sync.');
    const result = await refresh.json();
    if (!result.access_token || !result.refresh_token || session !== cloudSession)
      throw Error('Sign in again to resume sync.');
    saveCloudSession(session,result);
    response = await cloudFetch(config,path,options,session.token);
  }
  if (!response.ok)
    throw Error(response.status === 404
      ? 'The training database has not been installed in this Supabase project.'
      : 'Supabase could not sync this journal. Check project access and try again.');
  if (response.status !== 204) return response.json();
}

async function cloudSignIn(form) {
  const data = new FormData(form);
  const config = cloudProject || {
    endpoint:data.get('endpoint')?.trim().replace(/\/$/,''),
    apiKey:data.get('apiKey')?.trim()
  };
  if (!validCloudConfig(config)) throw Error('Enter the project HTTPS URL and its publishable key.');
  if (unsaved.size) throw Error('Export this device’s unsaved changes before connecting an account.');
  const response = await cloudFetch(config,'/auth/v1/token?grant_type=password',{
    method:'POST',body:JSON.stringify({email:data.get('email').trim(),password:data.get('password')})
  });
  if (!response.ok) throw Error('Sign-in failed. Check your account details and project settings.');
  const result = await response.json();
  if (!result.access_token || !result.refresh_token || !/^[0-9a-f-]{36}$/i.test(result.user?.id || ''))
    throw Error('Supabase did not return a signed-in account.');
  cloudConfig = config;
  try { localStorage.setItem(cloudConfigKey,JSON.stringify(config)); } catch {}
  cloudSession = {owner:result.user.id,endpoint:config.endpoint};
  saveCloudSession(cloudSession,result);
  setCloudStatus('syncing');
  loadEntries();
  render();
  cloudDialog('',form.dataset?.uploadDevice === 'true');
  await syncJournal();
}

// Persist the pending change before updating the on-device view. Null entries are deletions.
function persistJournalRecord(k, encoded, {onlyMissing = false} = {}) {
  const session = cloudSession;
  if (session) localStorage.setItem(outboxPrefix(session)+k,JSON.stringify({
    id:window.crypto.randomUUID(),encoded,onlyMissing
  }));
  if (encoded === null) localStorage.removeItem(journalPrefix()+k);
  else localStorage.setItem(journalPrefix()+k,encoded);
  if (session) planCloudSync();
}
function planCloudSync() {
  if (!cloudSession) return;
  setCloudStatus('syncing');
  clearTimeout(cloudTimer);
  cloudTimer = setTimeout(syncJournal,350);
}

async function syncEntries(session) {
  const cached = journalPrefix(session), outbox = outboxPrefix(session);
  // Flush writes first, then read the server's complete journal. Changes made during
  // the request stay queued and take priority over the incoming copy.
  const pending = storageKeys(outbox).map(k=>[k,localStorage.getItem(k)]).filter(([,v])=>v!==null);
  const changes = pending.map(([k,value])=>({key:k.slice(outbox.length),...JSON.parse(value)}));
  for (const onlyMissing of [false,true]) {
    const group = changes.filter(change=>Boolean(change.onlyMissing) === onlyMissing);
    const resolution = onlyMissing ? 'ignore-duplicates' : 'merge-duplicates';
    for (let i=0;i<group.length;i+=100) {
      const rows = group.slice(i,i+100).map(({key,encoded})=>({
        owner:session.owner,journal:cloudJournal,entry_key:key,payload:JSON.parse(encoded)
      }));
      await cloudRequest(session,'/rest/v1/bench_sync_entries?on_conflict=owner,journal,entry_key',{
        method:'POST',headers:{Prefer:'resolution='+resolution+',return=minimal'},body:JSON.stringify(rows)
      });
      if (session !== cloudSession) return;
    }
  }

  const remote = new Map();
  let after = '';
  for (;;) {
    const params = new URLSearchParams({owner:'eq.'+session.owner,journal:'eq.'+cloudJournal,
      select:'entry_key,payload',order:'entry_key.asc',limit:'200'});
    if (after) params.set('entry_key','gt.'+after);
    const rows = await cloudRequest(session,'/rest/v1/bench_sync_entries?'+params);
    if (session !== cloudSession) return;
    if (!rows.length) break;
    for (const row of rows) if (row.payload !== null)
      remote.set(cached+row.entry_key,JSON.stringify(row.payload));
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
  const session = cloudSession;
  const work = () => session === cloudSession && syncEntries(session);
  // On browsers with Web Locks, serialize cloud writes across tabs on this device.
  const locks = window.navigator?.locks;
  cloudSyncing = Promise.resolve()
    .then(()=>locks ? locks.request(outboxPrefix(session),work) : work())
    .catch(error=>{
      if (session === cloudSession) setCloudStatus('error',error.message || 'Connection interrupted. Sync will retry.');
    })
    .finally(()=>{cloudSyncing = null;if (cloudSession && cloudSession !== session) planCloudSync();});
  return cloudSyncing;
}

async function cloudAction(action) {
  if (action === 'cloud-copy') {cloudDialog('',true);return;}
  if (!cloudSession) {cloudDialog();return;}
  if (action === 'cloud-sign-out') {
    if (unsaved.size) throw Error('Export the unsaved changes before signing out.');
    cloudSession = null;
    cloudNeedsPaint = false;
    try {sessionStorage.removeItem(cloudSessionKey);} catch {}
    setCloudStatus('');
    loadEntries();
    render();
    cloudDialog('Signed out. Any pending cloud changes will retry when the same account signs back in.');
    return;
  }
  if (action === 'cloud-retry') {
    setCloudStatus('syncing');
    await syncJournal();
    return;
  }
  if (action === 'cloud-copy-confirm') {
    const session = cloudSession;
    await syncJournal();
    if (session !== cloudSession) return;
    if (cloudStatus === 'error') {cloudDialog('Connect to your cloud journal first, then try again.',true);return;}
    let copied = 0;
    const scoped = journalPrefix();
    for (const k of deviceDataKeys()) {
      const key = k.slice(prefix.length);
      if (localStorage.getItem(scoped+key)!==null) continue;
      const encoded = localStorage.getItem(k);
      if (encoded === null) continue;
      persistJournalRecord(key,encoded,{onlyMissing:true});
      copied++;
    }
    loadEntries();
    render();
    cloudDialog(copied ? copied+' earlier entries queued for upload.' : 'This account already has the device entries.');
    if (copied) await syncJournal();
    return;
  }
  const [row] = await cloudRequest(cloudSession,'/rest/v1/bench_journals?journal=eq.'+cloudJournal+'&select=payload');
  if (!row) {cloudDialog('No earlier cloud backup was found.');return;}
  await previewImport({size:0,text:async()=>JSON.stringify(row.payload)});
}

async function runCloud(action, uploadDevice = false) {
  if (typeof action !== 'function') action.disabled = true;
  try { await (typeof action === 'function' ? action() : cloudAction(action.dataset.action)); }
  catch (error) {cloudDialog(error.message || 'The cloud request failed.',uploadDevice);}
  finally {if(typeof action !== 'function') action.disabled = false;}
}

function startCloudSync() {
  if (cloudSession) syncJournal();
  window.addEventListener('online',syncJournal);
  if (typeof setInterval === 'function') setInterval(()=>{if(!document.hidden) syncJournal();},20000);
}
