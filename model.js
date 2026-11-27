'use strict';
const isDan = document.documentElement?.dataset.journal === 'dan';
const appName = isDan ? 'Bench Dan' : 'Bench Marx';
const baseGroups = [
  {
    name: 'Cable machine',
    short: 'Cable',
    colour: '#68c6ee',
    exercises: [
      ['lat', 'One-arm lat pulldowns'], ['row', 'One-arm seated rows'],
      ['lateral', 'One-arm lateral raises'], ['face', 'One-arm face pulls'],
      ['rotator', 'One-arm rotator cuff external rotations'],
      ['javelin', 'Controlled javelin throwing movements'], ['yraise', 'Cable Y-raises']
    ]
  },
  {
    name: 'Weights',
    short: 'Weights',
    colour: '#699df1',
    exercises: [
      ['bench', 'Bench press'], ['overhead', 'Overhead press'], ['rdl', 'Romanian deadlifts (RDLs)'],
      ['split', 'Bulgarian split squats'], ['calf', 'Standing calf raises']
    ]
  },
  {
    name: 'Plyometrics and mobility',
    short: 'Plyo & mobility',
    colour: '#e8ae81',
    exercises: [
      ['pogo', 'Hops across floor', 'Single-leg pogo hops'],
      ['floorjumps', 'Straight jumps across floor'], ['jump', 'Vertical jumps', 'High straight jumps'],
      ['swings', 'Kicks', 'Forward and sideways hip mobility kicks'], ['shoulder', 'Bridges']
    ]
  }
];
if (isDan) baseGroups.pop();
baseGroups.forEach((g,ref) => g.ref=ref);
const groups = [...baseGroups];
const exercises =
    groups.flatMap((group, gi) => group.exercises.map(([id, name, detail]) => ({id, name, detail, gi})));
const baseExercises = [...exercises];
const byId = Object.fromEntries(exercises.map(e => [e.id, e]));
// Keep retired records readable in History and portable in backups.
byId.pallof = {id:'pallof', name:'Pallof presses', retired:true};
if (!isDan) byId.hip = {id:'hip', name:'Hip mobility', retired:true};
const skills = isDan ? [] : [
  {id:'pirouette', name:'Handstand pirouette', family:'Handstands'},
  {id:'shoulderstand', name:'Back shoulder handstand', family:'Handstands'},
  {id:'standingtuck', name:'Standing back tuck', family:'Tumbling'},
  {id:'roundofftuck', name:'Round-off back tuck', family:'Tumbling'},
  {id:'pikestick', name:'Piked front somersault to stick', family:'Tumbling'},
  {id:'hold', name:'Five-second handstand hold', family:'Optional basics', optional:true},
  {id:'hsroll', name:'Handstand forward roll', family:'Optional basics', optional:true},
  {id:'jumpstick', name:'Straight jump to stick', family:'Optional basics', optional:true}
];
const repsPerSkill = 5;
const coreSkills = skills.filter(s=>!s.optional);
const coreTarget = coreSkills.length * repsPerSkill;
function repId(skillId, index){return 'gym_'+skillId+'_'+index}
for (const skill of skills) {
  for(let rep=1; rep<=repsPerSkill; rep++){
    const id=repId(skill.id,rep);
    byId[id]={id,name:skill.name,skill:skill.id,rep,optional:!!skill.optional};
  }
}
function isGym(r){ return !!byId[r.id]?.skill }
function groupRef(value) {
  return /^[0-2]$/.test(value) ? Number(value) : value;
}
function groupOf(ref) { return groups.find(group=>group.ref===ref); }
function visibleOn(item,day) {
  return !!item && (!item.created || item.created<=day) && (!item.archived || item.archived>day);
}
function groupsAt(day) { return groups.filter(g=>visibleOn(g,day)); }
function exerciseOn(exercise,day) { return visibleOn(exercise,day) && visibleOn(groupOf(exercise.gi),day); }
function activeWorkout(r) { return !isGym(r) && exerciseOn(byId[r.id],r.day); }
function archivedDay(day){ return [...entries.values()].filter(r=>r.day===day && !isGym(r) && !exerciseOn(byId[r.id],day)) }
const levels = ['Unlogged', 'Done', 'Heavy', 'PR'], colours = ['neutral', 'done', 'heavy', 'pr'];
const entries = new Map();
const prefix = isDan ? 'bench-dan.v1.entry.' : 'formlog.v1.entry.';
function iso(d = new Date()) {
  return [
    d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')
  ].join('-')
}
function dateObj(s) {
  return new Date(s + 'T12:00:00')
}
function offset(s, n) {
  const d = dateObj(s);
  d.setDate(d.getDate() + n);
  return iso(d)
}
function monday(s) {
  return offset(s, -(dateObj(s).getDay() + 6) % 7)
}
function fmt(s, opts) {
  return dateObj(s).toLocaleDateString('en-GB', opts)
}
function validDay(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && s >= '1900-01-01' &&
      iso(dateObj(s)) === s
}
function key(day, id) {
  return day + '.' + id
}
function cleanRecord(r, catalogue = byId) {
  if (!r || !validDay(r.day) || typeof r.id !== 'string' || !Object.hasOwn(catalogue, r.id) ||
      ![1, 2, 3].includes(r.level))
    return null;
  if(isGym(r) && r.level===3) return null;
  const out = {day: r.day, id: r.id, level: r.level};
  if (r.level === 3) {
    if (typeof r.result !== 'string' || !r.result.trim() || r.result.trim().length > 140 ||
        !Number.isInteger(r.reps) || r.reps < 1 || r.reps > 9999)
      return null;
    out.result = r.result.trim();
    out.reps = r.reps;
    if (r.note !== undefined && (typeof r.note !== 'string' || r.note.length > 300)) return null;
    out.note = r.note || '';
    if (Number.isSafeInteger(r.recordedAt) && r.recordedAt > 0) out.recordedAt = r.recordedAt;
  }
  return out;
}
function exercisesAt(day) {
  return exercises.filter(e => exerciseOn(e,day));
}
function dayItems(day) {
  return exercisesAt(day).map(e => entries.get(key(day, e.id))).filter(Boolean)
}
function windowItems(end, days) {
  const start = offset(end, 1 - days);
  return [...entries.values()].filter(r => r.day >= start && r.day <= end)
}
function tally(records) {
  return new Set(records.map(r => r.day)).size
}
function ranked(records) {
  const counts = new Map(), last = new Map();
  for (const r of records) {
    counts.set(r.id, (counts.get(r.id) || 0) + 1);
    if (!last.has(r.id) || last.get(r.id) < r.day) last.set(r.id, r.day)
  }
  return exercises.map(e => ({...e, n: counts.get(e.id) || 0, last: last.get(e.id) || ''}))
      .sort((a, b) => a.n - b.n || a.last.localeCompare(b.last) || a.name.localeCompare(b.name));
}
function esc(s) {
  return String(s ?? '').replace(
      /[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;'}[c]))
}
