"""Original score: Between the Lines. Apache-2.0. No samples or imported music.
Optional authoring dependencies are the same as compose-event-horizon.py.
Six orchestration chapters share a melody and 120 BPM pulse; normal builds use
the checked-in MP3/score and require neither Python nor FFmpeg.
"""
from pathlib import Path
import hashlib
import json
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'artifacts/music-python'))
import numpy as np
from scipy import signal
from scipy.io import wavfile

RATE, BPM, LEAD, BARS = 44100, 120, 8, 96
LENGTH = 200
N = RATE * LENGTH
rng = np.random.default_rng(73190)
dry = np.zeros((N, 2), np.float32)
room = np.zeros_like(dry)
events = []


def filt(x, hz, kind='lowpass'):
    return signal.sosfilt(signal.butter(2, hz, kind, fs=RATE, output='sos'), x)


def add(data, beat, volume, pan=0, wet=.2):
    start = round(beat * RATE / 2)
    count = min(len(data), N - start)
    if count <= 0:
        return
    stereo = np.column_stack((data[:count] * np.sqrt((1-pan)/2), data[:count] * np.sqrt((1+pan)/2)))
    dry[start:start+count] += stereo * volume
    room[start:start+count] += stereo * volume * wet


def voice(note, duration, kind):
    t = np.arange(round((duration + .55) * RATE)) / RATE
    f = 440 * 2 ** ((note - 69) / 12)
    # Frequency deviation, not a phase amount proportional to pitch. Plucked and
    # bass voices stay stable; sustained voices gain a small delayed vibrato.
    depth = {'flute': .01, 'strings': .006, 'brass': .0035, 'pulse': .002}.get(kind, 0)
    phase = 2*np.pi*f*t + (depth*f/4.8)*np.sin(2*np.pi*4.8*t)*np.minimum(t/.3, 1)
    release = np.exp(-np.maximum(0, t-duration) * 9)
    if kind == 'wood':
        wave = np.sin(phase)*np.exp(-t*7) + .3*np.sin(phase*2.76)*np.exp(-t*25)
        env = np.minimum(1, t/.002)*release
    elif kind == 'harp':
        wave = sum(np.sin(phase*k)*np.exp(-t*(2+k*2))/k for k in range(1, 7))
        env = np.minimum(1, t/.004)*release
    elif kind == 'flute':
        wave = np.sin(phase) + .15*np.sin(phase*2) + .065*np.sin(phase*3)
        env = np.minimum(1, t/.055)*(.8+.2*np.exp(-t*5))*release
    elif kind == 'strings':
        wave = sum((np.sin(phase*k)+np.sin(phase*k*1.0028+.8))*.35/k**1.3 for k in range(1, 9))
        env = np.minimum(1, t/.28)*release
    elif kind == 'brass':
        wave = sum(np.sin(phase*k)*np.exp(-k/(2+3*np.exp(-t*4)))/k for k in range(1, 10))
        env = np.minimum(1, t/.04)*release
    elif kind == 'pulse':
        wave = np.sin(phase + 1.6*np.exp(-t*5)*np.sin(2*phase)) + .2*np.sin(phase*2.002)
        env = np.minimum(1, t/.01)*np.exp(-t*2.5)*release
    else:
        wave = np.sin(phase) + .25*np.sin(phase*2) + .13*np.sin(phase*3)
        env = np.minimum(1, t/.009)*np.exp(-t*.9)*release
    return (wave*env).astype(np.float32)


def drum(kind):
    t = np.arange(round(RATE * (1.4 if kind == 'cymbal' else .5))) / RATE
    noise = rng.normal(0, 1, len(t))
    if kind == 'kick':
        return (np.sin(2*np.pi*(47*t + 90*.023*(1-np.exp(-t/.023))))*np.exp(-t*10) + .03*filt(noise, 2500, 'highpass')*np.exp(-t*160)).astype(np.float32)
    if kind == 'tom':
        return (np.sin(2*np.pi*(112*t + 12*.025*(1-np.exp(-t/.025))))*np.exp(-t*15) + .11*filt(noise, 1400)*np.exp(-t*30)).astype(np.float32)
    if kind == 'snare':
        return (.35*filt(noise, 1500, 'highpass')*np.exp(-t*19) + .3*np.sin(2*np.pi*185*t)*np.exp(-t*27)).astype(np.float32)
    return (filt(noise, 6500, 'highpass')*np.exp(-t*(5 if kind == 'cymbal' else 65))*.2).astype(np.float32)


sounds = {k: drum(k) for k in ['kick', 'tom', 'snare', 'hat', 'cymbal']}
# D minor / Bb / F / C, then an answering G minor / Bb / A / D minor cadence.
chords = [[50,57,62,65],[46,53,58,62],[53,60,65,69],[48,55,60,64],
          [43,50,58,62],[46,53,58,65],[45,52,61,64],[50,57,62,65]]
motifs = [[74,77,81,79],[77,74,70,72],[77,81,84,81],[79,76,72,74],
          [74,77,79,82],[77,74,70,74],[73,76,81,79],[77,76,74,74]]
