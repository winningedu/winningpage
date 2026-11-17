// 고객사가 준 서비스제공 화면의 인라인 SVG 원본을 JSX 속성명으로만 바꿔 옮겼다.
// 아바타 SVG의 id(cT, bgT 등)는 한 화면에서 겹치면 안 되므로 T, S, P 접미사를 그대로 둔다.

export function BannerIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 380 230" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="pp" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" />
          <stop offset="1" stopColor="#F1F5FC" />
        </linearGradient>
        <filter id="sh" x="-20%" y="-20%" width="140%" height="150%">
          <feDropShadow
            dx="0"
            dy="8"
            stdDeviation="9"
            floodColor="#0B2545"
            floodOpacity=".22"
          />
        </filter>
      </defs>
      <ellipse
        cx="200"
        cy="205"
        rx="130"
        ry="12"
        fill="#0B2545"
        opacity=".10"
      />
      <g transform="rotate(7 250 120)" filter="url(#sh)">
        <rect x="170" y="38" width="170" height="150" rx="10" fill="#E9F0FC" />
        <rect x="184" y="62" width="100" height="7" rx="3.5" fill="#C5D3EC" />
        <rect x="184" y="78" width="130" height="7" rx="3.5" fill="#D4DFF2" />
      </g>
      <g transform="rotate(-5 215 125)" filter="url(#sh)">
        <rect x="128" y="30" width="190" height="168" rx="12" fill="url(#pp)" />
        <text x="146" y="54" fontSize="9" fill="#8A93A6" fontWeight="600">
          2026. 11. 17
        </text>
        <text x="146" y="76" fontSize="15" fill="#0B2545" fontWeight="800">
          스쿨멘토 이용 안내
        </text>
        <rect x="146" y="88" width="120" height="5" rx="2.5" fill="#D6DEEC" />
        <rect x="146" y="99" width="95" height="5" rx="2.5" fill="#E1E7F2" />
        <g>
          <circle cx="152" cy="123" r="6" fill="#2C6BE8" />
          <path
            d="M149 123l2.2 2.2 3.8-4"
            stroke="#fff"
            strokeWidth="1.8"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <rect x="164" y="120" width="86" height="6" rx="3" fill="#C9D4E8" />
        </g>
        <g>
          <circle cx="152" cy="142" r="6" fill="#2C6BE8" />
          <path
            d="M149 142l2.2 2.2 3.8-4"
            stroke="#fff"
            strokeWidth="1.8"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <rect x="164" y="139" width="70" height="6" rx="3" fill="#C9D4E8" />
        </g>
        <g>
          <circle cx="152" cy="161" r="6" fill="#2C6BE8" />
          <path
            d="M149 161l2.2 2.2 3.8-4"
            stroke="#fff"
            strokeWidth="1.8"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <rect x="164" y="158" width="78" height="6" rx="3" fill="#C9D4E8" />
        </g>
        <g transform="rotate(-14 280 160)">
          <circle
            cx="280"
            cy="160"
            r="26"
            fill="none"
            stroke="#C9973F"
            strokeWidth="3"
            opacity=".92"
          />
          <circle
            cx="280"
            cy="160"
            r="21"
            fill="none"
            stroke="#C9973F"
            strokeWidth="1"
            opacity=".8"
          />
          <text
            x="280"
            y="158"
            textAnchor="middle"
            fontSize="10"
            fontWeight="800"
            fill="#C9973F"
          >
            교육기관
          </text>
          <text
            x="280"
            y="171"
            textAnchor="middle"
            fontSize="9"
            fontWeight="800"
            fill="#C9973F"
          >
            패키지
          </text>
        </g>
      </g>
      <path
        d="M300 24v34a8 8 0 0016 0V20a12 12 0 00-24 0v40"
        fill="none"
        stroke="#9AA6BD"
        strokeWidth="3"
        strokeLinecap="round"
        transform="rotate(8 300 40)"
      />
      <g transform="translate(34 34) scale(.9)">
        <path d="M0 22L34 8l34 14-34 14z" fill="#0B2545" />
        <path d="M14 30v14c0 6 40 6 40 0V30l-20 8z" fill="#1A3D75" />
        <path
          d="M62 24v22"
          stroke="#C9973F"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
        <circle cx="62" cy="49" r="3.4" fill="#C9973F" />
      </g>
      <g transform="translate(60 150)">
        <rect width="62" height="44" rx="10" fill="#fff" filter="url(#sh)" />
        <rect x="10" y="26" width="8" height="10" rx="2" fill="#7FA6F0" />
        <rect x="22" y="18" width="8" height="18" rx="2" fill="#4F86DB" />
        <rect x="34" y="10" width="8" height="26" rx="2" fill="#2C6BE8" />
        <rect x="46" y="14" width="8" height="22" rx="2" fill="#1B4FB8" />
      </g>
    </svg>
  );
}

