let audioCtx: AudioContext | null = null

function ensureCtx() {
  if (audioCtx) return audioCtx
  const Ctx = window.AudioContext || (window as any).webkitAudioContext
  audioCtx = new Ctx()
  return audioCtx!
}

async function resumeCtx() {
  try {
    const ctx = ensureCtx()
    if (ctx.state === "suspended") {
      await ctx.resume()
    }
  } catch {
    // ignore
  }
}

function beep(freq: number, durationMs: number, type: OscillatorType = "sine", volume = 0.2) {
  const ctx = ensureCtx()
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = type
  osc.frequency.value = freq
  gain.gain.value = volume

  osc.connect(gain)
  gain.connect(ctx.destination)

  osc.start()
  setTimeout(() => {
    osc.stop()
    osc.disconnect()
    gain.disconnect()
  }, durationMs)
}

function sequence(steps: Array<{ f: number; d: number; gap?: number; type?: OscillatorType; v?: number }>) {
  let total = 0
  for (const s of steps) {
    setTimeout(() => beep(s.f, s.d, s.type ?? "sine", s.v ?? 0.2), total)
    total += s.d + (s.gap ?? 60)
  }
}

export async function playSound(kind: "error" | "message" | "agendamento" | "followup" | "victory") {
  await resumeCtx()
  switch (kind) {
    case "error":
      sequence([
        { f: 420, d: 120, type: "square", v: 0.25 },
        { f: 380, d: 120, type: "square", v: 0.25 },
        { f: 340, d: 160, type: "square", v: 0.25 },
      ])
      break
    case "message":
      sequence([{ f: 780, d: 120, type: "sine", v: 0.2 }])
      break
    case "agendamento":
      sequence([
        { f: 520, d: 110, type: "triangle", v: 0.22 },
        { f: 680, d: 130, type: "triangle", v: 0.22 },
      ])
      break
    case "followup":
      sequence([
        { f: 900, d: 70, type: "sawtooth", v: 0.18 },
        { f: 1000, d: 70, type: "sawtooth", v: 0.18 },
        { f: 1100, d: 90, type: "sawtooth", v: 0.18 },
      ])
      break
    case "victory":
      // motivo de vitória: arpejo ascendente alegre
      sequence([
        { f: 660, d: 100, type: "triangle", v: 0.22 },
        { f: 880, d: 120, type: "triangle", v: 0.22 },
        { f: 990, d: 140, type: "triangle", v: 0.22 },
      ])
      break
  }
}

export function initAudioOnUserGesture() {
  const handler = async () => {
    await resumeCtx()
    window.removeEventListener("pointerdown", handler)
    window.removeEventListener("keydown", handler)
  }
  window.addEventListener("pointerdown", handler, { once: true })
  window.addEventListener("keydown", handler, { once: true })
}
