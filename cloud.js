// Optional private cloud backup. The browser retains no password or session token between visits.
const cloudConfigKey = (isDan ? 'bench-dan' : 'bench-marx')+'.cloud-config';
let cloudConfig, cloudSession, reviewedRevision;
try { cloudConfig = JSON.parse(localStorage.getItem(cloudConfigKey) || 'null'); } catch {}

function cloudDialog(message = '') {
  const note = message ? '<p class="dialog-sub" role="status">'+esc(message)+'</p>' : '';
  if (cloudSession) {
    showDialog('Cloud backup', note+'<p class="dialog-sub">Your signed-in account has a private backup for '+appName+
      '. Review it before saving a new copy.</p><button class="choice" data-action="cloud-review">Review cloud backup</button>'+
      '<button class="choice" data-action="cloud-save">Save this journal to cloud</button>'+
      '<button class="ghost wide" data-action="cloud-sign-out">Sign out</button>');
    return;
  }
  showDialog('Connect to Supabase', note+
    '<p class="dialog-sub">Use a training project with the Bench journal database installed and an existing sign-in.</p>'+
    '<form id="cloud-form"><label class="field">Project URL<input name="endpoint" type="url" required value="'+esc(cloudConfig?.endpoint)+
    '" placeholder="https://your-project.supabase.co"></label><label class="field">Publishable key<input name="apiKey" required value="'+
    esc(cloudConfig?.apiKey)+'"></label><label class="field">Email<input name="email" type="email" autocomplete="username" required></label>'+
    '<label class="field">Password<input name="password" type="password" autocomplete="current-password" required></label>'+
    '<div class="dialog-actions"><button class="primary">Sign in</button></div></form>');
}

async function cloudRequest(path, options = {}, config = cloudConfig) {
  const headers = {apikey:config.apiKey,'Content-Type':'application/json',...options.headers};
  if (cloudSession) headers.Authorization='Bearer '+cloudSession.token;
  const response = await window.fetch(config.endpoint+path,{...options,headers});
  if (response.status === 401) {cloudSession = null; throw Error('Sign in again to access your cloud backup.');}
  if (response.status === 409) throw Error('A backup already exists. Review the latest copy before saving.');
  if (!response.ok) throw Error('Supabase could not complete the request. Check your project, access and connection.');
  return response.json();
}

async function cloudSignIn(form) {
  const data = new FormData(form);
  const endpoint = data.get('endpoint').trim().replace(/\/$/,'');
  const apiKey = data.get('apiKey').trim();
  if (!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(endpoint) || !/^sb_publishable_[a-zA-Z0-9_-]+$/.test(apiKey)) {
    cloudDialog('Enter the project HTTPS URL and a publishable key.');
    return;
  }
  const config = {endpoint,apiKey};
  const result = await cloudRequest('/auth/v1/token?grant_type=password',{method:'POST',body:JSON.stringify({
    email:data.get('email'),password:data.get('password')
  })},config);
  if (!result.access_token || !result.user?.id) throw Error('Supabase did not return a signed-in account.');
  cloudSession={token:result.access_token,owner:result.user.id};
  cloudConfig=config;
  reviewedRevision=undefined;
  try {localStorage.setItem(cloudConfigKey,JSON.stringify(config));} catch {}
  cloudDialog('Signed in.');
}

async function cloudAction(action) {
  if (action === 'cloud-sign-out') {
    cloudSession = null;
    reviewedRevision = undefined;
    cloudDialog('Signed out on this device.');
    return;
  }
  if (!cloudSession) {cloudDialog();return;}
  const journal = isDan ? 'dan' : 'marx';
  const path = '/rest/v1/bench_journals?journal=eq.'+journal+'&owner=eq.'+encodeURIComponent(cloudSession.owner);
  if (action === 'cloud-review') {
    const [row] = await cloudRequest(path+'&select=payload,revision,updated_at');
    reviewedRevision = row?.revision ?? null;
    if (!row) {cloudDialog('This account has no cloud backup for '+appName+'.');return;}
    await previewImport({size:0,text:async()=>JSON.stringify(row.payload)});
    return;
  }
  if (reviewedRevision === undefined) {
    const [row] = await cloudRequest(path+'&select=revision');
    if (row) {cloudDialog('Review the existing backup before saving.');return;}
    reviewedRevision=null;
  }
  const updating = reviewedRevision !== null;
  const body = {payload:backupPayload(),revision:window.crypto.randomUUID(),updated_at:new Date().toISOString()};
  const [row] = await cloudRequest(updating ? path+'&revision=eq.'+reviewedRevision : '/rest/v1/bench_journals',{
    method:updating ? 'PATCH' : 'POST',headers:{Prefer:'return=representation'},
    body:JSON.stringify(updating ? body : {...body,journal})
  });
  if (!row) {
    reviewedRevision=undefined;
    cloudDialog('The cloud backup changed. Review its latest entries before saving.');
    return;
  }
  reviewedRevision=row.revision;
  cloudDialog('Cloud backup saved.');
}

async function runCloud(action) {
  if (typeof action !== 'function') action.disabled=true;
  try { await (typeof action === 'function' ? action() : cloudAction(action.dataset.action)); }
  catch (error) {cloudDialog(error.message || 'The cloud request failed.');}
  finally {if(typeof action !== 'function') action.disabled=false;}
}
