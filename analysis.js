let analysisMode='workout', selectedSkill=coreSkills[0]?.id, selectedExercise=exercises[0].id;
function periodChooser(){
  return '<div class="periods" aria-label="Analysis period">'+[7,28,90].map(n=>'<button data-period="'+n+'" aria-pressed="'+(period===n)+'">'+n+' days</button>').join('')+'</div>';
}
function metricCards(items) {
  return '<div class="metrics">'+items.map(([value,label])=>'<div class="card metric"><div>'+label+'</div><strong>'+value+'</strong></div>').join('')+'</div>';
}
function panel(title,subtitle,body,cls=''){
  return '<section class="card chartcard '+cls+'"><h2>'+title+'</h2>'+(subtitle?'<p class="subline">'+subtitle+'</p>':'')+body+'</section>';
}
function chooseItem(id,label,items,selectedId) {
  return '<label class="picker"><span>'+label+'</span><select id="'+id+'">'+
    items.map(x=>'<option value="'+x.id+'" '+(x.id===selectedId?'selected':'')+'>'+esc(x.name)+'</option>').join('')+'</select></label>';
}
function blank(text){return '<p class="empty-copy">'+text+'</p>'}
function shortLine(label,value){return '<div class="fact-line"><span>'+label+'</span><b>'+value+'</b></div>'}
function diffText(now,previous){const d=now-previous;return d>0?'+'+d:String(d)}
function compareCard(current,previous,isGymMode){
  const unit=isGymMode?'Marked reps':'Exercise logs';
  const items=[['Training days',tally(current),tally(previous)],[unit,current.length,previous.length],
    [isGymMode?'Great reps':'PR entries',current.filter(r=>r.level===(isGymMode?2:3)).length,
    previous.filter(r=>r.level===(isGymMode?2:3)).length]];
  return panel('Period comparison','Last '+period+' days against the preceding '+period+'.',
    '<table class="compare-table"><thead><tr><th>Measure</th><th>Previous</th><th>Now</th><th>Change</th></tr></thead><tbody>'+
    items.map(([label,now,before])=>'<tr><th>'+label+'</th><td>'+before+'</td><td>'+now+'</td><td>'+diffText(now,before)+'</td></tr>').join('')+'</tbody></table>');
}
function mixCard(rs){
  const total=rs.length;
  const counts=[1,2,3].map(l=>rs.filter(r=>r.level===l).length);
  return panel('Intensity mix','How you marked your exercise logs.',
    '<div class="mix-track">'+counts.map((n,i)=>'<i class="'+colours[i+1]+'" style="width:'+percentage(n,total)+'%"></i>').join('')+'</div>'+
    counts.map((n,i)=>shortLine('<i class="dot '+colours[i+1]+'"></i> '+levels[i+1],n+' · '+percentage(n,total)+'%')).join(''));
}
function workloadCard(records) {
  const days = new Map();
  for (const record of records) {
    if (!days.has(record.day)) days.set(record.day,false);
    if (isHeavy(record)) days.set(record.day,true);
  }
  const heavyDays=[...days].filter(([,heavy])=>heavy).map(([day])=>day).sort();
  return panel('Training intensity','Heavy and PR marks count as heavy work in this period.',
    shortLine('Days with heavy work',heavyDays.length)+
    shortLine('Days with Done marks only',days.size-heavyDays.length)+
    shortLine('Latest heavy day',heavyDays.length ? dateLabel(heavyDays.at(-1)) : '—'));
}
function movementDetail(rs) {
  const list=rs.filter(r=>r.id===selectedExercise).sort((a,b)=>b.day.localeCompare(a.day));
  const prs=prList(list), lastHeavy=list.find(isHeavy);
  return panel('Exercise detail','Frequency, last session and latest recorded result in this period.',
    chooseItem('exercise-detail','Exercise',exercises,selectedExercise)+
    shortLine('Training days logged',list.length+' / '+tally(rs))+
    shortLine('Last logged',list[0]?dateLabel(list[0].day)+' · '+levels[list[0].level]:'—')+
    shortLine('Last heavy in this period',lastHeavy?dateLabel(lastHeavy.day):'—')+
    shortLine('Latest PR',prs[0]?esc(prs[0].result)+' × '+prs[0].reps:'—'));
}
function skillDetail(rs){
  const matching=rs.filter(r=>byId[r.id].skill===selectedSkill);
  const days=[...new Set(matching.map(r=>r.day))].sort().reverse();
  const q=qualityStats(matching),sets=fiveRepSets(matching);
  const best=sets.map(set=>({day:set[0].day,great:qualityStats(set).great})).sort((a,b)=>b.great-a.great||b.day.localeCompare(a.day))[0];
  return panel('Skill detail','Great reps are measured against marked reps.',
    chooseItem('skill-detail','Skill',skills,selectedSkill)+shortLine('Great reps',q.great+' / '+q.total)+
    shortLine('Best complete set',best?best.great+' / 5 great · '+dateLabel(best.day):'—')+
    (days.length?'<div class="skill-trail">'+days.slice(0,6).map(d=>{
      const dots=Array.from({length:repsPerSkill},(_,i)=>{const l=entries.get(key(d,repId(selectedSkill,i+1)))?.level||0;return '<i class="trail-'+l+'"></i>'}).join('');
      return '<button data-open-log="gymnastics" data-session="'+d+'" aria-label="Open gymnastics on '+d+'">'+dateLabel(d)+'<span>'+dots+'</span></button>';
    }).join('')+'</div>':blank('No reps marked for this skill in the selected period.')));
}
function skillRanking(rs){
  return panel('Quality by skill','Double ticks as a share of each skill’s marked reps.',
    skills.filter(s=>!s.optional||rs.some(r=>byId[r.id].skill===s.id)).map(s=>{
      const q=qualityStats(rs.filter(r=>byId[r.id].skill===s.id));
      return '<div class="balance-line"><div class="label-line"><span>'+s.name+'</span><span>'+q.great+'/'+q.total+' · '+(q.rate===null?'—':q.rate+'%')+'</span></div><div class="bartrack"><em style="--c:var(--mint);width:'+(q.rate||0)+'%"></em></div></div>';
    }).join(''));
}
function skillGaps(rs){
  const past=rs.filter(r=>r.day<today), days=tally(past);
  if(!days)return panel('Skills left out','',blank('After your first finished gymnastics day, this shows which main skills went unmarked.'));
  const rows=coreSkills.map(skill=>{
    const done=tally(past.filter(r=>byId[r.id].skill===skill.id));
    return {name:skill.name,missed:days-done};
  }).filter(x=>x.missed).sort((a,b)=>b.missed-a.missed);
  return panel('Skills left out','Earlier gymnastics days with no marks for each main skill.',
    rows.length ? rows.map(r=>shortLine(r.name,r.missed+' / '+days+' days')).join('') : blank('All five main skills appeared on every earlier gymnastics day in this period.'));
}
function gymInsights(rs,prev) {
  const q=qualityStats(rs),sets=fiveRepSets(rs),perfect=sets.filter(set=>set.every(r=>r.level===2)).length;
  const bins=weeklyBins(rs);
  return metricCards([[q.total,'Marked reps'],[q.great,'Great reps'],[q.rate===null?'—':q.rate+'%','Great-rep rate'],[perfect,'All-great sets']])+
    '<div class="two-col insight-grid">'+skillRanking(rs)+skillDetail(rs)+
    panel('Rep quality over time','Achieved and great reps per '+bins.unit+'.',
      binsChart(bins.items)+gymLegend())+compareCard(rs,prev,true)+
    panel('Set consistency','Five marked reps complete a set.',
      shortLine('Complete sets',sets.length)+shortLine('All five great',perfect)+
      shortLine('Skills practised',new Set(rs.map(r=>byId[r.id].skill)).size)+shortLine('Gymnastics days',tally(rs)))+skillGaps(rs)+'</div>';
}
function weeklyBins(rs){
  const size=period===7?1:period===28?4:10,start=offset(today,1-period),items=[];
  for(let i=0;i<period;i+=size){
    const d=offset(start,i),end=offset(d,size-1);
    const bucket=rs.filter(r=>r.day>=d&&r.day<=end);
    items.push({day:d,one:bucket.filter(r=>r.level===1).length,two:bucket.filter(r=>r.level===2).length});
  }
  return {unit:size===1?'day':size+'-day block',items};
}
function binsChart(bins){
  const max=Math.max(1,...bins.map(b=>b.one+b.two));
  return '<div class="chart-scroll"><div class="bar-chart gym-bars">'+bins.map(b=>{const n=b.one+b.two;
    return '<div class="chart-col" aria-label="'+dateLabel(b.day)+', '+b.one+' achieved, '+b.two+' great"><span class="chart-num">'+n+'</span><div class="bar-area"><div class="barfill" style="height:'+100*n/max+'%"><i style="flex:'+b.one+';background:var(--mint)"></i><i style="flex:'+b.two+';background:var(--purple)"></i></div></div><span class="chart-x">'+dateLabel(b.day)+'</span></div>';
  }).join('')+'</div></div>';
}
function patternInsights(rs){
  const grouped=new Map();
  for(const r of rs){
    if(!grouped.has(r.day))grouped.set(r.day,{work:0,gym:0});
    const d=grouped.get(r.day);if(isGym(r))d.gym++;else d.work++;
  }
  const days=[...grouped.keys()].sort(),mixed=days.filter(d=>grouped.get(d).work&&grouped.get(d).gym).length;
  const weeks=new Set(days.map(monday)),last=days.at(-1);
  const names=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],weekCounts=names.map(()=>0);
  for(const d of days)weekCounts[(dateObj(d).getDay()+6)%7]++;
  let run=0,longest=0,previous='';
  for(const d of days){run=previous&&offset(previous,1)===d?run+1:1;longest=Math.max(longest,run);previous=d}
  const max=Math.max(...weekCounts,1),peak=Math.max(...weekCounts);
  const start=offset(today,1-period);
  const grid=Array.from({length:period},(_,i)=>{const d=offset(start,i),x=grouped.get(d);
    const tag=x?(x.work&&x.gym?'mixed':x.work?'work':'gym'):'rest';
    return '<button class="heat-cell '+tag+'" data-day-summary="'+d+'" aria-label="'+d+', '+(x?x.work+' exercises and '+x.gym+' reps':'no log')+'" title="'+dateLabel(d)+'">'+Number(d.slice(-2))+'</button>';
  }).join('');
  return metricCards([[days.length,'Training days'],[mixed,'Mixed sessions'],[weeks.size,'Active weeks'],[longest,'Longest run of days']])+
    '<div class="two-col insight-grid">'+panel('Training calendar',dateLabel(start)+' – '+dateLabel(today)+'. Tap a date for its session.',
      '<div class="heat-legend"><span class="work">Workout</span><span class="gym">Gymnastics</span><span class="mixed">Both</span></div>'+
      '<div class="heat-grid">'+names.map(n=>'<small>'+n+'</small>').join('')+'<span style="display:contents">'+
      '<i></i>'.repeat((dateObj(start).getDay()+6)%7)+grid+'</span></div>')+
    panel('Training rhythm','Logged days by weekday in this period.',
      names.map((n,i)=>'<div class="rhythm-line"><span>'+n+'</span><div class="bartrack"><em style="width:'+100*weekCounts[i]/max+'%"></em></div><b>'+weekCounts[i]+'</b></div>').join('')+
      shortLine('Busiest weekday'+(weekCounts.filter(x=>x===peak).length>1?'s':''),peak?names.filter((n,i)=>weekCounts[i]===peak).join(', '):'—'))+
    panel('Session mix','Days with either log count once.',
      shortLine('Workout only',days.filter(d=>grouped.get(d).work&&!grouped.get(d).gym).length)+shortLine('Gymnastics only',days.filter(d=>!grouped.get(d).work&&grouped.get(d).gym).length)+shortLine('Both logs',mixed)+shortLine('Most recent',last?dateLabel(last):'—'))+'</div>';
}
function openDaySummary(day){
  calDay=day;month=day.slice(0,7);historyMode='calendar';view='history';syncRoute();
  hideToast();render(true);window.scrollTo(0,0);
}
function insights() {
  const all=windowItems(today,period),previous=windowItems(offset(today,-period),period);
  const tabs='<div class="analysis-tabs" aria-label="Analysis focus">'+(isDan ? [['workout','Workout'],['weight','Weight']] : [['workout','Workout'],['gymnastics','Gymnastics'],['patterns','Patterns'],['weight','Weight']]).map(([v,label])=>'<button data-analysis="'+v+'" aria-pressed="'+(analysisMode===v)+'">'+label+'</button>').join('')+'</div>';
  let body;
  if(analysisMode==='weight')body=weightInsights();
  else if(analysisMode==='gymnastics')body=gymInsights(all.filter(isGym),previous.filter(isGym));
  else if(analysisMode==='patterns')body=patternInsights(all);
  else{
    const rs=all.filter(activeWorkout);
    body=workoutInsights()+'<div class="two-col insight-grid analysis-extra">'+mixCard(rs)+workloadCard(rs)+movementDetail(rs)+compareCard(rs,previous.filter(activeWorkout),false)+'</div>';
  }
  return head('Insights','Your training over the last '+period+' days.',periodChooser())+tabs+(analysisMode==='workout' ? attentionOverview() : '')+body;
}
