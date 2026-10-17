import os
import json
import urllib.request

API_KEY = "sk_b88c31298e127ba997269569b41c9bce4566bde856ca23e5"
# Voice ID for Adam (deep, soothing, clear narrative voice)
VOICE_ID = "pNInz6obpgDQGcFmaJgB"

segments = [
    {
        "id": "seg1",
        "name": "Intro & Depleting Wallet Trap",
        "text": "Every autonomous AI agent built today has an expiration date. You fund its hot wallet with two hundred dollars; it hits a recursive loop or queries expensive x402 API calls; the balance drains to zero; the agent dies. Funding agents with consumable balances is broken."
    },
    {
        "id": "seg2",
        "name": "The Endowment Model & Base USDC",
        "text": "We built YieldBox—the first perpetual endowment vault for PayBox agents. Instead of giving the agent your savings, your principal is locked in PayBox MoonX MPC behind a passkey. The vault generates a 5.10 percent APY work allowance anchored to Short-Term US Treasuries, spending only what it earns in native Base USDC."
    },
    {
        "id": "seg3",
        "name": "Adversarial Gate Halt (0ms)",
        "text": "Watch what happens when the agent tries to overspend. Here, the vault holds five dollars in accrued yield. The agent requests a ten dollar x402 query. Instantly—in zero milliseconds—Gate 1 trips: REJECT GATE 1: YIELD BUDGET EXCEEDED. The principal is 100 percent untouched. No model hallucination can bypass this."
    },
    {
        "id": "seg4",
        "name": "Canonical Proposal & Live Base RPC",
        "text": "When the agent requests a valid five-cent micro-service, all gates clear and construct the canonical PayBox x402 proposal on Base. Notice Test 15: the test suite connects live to Base Mainnet, queries block height, and verifies on-chain Base USDC precision."
    },
    {
        "id": "seg5",
        "name": "Conformance & Outro",
        "text": "Double-build byte determinism: passed. Official PayBox MCP protocol conformance: passed. 15 adversarial assertions: clean. YieldBox turns any PayBox agent into a self-funding worker that can never drain your savings. Built for MoonPay Hackathons Chapter 1."
    }
]

out_dir = r"c:\Users\HP LAPTOP\Documents\paybox\scratch_audio"
os.makedirs(out_dir, exist_ok=True)

url = f"https://api.elevenlabs.io/v1/text-to-speech/{VOICE_ID}"

for seg in segments:
    out_file = os.path.join(out_dir, f"{seg['id']}.mp3")
    print(f"Generating {seg['name']}...")
    payload = json.dumps({
        "text": seg["text"],
        "model_id": "eleven_multilingual_v2",
        "voice_settings": {
            "stability": 0.5,
            "similarity_boost": 0.8,
            "style": 0.2,
            "use_speaker_boost": True
        }
    }).encode("utf-8")
    
    req = urllib.request.Request(
        url,
        data=payload,
        headers={
            "xi-api-key": API_KEY,
            "Content-Type": "application/json",
            "Accept": "audio/mpeg"
        }
    )
    
    with urllib.request.urlopen(req) as resp:
        audio_data = resp.read()
        with open(out_file, "wb") as f:
            f.write(audio_data)
    print(f"Saved {out_file} ({len(audio_data)} bytes)")

print("All voiceover segments generated successfully!")
