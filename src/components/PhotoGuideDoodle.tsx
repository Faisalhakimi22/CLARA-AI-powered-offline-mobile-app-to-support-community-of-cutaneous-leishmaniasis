import React from 'react';
import Svg, { Circle, Ellipse, Line, Path, Rect } from 'react-native-svg';

export type PhotoGuideScene = 'light' | 'frame' | 'steady' | 'focus' | 'background' | 'review';

const red = '#B42332';
const ink = '#344054';
const pale = '#FCEDEE';
const line = '#D0D5DD';

/** Small, original vector illustrations for the practical photo-taking instructions. */
export function PhotoGuideDoodle({ scene }: { scene: PhotoGuideScene }) {
  return (
    <Svg width="100%" height={104} viewBox="0 0 240 104" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Rect x="1" y="1" width="238" height="102" rx="14" fill="#FFFFFF" />
      {scene === 'light' && (
        <>
          <Circle cx="66" cy="38" r="15" fill={pale} stroke={red} strokeWidth="2" />
          <Line x1="66" y1="11" x2="66" y2="5" stroke={red} strokeWidth="2" strokeLinecap="round" />
          <Line x1="43" y1="17" x2="38" y2="12" stroke={red} strokeWidth="2" strokeLinecap="round" />
          <Line x1="89" y1="17" x2="94" y2="12" stroke={red} strokeWidth="2" strokeLinecap="round" />
          <Path d="M49 66c7-9 27-9 34 0l7 19H42z" fill="#F2D4C5" stroke={ink} strokeWidth="2" strokeLinejoin="round" />
          <Path d="M105 26l20 26M113 21l20 27" stroke="#F2D4C5" strokeWidth="5" strokeLinecap="round" />
          <Circle cx="157" cy="57" r="19" fill="#F2D4C5" stroke={ink} strokeWidth="2" />
          <Circle cx="157" cy="57" r="7" fill={pale} stroke={red} strokeWidth="2" />
          <Path d="M188 24l8 8-8 8M205 24l8 8-8 8" fill="none" stroke={line} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
      {scene === 'frame' && (
        <>
          <Rect x="72" y="10" width="96" height="84" rx="10" fill="#FAFAFA" stroke={ink} strokeWidth="2" />
          <Path d="M86 28v-8h10M144 20h10v8M86 76v8h10M144 84h10v-8" fill="none" stroke={red} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          <Path d="M104 66c4-13 31-13 35 0l4 9h-43z" fill="#F2D4C5" stroke={ink} strokeWidth="2" />
          <Circle cx="126" cy="54" r="12" fill="#F2D4C5" stroke={ink} strokeWidth="2" />
          <Ellipse cx="126" cy="55" rx="4" ry="3" fill={pale} stroke={red} strokeWidth="1.5" />
          <Line x1="38" y1="52" x2="64" y2="52" stroke={line} strokeWidth="2" strokeDasharray="4 5" />
          <Line x1="176" y1="52" x2="202" y2="52" stroke={line} strokeWidth="2" strokeDasharray="4 5" />
        </>
      )}
      {scene === 'steady' && (
        <>
          <Path d="M55 76l12-14 12-5 8-12c3-4 9-1 7 4l-4 8 12-10c4-3 8 2 5 5l-10 11 9-6c4-2 7 3 3 6l-9 8c-8 8-18 12-30 11l-15-1z" fill="#F2D4C5" stroke={ink} strokeWidth="2" strokeLinejoin="round" />
          <Rect x="123" y="30" width="65" height="47" rx="8" fill="#FFFFFF" stroke={ink} strokeWidth="2.5" />
          <Path d="M136 30l6-8h23l6 8" fill="none" stroke={ink} strokeWidth="2.5" strokeLinejoin="round" />
          <Circle cx="155" cy="53" r="15" fill={pale} stroke={red} strokeWidth="2.5" />
          <Circle cx="155" cy="53" r="7" fill="#FFFFFF" stroke={red} strokeWidth="2" />
          <Path d="M83 90h96" stroke={line} strokeWidth="2" strokeDasharray="4 5" />
        </>
      )}
      {scene === 'focus' && (
        <>
          <Circle cx="120" cy="52" r="34" fill="#FFFFFF" stroke={line} strokeWidth="3" />
          <Circle cx="120" cy="52" r="23" fill={pale} stroke={red} strokeWidth="2" />
          <Circle cx="120" cy="52" r="10" fill="#F2D4C5" stroke={ink} strokeWidth="2" />
          <Path d="M120 12v9M120 83v9M80 52h9M151 52h9" stroke={red} strokeWidth="2.5" strokeLinecap="round" />
          <Path d="M53 22l5 5 9-10" fill="none" stroke={red} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          <Path d="M174 83l5 5 9-10" fill="none" stroke={red} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
      {scene === 'background' && (
        <>
          <Rect x="56" y="15" width="128" height="74" rx="8" fill="#FAFAFA" stroke={line} strokeWidth="2" />
          <Circle cx="120" cy="52" r="20" fill="#F2D4C5" stroke={ink} strokeWidth="2" />
          <Ellipse cx="120" cy="53" rx="8" ry="6" fill={pale} stroke={red} strokeWidth="2" />
          <Circle cx="72" cy="29" r="3" fill={line} />
          <Rect x="160" y="27" width="12" height="10" rx="2" fill="#EAECF0" />
          <Path d="M60 82h118" stroke={red} strokeWidth="2" strokeDasharray="5 5" />
          <Circle cx="197" cy="33" r="12" fill={pale} />
          <Path d="M191 27l12 12M203 27l-12 12" stroke={red} strokeWidth="2" strokeLinecap="round" />
        </>
      )}
      {scene === 'review' && (
        <>
          <Rect x="81" y="10" width="78" height="84" rx="9" fill="#FFFFFF" stroke={ink} strokeWidth="2" />
          <Rect x="91" y="20" width="58" height="34" rx="5" fill="#F2D4C5" />
          <Ellipse cx="120" cy="37" rx="10" ry="7" fill={pale} stroke={red} strokeWidth="2" />
          <Circle cx="100" cy="67" r="6" fill={pale} stroke={red} strokeWidth="1.5" />
          <Path d="M97 67l2 2 4-5" fill="none" stroke={red} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <Line x1="112" y1="67" x2="142" y2="67" stroke={line} strokeWidth="3" strokeLinecap="round" />
          <Circle cx="100" cy="82" r="6" fill={pale} stroke={red} strokeWidth="1.5" />
          <Path d="M97 82l2 2 4-5" fill="none" stroke={red} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <Line x1="112" y1="82" x2="142" y2="82" stroke={line} strokeWidth="3" strokeLinecap="round" />
          <Path d="M48 52h19M173 52h19" stroke={line} strokeWidth="2" strokeDasharray="4 5" />
        </>
      )}
    </Svg>
  );
}
