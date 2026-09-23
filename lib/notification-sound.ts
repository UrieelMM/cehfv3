let notificationAudioContext: AudioContext | null = null;

function audioContext() {
  if (typeof window === "undefined") return null;
  const AudioContextConstructor = window.AudioContext;
  if (!AudioContextConstructor) return null;
  if (!notificationAudioContext || notificationAudioContext.state === "closed") {
    notificationAudioContext = new AudioContextConstructor();
  }
  return notificationAudioContext;
}

export async function unlockNotificationSound() {
  const context = audioContext();
  if (context?.state === "suspended") {
    await context.resume().catch(() => undefined);
  }
}

export async function playNotificationSound() {
  const context = audioContext();
  if (!context) return;
  if (context.state === "suspended") {
    await context.resume().catch(() => undefined);
  }
  if (context.state !== "running") return;

  const start = context.currentTime + 0.015;
  const notes = [659.25, 783.99, 1046.5];
  notes.forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const noteStart = start + index * 0.105;
    const noteEnd = noteStart + 0.22;
    oscillator.type = index === notes.length - 1 ? "sine" : "triangle";
    oscillator.frequency.setValueAtTime(frequency, noteStart);
    gain.gain.setValueAtTime(0.0001, noteStart);
    gain.gain.exponentialRampToValueAtTime(index === 2 ? 0.075 : 0.052, noteStart + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, noteEnd);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(noteStart);
    oscillator.stop(noteEnd);
  });
}
