import { NextRequest, NextResponse } from 'next/server';

const AWS_VOICE_AGENT_ENDPOINT = process.env.NEXT_PUBLIC_VOICE_AGENT_URL || '';

const GROQ_API_KEY = process.env.GROQ_API_KEY || '';

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get('content-type') || '';

    // Case 1: Audio file upload (via MediaRecorder) for high-accuracy Whisper transcription
    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const audioFile = formData.get('file') as Blob | null;

      if (!audioFile) {
        return NextResponse.json({ error: 'No audio file provided' }, { status: 400 });
      }

      // 1. Transcribe audio with Groq Whisper Large V3 Turbo
      const whisperFormData = new FormData();
      whisperFormData.append('file', audioFile, 'recording.webm');
      whisperFormData.append('model', 'whisper-large-v3-turbo');
      whisperFormData.append('temperature', '0');
      whisperFormData.append(
        'prompt',
        'ZeroGrid emergency disaster dispatch: waterlogging depth, flood ward, evacuation rescue, dewatering pump.'
      );

      const whisperRes = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${GROQ_API_KEY}`,
        },
        body: whisperFormData,
      });

      if (!whisperRes.ok) {
        const err = await whisperRes.text();
        console.error('Whisper transcription failed:', err);
        return NextResponse.json(
          { error: 'Audio transcription failed', details: err },
          { status: 500 }
        );
      }

      const whisperData = await whisperRes.json();
      const rawTranscript = whisperData.text?.trim() || '';

      // Whisper known silence hallucinations filter
      const silenceHallucinations = [
        'thank you',
        'thank you.',
        'thank you!',
        'thank you very much.',
        'thank you for watching',
        'thank you for watching.',
        'thanks for watching.',
        'you',
        'bye.',
        'bye'
      ];

      const normalized = rawTranscript.toLowerCase().replace(/[.!?,]/g, '').trim();
      const isSilence = !rawTranscript || silenceHallucinations.includes(rawTranscript.toLowerCase().trim()) || normalized === 'thank you';

      if (isSilence) {
        return NextResponse.json({
          transcript: '',
          reply: 'I detected silence or very low microphone input. Please ensure your microphone is unmuted and speak clearly.',
        });
      }

      const transcript = rawTranscript;

      // 2. Pass transcript to AWS Lambda Microservice
      const lambdaRes = await fetch(AWS_VOICE_AGENT_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ transcript }),
      });

      const lambdaData = await lambdaRes.json();
      return NextResponse.json({
        transcript,
        reply: lambdaData.reply || 'Voice agent replied with empty text.',
      });
    }

    // Case 2: Standard text transcript JSON
    const body = await req.json();

    const response = await fetch(AWS_VOICE_AGENT_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text();
      return NextResponse.json(
        { error: `Microservice error: ${response.statusText}`, details: errText },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Proxy to Voice Agent failed:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to communicate with Voice Agent microservice' },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const response = await fetch(AWS_VOICE_AGENT_ENDPOINT, {
      method: 'GET',
    });
    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json(
      { status: 'offline', error: error?.message },
      { status: 500 }
    );
  }
}
