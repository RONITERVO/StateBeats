"""Render the original Event Horizon score. No samples, services or copyrighted audio.

Optional authoring dependencies: Python 3.14, numpy 2.4.6, scipy 1.18.1 and FFmpeg.
Normal builds use the checked-in MP3 and score; players never run this script.
From the repository root: python scripts/compose-event-horizon.py
Code: MIT. Composition, rendered audio and exported score: CC0-1.0.
"""
from pathlib import Path
import hashlib
import json
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "artifacts/music-python"))
import numpy as np
from scipy import signal
from scipy.io import wavfile

RATE, BPM, LEAD, BARS = 48000, 150, 8, 96
SPB = 60 / BPM
LENGTH = (LEAD + BARS * 4 + 8) * SPB
N = round(LENGTH * RATE)
rng = np.random.default_rng(20260924)
drums = np.zeros((N, 2), np.float32)
instruments = np.zeros_like(drums)
bass = np.zeros_like(drums)
send = np.zeros_like(drums)
fx = np.zeros_like(drums)
lead_events, kick_beats, snare_beats = [], [], []
sections = [
    (0, 8, "Ignition", "intro"), (8, 24, "Accretion", "verse"),
    (24, 40, "Event horizon", "drop"), (40, 48, "Weightless", "break"),
    (48, 56, "Escape velocity", "build"), (56, 72, "Binary stars", "drop"),
    (72, 88, "Supernova", "finale"), (88, 96, "Afterglow", "outro"),
]
freq = lambda note: 440 * 2 ** ((note - 69) / 12)


def filt(x, cutoff, kind="lowpass", order=2):
    return signal.sosfilt(signal.butter(order, cutoff, kind, fs=RATE, output="sos"), x).astype(np.float32)


def add(bus, data, beat, volume=1, pan=0, wet=0):
    start = round((LEAD + beat) * SPB * RATE)
    count = min(len(data), N - start)
    if start < 0 or count <= 0:
        return
    x = data[:count]
    if x.ndim == 1:
        x = np.column_stack((x * np.sqrt((1-pan)/2), x * np.sqrt((1+pan)/2)))
    bus[start:start+count] += x * volume
    if wet:
        send[start:start+count] += x * volume * wet


def synth(note, seconds, voice="pluck", bright=1):
    t = np.arange(round((seconds + 0.32) * RATE), dtype=np.float64) / RATE
    f = freq(note)
    release = np.exp(-np.maximum(0, t-seconds) * 18)
    if voice == "pad":
        attack = np.minimum(1, t / .32)
        stereo = []
        for side in [-1, 1]:
            wave = np.zeros(len(t))
            for detune in [-.006, .002, .007]:
                phase = 2*np.pi*f*(1+detune+side*.0014)*t
                wave += np.sin(phase) + .24*np.sin(phase*2) + .08*np.sin(phase*3)
            stereo.append(wave / 4 * attack * release)
        return np.column_stack(stereo).astype(np.float32)
    if voice == "bell":
        wave = np.sin(2*np.pi*f*t + 2.1*np.exp(-t*7)*np.sin(2*np.pi*f*2*t))
        wave += .22*np.sin(2*np.pi*f*3*t)*np.exp(-t*9)
        env = np.minimum(1, t/.004)*np.exp(-t*3)*release
    elif voice == "lead":
        stereo = []
        for side in [-1, 1]:
            wave = np.zeros(len(t))
            for j, detune in enumerate([-.008, -.003, .001, .006]):
                phase = 2*np.pi*f*(1+detune+side*.001)*t + j*.71
                for harmonic in range(1, 7):
                    wave += np.sin(phase*harmonic) / harmonic * np.exp(-harmonic/(2.5+bright*3))
            env = np.minimum(1, t/.009) * (.65+.35*np.exp(-t*9)) * release
            stereo.append(filt(wave/3.5, 3600+bright*1800)*env)
        return np.column_stack(stereo).astype(np.float32)
    elif voice == "bass":
        phase = 2*np.pi*f*t
        wave = np.sin(phase) + .3*np.sin(phase*2) + .14*np.sin(phase*3) + .08*np.sin(phase*5)
        env = np.minimum(1,t/.007) * np.exp(-t*.65) * np.exp(-np.maximum(0,t-seconds)*45)
        return (np.tanh(wave*1.5)*env*.8).astype(np.float32)
    else:
        phase = 2*np.pi*f*t
        wave = np.sin(phase)+.4*np.sin(phase*2)*np.exp(-t*12)+.18*np.sin(phase*3)*np.exp(-t*18)
        env = np.minimum(1, t/.003) * np.exp(-t*6) * release
    return (wave*env).astype(np.float32)


