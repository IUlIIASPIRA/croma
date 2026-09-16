'use strict';
/* CROMA mixer — Web Audio.

   Миксер работает сценами. Сцена — папка в media/миксер/ с готовыми лупами одной длины:
   модульный слой, акустический и, если есть, ритм. Все слои сцены стартуют в один момент
   AudioContext и крутятся синхронно; фейдеры и баланс меняют только громкость.
   У каждой сцены своя длина. Переключение сцены меняет набор целиком: старая уходит
   коротким кроссфейдом, новая начинается с начала.

   Бесшовность: AudioBufferSourceNode с loop = true; loopStart/loopEnd ставятся по точной
   длине лупа из сборки. Файл собран так: [хвост лупа 0.5 с][луп][начало лупа 0.5 с].
   Содержимое файла периодично, поэтому задержка кодека AAC сдвигает фазу, но не рвёт стык. */

window.CromaMixer = (function () {
  const media = window.CROMA_MEDIA || { loop: { padding: 0.5 }, scenes: [] };
  const padding = media.loop.padding || 0;
  const beatsPerBar = media.loop.beatsPerBar || 4;
  const beatSeconds = media.loop.bpm ? 60 / media.loop.bpm : 0;
  const CROSSFADE = 0.12;
  const ROLES = ['modular', 'acoustic', 'rhythm'];

  const scenes = (media.scenes || []).map(scene => ({
    n: scene.n,
    name: scene.name,
    length: scene.seconds,
    layers: ROLES.filter(role => scene.layers[role]).map(role => ({
      role, length: scene.layers[role].seconds,
      url: scene.layers[role].src || '', data: scene.layers[role].srcData || '',
      buffer: null, peaks: null, source: null, gain: null, failed: false
    }))
  }));

  const audio = { context: null, master: null, buses: {}, analyser: null, waveData: null,
    playing: false, startTime: 0, offset: 0, loading: null };
  let active = scenes[0] || null;
  let mix = { blend: 50, modularVolume: 55, acousticVolume: 55, rhythmVolume: 20 };
  const listeners = new Set();
  const emit = () => listeners.forEach(fn => fn());

  // В одном HTML-файле звук встроен в base64: на file:// fetch запрещён.
  function base64ToArrayBuffer(text) {
    const binary = atob(text), bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  }

  function ensureContext() {
    if (audio.context) return audio.context;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) throw new Error('no-web-audio');
    const ctx = new AC({ latencyHint: 'playback' });
    audio.context = ctx;
    audio.master = ctx.createGain(); audio.master.gain.value = 0;
    ROLES.forEach(role => { audio.buses[role] = ctx.createGain(); audio.buses[role].connect(audio.master); });
    audio.analyser = ctx.createAnalyser(); audio.analyser.fftSize = 1024;
    audio.waveData = new Float32Array(audio.analyser.fftSize);
    audio.master.connect(audio.analyser); audio.analyser.connect(ctx.destination);
    // iPhone может «прервать» звук (звонок, блокировка экрана) — возобновляем при первой возможности.
    ctx.addEventListener('statechange', () => { if (audio.playing && ctx.state !== 'running') ctx.resume().catch(() => {}); });
    applyMix();
    return ctx;
  }

  function decode(ctx, data) {
    // Старый Safari умеет только колбэки.
    return new Promise((resolve, reject) => {
      const p = ctx.decodeAudioData(data, resolve, reject);
      if (p && p.then) p.then(resolve, reject);
    });
  }

  function calculatePeaks(buffer, seconds) {
    const data = buffer.getChannelData(0), count = 90, peaks = new Float32Array(count);
    const first = Math.round(padding * buffer.sampleRate);
    const length = Math.min(Math.round(seconds * buffer.sampleRate), data.length - first);
    for (let i = 0; i < count; i++) {
      const begin = first + Math.floor(i * length / count), end = first + Math.floor((i + 1) * length / count);
      let peak = 0;
      for (let j = begin; j < end; j += 12) peak = Math.max(peak, Math.abs(data[j]));
      peaks[i] = peak;
    }
    return peaks;
  }

  // Загружает все лупы всех сцен. Повторный вызов возвращает ту же загрузку.
  function load() {
    if (audio.loading) return audio.loading;
    const ctx = ensureContext();
    const layers = scenes.flatMap(scene => scene.layers);
    audio.loading = Promise.all(layers.map(async layer => {
      try {
        let bytes;
        if (layer.data) bytes = base64ToArrayBuffer(layer.data);
        else {
          const response = await fetch(layer.url);
          if (!response.ok) throw new Error(String(response.status));
          bytes = await response.arrayBuffer();
        }
        const buffer = await decode(ctx, bytes);
        if (buffer.duration + 0.001 < padding + layer.length) throw new Error('too-short');
        layer.buffer = buffer; layer.peaks = calculatePeaks(buffer, layer.length);
      } catch (error) {
        layer.failed = true;
        console.warn('CROMA loop failed:', layer.url, error.message);
      }
      emit();
    }));
    return audio.loading;
  }

  function smooth(param, value, timeConstant = 0.024) {
    const now = audio.context.currentTime;
    param.cancelScheduledValues(now);
    param.setTargetAtTime(value, now, timeConstant);
  }
  // Баланс делит модульное и акустическое поле с равной мощностью; ритм — своим фейдером.
  function busGains() {
    const ratio = mix.blend / 100;
    return {
      modular: Math.cos(ratio * Math.PI / 2) * mix.modularVolume / 100,
      acoustic: Math.sin(ratio * Math.PI / 2) * mix.acousticVolume / 100,
      rhythm: mix.rhythmVolume / 100
    };
  }
  function applyMix() {
    if (!audio.context) return;
    const gains = busGains();
    ROLES.forEach(role => smooth(audio.buses[role].gain, gains[role]));
  }

  function phase() {
    const length = active ? active.length : 0;
    if (!length) return 0;
    if (!audio.playing) return audio.offset % length;
    const elapsed = audio.context.currentTime - audio.startTime;
    return elapsed <= 0 ? 0 : elapsed % length;   // до старта новой сцены показываем начало
  }

  function startScene(scene, when, offset, fadeIn) {
    const ctx = audio.context;
    scene.layers.forEach(layer => {
      if (!layer.buffer) return;
      const source = ctx.createBufferSource();
      const gain = ctx.createGain();
      source.buffer = layer.buffer;
      source.loop = true;
      source.loopStart = padding;
      source.loopEnd = padding + layer.length;
      if (fadeIn) {
        gain.gain.setValueAtTime(0, when);
        gain.gain.linearRampToValueAtTime(1, when + CROSSFADE);
      }
      source.connect(gain); gain.connect(audio.buses[layer.role]);
      source.start(when, padding + offset % layer.length);
      source.onended = () => { try { source.disconnect(); gain.disconnect(); } catch (_) {} };
      layer.source = source; layer.gain = gain;
    });
  }
  function stopScene(scene, fadeOut) {
    const now = audio.context.currentTime;
    scene.layers.forEach(layer => {
      if (!layer.source) return;
      if (fadeOut) {
        layer.gain.gain.cancelScheduledValues(now);
        layer.gain.gain.setValueAtTime(layer.gain.gain.value, now);
        layer.gain.gain.linearRampToValueAtTime(0, now + CROSSFADE);
      }
      try { layer.source.stop(now + (fadeOut ? CROSSFADE + 0.02 : 0.12)); } catch (_) {}
      layer.source = null; layer.gain = null;
    });
  }

  async function play() {
    if (audio.playing || !active) return;
    const ctx = ensureContext();
    if (ctx.state !== 'running') await ctx.resume();
    await load();
    if (!active.layers.some(layer => layer.buffer)) throw new Error('no-audio');
    const when = ctx.currentTime + 0.08;
    audio.startTime = when - audio.offset;
    startScene(active, when, audio.offset, false);
    audio.playing = true;
    applyMix();
    smooth(audio.master.gain, 0.72, 0.03);
    emit();
  }

  function pause() {
    if (!audio.playing) return;
    audio.offset = phase();
    audio.playing = false;
    smooth(audio.master.gain, 0, 0.02);
    stopScene(active, false);
    emit();
  }

  function selectScene(n) {
    const next = scenes.find(scene => scene.n === n);
    if (!next || next === active) return;
    if (audio.playing) {
      stopScene(active, true);
      const when = audio.context.currentTime + 0.02;
      audio.startTime = when;
      startScene(next, when, 0, true);
    }
    audio.offset = 0;
    active = next;
    emit();
  }

  function level() {
    if (!audio.playing) return 0;
    audio.analyser.getFloatTimeDomainData(audio.waveData);
    let sum = 0;
    for (let i = 0; i < audio.waveData.length; i++) sum += audio.waveData[i] ** 2;
    return Math.sqrt(sum / audio.waveData.length);
  }

  // Лупы играют, пока открыт сайт: переключение вкладки или сворачивание окна их не останавливает.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && audio.playing && audio.context.state !== 'running') audio.context.resume().catch(() => {});
  });

  return {
    scenes,
    get active() { return active; },
    get loopLength() { return active ? active.length : 0; },
    get playing() { return audio.playing; },
    get anyConfigured() { return scenes.some(scene => scene.layers.length); },
    hasLayer(role) { return !!(active && active.layers.some(layer => layer.role === role)); },
    get beatSeconds() { return beatSeconds; },
    get beatsPerBar() { return beatsPerBar; },
    load, play, pause, phase, level, busGains, selectScene,
    setMix(values) { mix = { ...mix, ...values }; applyMix(); },
    onChange(fn) { listeners.add(fn); }
  };
})();