export function TeacherAvatar({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" className={className} aria-hidden="true">
      <defs>
        <clipPath id="cT">
          <circle cx="60" cy="60" r="60" />
        </clipPath>
        <linearGradient id="bgT" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#E8EDF6" />
          <stop offset="1" stopColor="#C5D2E8" />
        </linearGradient>
        <linearGradient id="skT" x1="0.2" y1="0" x2="0.8" y2="1">
          <stop offset="0" stopColor="#F7D6BB" />
          <stop offset="1" stopColor="#E4B592" />
        </linearGradient>
        <linearGradient id="hrT" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3B2519" />
          <stop offset="1" stopColor="#1B100A" />
        </linearGradient>
        <radialGradient id="chT">
          <stop offset="0" stopColor="#F08A84" stopOpacity=".38" />
          <stop offset="1" stopColor="#F08A84" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="nkT" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#E4B592" />
          <stop offset="1" stopColor="#E4B592" stopOpacity=".75" />
        </linearGradient>
        <filter id="blT">
          <feGaussianBlur stdDeviation="1.2" />
        </filter>
      </defs>
      <g clipPath="url(#cT)">
        <rect width="120" height="120" fill="url(#bgT)" />
        <ellipse cx="60" cy="118" rx="62" ry="10" fill="#000" opacity=".06" />
        <path
          d="M36 58C32 30 46 17 62 17c16 0 28 13 23 42c2 12-1 22-5 28l-40 0c-4-7-6-17-4-29z"
          fill="url(#hrT)"
        />
        <path d="M51 68h18v18c-5 5-13 5-18 0z" fill="url(#nkT)" />
        <path d="M6 122C8 96 28 86 60 86s52 10 54 36z" fill="#16305c" />
        <path
          d="M6 122C8 96 28 86 60 86c-14 6-24 18-26 36z"
          fill="#0d2347"
          opacity=".55"
        />
        <path d="M46 86l14 22 14-22z" fill="#f4f6fa" />
        <path d="M52 86l8 12 8-12z" fill="#dfe5ee" />
        <path d="M46 86L38 90l10 30 10-18z" fill="#1d3d75" />
        <path d="M74 86l8 4-10 30-10-18z" fill="#234684" />
        <path d="M60 108l-2 14h4z" fill="#0d2347" opacity=".5" />
        <path
          d="M51 78c5 6 13 6 18 0v-4c-5 4-13 4-18 0z"
          fill="#000"
          opacity=".10"
          filter="url(#blT)"
        />
        <ellipse cx="40.6" cy="55" rx="3.2" ry="5" fill="url(#skT)" />
        <ellipse cx="79.4" cy="55" rx="3.2" ry="5" fill="url(#skT)" />
        <ellipse
          cx="40.8"
          cy="55.5"
          rx="1.4"
          ry="2.8"
          fill="#000"
          opacity=".08"
        />
        <ellipse
          cx="79.2"
          cy="55.5"
          rx="1.4"
          ry="2.8"
          fill="#000"
          opacity=".08"
        />
        <circle cx="40.6" cy="61" r="1.6" fill="#E9C46A" />
        <circle cx="79.4" cy="61" r="1.6" fill="#E9C46A" />
        <path
          d="M41.5 50C41.5 36 49 29 60 29s18.5 7 18.5 21c0 14-6 26-18.5 26S41.5 64 41.5 50z"
          fill="url(#skT)"
        />
        <path
          d="M44 66c4 7 9 10 16 10s12-3 16-10c-3 9-9 14-16 14s-13-5-16-14z"
          fill="#000"
          opacity=".07"
        />
        <ellipse cx="48.5" cy="62" rx="6.5" ry="4.2" fill="url(#chT)" />
        <ellipse cx="71.5" cy="62" rx="6.5" ry="4.2" fill="url(#chT)" />
        <path
          d="M46.5 47.2c3-2.2 7-2.4 10.2-.8"
          fill="none"
          stroke="#2c1b12"
          strokeWidth="1.9"
          strokeLinecap="round"
        />
        <path
          d="M63.3 46.4c3.2-1.6 7.2-1.4 10.2.8"
          fill="none"
          stroke="#2c1b12"
          strokeWidth="1.9"
          strokeLinecap="round"
        />
        <g>
          <path
            d="M47.4 53.6c2.2-2.3 6.8-2.3 9 0c-2.2 2.1-6.8 2.1-9 0z"
            fill="#fff"
          />
          <path
            d="M63.6 53.6c2.2-2.3 6.8-2.3 9 0c-2.2 2.1-6.8 2.1-9 0z"
            fill="#fff"
          />
          <circle cx="52" cy="53.6" r="2.3" fill="#3A2A20" />
          <circle cx="68" cy="53.6" r="2.3" fill="#3A2A20" />
          <circle cx="52" cy="53.6" r="1.05" fill="#0b0705" />
          <circle cx="68" cy="53.6" r="1.05" fill="#0b0705" />
          <circle cx="52.8" cy="52.8" r=".7" fill="#fff" />
          <circle cx="68.8" cy="52.8" r=".7" fill="#fff" />
          <path
            d="M46.8 53.4c2.6-2.8 7.4-2.8 10 .2"
            fill="none"
            stroke="#1d130d"
            strokeWidth="1.35"
            strokeLinecap="round"
          />
          <path
            d="M63.2 53.6c2.6-3 7.4-3 10 -.2"
            fill="none"
            stroke="#1d130d"
            strokeWidth="1.35"
            strokeLinecap="round"
          />
        </g>
        <path
          d="M60 55.5c-.8 3.6-1.8 6.2-2.6 7.4c1.4 1 3.8 1 5.2 0"
          fill="none"
          stroke="#E4B592"
          strokeWidth="1.2"
          strokeLinecap="round"
          opacity=".9"
        />
        <path
          d="M56.4 70.3c2.2 1.6 5 1.6 7.2 0c-.6 2.5-6.6 2.5-7.2 0z"
          fill="#CF6F69"
          opacity=".95"
        />
        <path
          d="M55.2 68.6c1.6-1.5 3.2-1.4 4.8-.6c1.6-.8 3.2-.9 4.8.6c-1.2 1.9-3 2.8-4.8 2.8s-3.6-.9-4.8-2.8z"
          fill="#CF6F69"
        />
        <path
          d="M56 69.2c2.6.9 5.4.9 8 0"
          fill="none"
          stroke="#7a2f2a"
          strokeWidth=".7"
          opacity=".55"
          strokeLinecap="round"
        />
        <path
          d="M57 68.6c1-.7 2-.7 3 0"
          fill="none"
          stroke="#fff"
          strokeWidth=".6"
          opacity=".35"
        />
        <path
          d="M40.5 52C40 35 50 25 62 25c12 0 19 9 18 27c-4-9-10-15-19-16c-9 0-16 6-20 16z"
          fill="url(#hrT)"
        />
        <path
          d="M48 31c6-4 14-4 20 0"
          fill="none"
          stroke="#6b4630"
          strokeWidth="1.2"
          opacity=".6"
          strokeLinecap="round"
        />
        <path
          d="M42 40c3-6 8-10 14-11"
          fill="none"
          stroke="#7a5037"
          strokeWidth="1"
          opacity=".5"
          strokeLinecap="round"
        />
        <path
          d="M52 83l-4 24"
          stroke="#C9973F"
          strokeWidth="1.6"
          strokeLinecap="round"
          opacity=".95"
        />
        <path
          d="M68 83l4 24"
          stroke="#C9973F"
          strokeWidth="1.6"
          strokeLinecap="round"
          opacity=".95"
        />
        <rect
          x="64"
          y="107"
          width="14"
          height="12"
          rx="2"
          fill="#fff"
          stroke="#cfd6e3"
          strokeWidth=".6"
        />
        <rect x="64" y="107" width="14" height="3.4" rx="1.4" fill="#2C6BE8" />
        <circle cx="68" cy="113.2" r="2" fill="#E4B592" />
        <rect x="71" y="112" width="5" height="1" fill="#b9c2d3" />
        <rect x="71" y="114.2" width="4" height="1" fill="#b9c2d3" />
      </g>
    </svg>
  );
}

