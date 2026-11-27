// Preferences are independent from the training journal and its backups.
const preferenceKey = isDan ? 'bench-dan.preferences.v1' : 'bench-marx.preferences.v1';
const preferences = {motion:true, chimes:false};
try {
  const saved = JSON.parse(localStorage.getItem(preferenceKey) || '{}');
  for (const name of Object.keys(preferences)) {
    if (typeof saved?.[name] === 'boolean') preferences[name] = saved[name];
  }
} catch { /* The session can still use default preferences. */ }
const reduceQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)');
function motionAllowed() { return preferences.motion && !reduceQuery?.matches; }
function applyMotion() { document.body.dataset.motion = motionAllowed() ? 'on' : 'off'; }
applyMotion();
reduceQuery?.addEventListener?.('change', () => {applyMotion();stopCounters();});
function preferenceControls() {
  return '<div class="preferences">'+[['motion','Screen animations'],['chimes','Progress chimes']].map(([name,label])=>
    '<button type="button" role="switch" aria-checked="'+preferences[name]+'" data-pref="'+name+'"><span>'+label+'</span><i aria-hidden="true"></i></button>').join('')+'</div>';
}
let chimeContext;
function playNotes(notes) {
  if (!preferences.chimes) return;
  try {
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return;
    chimeContext ||= new Context();
    const context = chimeContext;
    context.resume().then(() => {
      const t = context.currentTime;
      notes.forEach((frequency,i) => {
        const tone=context.createOscillator(), gain=context.createGain(), start=t+i*.105;
        tone.type='sine'; tone.frequency.value=frequency;
        gain.gain.setValueAtTime(.0001,start); gain.gain.exponentialRampToValueAtTime(.045,start+.012);
        gain.gain.exponentialRampToValueAtTime(.0001,start+.18);
        tone.connect(gain); gain.connect(context.destination);
        tone.start(start); tone.stop(start+.19);
      });
    }).catch(()=>{});
  } catch { /* A browser can decline audio playback. */ }
}
function changePreference(name, button) {
  if (!Object.hasOwn(preferences,name)) return;
  preferences[name] = !preferences[name];
  let persisted=true;
  try {localStorage.setItem(preferenceKey,JSON.stringify(preferences));} catch {persisted=false;}
  applyMotion();
  if(!motionAllowed())stopCounters();
  button.setAttribute('aria-checked',String(preferences[name]));
  if(name==='chimes' && preferences.chimes)playNotes([495,660]);
  if(!persisted)notify('Preference applied for this visit.');
}
let entryFrame=0, activeCounters=[];
function stopCounters() {
  if(entryFrame && window.cancelAnimationFrame)window.cancelAnimationFrame(entryFrame);
  entryFrame=0;
  for(const item of activeCounters)item.el.textContent=item.value+item.suffix;
  activeCounters=[];
}
function enterScreen() {
  if(!motionAllowed())return;
  main.querySelectorAll('.card').forEach((card,i)=>{
    card.style.setProperty('--delay',Math.min(i,5)*32+'ms');
    card.classList.add('card-enter');
  });
  const targets='.segs b, .weekcol, [data-ridge], .chart-col, .heat-cell';
  main.querySelectorAll(targets).forEach(el=>{
    const i=Array.prototype.indexOf.call(el.parentElement.children,el);
    el.style.setProperty('--step',Math.min(i,22));
    el.classList.add('enter-step');
  });
  main.querySelectorAll('.flight-path,.bartrack em,.quality-track').forEach(el=>el.classList.add('enter-step'));
  if(!window.requestAnimationFrame)return;
  activeCounters=Array.from(main.querySelectorAll('[data-counter]'),el=>({el,value:Number(el.dataset.counter),suffix:el.dataset.suffix||''}));
  if(!activeCounters.length)return;
  let start;
  function tick(t) {
    start??=t;
    const p=Math.min(1,(t-start)/650),amount=1-Math.pow(1-p,3);
    for(const item of activeCounters)item.el.textContent=Math.round(item.value*amount)+item.suffix;
    if(p<1)entryFrame=window.requestAnimationFrame(tick);
    else {entryFrame=0;activeCounters=[];}
  }
  entryFrame=window.requestAnimationFrame(tick);
}
