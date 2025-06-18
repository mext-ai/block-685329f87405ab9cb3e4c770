import React, { useRef, useEffect, useState, useCallback } from 'react';

interface BlockProps {
  title?: string;
  description?: string;
}

const Block: React.FC<BlockProps> = ({ 
  title = "Interactive Soundwave Generator", 
  description = "Draw a waveform and hear it come to life!"
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const oscillatorRef = useRef<OscillatorNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [waveformData, setWaveformData] = useState<number[]>([]);
  const [frequency, setFrequency] = useState(440);
  const [volume, setVolume] = useState(0.3);

  // Initialize audio context
  const initAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return audioContextRef.current;
  }, []);

  // Convert canvas drawing to waveform data
  const canvasToWaveform = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return [];

    const ctx = canvas.getContext('2d');
    if (!ctx) return [];

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    const waveform: number[] = [];

    // Sample the waveform by checking each column for drawn pixels
    for (let x = 0; x < canvas.width; x += 2) { // Sample every 2 pixels for performance
      let sum = 0;
      let count = 0;
      
      for (let y = 0; y < canvas.height; y++) {
        const index = (y * canvas.width + x) * 4;
        const alpha = data[index + 3];
        
        if (alpha > 0) { // If pixel is drawn
          // Convert y position to amplitude (-1 to 1)
          const amplitude = (canvas.height / 2 - y) / (canvas.height / 2);
          sum += amplitude;
          count++;
        }
      }
      
      if (count > 0) {
        waveform.push(sum / count);
      } else {
        waveform.push(0);
      }
    }

    return waveform;
  }, []);

  // Play the drawn waveform
  const playWaveform = useCallback(() => {
    const audioContext = initAudioContext();
    if (!audioContext || waveformData.length === 0) return;

    // Resume audio context if suspended
    if (audioContext.state === 'suspended') {
      audioContext.resume();
    }

    // Stop any existing audio
    if (oscillatorRef.current) {
      oscillatorRef.current.stop();
    }

    // Create audio buffer from waveform data
    const sampleRate = audioContext.sampleRate;
    const duration = 2; // 2 seconds
    const frameCount = sampleRate * duration;
    const audioBuffer = audioContext.createBuffer(1, frameCount, sampleRate);
    const channelData = audioBuffer.getChannelData(0);

    // Fill buffer with waveform data
    for (let i = 0; i < frameCount; i++) {
      const waveformIndex = Math.floor((i / frameCount) * waveformData.length);
      const amplitude = waveformData[waveformIndex] || 0;
      
      // Apply frequency modulation
      const t = i / sampleRate;
      channelData[i] = amplitude * Math.sin(2 * Math.PI * frequency * t) * 0.5;
    }

    // Create and connect audio nodes
    const source = audioContext.createBufferSource();
    const gainNode = audioContext.createGain();
    
    source.buffer = audioBuffer;
    source.connect(gainNode);
    gainNode.connect(audioContext.destination);
    gainNode.gain.value = volume;

    // Play the sound
    source.start();
    setIsPlaying(true);

    // Stop playing after duration
    source.onended = () => {
      setIsPlaying(false);
    };

    oscillatorRef.current = source as any;
    gainNodeRef.current = gainNode;
  }, [waveformData, frequency, volume, initAudioContext]);

  // Canvas drawing handlers
  const startDrawing = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDrawing(true);
    draw(e);
  }, []);

  const draw = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing && e.type !== 'mousedown') return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#00ff88';
    ctx.globalCompositeOperation = 'source-over';

    if (e.type === 'mousedown') {
      ctx.beginPath();
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
      ctx.stroke();
    }
  }, [isDrawing]);

  const stopDrawing = useCallback(() => {
    setIsDrawing(false);
    // Update waveform data when drawing stops
    const newWaveformData = canvasToWaveform();
    setWaveformData(newWaveformData);
  }, [canvasToWaveform]);

  // Clear canvas
  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setWaveformData([]);
    
    // Stop any playing audio
    if (oscillatorRef.current) {
      try {
        oscillatorRef.current.stop();
      } catch (e) {
        // Ignore if already stopped
      }
      setIsPlaying(false);
    }
  }, []);

  // Draw grid on canvas
  const drawGrid = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.3;

    // Horizontal center line
    ctx.beginPath();
    ctx.moveTo(0, canvas.height / 2);
    ctx.lineTo(canvas.width, canvas.height / 2);
    ctx.stroke();

    // Vertical grid lines
    for (let x = 0; x <= canvas.width; x += 50) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }

    // Horizontal grid lines
    for (let y = 0; y <= canvas.height; y += 25) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    ctx.globalAlpha = 1;
  }, []);

  // Initialize canvas
  useEffect(() => {
    drawGrid();
  }, [drawGrid]);

  // Send completion event on first interaction
  useEffect(() => {
    const handleFirstInteraction = () => {
      window.postMessage({ type: 'BLOCK_COMPLETION', blockId: '685329f87405ab9cb3e4c770', completed: true }, '*');
      window.parent.postMessage({ type: 'BLOCK_COMPLETION', blockId: '685329f87405ab9cb3e4c770', completed: true }, '*');
    };

    // Send completion on first draw or play
    if (waveformData.length > 0) {
      handleFirstInteraction();
    }
  }, [waveformData]);

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
      color: 'white',
      fontFamily: 'Arial, sans-serif',
      padding: '20px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center'
    }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '30px' }}>
        <h1 style={{ 
          fontSize: '2.5rem', 
          margin: '0 0 10px 0',
          background: 'linear-gradient(45deg, #00ff88, #00ccff)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text'
        }}>
          {title}
        </h1>
        <p style={{ fontSize: '1.1rem', opacity: 0.8, margin: 0 }}>
          {description}
        </p>
      </div>

      {/* Instructions */}
      <div style={{
        background: 'rgba(255, 255, 255, 0.1)',
        borderRadius: '10px',
        padding: '15px',
        marginBottom: '20px',
        maxWidth: '800px',
        textAlign: 'center'
      }}>
        <p style={{ margin: '0 0 10px 0', fontSize: '1rem' }}>
          <strong>How to use:</strong> Draw a waveform on the canvas below, then click "Play Sound" to hear your creation!
        </p>
        <p style={{ margin: 0, fontSize: '0.9rem', opacity: 0.7 }}>
          The horizontal center line represents zero amplitude. Draw above for positive, below for negative.
        </p>
      </div>

      {/* Controls */}
      <div style={{
        display: 'flex',
        gap: '20px',
        marginBottom: '20px',
        flexWrap: 'wrap',
        justifyContent: 'center',
        alignItems: 'center'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <label>Frequency:</label>
          <input
            type="range"
            min="100"
            max="1000"
            value={frequency}
            onChange={(e) => setFrequency(Number(e.target.value))}
            style={{ width: '120px' }}
          />
          <span>{frequency}Hz</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <label>Volume:</label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            style={{ width: '120px' }}
          />
          <span>{Math.round(volume * 100)}%</span>
        </div>

        <button
          onClick={playWaveform}
          disabled={waveformData.length === 0 || isPlaying}
          style={{
            background: isPlaying ? '#666' : 'linear-gradient(45deg, #00ff88, #00ccff)',
            color: 'white',
            border: 'none',
            borderRadius: '25px',
            padding: '12px 24px',
            fontSize: '1rem',
            cursor: waveformData.length === 0 || isPlaying ? 'not-allowed' : 'pointer',
            fontWeight: 'bold',
            opacity: waveformData.length === 0 || isPlaying ? 0.5 : 1
          }}
        >
          {isPlaying ? '♪ Playing...' : '▶ Play Sound'}
        </button>

        <button
          onClick={clearCanvas}
          style={{
            background: 'linear-gradient(45deg, #ff4757, #ff6b7a)',
            color: 'white',
            border: 'none',
            borderRadius: '25px',
            padding: '12px 24px',
            fontSize: '1rem',
            cursor: 'pointer',
            fontWeight: 'bold'
          }}
        >
          🗑️ Clear
        </button>
      </div>

      {/* Canvas */}
      <div style={{
        border: '3px solid #00ff88',
        borderRadius: '15px',
        background: '#000',
        padding: '5px',
        boxShadow: '0 0 20px rgba(0, 255, 136, 0.3)'
      }}>
        <canvas
          ref={canvasRef}
          width={800}
          height={300}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          style={{
            display: 'block',
            cursor: 'crosshair',
            borderRadius: '10px'
          }}
        />
      </div>

      {/* Waveform Info */}
      {waveformData.length > 0 && (
        <div style={{
          marginTop: '20px',
          padding: '15px',
          background: 'rgba(0, 255, 136, 0.1)',
          borderRadius: '10px',
          border: '1px solid rgba(0, 255, 136, 0.3)',
          textAlign: 'center'
        }}>
          <p style={{ margin: 0, fontSize: '0.9rem' }}>
            Waveform captured! {waveformData.length} sample points ready to play.
          </p>
        </div>
      )}

      {/* Tips */}
      <div style={{
        marginTop: '30px',
        maxWidth: '800px',
        textAlign: 'center',
        opacity: 0.7,
        fontSize: '0.9rem'
      }}>
        <p><strong>💡 Tips:</strong></p>
        <p>• Draw sine waves for pure tones • Try jagged lines for rough sounds • Experiment with different frequencies</p>
        <p>• Higher drawings = louder parts • Lower drawings = quieter parts • Complex shapes = complex sounds!</p>
      </div>
    </div>
  );
};

export default Block;