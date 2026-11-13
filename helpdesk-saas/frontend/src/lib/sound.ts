// Sons sintetizados via Web Audio — sem arquivo externo pra carregar/versionar.
// Quando o back-end real disparar eventos de fila/mensagem, é só chamar essas
// mesmas funções a partir do handler do evento.

let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new AudioContext();
  }
  if (audioContext.state === 'suspended') {
    audioContext.resume();
  }
  return audioContext;
}

function playTone(ctx: AudioContext, frequency: number, startTime: number, duration: number, peakVolume: number) {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();

  oscillator.type = 'sine';
  oscillator.frequency.value = frequency;

  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(peakVolume, startTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start(startTime);
  oscillator.stop(startTime + duration);
}

// Duas notas ascendentes — som de alerta, pra chamar atenção pra fila.
export function playQueueSound(volumePercent: number) {
  if (volumePercent <= 0) return;
  const ctx = getAudioContext();
  const peakVolume = (volumePercent / 100) * 0.3;
  const now = ctx.currentTime;
  playTone(ctx, 660, now, 0.18, peakVolume);
  playTone(ctx, 880, now + 0.14, 0.22, peakVolume);
}

// Um pop curto — som discreto de notificação de mensagem.
export function playMessageSound(volumePercent: number) {
  if (volumePercent <= 0) return;
  const ctx = getAudioContext();
  const peakVolume = (volumePercent / 100) * 0.25;
  const now = ctx.currentTime;
  playTone(ctx, 520, now, 0.12, peakVolume);
}
