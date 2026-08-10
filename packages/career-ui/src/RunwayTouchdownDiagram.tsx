import type { RunwayTouchdownSnapshot } from './api';

type Props = {
  touch: RunwayTouchdownSnapshot;
};

function formatRunwayLength(lengthM: number): string {
  if (lengthM >= 1000) {
    const km = lengthM / 1000;
    return `${km.toFixed(lengthM >= 10_000 ? 1 : 2)} km`;
  }
  return `${Math.round(lengthM)} m`;
}

/**
 * Top-down runway strip with touchdown marker.
 * Oriented so the landing threshold is on the left (approach direction),
 * matching the debrief "X m past THR" text.
 */
export function RunwayTouchdownDiagram({ touch }: Props) {
  const vbW = 560;
  const vbH = 160;
  const padX = 36;
  const stripW = vbW - padX * 2;
  // Keep the strip readable; do not crush height on long runways.
  const aspect = Math.max(6, Math.min(18, touch.lengthM / Math.max(1, touch.widthM)));
  const stripH = Math.max(28, Math.min(56, stripW / aspect));
  const stripY = (vbH - stripH) / 2 - 4;
  const stripX = padX;

  const landingIsReciprocal =
    touch.landingEnd === 'reciprocal' && Boolean(touch.runwayIdentReciprocal);
  const leftIdent = landingIsReciprocal
    ? touch.runwayIdentReciprocal!
    : touch.runwayIdent;
  const rightIdent = landingIsReciprocal
    ? touch.runwayIdent
    : (touch.runwayIdentReciprocal ?? '');

  // pastThresholdM is always from the catalog primary end; convert to meters
  // past the end you actually landed on so the marker matches the text line.
  const pastLandingThrM = landingIsReciprocal
    ? Math.max(0, touch.lengthM - touch.pastThresholdM)
    : Math.max(0, touch.pastThresholdM);
  const alongFrac = Math.max(
    -0.08,
    Math.min(1.08, pastLandingThrM / Math.max(1, touch.lengthM)),
  );
  // Facing the landing direction: flip lateral when the strip is mirrored.
  const lateralSigned = landingIsReciprocal ? -touch.lateralM : touch.lateralM;
  const latFrac = Math.max(
    -1.8,
    Math.min(1.8, lateralSigned / Math.max(1, touch.widthM / 2)),
  );
  const tdX = stripX + alongFrac * stripW;
  const tdY = stripY + stripH / 2 + latFrac * (stripH / 2);

  const on = touch.onPavement;
  const lengthLabel = formatRunwayLength(touch.lengthM);
  const widthLabel = `${Math.round(touch.widthM)} m wide`;

  return (
    <div
      className={`debrief-runway ${on ? 'debrief-runway-on' : 'debrief-runway-off'}`}
      aria-label={`Touchdown on runway ${leftIdent}, ${lengthLabel}`}
    >
      <svg
        className="debrief-runway-svg"
        viewBox={`0 0 ${vbW} ${vbH}`}
        role="img"
        aria-hidden
      >
        <rect
          x={stripX}
          y={stripY}
          width={stripW}
          height={stripH}
          rx={3}
          className="debrief-runway-pavement"
        />
        <line
          x1={stripX + stripW / 2}
          y1={stripY + 3}
          x2={stripX + stripW / 2}
          y2={stripY + stripH - 3}
          className="debrief-runway-center"
        />
        {/* Threshold tick at landing end (left). */}
        <line
          x1={stripX}
          y1={stripY - 4}
          x2={stripX}
          y2={stripY + stripH + 4}
          className="debrief-runway-thr"
        />
        <text
          x={stripX + 8}
          y={stripY + stripH / 2 + 5}
          className="debrief-runway-ident"
        >
          {leftIdent}
        </text>
        {rightIdent ? (
          <text
            x={stripX + stripW - 8}
            y={stripY + stripH / 2 + 5}
            textAnchor="end"
            className="debrief-runway-ident"
          >
            {rightIdent}
          </text>
        ) : null}
        <text
          x={vbW / 2}
          y={stripY + stripH + 18}
          textAnchor="middle"
          className="debrief-runway-meta"
        >
          {lengthLabel} · {widthLabel}
        </text>
        <circle
          cx={tdX}
          cy={tdY}
          r={7}
          className={
            on ? 'debrief-runway-td debrief-runway-td-on' : 'debrief-runway-td debrief-runway-td-off'
          }
        />
      </svg>
    </div>
  );
}
