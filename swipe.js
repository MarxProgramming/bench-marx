let exerciseSwipe, ignoreSwipeClick;
const revealDistance = 70;

function resetExerciseSwipe() {
  exerciseSwipe?.row.style.removeProperty('--swipe-x');
  exerciseSwipe?.row.classList.remove('swiping');
  exerciseSwipe = null;
}

document.addEventListener('pointerdown', event => {
  if (!event.isPrimary || event.pointerType === 'mouse' || modal.open) return;
  const button = event.target.closest('button[data-log]');
  if (!button) return;
  exerciseSwipe = {
    id:button.dataset.log, row:button.closest('.exercise'), pointer:event.pointerId,
    x:event.clientX, y:event.clientY, locked:false
  };
});

document.addEventListener('pointermove', event => {
  const swipe=exerciseSwipe;
  if (!swipe || event.pointerId !== swipe.pointer) return;
  const x=event.clientX-swipe.x, y=Math.abs(event.clientY-swipe.y);
  if (!swipe.locked && (y>15 && y>Math.abs(x) || x>18)) {resetExerciseSwipe();return;}
  if (!swipe.locked && x < -14 && -x>y*1.35) {
    swipe.locked=true;
    swipe.row.classList.add('swiping');
  }
  if (swipe.locked) swipe.row.style.setProperty('--swipe-x',Math.max(-104,Math.min(0,x))+'px');
});

document.addEventListener('pointerup', event => {
  const swipe=exerciseSwipe;
  if (!swipe || event.pointerId!==swipe.pointer) return;
  const remove=swipe.locked && event.clientX-swipe.x<=-revealDistance;
  resetExerciseSwipe();
  if (swipe.locked) {
    ignoreSwipeClick=swipe.id;
    setTimeout(()=>{if (ignoreSwipeClick===swipe.id) ignoreSwipeClick=null;},420);
  }
  if (remove) reviewExerciseRemoval(swipe.id);
});

document.addEventListener('pointercancel', resetExerciseSwipe);
document.addEventListener('click',event=>{
  if (ignoreSwipeClick && event.target.closest('[data-log]')?.dataset.log===ignoreSwipeClick) {
    ignoreSwipeClick=null;
    event.stopImmediatePropagation();
    event.preventDefault();
  }
},true);
