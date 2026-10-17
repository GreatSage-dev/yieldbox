import os
import subprocess

ffmpeg = r"C:\Users\HP LAPTOP\AppData\Local\Programs\Python\Python312\Lib\site-packages\imageio_ffmpeg\binaries\ffmpeg-win-x86_64-v7.1.exe"
raw_video = r"C:\Users\HP LAPTOP\Videos\yieldbox.mp4"
work_dir = r"c:\Users\HP LAPTOP\Documents\paybox\scratch_build"
os.makedirs(work_dir, exist_ok=True)

# 1. Exact video cut segments matching ElevenLabs audio duration
# Intro: 3.0s
# Seg 1: raw 0.0s - 20.61s (GitHub README) -> audio seg1.mp3 (20.61s)
# Seg 2: raw 33.0s - 56.90s (BaseScan USDC) -> audio seg2.mp3 (23.90s)
# Seg 3: raw 72.0s - 97.73s (CMD npm run test:gates Test 1-6) -> audio seg3.mp3 (25.73s)
# Seg 4: raw 125.0s - 144.77s (CMD Test 6 Proposal & Test 15 Base RPC) -> audio seg4.mp3 (19.77s)
# Seg 5: raw 156.0s - 176.92s (CMD npm test double-build & MCP pass) -> audio seg5.mp3 (20.92s)

cuts = [
    {"id": "cut1", "start": 0.0, "dur": 20.61, "audio": r"c:\Users\HP LAPTOP\Documents\paybox\scratch_audio\seg1.mp3"},
    {"id": "cut2", "start": 33.0, "dur": 23.90, "audio": r"c:\Users\HP LAPTOP\Documents\paybox\scratch_audio\seg2.mp3"},
    {"id": "cut3", "start": 72.0, "dur": 25.73, "audio": r"c:\Users\HP LAPTOP\Documents\paybox\scratch_audio\seg3.mp3"},
    {"id": "cut4", "start": 125.0, "dur": 19.77, "audio": r"c:\Users\HP LAPTOP\Documents\paybox\scratch_audio\seg4.mp3"},
    {"id": "cut5", "start": 156.0, "dur": 20.92, "audio": r"c:\Users\HP LAPTOP\Documents\paybox\scratch_audio\seg5.mp3"},
]

part_files = []

# Prepare intro with 3s silent audio
intro_with_audio = os.path.join(work_dir, "intro_part.mp4")
intro_raw = r"c:\Users\HP LAPTOP\Documents\paybox\scratch_intro.mp4"
cmd_intro = [
    ffmpeg, "-y",
    "-i", intro_raw,
    "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000",
    "-c:v", "copy",
    "-c:a", "aac",
    "-shortest",
    intro_with_audio
]
subprocess.run(cmd_intro, check=True)
part_files.append(intro_with_audio)

for c in cuts:
    out_part = os.path.join(work_dir, f"{c['id']}.mp4")
    print(f"Cutting {c['id']}: start={c['start']}s, dur={c['dur']}s...")
    cmd = [
        ffmpeg, "-y",
        "-ss", str(c["start"]),
        "-i", raw_video,
        "-i", c["audio"],
        "-t", str(c["dur"]),
        "-map", "0:v:0",
        "-map", "1:a:0",
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-pix_fmt", "yuv420p",
        "-r", "30",
        "-c:a", "aac",
        "-b:a", "192k",
        "-shortest",
        out_part
    ]
    subprocess.run(cmd, check=True)
    part_files.append(out_part)

# Concat all parts
concat_list = os.path.join(work_dir, "concat.txt")
with open(concat_list, "w") as f:
    for p in part_files:
        f.write(f"file '{p.replace('\\', '/')}'\n")

merged_no_sub = os.path.join(work_dir, "merged_no_sub.mp4")
print("Merging all parts together...")
cmd_concat = [
    ffmpeg, "-y",
    "-f", "concat",
    "-safe", "0",
    "-i", concat_list,
    "-c", "copy",
    merged_no_sub
]
subprocess.run(cmd_concat, check=True)
print("Merged video without subtitles ready!")