def percussion(kind):
    seconds = {"kick": .48, "snare": .3, "hat": .12, "open": .28, "crash": 1.8}[kind]
    t = np.arange(round(seconds*RATE))/RATE
    noise = rng.standard_normal(len(t))
    if kind == "kick":
        phase = 2*np.pi*(46*t + 95*.024*(1-np.exp(-t/.024)))
        wave = np.sin(phase)*np.exp(-t*10) + .055*filt(noise, 3800, "highpass")*np.exp(-t*160)
        return (np.tanh(wave*1.5)*.85*np.minimum(1,t/.001)).astype(np.float32)
    if kind == "snare":
        body = np.sin(2*np.pi*185*t)*np.exp(-t*25) + .35*np.sin(2*np.pi*330*t)*np.exp(-t*45)
        burst = np.exp(-t*20) + .5*np.exp(-np.maximum(0,t-.011)*50)*(t>=.011)
        return (body*.27 + filt(noise,[1500,12500],"bandpass")*burst*.36).astype(np.float32)
    cutoff = 7000 if kind != "crash" else 4500
    decay = {"hat": 60, "open": 16, "crash": 2.4}[kind]
    metallic = np.sin(2*np.pi*7133*t)*np.sin(2*np.pi*10331*t)
    return ((filt(noise,cutoff,"highpass")*.32 + metallic*.045)*np.exp(-t*decay)).astype(np.float32)


kit = {kind: percussion(kind) for kind in ["kick", "snare", "hat", "open", "crash"]}
roots = [38, 34, 41, 36]
chords = [[62,65,69,72,76], [58,62,65,69,72], [60,64,65,69,72], [60,62,67,71,74]]
hooks = [
    [(0,74,.65),(.75,77,.5),(1.5,81,.9),(2.5,79,.45),(3,77,.4),(3.5,76,.35)],
    [(0,74,.85),(1,72,.4),(1.5,69,.8),(2.5,72,.4),(3,74,.85)],
    [(0,77,.65),(.75,81,.5),(1.5,84,.85),(2.5,81,.4),(3,79,.4),(3.5,77,.35)],
    [(0,76,.8),(1,74,.4),(1.5,72,.8),(2.5,71,.4),(3,69,.85)],
]

