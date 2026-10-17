import os
import math
import subprocess
from PIL import Image, ImageDraw, ImageFont

ffmpeg = r"C:\Users\HP LAPTOP\AppData\Local\Programs\Python\Python312\Lib\site-packages\imageio_ffmpeg\binaries\ffmpeg-win-x86_64-v7.1.exe"
intro_frames_dir = r"c:\Users\HP LAPTOP\Documents\paybox\scratch_intro_frames"
os.makedirs(intro_frames_dir, exist_ok=True)

width, height = 1360, 720
fps = 30
duration = 3.0
total_frames = int(fps * duration)

# Try to find standard Windows fonts
font_title = None
font_sub = None
font_tag = None
font_paths = [
    r"C:\Windows\Fonts\segoeuib.ttf",
    r"C:\Windows\Fonts\arialbd.ttf",
    r"C:\Windows\Fonts\calibrib.ttf",
]
for p in font_paths:
    if os.path.exists(p):
        try:
            font_title = ImageFont.truetype(p, 64)
            font_sub = ImageFont.truetype(p, 28)
            font_tag = ImageFont.truetype(p, 20)
            break
        except:
            pass

if not font_title:
    font_title = ImageFont.load_default()
    font_sub = ImageFont.load_default()
    font_tag = ImageFont.load_default()

print(f"Rendering {total_frames} intro frames at {width}x{height}...")

for f in range(total_frames):
    t = f / total_frames # 0.0 to 1.0
    
    # Create base dark gradient
    im = Image.new("RGB", (width, height), (11, 14, 20))
    draw = ImageDraw.Draw(im)
    
    # Subtle ambient gradient / glow in center
    glow_radius = int(250 + 50 * math.sin(t * math.pi))
    alpha = min(1.0, t * 2.5) if t < 0.8 else max(0.0, (1.0 - t) * 5.0)
    
    # Glowing line / badge at top
    badge_text = "MOONPAY HACKATHONS · CHAPTER 1"
    draw.rounded_rectangle([(width//2 - 220, 160), (width//2 + 220, 200)], radius=20, fill=(20, 30, 48), outline=(0, 120, 255), width=1)
    draw.text((width//2, 180), badge_text, fill=(80, 180, 255), font=font_tag, anchor="mm")
    
    # Title with subtle scale/glow
    title = "⚡ YIELD-BOX"
    draw.text((width//2, 290), title, fill=(255, 255, 255), font=font_title, anchor="mm")
    
    # Subtitle
    sub1 = "The Autonomous Perpetual Endowment Vault for PayBox Agents"
    draw.text((width//2, 380), sub1, fill=(200, 210, 230), font=font_sub, anchor="mm")
    
    # Tagline
    tagline = "Locked Principal in MoonX MPC · 5.10% Streaming Yield · Zero Model in Path"
    draw.text((width//2, 440), tagline, fill=(130, 145, 170), font=font_tag, anchor="mm")
    
    # Save frame
    frame_path = os.path.join(intro_frames_dir, f"frame_{f:04d}.png")
    im.save(frame_path)

out_intro = r"c:\Users\HP LAPTOP\Documents\paybox\scratch_intro.mp4"
cmd = [
    ffmpeg, "-y",
    "-framerate", str(fps),
    "-i", os.path.join(intro_frames_dir, "frame_%04d.png"),
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    "-r", str(fps),
    out_intro
]
subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
print(f"Rendered {out_intro} successfully!")
