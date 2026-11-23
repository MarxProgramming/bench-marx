const repNames = ['Unmarked', 'Achieved', 'Great'];
let basicsExpanded = false;
function gymOn(day) {
  return skills.flatMap(skill => skillOn(day, skill.id));
}
function skillOn(day, skillId) {
  return Array.from({length:repsPerSkill}, (_, i) => entries.get(key(day, repId(skillId,i+1)))).filter(Boolean);
}
function qualityStats(records) {
  const great = records.filter(r=>r.level===2).length;
  return {total:records.length, great, standard:records.length-great, rate:records.length ? Math.round(100*great/records.length) : null};
}
function fiveRepSets(records) {
  const sets=new Map();
  for(const r of records){
    const k=key(r.day,byId[r.id].skill);
    if(!sets.has(k)) sets.set(k,[]);
    sets.get(k).push(r);
  }
  return [...sets.values()].filter(set=>set.length===repsPerSkill);
}
function percentage(n,d){return d ? Math.round(100*n/d) : 0}
function dateLabel(day){ return fmt(day,{day:'numeric',month:'short'}) }
function qualityMark(level,rep) {
  if(level===0)return String(rep);
  return icon(level===2?'heavy':'check');
}
function repButton(day,skill,rep) {
  const id=repId(skill.id,rep),level=entries.get(key(day,id))?.level||0;
  const next=['Mark achieved','Mark great','Clear this rep'][level];
  return '<button class="rep-box grade-'+level+'" data-rep="'+id+'" aria-label="'+
    esc(skill.name+', rep '+rep+', '+repNames[level]+'. '+next)+'" title="'+next+'">'+
    qualityMark(level,rep)+'</button>';
}
function skillRow(day,skill) {
  const done=skillOn(day,skill.id).length;
  return '<div class="skill-row" data-skill-row="'+skill.id+'"><div class="skill-title"><strong>'+skill.name+
    '</strong><span class="skill-count">'+done+' / '+repsPerSkill+'</span></div><div class="rep-strip">'+
    Array.from({length:repsPerSkill},(_,i)=>repButton(day,skill,i+1)).join('')+'</div></div>';
}
function gymLegend(){return '<div class="legend gym-legend"><span>'+icon('check')+'Achieved</span><span>'+icon('heavy')+'Great</span></div>'}
function gymSheet() {
  const groups=['Handstands','Tumbling'];
  const core=groups.map(f=>'<div class="group-label" style="--group-colour:var(--mint)"><h3>'+f+'</h3></div>'+
    coreSkills.filter(s=>s.family===f).map(s=>skillRow(selected,s)).join('')).join('');
  const extras=skills.filter(s=>s.optional);
  return '<section class="card sheet gym-sheet"><div class="sheet-top"><div class="sheet-title"><h2>Skill log</h2>'+
     gymLegend()+'</div><p class="subline">One box per rep. Tap once for achieved, twice for great, again to clear.</p></div>'+
     core+'<details class="optional" id="optional-skills" '+(basicsExpanded?'open':'')+
     '><summary>Optional basics <span>3 skills</span></summary>'+extras.map(s=>skillRow(selected,s)).join('')+'</details></section>';
}
function gymTrace(day) {
  const lines=coreSkills.map((skill,i)=>{
    const x=20+i*24,y=124-i*17;
    const tiles=Array.from({length:5},(_,j)=>{
      const l=entries.get(key(day,repId(skill.id,j+1)))?.level||0;
      const dx=x+j*32,dy=y+j*1.8;
      return '<path class="trace-tile grade-'+l+'" style="--i:'+(i+j)+'" d="M'+dx+' '+dy+
        ' l25 -10 q3 -1 6 1 l12 8 q3 2 -1 4 l-25 10 q-3 1 -6 -1 l-12 -8 q-3 -2 1 -4Z"/>';
    }).join('');
    return '<g>'+tiles+'</g>';
  }).join('');
  return '<svg class="gym-trace" aria-hidden="true" viewBox="0 30 320 135">'+lines+'</svg>';
}
function gymHero(){
  const done=gymOn(selected).filter(r=>!byId[r.id].optional).length;
  return '<section class="hero card gym-hero" aria-label="Main gymnastics reps logged">'+gymTrace(selected)+
   '<div class="hero-label">Skill tiles</div><div class="stat"><span data-counter="'+done+'">'+done+'</span><small>/ '+coreTarget+
   '</small></div><div class="descriptor">main reps logged</div><div class="meterline"><span class="segs gym-segs" aria-hidden="true">'+
   Array.from({length:coreTarget},(_,i)=>'<b class="'+(i<done?'on':'')+'"></b>').join('')+
   '</span><span class="pct" data-counter="'+percentage(done,coreTarget)+'" data-suffix="%">'+percentage(done,coreTarget)+'%</span></div></section>'
}
function gymQuality(day) {
  const records=gymOn(day),q=qualityStats(records),sets=fiveRepSets(records);
  return '<div class="card-head"><h2>Rep quality</h2>'+icon('check')+'</div><p class="subline">Across all marked reps</p>'+
   '<div class="quality-big">'+(q.rate===null?'—':q.rate+'%')+' <small>great</small></div>'+
   '<div class="quality-track"><i style="width:'+percentage(q.standard,q.total)+'%"></i><b style="width:'+percentage(q.great,q.total)+'%"></b></div>'+
   '<div class="quality-labels"><span>Achieved <b>'+q.standard+'</b></span><span>Great <b>'+q.great+'</b></span></div>'+
   '<div class="summary-foot">'+sets.length+' complete '+(sets.length===1?'set':'sets')+' of five</div>';
}
function gymSessionList(end) {
  const days=[...new Set([...entries.values()].filter(r=>isGym(r)&&r.day<end).map(r=>r.day))].sort().reverse().slice(0,3);
  return '<div class="card-head"><h2>Previous sessions</h2>'+icon('history')+'</div>'+
    (days.length?days.map(d=>{
      const q=qualityStats(gymOn(d));
      return '<button class="past-session" data-open-log="gymnastics" data-session="'+d+'"><span>'+dateLabel(d)+'</span><small>'+q.total+' reps · '+q.great+' great</small></button>'
    }).join(''):'<p class="empty-copy">Earlier gymnastics sessions will appear here.</p>');
}
function gymnastics(){
  return head('Gymnastics log',fmt(selected,{weekday:'long',day:'numeric',month:'long',year:'numeric'}),controls())+
    '<div class="work-grid gym-grid">'+gymHero()+'<section class="card weekly" id="week">'+week(true)+'</section>'+
    gymSheet()+'<aside class="side"><section class="card balance" id="gym-quality">'+gymQuality(selected)+'</section>'+
    '<section class="card latest">'+gymSessionList(selected)+'</section></aside></div>';
}
function tapRep(id) {
  const item=byId[id];
  if(!item?.skill)return;
  const current=entries.get(key(selected,id))?.level||0;
  const level=(current+1)%3;
  change(selected,id,level?{day:selected,id,level}:null);
}
function repaintGym(day,id){
  const skill=skills.find(s=>s.id===byId[id].skill);
  const row=document.querySelector('[data-skill-row="'+skill.id+'"]');
  const focused=row?.contains(document.activeElement);
  if(row)row.outerHTML=skillRow(day,skill);
  const button=document.querySelector('[data-rep="'+id+'"]');
  if(focused)button?.focus({preventScroll:true});
  button?.classList.add('stamped');
  document.querySelector('.gym-hero').outerHTML=gymHero();
  document.querySelector('#gym-quality').innerHTML=gymQuality(day);
  document.querySelector('#week').innerHTML=week(true);
}