export function StudentAvatar({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" className={className} aria-hidden="true">
      <defs>
        <clipPath id="cS">
          <circle cx="60" cy="60" r="60" />
        </clipPath>
        <linearGradient id="bgS" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FBE5C9" />
          <stop offset="1" stopColor="#F0C99C" />
        </linearGradient>
        <linearGradient id="skS" x1="0.2" y1="0" x2="0.8" y2="1">
          <stop offset="0" stopColor="#F5D0B0" />
          <stop offset="1" stopColor="#DFA982" />
        </linearGradient>
        <linearGradient id="hrS" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#25201f" />
          <stop offset="1" stopColor="#0f0c0b" />
        </linearGradient>
        <radialGradient id="chS">
          <stop offset="0" stopColor="#F08A84" stopOpacity=".38" />
          <stop offset="1" stopColor="#F08A84" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="nkS" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#DFA982" />
          <stop offset="1" stopColor="#DFA982" stopOpacity=".75" />
        </linearGradient>
        <filter id="blS">
          <feGaussianBlur stdDeviation="1.2" />
        </filter>
      </defs>
      <g clipPath="url(#cS)">
        <rect width="120" height="120" fill="url(#bgS)" />
        <ellipse cx="60" cy="118" rx="62" ry="10" fill="#000" opacity=".06" />
        <path d="M40 48C38 28 48 20 61 20s23 8 19 28z" fill="url(#hrS)" />
        <path d="M51 68h18v18c-5 5-13 5-18 0z" fill="url(#nkS)" />
        <path d="M6 122C8 96 28 86 60 86s52 10 54 36z" fill="#2a3f73" />
        <path
          d="M6 122C8 96 28 86 60 86c-14 6-24 18-26 36z"
          fill="#1b2c58"
          opacity=".6"
        />
        <path d="M46 86l14 18 14-18z" fill="#ffffff" />
        <path d="M46 86l-3 6 17 14 17-14-3-6-14 14z" fill="#f1f4f9" />
        <path d="M55 91l5 3 5-3-1.8 5.6h-6.4z" fill="#C9973F" />
        <path d="M57.6 96.6h4.8l1.8 20-4.2 4-4.2-4z" fill="#C9973F" />
        <path d="M57.6 96.6h2.4l-.6 24-3-3.4z" fill="#a97c2c" opacity=".55" />
        <path d="M46 86L38 90l8 32 12-24z" fill="#223665" />
        <path d="M74 86l8 4-8 32-12-24z" fill="#2c437a" />
        <circle cx="30" cy="104" r="1.6" fill="#C9973F" />
        <path
          d="M51 78c5 6 13 6 18 0v-4c-5 4-13 4-18 0z"
          fill="#000"
          opacity=".10"
          filter="url(#blS)"
        />
        <ellipse cx="40.6" cy="55" rx="3.2" ry="5" fill="url(#skS)" />
        <ellipse cx="79.4" cy="55" rx="3.2" ry="5" fill="url(#skS)" />
        <ellipse
          cx="40.8"
          cy="55.5"
          rx="1.4"
          ry="2.8"
          fill="#000"
          opacity=".08"
        />
        <ellipse
          cx="79.2"
          cy="55.5"
          rx="1.4"
          ry="2.8"
          fill="#000"
          opacity=".08"
        />

        <path
          d="M41.5 50C41.5 36 49 29 60 29s18.5 7 18.5 21c0 14-6 26-18.5 26S41.5 64 41.5 50z"
          fill="url(#skS)"
        />
        <path
          d="M44 66c4 7 9 10 16 10s12-3 16-10c-3 9-9 14-16 14s-13-5-16-14z"
          fill="#000"
          opacity=".07"
        />
        <ellipse cx="48.5" cy="62" rx="6.5" ry="4.2" fill="url(#chS)" />
        <ellipse cx="71.5" cy="62" rx="6.5" ry="4.2" fill="url(#chS)" />
        <path
          d="M46.5 47.2c3-2.2 7-2.4 10.2-.8"
          fill="none"
          stroke="#1f1815"
          strokeWidth="1.9"
          strokeLinecap="round"
        />
        <path
          d="M63.3 46.4c3.2-1.6 7.2-1.4 10.2.8"
          fill="none"
          stroke="#1f1815"
          strokeWidth="1.9"
          strokeLinecap="round"
        />
        <g>
          <path
            d="M47.4 53.6c2.2-2.3 6.8-2.3 9 0c-2.2 2.1-6.8 2.1-9 0z"
            fill="#fff"
          />
          <path
            d="M63.6 53.6c2.2-2.3 6.8-2.3 9 0c-2.2 2.1-6.8 2.1-9 0z"
            fill="#fff"
          />
          <circle cx="52" cy="53.6" r="2.3" fill="#3A2A20" />
          <circle cx="68" cy="53.6" r="2.3" fill="#3A2A20" />
          <circle cx="52" cy="53.6" r="1.05" fill="#0b0705" />
          <circle cx="68" cy="53.6" r="1.05" fill="#0b0705" />
          <circle cx="52.8" cy="52.8" r=".7" fill="#fff" />
          <circle cx="68.8" cy="52.8" r=".7" fill="#fff" />
          <path
            d="M46.8 53.4c2.6-2.8 7.4-2.8 10 .2"
            fill="none"
            stroke="#1d130d"
            strokeWidth="1.35"
            strokeLinecap="round"
          />
          <path
            d="M63.2 53.6c2.6-3 7.4-3 10 -.2"
            fill="none"
            stroke="#1d130d"
            strokeWidth="1.35"
            strokeLinecap="round"
          />
        </g>
        <path
          d="M60 55.5c-.8 3.6-1.8 6.2-2.6 7.4c1.4 1 3.8 1 5.2 0"
          fill="none"
          stroke="#DFA982"
          strokeWidth="1.2"
          strokeLinecap="round"
          opacity=".9"
        />
        <path
          d="M56.4 70.3c2.2 1.6 5 1.6 7.2 0c-.6 2.5-6.6 2.5-7.2 0z"
          fill="#C7706A"
          opacity=".95"
        />
        <path
          d="M55.2 68.6c1.6-1.5 3.2-1.4 4.8-.6c1.6-.8 3.2-.9 4.8.6c-1.2 1.9-3 2.8-4.8 2.8s-3.6-.9-4.8-2.8z"
          fill="#C7706A"
        />
        <path
          d="M56 69.2c2.6.9 5.4.9 8 0"
          fill="none"
          stroke="#7a2f2a"
          strokeWidth=".7"
          opacity=".55"
          strokeLinecap="round"
        />
        <path
          d="M57 68.6c1-.7 2-.7 3 0"
          fill="none"
          stroke="#fff"
          strokeWidth=".6"
          opacity=".35"
        />
        <path
          d="M40.5 50C39 33 48 24 61 24c14 0 22 9 18.5 27c-1-7-4-12-9-14c-4 3-12 5-20 4c-3 2-5 6-6 9z"
          fill="url(#hrS)"
        />
        <path
          d="M52 28c5-2 11-2 16 1"
          fill="none"
          stroke="#5a4e4a"
          strokeWidth="1.1"
          opacity=".65"
          strokeLinecap="round"
        />
        <path
          d="M46 34c4-4 9-6 14-6"
          fill="none"
          stroke="#5a4e4a"
          strokeWidth="1"
          opacity=".5"
          strokeLinecap="round"
        />
        <path
          d="M42 44c0-5 2-8 5-10"
          fill="none"
          stroke="#5a4e4a"
          strokeWidth=".9"
          opacity=".45"
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
}

export function ParentAvatar({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" className={className} aria-hidden="true">
      <defs>
        <clipPath id="cP">
          <circle cx="60" cy="60" r="60" />
        </clipPath>
        <linearGradient id="bgP" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#DDEEF9" />
          <stop offset="1" stopColor="#B9D9EE" />
        </linearGradient>
        <linearGradient id="skP" x1="0.2" y1="0" x2="0.8" y2="1">
          <stop offset="0" stopColor="#F4D2B8" />
          <stop offset="1" stopColor="#E1B190" />
        </linearGradient>
        <linearGradient id="hrP" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5B3A2A" />
          <stop offset="1" stopColor="#2E1B12" />
        </linearGradient>
        <radialGradient id="chP">
          <stop offset="0" stopColor="#F08A84" stopOpacity=".38" />
          <stop offset="1" stopColor="#F08A84" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="nkP" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#E1B190" />
          <stop offset="1" stopColor="#E1B190" stopOpacity=".75" />
        </linearGradient>
        <filter id="blP">
          <feGaussianBlur stdDeviation="1.2" />
        </filter>
      </defs>
      <g clipPath="url(#cP)">
        <rect width="120" height="120" fill="url(#bgP)" />
        <ellipse cx="60" cy="118" rx="62" ry="10" fill="#000" opacity=".06" />
        <path
          d="M33 60C28 30 44 16 62 16c18 0 31 14 25 44c3 12 1 24-3 32l-8 2-34 0-8-2c-5-8-5-20-3-32z"
          fill="url(#hrP)"
        />
        <path
          d="M36 70c-3 8-3 16 0 22"
          fill="none"
          stroke="#8a5d43"
          strokeWidth="1"
          opacity=".5"
        />
        <path
          d="M84 70c3 8 3 16 0 22"
          fill="none"
          stroke="#8a5d43"
          strokeWidth="1"
          opacity=".5"
        />
        <path d="M51 68h18v18c-5 5-13 5-18 0z" fill="url(#nkP)" />
        <path d="M6 122C8 96 28 86 60 86s52 10 54 36z" fill="#E7A9B6" />
        <path
          d="M6 122C8 96 28 86 60 86c-14 6-24 18-26 36z"
          fill="#d48b9c"
          opacity=".6"
        />
        <path
          d="M47 86c4 10 9 14 13 14s9-4 13-14c-4-1-8-2-13-2s-9 1-13 2z"
          fill="#fbf3ee"
        />
        <path d="M47 86l-9 4 12 32 10-22z" fill="#D893A3" />
        <path d="M73 86l9 4-12 32-10-22z" fill="#E09DAC" />
        <path
          d="M50 84c4 5 16 5 20 0l2 4c-6 6-18 6-24 0z"
          fill="#fff"
          opacity=".85"
        />
        <path
          d="M51 78c5 6 13 6 18 0v-4c-5 4-13 4-18 0z"
          fill="#000"
          opacity=".10"
          filter="url(#blP)"
        />
        <ellipse cx="40.6" cy="55" rx="3.2" ry="5" fill="url(#skP)" />
        <ellipse cx="79.4" cy="55" rx="3.2" ry="5" fill="url(#skP)" />
        <ellipse
          cx="40.8"
          cy="55.5"
          rx="1.4"
          ry="2.8"
          fill="#000"
          opacity=".08"
        />
        <ellipse
          cx="79.2"
          cy="55.5"
          rx="1.4"
          ry="2.8"
          fill="#000"
          opacity=".08"
        />
        <circle cx="40.6" cy="61" r="1.6" fill="#E9C46A" />
        <circle cx="79.4" cy="61" r="1.6" fill="#E9C46A" />
        <path
          d="M41.5 50C41.5 36 49 29 60 29s18.5 7 18.5 21c0 14-6 26-18.5 26S41.5 64 41.5 50z"
          fill="url(#skP)"
        />
        <path
          d="M44 66c4 7 9 10 16 10s12-3 16-10c-3 9-9 14-16 14s-13-5-16-14z"
          fill="#000"
          opacity=".07"
        />
        <ellipse cx="48.5" cy="62" rx="6.5" ry="4.2" fill="url(#chP)" />
        <ellipse cx="71.5" cy="62" rx="6.5" ry="4.2" fill="url(#chP)" />
        <path
          d="M46.5 47.2c3-2.2 7-2.4 10.2-.8"
          fill="none"
          stroke="#3a2418"
          strokeWidth="1.9"
          strokeLinecap="round"
        />
        <path
          d="M63.3 46.4c3.2-1.6 7.2-1.4 10.2.8"
          fill="none"
          stroke="#3a2418"
          strokeWidth="1.9"
          strokeLinecap="round"
        />
        <g>
          <path
            d="M47.4 53.6c2.2-2.3 6.8-2.3 9 0c-2.2 2.1-6.8 2.1-9 0z"
            fill="#fff"
          />
          <path
            d="M63.6 53.6c2.2-2.3 6.8-2.3 9 0c-2.2 2.1-6.8 2.1-9 0z"
            fill="#fff"
          />
          <circle cx="52" cy="53.6" r="2.3" fill="#4a3426" />
          <circle cx="68" cy="53.6" r="2.3" fill="#4a3426" />
          <circle cx="52" cy="53.6" r="1.05" fill="#0b0705" />
          <circle cx="68" cy="53.6" r="1.05" fill="#0b0705" />
          <circle cx="52.8" cy="52.8" r=".7" fill="#fff" />
          <circle cx="68.8" cy="52.8" r=".7" fill="#fff" />
          <path
            d="M46.8 53.4c2.6-2.8 7.4-2.8 10 .2"
            fill="none"
            stroke="#1d130d"
            strokeWidth="1.35"
            strokeLinecap="round"
          />
          <path
            d="M63.2 53.6c2.6-3 7.4-3 10 -.2"
            fill="none"
            stroke="#1d130d"
            strokeWidth="1.35"
            strokeLinecap="round"
          />
        </g>
        <path
          d="M60 55.5c-.8 3.6-1.8 6.2-2.6 7.4c1.4 1 3.8 1 5.2 0"
          fill="none"
          stroke="#E1B190"
          strokeWidth="1.2"
          strokeLinecap="round"
          opacity=".9"
        />
        <path
          d="M56.4 70.3c2.2 1.6 5 1.6 7.2 0c-.6 2.5-6.6 2.5-7.2 0z"
          fill="#C96A68"
          opacity=".95"
        />
        <path
          d="M55.2 68.6c1.6-1.5 3.2-1.4 4.8-.6c1.6-.8 3.2-.9 4.8.6c-1.2 1.9-3 2.8-4.8 2.8s-3.6-.9-4.8-2.8z"
          fill="#C96A68"
        />
        <path
          d="M56 69.2c2.6.9 5.4.9 8 0"
          fill="none"
          stroke="#7a2f2a"
          strokeWidth=".7"
          opacity=".55"
          strokeLinecap="round"
        />
        <path
          d="M57 68.6c1-.7 2-.7 3 0"
          fill="none"
          stroke="#fff"
          strokeWidth=".6"
          opacity=".35"
        />
        <path
          d="M40.5 53C39 34 48 24 61 24c13 0 22 9 19 29c-2-9-7-16-14-18c-8 3-17 8-25 18z"
          fill="url(#hrP)"
        />
        <path
          d="M50 30c6-3 13-3 19 1"
          fill="none"
          stroke="#8a5d43"
          strokeWidth="1.2"
          opacity=".6"
          strokeLinecap="round"
        />
        <path
          d="M45 38c3-4 8-7 13-8"
          fill="none"
          stroke="#8a5d43"
          strokeWidth="1"
          opacity=".5"
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
}

export function MinimalDataIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 72 72"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M36 8l22 8v16c0 14-9 25-22 31C23 57 14 46 14 32V16z"
        stroke="#2C6BE8"
        strokeWidth="3.2"
        strokeLinejoin="round"
        fill="#fff"
      />
      <rect
        x="26"
        y="31"
        width="20"
        height="15"
        rx="3"
        stroke="#2C6BE8"
        strokeWidth="3"
        fill="#EAF2FE"
      />
      <path
        d="M30 31v-4a6 6 0 0112 0v4"
        stroke="#2C6BE8"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function SeparationIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 72 72"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <rect
        x="14"
        y="14"
        width="44"
        height="44"
        rx="10"
        stroke="#2C6BE8"
        strokeWidth="3.2"
        fill="#fff"
      />
      <path d="M14 30h44M30 30v28" stroke="#2C6BE8" strokeWidth="3" />
      <rect
        x="34"
        y="35"
        width="19"
        height="7"
        rx="2.5"
        fill="#EAF2FE"
        stroke="#2C6BE8"
        strokeWidth="2.4"
      />
      <rect
        x="34"
        y="46"
        width="19"
        height="7"
        rx="2.5"
        fill="#EAF2FE"
        stroke="#2C6BE8"
        strokeWidth="2.4"
      />
    </svg>
  );
}