lead_voices = ['wood', 'flute', 'harp', 'brass', 'pulse', 'flute']
for bar in range(BARS):
    age, local = divmod(bar, 16)
    beat = LEAD + bar*4
    chord, motif = chords[local % 8], motifs[local % 8]
    quiet = local in [0, 8, 15]
    intensity = .72 if quiet else 1
    # Breathing spaces announce the page changes, followed by increasingly busy armies.
    offsets = [0, 1.5, 2.5] if age < 2 else [0, 1, 2, 3.5]
    if age >= 4 and local % 4 == 2:
        offsets = [0, .5, 1.5, 2, 2.5, 3.5]
    if local == 15:
        offsets = [0, 2]
    for i, offset in enumerate(offsets):
        note = motif[i % 4]
        length = .32 if age == 4 else .43
        add(voice(note, length, lead_voices[age]), beat+offset, .22*intensity, -.16 if i%2==0 else .16, .32)
        events.append([beat+offset, age, bar, i])
        if age == 5:
            add(voice(note-12, length, 'pulse'), beat+offset, .11, -.3, .25)
    for i, note in enumerate(chord[1:]):
        add(voice(note, 1.65, 'strings'), beat, .13 if age>0 else .055, [-.65,0,.65][i], .42)
    for offset in [0, 2]:
        add(voice(chord[0]-12 if age>=3 else chord[0], .7, 'bass'), beat+offset, .23, 0, .08)
    for step in range(8):
        if age == 0 and step%2:
            continue
        add(voice(chord[1+(step%3)] + (12 if age>=4 else 0), .12, 'pulse' if age>=4 else 'harp'), beat+step*.5, .075*intensity, .55*np.sin(step*2), .3)
        add(sounds['hat'], beat+step*.5, .24 if age>=3 else .1, .2, .05)
    for offset in ([0, 2] if age<4 else [0, 1, 2, 3]):
        add(sounds['kick'], beat+offset, .6 if age>=3 else .36, wet=.04)
    for offset in [1, 3]:
        add(sounds['tom' if age<2 else 'snare'], beat+offset, .65, -.08, .15)
    if local%4==3:
        for step in range(4):
            add(sounds['tom' if age<3 else 'snare'], beat+3+step*.25, .12+step*.055, (step-1.5)*.18, .17)
    if local%8==0:
        add(sounds['cymbal'], beat, .3, -.25, .4)

for i in range(8):
    add(voice([62,69,74,77][i%4], .35, 'harp'), i, .16, (i%2-.5)*.5, .4)
for note in [50,57,62,65,74]:
    add(voice(note, 2.4, 'strings'), 392, .14, (note-62)/32, .4)
for delay, gain in [(.087,.25),(.173,.23),(.293,.21),(.433,.18),(.617,.14),(.827,.1), (1.091,.065)]:
    shift = round(delay*RATE)
    dry[shift:] += room[:-shift, ::-1] * gain
dry = np.tanh(dry*1.3)
dry *= np.minimum(1, np.arange(N)/(.06*RATE))[:,None]
dry *= np.minimum(1, (N-1-np.arange(N))/(2.4*RATE))[:,None]
dry *= .93 / max(.001, float(np.max(np.abs(dry))))
audio = ROOT/'packages/ink-battle/audio'
audio.mkdir(parents=True, exist_ok=True)
temp = ROOT/'artifacts/ink-battle.wav'
temp.parent.mkdir(exist_ok=True)
wavfile.write(temp, RATE, (dry*32767).astype(np.int16))
output = audio/'between-the-lines.mp3'
subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(temp),'-codec:a','libmp3lame','-b:a','160k','-map_metadata','-1',str(output)],check=True)
# Compact actual RMS / band energy analysis for renderer adapters (120 Hz map clock).
mono = np.mean(dry, axis=1)
bands = [filt(mono, 180), filt(mono, [180,2400], 'bandpass'), filt(mono, 2400, 'highpass')]
frames = []
for n in range(LENGTH*10):
    start, end = int(n*RATE/10), int((n+1)*RATE/10)
    values = [float(np.sqrt(np.mean(x[start:end]**2))) for x in [mono,*bands]]
    frames.append([n*12,*values])
limits = np.percentile(np.array(frames)[:,1:], 96, axis=0)
for frame in frames:
    frame[1:] = [round(min(1,v/max(.0001,limit)),4) for v,limit in zip(frame[1:], limits)]
score = {'sha256':hashlib.sha256(output.read_bytes()).hexdigest(),'durationSeconds':LENGTH,
         'bpm':BPM,'leadBeats':LEAD,'durationBeats':400,'events':events,'frames':frames}
(ROOT/'packages/ink-battle/src/score.ts').write_text('// Generated by scripts/compose-ink-battle.py. Original music; Apache-2.0.\nexport const score = '+json.dumps(score,separators=(',',':'))+';\n')
print(json.dumps({'track':str(output),'sha256':score['sha256'],'seconds':LENGTH,'notes':len(events),'peak':float(np.max(np.abs(dry)))}))
