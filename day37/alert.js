// The alert screen beside the monitor wall: log lines type themselves out like an
// emergency broadcast and stack up, the oldest fading off the top.
window.AlertLog = (() => {
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const MAX_LINES = 14;
  const CHARS_PER_SECOND = 40;

  let list = null;
  const queue = [];
  let typing = null; // { el, text, at, timer }

  function init(el) {
    list = el;
  }

  function startNext() {
    if (typing || !queue.length) return;
    const { text, isAlarm } = queue.shift();
    const li = document.createElement('li');
    if (isAlarm) li.className = 'alarm';
    list.appendChild(li);
    while (list.children.length > MAX_LINES) list.firstChild.remove();
    if (reduceMotion) {
      li.textContent = text;
      startNext();
      return;
    }
    li.classList.add('typing');
    typing = { el: li, text, at: 0 };
    typing.timer = setInterval(() => {
      typing.at++;
      li.textContent = text.slice(0, typing.at);
      if (typing.at >= text.length) {
        clearInterval(typing.timer);
        li.classList.remove('typing');
        typing = null;
        startNext();
      }
    }, 1000 / CHARS_PER_SECOND);
  }

  // Lines queue up so a burst of events still types out one after another
  function push(text, isAlarm) {
    if (!list) return;
    queue.push({ text, isAlarm });
    // A long backlog would lag behind the pictures, so drop the oldest waiting lines
    while (queue.length > 4) queue.shift();
    startNext();
  }

  return { init, push };
})();
