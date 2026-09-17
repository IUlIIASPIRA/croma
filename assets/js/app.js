'use strict';
/* CROMA — поведение панели: язык, навигация, опыт команды, подход, миксер, форма. */
(() => {
  const $ = id => document.getElementById(id);
  const cfg = window.CROMA_CONFIG, TEXT = window.CROMA_TEXT, mixer = window.CromaMixer;
  const panel = $('console');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  // Совпадает с медиазапросом ленты в croma.css.
  const flow = matchMedia('(max-width: 980px), (orientation: portrait) and (max-width: 1180px)');
  const state = { lang: document.documentElement.lang === 'ru' ? 'ru' : 'en', focus: null, work: 0,
    blend: 50, modularVolume: 55, acousticVolume: 55, rhythmVolume: 20 };
  const media = window.CROMA_MEDIA || { team: [], approach: null };
  const team = media.team;

  // Видео в одном HTML-файле встроено в base64 и превращается в Blob при первом показе.
  const blobUrls = new Map();
  function mediaUrl(item, key) {
    if (item[key]) return item[key];
    const data = item[key + 'Data'];
    if (!data) return '';
    if (!blobUrls.has(data)) {
      const binary = atob(data), bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      blobUrls.set(data, URL.createObjectURL(new Blob([bytes], { type: item[key + 'Type'] || '' })));
    }
    return blobUrls.get(data);
  }
  if (media.approach) {
    // Путь делаем абсолютным: url() внутри CSS-переменной считается от файла стилей, а не от страницы.
    const absolute = src => src.startsWith('data:') ? src : new URL(src, document.baseURI).href;
    panel.style.setProperty('--space-photo', `url("${absolute(media.approach.portrait)}")`);
    panel.style.setProperty('--space-photo-wide', `url("${absolute(media.approach.wide)}")`);
  }

  const t = (key, vars) => (TEXT[state.lang][key] || TEXT.en[key] || '').replace(/\{(\w+)\}/g, (_, k) => vars && vars[k] != null ? vars[k] : '');
  const pick = value => (value && typeof value === 'object') ? (value[state.lang] || value.en) : value;

  // Рамку фокуса показываем только при работе с клавиатуры: от мыши и пальца она лишняя.
  const markInput = mode => document.documentElement.dataset.input = mode;
  addEventListener('pointerdown', () => markInput('pointer'), true);
  addEventListener('keydown', e => { if (e.key === 'Tab' || e.key.startsWith('Arrow') || e.key === ' ' || e.key === 'Enter') markInput('key'); }, true);

  let announceTimer;
  function announce(message) {
    clearTimeout(announceTimer);
    $('announcement').textContent = '';
    announceTimer = setTimeout(() => { $('announcement').textContent = message; }, 30);
  }

  /* ---------- Язык ---------- */
  function applyLanguage() {
    document.documentElement.lang = state.lang;
    document.title = t('pageTitle');
    document.querySelector('meta[name=description]').setAttribute('content', t('description'));
    document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
    document.querySelectorAll('[data-i18n-html]').forEach(el => { el.innerHTML = t(el.dataset.i18nHtml); });
    document.querySelectorAll('[data-i18n-aria]').forEach(el => el.setAttribute('aria-label', t(el.dataset.i18nAria)));
    document.querySelectorAll('[data-i18n-title]').forEach(el => el.setAttribute('title', t(el.dataset.i18nTitle)));
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => el.setAttribute('placeholder', t(el.dataset.i18nPlaceholder)));
    document.querySelectorAll('.lang-key').forEach(key => key.setAttribute('aria-pressed', String(key.dataset.lang === state.lang)));
    renderMethods(); renderScenes(); renderWork(false); renderTransport();
  }
  document.querySelectorAll('.lang-key').forEach(key => key.addEventListener('click', () => {
    if (state.lang === key.dataset.lang) return;
    state.lang = key.dataset.lang;
    try { localStorage.setItem('croma-lang', state.lang); } catch (_) {}
    const url = new URL(location.href); url.searchParams.set('lang', state.lang); history.replaceState(null, '', url);
    applyLanguage();
  }));

  /* ---------- Масштаб панели ---------- */
  let resizeFrame;
  function fitPanel() {
    const viewport = $('viewport');
    if (flow.matches) {
      document.documentElement.style.setProperty('--scale', '1');
      viewport.classList.remove('is-tall');
      return;
    }
    const w = window.innerWidth, h = window.innerHeight;
    const fitW = w / 1536, fitH = h / 1024;
    // На низких экранах не даём тексту стать мельче 82% — лучше лёгкий скролл.
    const scale = Math.min(fitW, Math.max(fitH, Math.min(fitW, 0.82)));
    document.documentElement.style.setProperty('--scale', String(scale));
    viewport.classList.toggle('is-tall', 1024 * scale > h);
  }
  addEventListener('resize', () => { cancelAnimationFrame(resizeFrame); resizeFrame = requestAnimationFrame(fitPanel); });
  flow.addEventListener('change', () => { fitPanel(); focusModule(null, false); });

  /* ---------- Заставка ---------- */
  let entranceTimer;
  function dismissEntrance() {
    clearTimeout(entranceTimer);
    document.body.classList.remove('entry-running');
    panel.inert = false;
    $('skip-entry').tabIndex = -1;
    if (!reduced.matches) { panel.classList.remove('nav-invitation'); void panel.offsetWidth; panel.classList.add('nav-invitation'); }
  }
  function runEntrance() {
    if (reduced.matches) return dismissEntrance();
    document.body.classList.add('entry-running');
    panel.inert = true;
    $('skip-entry').tabIndex = 0;
    entranceTimer = setTimeout(dismissEntrance, 2350);
  }
  $('skip-entry').addEventListener('click', dismissEntrance);
  $('entrance').addEventListener('click', e => { if (e.target === $('entrance')) dismissEntrance(); });

  /* ---------- Навигация ---------- */
  const navKeys = [...document.querySelectorAll('.module-key')];
  const faces = [...document.querySelectorAll('[data-module]')];
  const navNames = { team: 'navTeam', approach: 'navApproach', fragments: 'navFragments', contact: 'navContact' };
  function focusModule(name, notify = true) {
    state.focus = name;
    navKeys.forEach(key => key.setAttribute('aria-pressed', String(key.dataset.focus === name)));
    if (flow.matches) {
      panel.classList.remove('has-focus');
      faces.forEach(face => face.classList.remove('is-focused'));
      if (name) {
        const target = name === 'fragments' ? $('player') : faces.find(face => face.dataset.module === name);
        target && target.scrollIntoView({ behavior: reduced.matches ? 'auto' : 'smooth', block: 'start' });
      }
    } else {
      panel.classList.toggle('has-focus', !!name);
      faces.forEach(face => {
        const on = face.dataset.module === name;
        face.classList.toggle('is-focused', on);
        face.classList.remove('focus-arrival');
        if (on && !reduced.matches) { void face.offsetWidth; face.classList.add('focus-arrival'); }
      });
    }
    if (notify && name) announce(t('panelSelected', { name: t(navNames[name]).toLowerCase() }));
  }
  navKeys.forEach(key => key.addEventListener('click', () => focusModule(key.dataset.focus)));
  $('brand').addEventListener('click', () => {
    focusModule(null);
    if (flow.matches) scrollTo({ top: 0, behavior: reduced.matches ? 'auto' : 'smooth' });
  });

  /* ---------- Диалоги ---------- */
  function openDialog(dialog) {
    if (document.body.classList.contains('entry-running')) dismissEntrance();
    document.querySelectorAll('dialog[open]').forEach(d => { if (d !== dialog) d.close(); });
    if (!dialog.open) dialog.showModal();
  }
  document.querySelectorAll('.close-dialog').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()));
  document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('click', e => {
    if (e.target !== dialog) return;
    const r = dialog.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.close();
  }));
  function showInfo({ eyebrow, title, body, note = '', link = '' }) {
    $('info-eyebrow').textContent = eyebrow;
    $('info-title').textContent = title;
    $('info-body').textContent = body;
    $('info-note').textContent = note;
    $('info-link').hidden = !link;
    if (link) { $('info-link').href = link; $('info-link-text').textContent = t('watchFull'); }
    openDialog($('info-dialog'));
  }

  addEventListener('keydown', e => {
    if (e.key === 'Escape' && document.body.classList.contains('entry-running')) return dismissEntrance();
    if (document.querySelector('dialog[open]')) return;
    const target = e.target instanceof Element ? e.target : null;
    if (target && target.closest('input,textarea,select,video,[role=slider]')) return;
    if (!e.metaKey && !e.ctrlKey && !e.altKey && /^[1-4]$/.test(e.key)) {
      e.preventDefault(); focusModule(['team', 'approach', 'fragments', 'contact'][Number(e.key) - 1]);
    } else if (e.key === 'Escape') focusModule(null);
    else if (e.code === 'Space' && !(target && target.closest('button,a'))) { e.preventDefault(); togglePlayback(); }
  });

  /* ---------- Подход ---------- */
  function renderMethods() {
    const list = $('method-list');
    list.textContent = '';
    cfg.approach.forEach(method => {
      const button = document.createElement('button');
      button.className = 'method';
      button.append(document.createTextNode(pick(method.title)));
      const small = document.createElement('small'); small.textContent = pick(method.short);
      button.appendChild(small);
      button.addEventListener('click', () => showInfo({ eyebrow: t('approachEyebrow'), title: pick(method.title), body: pick(method.detail), note: t('approachNote') }));
      list.appendChild(button);
    });
  }

  /* ---------- Опыт команды ---------- */
  const video = $('work-video'), image = $('work-image');
  function renderWork(animate = true) {
    $('team').hidden = !team.length;
    if (!team.length) return;
    const work = team[state.work];
    $('work-counter').textContent = `${String(state.work + 1).padStart(2, '0')} / ${String(team.length).padStart(2, '0')}`;
    $('work-title').textContent = pick(work.title);
    $('work-credit').textContent = pick(work.credit);
    const isVideo = work.type === 'video';
    const key = isVideo ? `${work.id}` : '';
    if (video.dataset.card !== key) {
      video.pause();
      if (isVideo) { video.poster = mediaUrl(work, 'poster'); video.src = mediaUrl(work, 'src'); video.dataset.card = key; }
      else { video.removeAttribute('src'); video.dataset.card = ''; video.load(); }
    }
    video.hidden = !isVideo; image.hidden = isVideo;
    if (!isVideo) {
      image.src = mediaUrl(work, 'src');
      image.style.objectPosition = work.position || '50% 50%';
      image.alt = pick(work.title);
    }
    if (animate && !reduced.matches) { $('work-window').classList.remove('changing'); void $('work-window').offsetWidth; $('work-window').classList.add('changing'); }
  }
  function stepWork(delta) {
    if (!team.length) return;
    state.work = (state.work + delta + team.length) % team.length;
    renderWork(); announce(`${state.work + 1} / ${team.length}. ${pick(team[state.work].title)}`);
  }
  $('previous-work').addEventListener('click', () => stepWork(-1));
  $('next-work').addEventListener('click', () => stepWork(1));
  $('team').addEventListener('keydown', e => {
    if (e.target.closest('video')) return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); stepWork(e.key === 'ArrowLeft' ? -1 : 1); }
  });
  let touchX = null;
  $('work-window').addEventListener('touchstart', e => { if (!e.target.closest('video,button')) touchX = e.touches[0].clientX; }, { passive: true });
  $('work-window').addEventListener('touchend', e => {
    if (touchX == null) return;
    const dx = e.changedTouches[0].clientX - touchX; touchX = null;
    if (Math.abs(dx) > 40) stepWork(dx < 0 ? 1 : -1);
  });
  $('credit-link').addEventListener('click', () => {
    const work = team[state.work];
    showInfo({ eyebrow: t('teamEyebrow'), title: pick(work.title), body: pick(work.detail), link: work.link || '' });
  });

  // Полный экран: видео — средствами браузера (на iPhone — нативный плеер), фото — в окне просмотра.
  $('fullscreen-toggle').addEventListener('click', () => {
    const work = team[state.work];
    if (work.type === 'video') {
      if (video.requestFullscreen) video.requestFullscreen().then(() => video.play()).catch(() => {});
      else if (video.webkitRequestFullscreen) { video.webkitRequestFullscreen(); video.play(); }
      else if (video.webkitEnterFullscreen) { video.play(); video.webkitEnterFullscreen(); }
    } else {
      $('media-title').textContent = pick(work.title);
      $('media-credit').textContent = pick(work.credit);
      $('media-image').src = mediaUrl(work, 'src'); $('media-image').alt = pick(work.title);
      openDialog($('media-dialog'));
    }
  });
  video.addEventListener('play', () => mixer.pause());

  /* ---------- Миксер ---------- */
  // Сцены: кнопки в верхнем ряду панели. Ритм — отдельный фейдер, активен, если он есть в сцене.
  function renderScenes(changed = 0) {
    const bank = $('scene-bank');
    bank.textContent = '';
    mixer.scenes.forEach((scene, i) => {
      const button = document.createElement('button');
      button.className = 'source'; button.dataset.scene = scene.n; button.dataset.glyph = i % 4;
      button.setAttribute('aria-pressed', String(mixer.active === scene));
      button.setAttribute('aria-label', t('selectScene', { name: pick(scene.name) }));
      const label = document.createElement('span'); label.className = 'source-index';
      label.textContent = String(scene.n).padStart(2, '0');
      const glyph = document.createElement('span'); glyph.className = 'dot-glyph'; glyph.setAttribute('aria-hidden', 'true');
      for (let k = 0; k < 3; k++) glyph.appendChild(document.createElement('i'));
      const name = document.createElement('span'); name.className = 'source-name'; name.textContent = pick(scene.name);
      const pilot = document.createElement('i'); pilot.className = 'pilot'; pilot.setAttribute('aria-hidden', 'true');
      button.append(label, glyph, name, pilot);
      if (scene.n === changed && !reduced.matches) button.classList.add('selection-arrival');
      button.addEventListener('click', () => {
        mixer.selectScene(scene.n);
        renderScenes(scene.n);
        bank.querySelector(`[data-scene="${scene.n}"]`).focus({ preventScroll: true });
      });
      bank.appendChild(button);
    });
    const hasRhythm = mixer.hasLayer('rhythm');
    const rhythm = $('rhythm-level');
    rhythm.classList.toggle('is-off', !hasRhythm);
    rhythm.setAttribute('aria-disabled', String(!hasRhythm));
    rhythm.tabIndex = hasRhythm ? 0 : -1;
    $('rhythm-note').hidden = hasRhythm;
    drawWaveform();
  }

  let instructionOverride = '';
  function setInstruction(text) { instructionOverride = text; renderTransport(); }
  function renderTransport() {
    const playing = mixer.playing;
    const use = playing ? '#pause-symbol' : '#play-symbol';
    [$('play'), $('fragment-play')].forEach(b => {
      b.querySelector('use').setAttribute('href', use);
      b.setAttribute('aria-label', t(playing ? 'pauseLabel' : 'playLabel'));
      b.disabled = !mixer.anyConfigured;
    });
    $('play-text').textContent = t(playing ? 'pause' : 'play');
    const names = mixer.active ? pick(mixer.active.name) : '';
    $('player-instruction').textContent = instructionOverride
      || (playing ? t('playing', { names }) : t('instruction'));
    panel.classList.toggle('is-playing', playing);
    paintLight();
  }

  let loadingShown = false;
  async function togglePlayback() {
    if (mixer.playing) { mixer.pause(); return; }
    if (!mixer.anyConfigured) return;
    instructionOverride = '';
    const loadingTimer = setTimeout(() => { loadingShown = true; setInstruction(t('loading')); }, 250);
    try {
      document.querySelectorAll('video').forEach(v => v.pause());
      await mixer.play();
      instructionOverride = '';
    } catch (error) {
      instructionOverride = error.message === 'no-audio' ? t('noAudio') : t('audioError');
    } finally {
      clearTimeout(loadingTimer); loadingShown = false;
      renderTransport(); animate();
    }
  }
  $('play').addEventListener('click', togglePlayback);
  $('fragment-play').addEventListener('click', togglePlayback);
  mixer.onChange(() => { renderTransport(); drawWaveform(); renderTime(); });

  function renderParameters() {
    ['blend', 'modularVolume', 'acousticVolume', 'rhythmVolume'].forEach(name => panel.style.setProperty(`--${name}`, String(state[name])));
    document.querySelectorAll('[role=slider]').forEach(control => {
      const name = control.dataset.param, value = state[name];
      control.setAttribute('aria-valuenow', String(value));
      control.setAttribute('aria-valuetext', name === 'blend' ? `${100 - value} / ${value}` : `${value}%`);
      const readout = control.querySelector('.control-readout');
      if (readout) readout.textContent = name === 'blend' ? `${100 - value} / ${value}` : String(value);
    });
    mixer.setMix({ blend: state.blend, modularVolume: state.modularVolume, acousticVolume: state.acousticVolume, rhythmVolume: state.rhythmVolume });
    drawWaveform(); paintLight();
  }
  document.querySelectorAll('[role=slider]').forEach(control => {
    const name = control.dataset.param, vertical = control.dataset.vertical === 'true';
    const rail = () => control.querySelector('.level-rail, .polished-rail, .fine-rail');
    const update = e => {
      const r = rail().getBoundingClientRect();
      const n = vertical ? 1 - (e.clientY - r.top) / r.height : (e.clientX - r.left) / r.width;
      state[name] = Math.round(Math.max(0, Math.min(1, n)) * 100);
      renderParameters();
    };
    control.addEventListener('pointerdown', e => {
      if (e.button !== 0 || control.getAttribute('aria-disabled') === 'true') return;
      e.preventDefault(); control.focus({ preventScroll: true });
      control.setPointerCapture(e.pointerId); control.classList.add('dragging'); update(e);
    });
    control.addEventListener('pointermove', e => { if (control.hasPointerCapture(e.pointerId)) update(e); });
    const release = e => { if (control.hasPointerCapture(e.pointerId)) control.releasePointerCapture(e.pointerId); control.classList.remove('dragging'); };
    control.addEventListener('pointerup', release); control.addEventListener('pointercancel', release);
    control.addEventListener('lostpointercapture', () => control.classList.remove('dragging'));
    control.addEventListener('keydown', e => {
      if (!['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key) || control.getAttribute('aria-disabled') === 'true') return;
      e.preventDefault(); const step = e.shiftKey ? 10 : 1;
      state[name] = e.key === 'Home' ? 0 : e.key === 'End' ? 100 : Math.max(0, Math.min(100, state[name] + (['ArrowRight', 'ArrowUp'].includes(e.key) ? step : -step)));
      renderParameters();
    });
  });

  const canvas = $('waveform'), drawing = canvas.getContext('2d');
  function drawWaveform() {
    drawing.clearRect(0, 0, canvas.width, canvas.height);
    const layers = mixer.active ? mixer.active.layers.filter(layer => layer.peaks) : [];
    const gains = mixer.busGains();
    drawing.fillStyle = 'rgba(14, 16, 16, 0.86)';
    const values = Array.from({ length: 90 }, (_, i) => layers.reduce((sum, layer) => sum + layer.peaks[i] * gains[layer.role], 0));
    const maximum = Math.max(0.05, ...values);
    values.forEach((v, i) => {
      const height = Math.max(1.5, (v / maximum) * 64);
      drawing.fillRect(i * 6 + 2, (canvas.height - height) / 2, 2, height);
    });
  }
  const fmt = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  function renderTime() {
    const p = mixer.phase(), L = mixer.loopLength;
    $('fragment-time').textContent = `${fmt(p)} / ${fmt(L)}`;
    $('playhead').hidden = !mixer.playing && p === 0;
    $('playhead').style.left = `${100 * p / L}%`;
  }

  // Металл теплеет, когда в миксе слышна акустика.
  const light = { envelope: 0 };
  function paintLight(rms = 0) {
    const gains = mixer.busGains();
    const total = gains.modular ** 2 + gains.acoustic ** 2;
    const weight = mixer.playing && total > 1e-6 ? gains.acoustic ** 2 / total : state.blend / 100;
    light.envelope += (rms - light.envelope) * 0.12;
    const strength = mixer.playing ? 0.42 + (reduced.matches ? 0 : Math.min(0.06, light.envelope * 1.2)) : 0.24;
    panel.style.setProperty('--light-cool', String(Math.max(0, 1 - 2 * weight) * strength));
    panel.style.setProperty('--light-neutral', String((1 - Math.abs(2 * weight - 1)) * strength * 0.5));
    panel.style.setProperty('--light-warm', String(Math.max(0, 2 * weight - 1) * strength));
  }
  // Индикаторы сцен вспыхивают в такт: первая доля ярче, остальные мягче.
  function paintBeat() {
    const beat = mixer.beatSeconds;
    const live = mixer.playing && beat > 0 && mixer.hasLayer('rhythm') && mixer.busGains().rhythm > 0.01;
    let value = 0;
    if (live) {
      const position = mixer.phase() / beat;
      const accent = Math.floor(position) % mixer.beatsPerBar === 0 ? 1 : 0.6;
      value = accent * Math.exp(-(position - Math.floor(position)) * 5);
    }
    document.querySelectorAll('#scene-bank .pilot').forEach(pilot => {
      pilot.style.setProperty('--beat', value.toFixed(3));
    });
  }

  let frame = 0, lastPaint = 0;
  function animate() {
    cancelAnimationFrame(frame);
    const tick = now => {
      if (!mixer.playing) { renderTime(); paintBeat(); $('signal-pin').classList.remove('is-audible'); return; }
      renderTime(); paintBeat();
      if (!reduced.matches && now - lastPaint > 45) {
        lastPaint = now;
        const rms = mixer.level();
        paintLight(rms);
        $('signal-pin').classList.toggle('is-audible', rms > 0.0008);
        $('signal-pin').style.setProperty('--signal-level', String(Math.min(0.85, rms * 4)));
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
  }

  // Лупы подгружаем заранее, когда страница уже показана.
  if (mixer.anyConfigured) {
    const preload = () => { try { mixer.load(); } catch (_) {} };
    ('requestIdleCallback' in window) ? requestIdleCallback(preload, { timeout: 3000 }) : setTimeout(preload, 1500);
  }

  /* ---------- Контакт ---------- */
  $('contact-action').addEventListener('click', () => openDialog($('enquiry-dialog')));
  $('enquiry-submit').disabled = !cfg.contactEmail;
  $('enquiry-form').addEventListener('submit', e => {
    e.preventDefault();
    const form = e.currentTarget;
    if (!cfg.contactEmail || !form.reportValidity()) return;
    const f = new FormData(form);
    const mixNames = mixer.active ? pick(mixer.active.name) : '';
    const body = `${f.get('brief')}\n\n—\n${f.get('name')}\n${f.get('email')}\n\nMix: ${mixNames}, ${100 - state.blend}/${state.blend}\n`;
    location.href = `mailto:${cfg.contactEmail}?subject=${encodeURIComponent(t('mailSubject'))}&body=${encodeURIComponent(body)}`;
  });

  applyLanguage(); fitPanel(); renderParameters(); renderTime(); runEntrance();
})();
