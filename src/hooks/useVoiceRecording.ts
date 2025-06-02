import { useState, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export interface VoiceRecordingState {
  isRecording: boolean;
  isTranscribing: boolean;
  audioLevel: number;
  error: string | null;
}

export interface VoiceRecordingActions {
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<string | null>;
  cancelRecording: () => void;
}

export function useVoiceRecording(): VoiceRecordingState & VoiceRecordingActions {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Setup audio level monitoring
  const setupAudioLevelMonitoring = useCallback((stream: MediaStream) => {
    try {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      analyserRef.current = audioContextRef.current.createAnalyser();
      
      analyserRef.current.fftSize = 256;
      source.connect(analyserRef.current);

      const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);

      const updateAudioLevel = () => {
        if (analyserRef.current && isRecording) {
          analyserRef.current.getByteFrequencyData(dataArray);
          const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
          setAudioLevel(average);
          animationFrameRef.current = requestAnimationFrame(updateAudioLevel);
        }
      };

      updateAudioLevel();
    } catch (err) {
      console.warn('Audio level monitoring not available:', err);
    }
  }, [isRecording]);

  const startRecording = useCallback(async () => {
    try {
      setError(null);
      
      // Request microphone permission
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000, // Optimal for Whisper
        } 
      });

      streamRef.current = stream;
      audioChunksRef.current = [];

      // Setup audio level monitoring
      setupAudioLevelMonitoring(stream);

      // Create MediaRecorder
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus', // Preferred format for Whisper
      });

      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.start(100); // Collect data every 100ms
      setIsRecording(true);

    } catch (err: any) {
      const errorMessage = err.name === 'NotAllowedError' 
        ? 'Microphone access denied. Please allow microphone access and try again.'
        : 'Failed to start recording. Please check your microphone and try again.';
      
      setError(errorMessage);
      console.error('Error starting recording:', err);
    }
  }, [setupAudioLevelMonitoring]);

  const stopRecording = useCallback(async (): Promise<string | null> => {
    return new Promise((resolve) => {
      if (!mediaRecorderRef.current || !isRecording) {
        resolve(null);
        return;
      }

      mediaRecorderRef.current.onstop = async () => {
        try {
          setIsRecording(false);
          setIsTranscribing(true);
          setAudioLevel(0);

          // Clean up audio monitoring
          if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
          }
          if (audioContextRef.current) {
            audioContextRef.current.close();
            audioContextRef.current = null;
          }

          // Stop all tracks
          if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
          }

          // Create audio blob
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          
          if (audioBlob.size === 0) {
            throw new Error('No audio data recorded');
          }

          // Convert to format suitable for Whisper (if needed)
          const audioFile = new File([audioBlob], 'recording.webm', { type: 'audio/webm' });

          // Create FormData for the API call
          const formData = new FormData();
          formData.append('file', audioFile);
          formData.append('model', 'whisper-1');

          // Call the Supabase Edge Function for transcription
          const { data, error } = await supabase.functions.invoke('whisper-transcribe', {
            body: formData,
          });

          if (error) {
            throw new Error(error.message);
          }

          const transcription = data?.text;
          if (!transcription || transcription.trim() === '') {
            throw new Error('No speech detected in the recording');
          }

          setIsTranscribing(false);
          resolve(transcription.trim());

        } catch (err: any) {
          console.error('Error processing recording:', err);
          setError(err.message || 'Failed to process recording');
          setIsTranscribing(false);
          resolve(null);
        }
      };

      mediaRecorderRef.current.stop();
    });
  }, [isRecording]);

  const cancelRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
    }

    // Clean up
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    setIsRecording(false);
    setIsTranscribing(false);
    setAudioLevel(0);
    setError(null);
    audioChunksRef.current = [];
  }, [isRecording]);

  return {
    isRecording,
    isTranscribing,
    audioLevel,
    error,
    startRecording,
    stopRecording,
    cancelRecording,
  };
} 