for bar in range(BARS):
    section = next(s for s in sections if s[0] <= bar < s[1])
    kind, beat, chord_index = section[3], bar*4, (bar//2)%4
    root, chord = roots[chord_index], chords[chord_index]
    is_drop = kind in ["drop", "finale"]
    if bar % 8 == 0:
        print(f"Rendering bars {bar+1}–{bar+8}: {section[2]}", flush=True)
    if bar % 2 == 0:
        for i, note in enumerate(chord):
            add(instruments, synth(note, 8*SPB, "pad"), beat, .055 if is_drop else .078, wet=.22)
    if kind not in ["break"] and not (kind == "intro" and bar < 4) and not (kind == "outro" and bar >= 94):
        kicks = [0,1,2,3] if is_drop else [0,1.5,2.75] if kind == "verse" else [0,2]
        for at in kicks:
            add(drums, kit["kick"], beat+at, .95 if is_drop else .78)
            kick_beats.append(beat+at)
        snares = [1,3] if kind != "build" else list(np.arange(0,4,.25 if bar >= 54 else .5))
        for at in snares:
            vol = .55 if kind != "build" else .12+.33*(bar-48)/8
            add(drums, kit["snare"], beat+at, vol, wet=.055)
            snare_beats.append(beat+at)
        for i, at in enumerate(np.arange(0,4,.25 if kind == "finale" else .5)):
            hat = "open" if i%4 == 3 else "hat"
            add(drums, kit[hat], beat+at+(0.018 if i%2 else 0), .28 if i%2 else .17, .3*(-1 if i%2 else 1))
        if bar%8 == 7:
            for at in [3.25,3.5,3.75]:
                add(drums,kit["snare"],beat+at,.15+(at-3)*.23, .15)
    if bar in [8,24,40,56,72,88]:
        add(fx,kit["crash"],beat,.62,wet=.28)
    if kind not in ["intro", "break"] or bar >= 4 and kind == "intro":
        rhythm = [0,.75,1.5,2,2.75,3.5] if is_drop else [0,1.5,2.75]
        if kind == "outro" and bar >= 94:
            rhythm = [0]
        for i, at in enumerate(rhythm):
            pitch = root+(12 if i%6==5 else 0)
            add(bass,synth(pitch,.42*SPB,"bass"),beat+at,.35 if is_drop else .26)
    # A recurring eight-bar hook, answered an octave up in the second drop.
    if is_drop or kind in ["verse", "outro"]:
        pattern = hooks[(bar//2)%4]
        if bar%2:
            pattern = [(at, note+(12 if kind == "finale" and at in [.75,2.5] else 0), length) for at,note,length in pattern]
        if kind == "outro" and bar >= 94:
            pattern = [(0,74 if bar==94 else 62,3.5)]
        for at,note,length in pattern:
            voice = "lead" if is_drop else "pluck"
            add(instruments,synth(note,length*SPB,voice),beat+at,.2 if is_drop else .21,wet=.24)
            lead_events.append([beat+at,note,length])
    else:
        for i,at in enumerate([0,1.5,2.5,3.5] if kind=="break" else [0,.75,1.5,2.5,3.5]):
            note = chord[(bar+i)%len(chord)]+12
            add(instruments,synth(note,.7,"bell"),beat+at,.15 if kind=="break" else .12, (-1 if i%2 else 1)*.25,wet=.5)
            lead_events.append([beat+at,note,.7])
    # Quiet sixteenth-note arpeggios fill the stereo field without replacing the hook.
    if is_drop or kind == "build":
        for i in range(8):
            note = chord[(i+bar)%len(chord)]+12
            add(instruments,synth(note,.12,"pluck"),beat+i*.5,.055,.5*(-1 if i%2 else 1),wet=.38)

for endbar in [24,56,72]:
    seconds = 8*SPB
    t = np.arange(round(seconds*RATE))/RATE
    rise = (t/seconds)**2
    noise = filt(rng.standard_normal(len(t)), [1800,10000], "bandpass")
    wave = noise*rise*.16 + np.sin(2*np.pi*(110*t+180*t*t))*rise*.025
    add(fx,wave,endbar*4-8,1,wet=.25)
    add(fx,kit["crash"][::-1],endbar*4-len(kit["crash"])/RATE/SPB,.35)

print("Mixing sidechain, stereo delay and algorithmic room…", flush=True)
duck = np.ones(N,np.float32)
for beat in kick_beats:
    start = round((LEAD+beat)*SPB*RATE)
    t = np.arange(round(.3*RATE))/RATE
    curve = 1-.62*np.exp(-t/0.09)
    duck[start:start+len(t)] = np.minimum(duck[start:start+len(t)],curve)
instruments *= duck[:,None]
bass *= (.28+.72*duck[:,None])
wet = np.zeros_like(send)
for taps, gain in [(1,.38),(2,.2),(3,.1),(4,.055)]:
    delay = round(SPB*.75*taps*RATE)
    wet[delay:] += send[:-delay, ::-1 if taps%2 else 1]*gain
# A deterministic diffuse stereo impulse. Convolution happens offline, never on the headset.
for channel in range(2):
    t = np.arange(round(1.9*RATE))/RATE
    impulse = filt(rng.standard_normal(len(t)),[300,6500],"bandpass")*np.exp(-t*3.5)
    impulse[:round(.025*RATE)] = 0
    impulse /= np.sqrt(np.sum(impulse**2))*2.8
    wet[:,channel] += signal.oaconvolve(send[:,channel],impulse,mode="full")[:N].astype(np.float32)
mix = drums + instruments + bass + fx + wet*duck[:,None]
mix = signal.sosfilt(signal.butter(2,25,"highpass",fs=RATE,output="sos"),mix,axis=0).astype(np.float32)
mix = np.tanh(mix*.95)
fade = np.clip((LENGTH-np.arange(N)/RATE)/3.2,0,1)
mix *= fade[:,None]
mix *= .88/max(.001,float(np.max(np.abs(mix))))
out = ROOT / "packages/content/audio"
out.mkdir(parents=True,exist_ok=True)
work = ROOT / "artifacts/event-horizon"
work.mkdir(parents=True,exist_ok=True)
wav = work / "event-horizon-premaster.wav"
wavfile.write(wav,RATE,(mix*32767).astype(np.int16))
asset = out / "event-horizon.mp3"
subprocess.run(["ffmpeg","-v","error","-y","-i",str(wav),"-af",
                "loudnorm=I=-14:TP=-1.2:LRA=9,volume=-1dB","-ar",str(RATE),"-c:a","libmp3lame","-q:a","2",
                "-metadata","title=Event Horizon","-metadata","artist=StateBeats",
                "-metadata","copyright=CC0-1.0; original procedural composition",str(asset)],check=True)
# Analyse the distributed audio, so stage envelopes describe what visitors actually hear.
decoded = work / "event-horizon-decoded.wav"
subprocess.run(["ffmpeg","-v","error","-y","-i",str(asset),"-ar",str(RATE),"-ac","2",str(decoded)],check=True)
_, pcm = wavfile.read(decoded)
mono = pcm.astype(np.float32).mean(axis=1)/32768
window = np.hanning(4096)
bins = np.fft.rfftfreq(4096,1/RATE)
frames = []
previous = 0
for start in range(0,len(mono),RATE//20):
    chunk = np.zeros(4096)
    piece = mono[start:start+4096]
    chunk[:len(piece)] = piece
    power = np.abs(np.fft.rfft(chunk*window))**2
    rms = float(np.sqrt(np.mean(chunk**2)))
    bands = [float(np.sqrt(power[(bins>=lo)&(bins<hi)].sum())/1024) for lo,hi in [(30,200),(200,3000),(3000,16000)]]
    frames.append([round(start/RATE*120),rms,*bands,max(0,rms-previous)])
    previous = rms
array = np.asarray(frames)
for i in range(1,6):
    array[:,i] = np.clip(array[:,i]/max(.0001,np.percentile(array[:,i],97)),0,1)
packed = [[int(f[0]),*[round(float(v),4) for v in f[1:]]] for f in array]
score = dict(bpm=BPM,leadBeats=LEAD,bars=BARS,durationBeats=LEAD+BARS*4+8,
             durationSeconds=len(mono)/RATE,sha256=hashlib.sha256(asset.read_bytes()).hexdigest(),
             sections=[dict(bar=a,endBar=b,name=name,kind=kind) for a,b,name,kind in sections],
             melody=lead_events,kicks=kick_beats,snares=snare_beats,frames=packed)
(ROOT/"packages/content/src/event-horizon-score.ts").write_text(
    "// Generated by scripts/compose-event-horizon.py. Original score and audio: CC0-1.0.\n"
    "export const eventHorizonScore = "+json.dumps(score,separators=(",",":"))+";\n",encoding="utf-8")
(work/"mastering.json").write_text(json.dumps(dict(sampleRate=RATE,durationSeconds=len(mono)/RATE,
    bytes=asset.stat().st_size,sha256=score["sha256"],peak=float(np.max(np.abs(pcm.astype(float)))/32768),
    rms=float(np.sqrt(np.mean(mono**2))),melodyEvents=len(lead_events)),indent=2)+"\n")
print(f"Wrote {asset}: {len(mono)/RATE:.1f}s, {asset.stat().st_size/1e6:.2f} MB",flush=True)
