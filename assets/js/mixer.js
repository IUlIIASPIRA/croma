'use strict';
/* CROMA mixer — Web Audio.

   Миксер работает парами. Пара N — модульный звук N и акустический звук N из media/миксер/.
   Внутри пары оба лупа стартуют в один момент AudioContext и крутятся синхронно,
   фейдеры и баланс меняют только громкость. У каждой пары своя длина лупа.
   Переключение на другую пару меняет набор целиком: старая пара уходит коротким
   кроссфейдом, новая начинается с начала.

   Бесшовность: AudioBufferSourceNode с loop = true; loopStart/loopEnd ставятся по
   точной длине лупа из сборки. Файл собран так: [хвост лупа 0.5 с][луп][начало лупа 0.5 с].
   Содержимое файла периодично, поэтому задержка кодека AAC сдвигает фазу, но не рвёт стык. */

window.CromaMixer = (function () {
  // Слоты и темп приходят из сборки media/ (tools/build.py → CROMA_MEDIA).
  const media = window.CROMA_MEDIA || { loop: { bpm: 120, beatsPerBar: 4, padding: 0.5 }, slots: [] };
  const barSeconds = media.loop.beatsPerBar * 60 / media.loop.bpm;
  const padding = media.loop.padding || 0;
  const CROSSFADE = 0.12;

  // Всегда 8 слотов: 4 модульных и 4 акустических. Пустые скрыты.
  const slots = [];
  ['modular', 'acoustic'].forEach(field => {
    for (let n = 1; n <= 4; n++) {
      const item = media.slots.find(s => s.field === field && s.n === n);
      const length = item ? (item.seconds || item.bars * barSeconds) : 0;
      slots.push({ field, n, index: slots.length, hidden: !item,
        name: item ? item.name : { en: '', ru: '' }, url: item ? item.src : '', data: item ? item.srcData : '',
        length, buffer: null, peaks: null, source: null, gain: null, failed: false });
    }
  });

  const pairs = [1, 2, 3, 4].map(n => {
    const modular = slots.find(s => s.field === 'modular' && s.n === n && !s.hidden) || null;
    const acoustic = slots.find(s => s.field === 'acoustic' && s.n === n && !s.hidden) || null;
    const length = Math.max(modular ? modular.length : 0, acoustic ? acoustic.length : 0);
    return { n, modular, acoustic, length };
  }).filter(pair => pair.modular || pair.acoustic);
  pairs.forEach(pair => {
    if (pair.modular && pair.acoustic && Math.abs(pair.modular.length - pair.acoustic.length) > 0.01) {
      console.warn(`CROMA: pair ${pair.n} loops have different lengths`, pair.modular.length, pair.acoustic.length);
    }
  });

  const audio = { context: null, master: null, buses: {}, analyser: null, waveData: null,
    playing: false, startTime: 0, offset: 0, loading: null };
  let active = pairs[0] || null;
  let mix = { blend: 50, modularVolume: 55, acousticVolume: 55 };
  const listeners = new Set();
  const emit = () => listeners.forEach(fn => fn());

  const pairSlots = pair => pair ? [pair.modular, pair.acoustic].filter(Boolean) : [];
  function hasAudio(index) { return !!(slots[index].url || slots[index].data); }
  function isReady(index) { return index >= 0 && !!slots[index].buffer; }

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
    audio.buses.modular = ctx.createGain(); audio.buses.acoustic = ctx.createGain();
    audio.analyser = ctx.createAnalyser(); audio.analyser.fftSize = 1024;
    audio.waveData = new Float32Array(audio.analyser.fftSize);
    audio.buses.modular.connect(audio.master); audio.buses.acoustic.connect(audio.master);
    audio.master.connect(audio.analyser); audio.analyser.connect(ctx.destination);
    ctx.addEventListener('statechange', () => { if (audio.playing && ctx.state === 'interrupted') pause(); });
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

  // Загружает все лупы. Повторный вызов возвращает ту же загрузку.
  function load() {
    if (audio.loading) return audio.loading;
    const ctx = ensureContext();
    audio.loading = Promise.all(slots.map(async slot => {
      if (!slot.url && !slot.data) return;
      try {
        let bytes;
        if (slot.data) bytes = base64ToArrayBuffer(slot.data);
        else {
          const response = await fetch(slot.url);
          if (!response.ok) throw new Error(String(response.status));
          bytes = await response.arrayBuffer();
        }
        const buffer = await decode(ctx, bytes);
        if (buffer.duration + 0.001 < padding + slot.length) throw new Error('too-short');
        slot.buffer = buffer; slot.peaks = calculatePeaks(buffer, slot.length);
      } catch (error) {
        slot.failed = true;
        console.warn('CROMA loop failed:', slot.url, error.message);
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
  function busGains() {
    const ratio = mix.blend / 100;
    return {
      modular: Math.cos(ratio * Math.PI / 2) * mix.modularVolume / 100,
      acoustic: Math.sin(ratio * Math.PI / 2) * mix.acousticVolume / 100
    };
  }
  function applyMix() {
    if (!audio.context) return;
    const gains = busGains();
    smooth(audio.buses.modular.gain, gains.modular);
    smooth(audio.buses.acoustic.gain, gains.acoustic);
  }

  function phase() {
    const length = active ? active.length : 0;
    if (!length) return 0;
    if (!audio.playing) return audio.offset % length;
    const elapsed = audio.context.currentTime - audio.startTime;
    return elapsed <= 0 ? 0 : elapsed % length;   // до старта новой пары показываем начало
  }

  function startPair(pair, when, offset, fadeIn) {
    const ctx = audio.context;
    pairSlots(pair).forEach(slot => {
      if (!slot.buffer) return;
      const source = ctx.createBufferSource();
      const gain = ctx.createGain();
      source.buffer = slot.buffer;
      source.loop = true;
      source.loopStart = padding;
      source.loopEnd = padding + slot.length;
      if (fadeIn) {
        gain.gain.setValueAtTime(0, when);
        gain.gain.linearRampToValueAtTime(1, when + CROSSFADE);
      }
      source.connect(gain); gain.connect(audio.buses[slot.field]);
      source.start(when, padding + offset % slot.length);
      source.onended = () => { try { source.disconnect(); gain.disconnect(); } catch (_) {} };
      slot.source = source; slot.gain = gain;
    });
  }
  function stopPair(pair, fadeOut) {
    const now = audio.context.currentTime;
    pairSlots(pair).forEach(slot => {
      if (!slot.source) return;
      if (fadeOut) {
        slot.gain.gain.cancelScheduledValues(now);
        slot.gain.gain.setValueAtTime(slot.gain.gain.value, now);
        slot.gain.gain.linearRampToValueAtTime(0, now + CROSSFADE);
      }
      try { slot.source.stop(now + (fadeOut ? CROSSFADE + 0.02 : 0.12)); } catch (_) {}
      slot.source = null; slot.gain = null;
    });
  }

  async function play() {
    if (audio.playing || !active) return;
    const ctx = ensureContext();
    if (ctx.state !== 'running') await ctx.resume();
    await load();
    if (!pairSlots(active).some(slot => slot.buffer)) throw new Error('no-audio');
    const when = ctx.currentTime + 0.08;
    audio.startTime = when - audio.offset;
    startPair(active, when, audio.offset, false);
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
    stopPair(active, false);
    emit();
  }

  // Смена пары: весь набор меняется, новая пара начинается с начала лупа.
  function selectPair(n) {
    const next = pairs.find(pair => pair.n === n);
    if (!next || next === active) return;
    if (audio.playing) {
      stopPair(active, true);
      const when = audio.context.currentTime + 0.02;
      audio.startTime = when;
      startPair(next, when, 0, true);
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

  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

  return {
    slots, pairs,
    get loopLength() { return active ? active.length : 0; },
    get playing() { return audio.playing; },
    get anyConfigured() { return slots.some(s => s.url || s.data); },
    get activePair() { return active ? active.n : 0; },
    // Выбранные звуки: индексы слотов активной пары, -1 — в этом поле у пары звука нет.
    get selection() {
      return { modular: active && active.modular ? active.modular.index : -1,
               acoustic: active && active.acoustic ? active.acoustic.index : -1 };
    },
    hasAudio, isReady, load, play, pause, phase, level, busGains,
    select(field, index) { selectPair(slots[index].n); },
    selectPair,
    setMix(values) { mix = { ...mix, ...values }; applyMix(); },
    onChange(fn) { listeners.add(fn); }
  };
})();
