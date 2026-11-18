interface EcgMonitorStripProps {
  pattern?: 'normal' | 'stemi' | 'afib' | 'vtach' | 'pe_s1q3t3';
  heartRate: number;
}

export function EcgMonitorStrip({ pattern = 'normal', heartRate }: EcgMonitorStripProps) {
  const buildWavePath = () => {
    const cycles = 4;
    let d = 'M 0 60';
    for (let i = 0; i < cycles; i++) {
      const x = i * 150;
      if (pattern === 'stemi') {
        d += ` L ${x + 15} 60 Q ${x + 25} 52 ${x + 35} 60 L ${x + 48} 60 L ${x + 53} 68 L ${x + 60} 18 L ${x + 68} 74 L ${x + 76} 34 Q ${x + 100} 26 ${x + 118} 54 L ${x + 150} 60`;
      } else if (pattern === 'afib') {
        const jitter = i % 2 === 0 ? 0 : 18;
        d += ` L ${x + 12} 62 L ${x + 20} 58 L ${x + 28} 61 L ${x + 42 + jitter} 60 L ${x + 47 + jitter} 20 L ${x + 55 + jitter} 76 L ${x + 62 + jitter} 60 Q ${x + 85 + jitter} 44 ${x + 105 + jitter} 60 L ${x + 150} 60`;
      } else if (pattern === 'vtach') {
        d += ` Q ${x + 25} 12 ${x + 50} 96 Q ${x + 75} 104 ${x + 100} 16 Q ${x + 125} 96 ${x + 150} 60`;
      } else if (pattern === 'pe_s1q3t3') {
        d += ` L ${x + 15} 60 Q ${x + 25} 52 ${x + 35} 60 L ${x + 45} 60 L ${x + 51} 22 L ${x + 59} 86 L ${x + 67} 60 Q ${x + 88} 78 ${x + 108} 60 L ${x + 150} 60`;
      } else {
        d += ` L ${x + 18} 60 Q ${x + 28} 51 ${x + 38} 60 L ${x + 48} 60 L ${x + 52} 67 L ${x + 59} 18 L ${x + 66} 76 L ${x + 73} 60 Q ${x + 95} 43 ${x + 114} 60 L ${x + 150} 60`;
      }
    }
    return d;
  };

  return (
    <div className="rounded-xl bg-[#040B17] border border-emerald-500/30 p-3 overflow-hidden">
      <div className="flex items-center justify-between text-xs font-mono-tabular text-emerald-400 mb-2">
        <span>LEAD II · 25 mm/s · 10 mm/mV</span>
        <span>HR: {heartRate} bpm</span>
      </div>
      <svg
        viewBox="0 0 600 120"
        className="w-full h-28"
        role="img"
        aria-label="Clinical 12-Lead ECG Rhythm Strip"
      >
        <defs>
          <pattern id="ecgGrid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(16,185,129,0.14)" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="600" height="120" fill="url(#ecgGrid)" />
        <path
          d={buildWavePath()}
          fill="none"
          stroke="#10B981"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
