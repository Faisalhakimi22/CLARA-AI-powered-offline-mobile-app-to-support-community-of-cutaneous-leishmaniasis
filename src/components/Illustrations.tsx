import React from 'react';
import { Image, View } from 'react-native';
import Svg, {
  Circle,
  ClipPath,
  Defs,
  Ellipse,
  G,
  Line,
  Path,
  Polygon,
  Rect,
} from 'react-native-svg';
import { LesionImage, SegmentationResult } from '../domain/types';
import { Badge, T } from './ui';
import { colors, font } from '../theme';

export function Brand({ light = false, compact = false }: { light?: boolean; compact?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', gap: 11, alignItems: 'center' }}>
      <View
        style={{
          width: compact ? 34 : 40,
          height: compact ? 34 : 40,
          backgroundColor: light ? '#FFFFFF18' : colors.teal,
          borderRadius: 12,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Svg width={26} height={26} viewBox="0 0 32 32">
          <Path d="M13 3h6v10h10v6H19v10h-6V19H3v-6h10z" fill="#fff" />
          <Circle cx="25" cy="7" r="3.3" fill="#F7C8CE" />
        </Svg>
      </View>
      {!compact && (
        <View>
          <T
            style={{
              fontFamily: font.displayBold,
              fontSize: 21,
              color: light ? colors.white : colors.ink,
              letterSpacing: -0.8,
            }}
          >
            CLARA<T style={{ color: light ? '#F7C8CE' : colors.teal, fontSize: 21 }}>.</T>
          </T>
        </View>
      )}
    </View>
  );
}

export function ImagePreview({
  image,
  height = 260,
  label = true,
}: {
  image?: LesionImage;
  height?: number;
  label?: boolean;
}) {
  return (
    <View
      style={{ height, borderRadius: 14, overflow: 'hidden', backgroundColor: colors.tealLight }}
    >
      {image ? (
        <Image
          accessibilityLabel="Selected lesion photograph"
          source={{ uri: image.uri }}
          style={{ width: '100%', height: '100%' }}
          resizeMode="contain"
        />
      ) : (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <T tone="muted">No image captured</T>
        </View>
      )}
      {label && image && (
        <View style={{ position: 'absolute', left: 12, bottom: 12 }}>
          <Badge label="Lesion photograph" tone="neutral" dot={false} />
        </View>
      )}
    </View>
  );
}

export function SegmentationPreview({
  image,
  segmentation,
  height = 220,
}: {
  image: LesionImage;
  segmentation: SegmentationResult;
  height?: number;
}) {
  return (
    <View style={{ height, borderRadius: 14, overflow: 'hidden', backgroundColor: colors.bg }}>
      <Image
        accessibilityLabel="Lesion photograph with model-generated lesion outlines"
        source={{ uri: image.uri }}
        style={{ width: '100%', height: '100%' }}
        resizeMode="contain"
      />
      <Svg
        pointerEvents="none"
        style={{ position: 'absolute', width: '100%', height: '100%' }}
        viewBox={`0 0 ${image.width} ${image.height}`}
        preserveAspectRatio="xMidYMid meet"
      >
        {segmentation.lesions.map((lesion, index) => {
          const points = Array.from(
            { length: lesion.polygon.length / 2 },
            (_, pointIndex) =>
              `${lesion.polygon[pointIndex * 2] * image.width},${lesion.polygon[pointIndex * 2 + 1] * image.height}`,
          ).join(' ');
          return (
            <Polygon
              key={`${index}-${points.slice(0, 16)}`}
              points={points}
              fill={`${colors.red}24`}
              stroke={colors.red}
              strokeWidth={Math.max(image.width, image.height) / 180}
            />
          );
        })}
      </Svg>
      <View style={{ position: 'absolute', left: 12, bottom: 12 }}>
        <Badge
          label={`${segmentation.lesions.length} ${segmentation.lesions.length === 1 ? 'outline' : 'outlines'}`}
          tone="neutral"
          dot={false}
        />
      </View>
    </View>
  );
}

export function CaptureIllustration({ large = false }: { large?: boolean }) {
  return (
    <Svg width="100%" height={large ? 320 : 250} viewBox="0 0 380 300">
      <Circle cx="200" cy="146" r="125" fill="#DDEADF" />
      <Circle cx="200" cy="146" r="98" fill="none" stroke="#CADCCA" strokeWidth="1" />
      <Circle
        cx="200"
        cy="146"
        r="143"
        fill="none"
        stroke="#D7E4D5"
        strokeWidth="1"
        strokeDasharray="2 7"
      />
      <G transform="translate(128,20) rotate(9,76,126)">
        <Rect x="4" y="7" width="151" height="257" rx="28" fill="#173E35" opacity=".11" />
        <Rect width="151" height="257" rx="28" fill="#21564A" />
        <Rect x="7" y="7" width="137" height="243" rx="22" fill="#F4F6EF" />
        <Rect x="52" y="13" width="48" height="10" rx="5" fill="#21564A" />
        <Rect x="16" y="42" width="119" height="153" rx="12" fill="#D8B798" />
        <Path d="M16 128C46 78 94 68 135 89V187H16Z" fill="#CBA17E" />
        <Ellipse cx="77" cy="119" rx="22" ry="20" fill="#AD7864" />
        <Ellipse cx="77" cy="119" rx="14" ry="13" fill="#CD9577" />
        <Circle cx="77" cy="119" r="8" fill="#DAB89A" />
        <Path
          d="M31 89V75H45M110 75H122V89M31 149V163H45M110 163H122V149"
          stroke="white"
          strokeWidth="2"
          fill="none"
        />
        <Line x1="26" y1="121" x2="126" y2="121" stroke="#FFF" strokeWidth="1" opacity=".65" />
        <Circle cx="75" cy="222" r="17" stroke="#21564A" strokeWidth="1.3" fill="none" />
        <Circle cx="75" cy="222" r="12" fill="#21564A" />
      </G>
      <G transform="translate(218,200)">
        <Rect x="3" y="5" width="135" height="56" rx="13" fill="#194F3E" opacity=".06" />
        <Rect width="135" height="56" rx="13" fill="#FFFFFF" />
        <Circle cx="25" cy="28" r="13" fill="#E4F0E8" />
        <Path d="M19 28l4 4 8-8" fill="none" stroke="#176B5B" strokeWidth="2" />
        <Rect x="48" y="20" width="68" height="5" rx="2.5" fill="#456759" />
        <Rect x="48" y="31" width="46" height="4" rx="2" fill="#B8C8BC" />
      </G>
      <G transform="translate(44,70)">
        <Rect width="83" height="42" rx="11" fill="#FFFFFF" />
        <Circle cx="19" cy="21" r="6" fill="#B9CEA0" />
        <Rect x="34" y="14" width="34" height="4" rx="2" fill="#64816B" />
        <Rect x="34" y="23" width="25" height="4" rx="2" fill="#C2D0C2" />
      </G>
    </Svg>
  );
}
