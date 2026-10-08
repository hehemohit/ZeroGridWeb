import urllib.request
import io
import wave
import struct

wav_io = io.BytesIO()
with wave.open(wav_io, 'wb') as wav_file:
    wav_file.setnchannels(1)
    wav_file.setsampwidth(2)
    wav_file.setframerate(16000)
    for _ in range(16000):
        wav_file.writeframes(struct.pack('<h', 0))
wav_data = wav_io.getvalue()

boundary = '----Boundary123'
body = (
    b'--' + boundary.encode() + b'\r\n' +
    b'Content-Disposition: form-data; name="file"; filename="recording.wav"\r\n' +
    b'Content-Type: audio/wav\r\n\r\n' +
    wav_data +
    b'\r\n--' + boundary.encode() + b'--\r\n'
)

req = urllib.request.Request(
    'http://localhost:3000/api/voice-chat',
    data=body,
    headers={'Content-Type': 'multipart/form-data; boundary=' + boundary},
    method='POST'
)

try:
    with urllib.request.urlopen(req) as resp:
        print('Status:', resp.status)
        print('Body:', resp.read().decode())
except urllib.error.HTTPError as e:
    print('Failed:', e.code, e.read().decode())
