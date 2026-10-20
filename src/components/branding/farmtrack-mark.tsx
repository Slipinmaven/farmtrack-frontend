import Svg, { Circle, Path } from "react-native-svg";

type FarmTrackMarkProps = {
  size?: number;
};

export function FarmTrackMark({ size = 44 }: FarmTrackMarkProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 128 128"
      accessible
      accessibilityLabel="FarmTrack"
    >
      <Path
        d="M25 75c0-17 13-30 31-32 4-13 14-21 27-21 6 0 11 2 15 6l10 2-8 8c1 3 2 6 2 9 0 7-3 13-8 18 3 8 3 17-1 25-6 12-20 19-39 19H44c-11 0-19-8-19-19z"
        fill="#1B5E3B"
      />
      <Path
        d="M74 22c-1-8 3-12 8-12 3 0 5 2 6 5 4-3 9-2 11 2 2 4 0 8-4 11"
        fill="#66BB6A"
        stroke="#66BB6A"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path d="m109 38 12 5-12 5" fill="#F4B942" />
      <Path
        d="M42 77c8-9 18-13 29-13 11 0 19 4 24 11"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth={5}
        strokeLinecap="round"
      />
      <Circle cx={45} cy={77} r={5} fill="#F4B942" />
      <Circle cx={94} cy={75} r={5} fill="#66BB6A" />
      <Path
        d="M51 107v8m22-8v8m-27 0h11m11 0h11"
        fill="none"
        stroke="#1B5E3B"
        strokeWidth={5}
        strokeLinecap="round"
      />
      <Circle cx={88} cy={43} r={2.5} fill="#FFFFFF" />
    </Svg>
  );
}
