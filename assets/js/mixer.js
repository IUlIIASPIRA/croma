'use strict';
/* CROMA mixer — Web Audio.
   Все лупы крутятся одновременно на одной временной оси AudioContext.
   Выбор источника меняет только громкость, музыка не перезапускается.

   Бесшовность: AudioBufferSourceNode с loop = true, а границы loopStart/loopEnd
   считаются из темпа и тактов, а не из длины файла. Файл собран так:
   [хвост лупа padding с] [луп] [начало лупа padding с]. Содержимое файла периодично,
   поэтому задержка кодека (десятки мс тишины в начале AAC/MP3) сдвигает фазу,
   но не рвёт стык. У всех файлов один кодировщик и одна задержка — лупы остаются
   синхронными между собой. */

window.CromaMixer = (function () {
  // Слоты и темп приходят из сборки media/ (tools/build.py → CROMA_MEDIA).
  const media = window.CROMA_MEDIA || { loop: { bpm: 120, beatsPerBar: 4, padding: 0.5 }, slots: [] };
  const barSeconds = media.loop.beatsPerBar * 60 / media.loop.bpm;
  const padding = media.loop.padding || 0;

  // Всегда 8 слотов: 4 модульных и 4 акустических. Пустые скрыты.
  const slots = [];
  ['modular', 'acoustic'].forEach(field => {
    for (let n = 1; n <= 4; n++) {
      const item = media.slots.find(s => s.field === field && s.n === n);
      const bars = item ? item.bars : 8;
      slots.push({ field, n, index: slots.length, hidden: !item,
        name: item ? item.name : { en: '', ru: '' }, url: item ? item.src : '', data: item ? item.srcData : '',
        bars, length: bars * barSeconds, buffer: null, peaks: null, source: null, gain: null, failed: false });
    }
  });
  // Общий круг — самый длинный из подключённых лупов. Короткие лупы должны делить его нацело.
  const configured = slots.filter(s => s.url || s.data);
  const loopLength = Math.max(...(configured.length ? configured : slots).map(s => s.length));
  configured.forEach(s => {
    const ratio = loopLength / s.length;
    if (Math.abs(ratio - Math.round(ratio)) > 1e-6) console.warn(`CROMA: ${s.bars} bars do not divide the ${loopLength / barSeconds}-bar cycle`, s.url);
  });
  const audio = { context: null, master: null, buses: {}, analyser: null, waveData: null,
    playing: false, startTime: 0, offset: 0, loading: null };
  const listeners = new Set();
  const emit = () => listeners.forEach(fn => fn());

  function hasAudio(index) { return !!(slots[index].url || slots[index].data); }

  // В одном HTML-файле звук встроен в base64: на file:// fetch запрещён.
  function base64ToArrayBuffer(text) {
    const binary = atob(text), bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  }
  function isReady(index) { return !!slots[index].buffer; }

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
    // Волна рисуется на весь общий круг: короткий луп повторяется.
    const own = Math.round(seconds * buffer.sampleRate);
    const length = Math.round(loopLength * buffer.sampleRate);
    for (let i = 0; i < count; i++) {
      const begin = first + Math.floor(i * length / count), end = first + Math.floor((i + 1) * length / count);
      let peak = 0;
      for (let j = begin; j < end; j += 12) peak = Math.max(peak, Math.abs(data[first + (j - first) % own]));
      peaks[i] = peak;
    }
    return peaks;
  }

  // Загружает все лупы из конфигурации. Повторный вызов возвращает ту же загрузку.
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

  const firstVisible = field => (slots.find(s => s.field === field && !s.hidden) || slots.find(s => s.field === field)).index;
  let selection = { modular: firstVisible('modular'), acoustic: firstVisible('acoustic') };
  let mix = { blend: 50, modularVolume: 55, acousticVolume: 55 };

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
    slots.forEach(slot => {
      if (slot.gain) smooth(slot.gain.gain, selection[slot.field] === slot.index ? 1 : 0, 0.03);
    });
  }
  function phase() {
    if (!audio.playing) return audio.offset;
    return ((audio.context.currentTime - audio.startTime) % loopLength + loopLength) % loopLength;
  }
  function startSource(slot, when, offset) {
    const ctx = audio.context;
    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    source.buffer = slot.buffer;
    source.loop = true;
    source.loopStart = padding;
    source.loopEnd = padding + slot.length;
    gain.gain.value = selection[slot.field] === slot.index ? 1 : 0;
    source.connect(gain); gain.connect(audio.buses[slot.field]);
    source.start(when, padding + offset % slot.length);
    source.onended = () => { try { source.disconnect(); gain.disconnect(); } catch (_) {} };
    slot.source = source; slot.gain = gain;
  }

  async function play() {
    if (audio.playing) return;
    const ctx = ensureContext();
    if (ctx.state !== 'running') await ctx.resume();
    await load();
    if (!isReady(selection.modular) && !isReady(selection.acoustic)) throw new Error('no-audio');
    // Один момент старта для всех лупов — поэтому они совпадают до сэмпла.
    const when = ctx.currentTime + 0.08;
    audio.startTime = when - audio.offset;
    slots.forEach(slot => { if (slot.buffer) startSource(slot, when, audio.offset); });
    audio.playing = true;
    applyMix();
    smooth(audio.master.gain, 0.72, 0.03);
    emit();
  }

  function pause() {
    if (!audio.playing) return;
    audio.offset = phase();
    audio.playing = false;
    const end = audio.context.currentTime + 0.12;
    smooth(audio.master.gain, 0, 0.02);
    slots.forEach(slot => {
      if (slot.source) { try { slot.source.stop(end); } catch (_) {} }
      slot.source = null; slot.gain = null;
    });
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
    slots, loopLength,
    get playing() { return audio.playing; },
    get anyConfigured() { return slots.some(s => s.url || s.data); },
    hasAudio, isReady, load, play, pause, phase, level, busGains,
    select(field, index) { selection[field] = index; applyMix(); emit(); },
    get selection() { return selection; },
    setMix(values) { mix = { ...mix, ...values }; applyMix(); },
    onChange(fn) { listeners.add(fn); }
  };
})();