export function AccessLogIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 72 72"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M32 8l20 7v14c0 12-8 22-20 27C20 51 12 41 12 29V15z"
        stroke="#2C6BE8"
        strokeWidth="3.2"
        strokeLinejoin="round"
        fill="#fff"
      />
      <circle
        cx="32"
        cy="27"
        r="5"
        stroke="#2C6BE8"
        strokeWidth="3"
        fill="#EAF2FE"
      />
      <path
        d="M22 41c1-6 5-8 10-8s9 2 10 8"
        stroke="#2C6BE8"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <circle
        cx="52"
        cy="48"
        r="13"
        fill="#fff"
        stroke="#2C6BE8"
        strokeWidth="3.2"
      />
      <path
        d="M46 48l4.5 4.5L58.5 44"
        stroke="#2C6BE8"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function UsageGuideQr({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 33 33"
      shapeRendering="crispEdges"
      className={className}
      aria-hidden="true"
    >
      <path fill="#fff" d="M0 0h33v33h-33z" />
      <path
        stroke="#0b2545"
        d="M2 2.5h7m1 0h2m1 0h1m1 0h1m2 0h5m1 0h7m-29 1h1m5 0h1m1 0h1m1 0h3m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m5 0h1m-29 1h1m1 0h3m1 0h1m4 0h4m3 0h3m1 0h1m1 0h3m1 0h1m-29 1h1m1 0h3m1 0h1m1 0h1m1 0h8m2 0h1m1 0h1m1 0h3m1 0h1m-29 1h1m1 0h3m1 0h1m7 0h6m2 0h1m1 0h3m1 0h1m-29 1h1m5 0h1m2 0h1m1 0h4m2 0h1m1 0h1m2 0h1m5 0h1m-29 1h7m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h7m-21 1h2m2 0h1m1 0h4m1 0h1m-20 1h1m1 0h2m1 0h3m1 0h2m1 0h1m1 0h1m1 0h2m4 0h1m2 0h1m1 0h2m-27 1h4m1 0h1m1 0h1m1 0h2m3 0h5m1 0h3m3 0h1m-29 1h1m1 0h1m3 0h1m1 0h2m1 0h2m3 0h1m1 0h1m4 0h2m1 0h2m-27 1h1m1 0h1m1 0h1m1 0h3m1 0h4m4 0h3m1 0h2m3 0h1m-28 1h2m3 0h2m3 0h1m5 0h1m7 0h2m-26 1h1m3 0h1m1 0h2m3 0h1m1 0h2m3 0h1m2 0h2m2 0h3m-29 1h3m1 0h1m1 0h2m2 0h2m1 0h1m3 0h1m1 0h2m1 0h3m1 0h3m-29 1h1m1 0h2m1 0h1m2 0h1m1 0h1m4 0h2m3 0h1m1 0h3m2 0h1m-27 1h1m2 0h1m1 0h1m3 0h2m2 0h1m3 0h4m2 0h2m1 0h1m-26 1h2m3 0h1m1 0h1m1 0h2m2 0h1m2 0h1m1 0h1m2 0h1m1 0h3m-28 1h1m2 0h4m1 0h3m1 0h7m2 0h3m2 0h1m-24 1h2m3 0h1m1 0h2m1 0h5m8 0h1m-26 1h2m2 0h3m2 0h1m1 0h3m1 0h2m2 0h7m-19 1h4m4 0h3m1 0h1m3 0h5m-29 1h7m1 0h1m1 0h2m2 0h1m1 0h1m1 0h3m1 0h1m1 0h2m1 0h1m-28 1h1m5 0h1m1 0h1m1 0h1m2 0h2m1 0h1m1 0h1m1 0h1m3 0h2m1 0h1m-28 1h1m1 0h3m1 0h1m5 0h1m2 0h1m1 0h1m2 0h5m1 0h1m-27 1h1m1 0h3m1 0h1m1 0h3m4 0h5m1 0h1m2 0h2m2 0h1m-29 1h1m1 0h3m1 0h1m1 0h3m7 0h1m1 0h1m2 0h1m2 0h1m1 0h1m-29 1h1m5 0h1m2 0h2m2 0h2m5 0h1m1 0h2m1 0h1m1 0h1m-28 1h7m1 0h3m1 0h1m3 0h1m1 0h5m2 0h1m1 0h1"
      />
    </svg>
  );
}

export function ArrowRightIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M4 9h10M10 5l4 4-4 4"
        stroke="#fff"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
