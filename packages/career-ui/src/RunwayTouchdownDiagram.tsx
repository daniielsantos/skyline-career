import type { RunwayTouchdownSnapshot } from './api';

type Props = {
  touch: RunwayTouchdownSnapshot;
};

/**
 * Top-down runway strip with touchdown marker.
 * Oriented so the landing threshold is on the left (approach direction),
 * matching the debrief "X m past THR" text.
 */
export function RunwayTouchdownDiagram({ touch }: Props) {
  const vbW = 320;
  const vbH = 96;
  const padX = 28;
  const padY = 18;
  const stripW = vbW - padX * 2;
  const aspect = Math.max(8, Math.min(28, touch.lengthM / Math.max(1, touch.widthM)));
  const stripH = Math.max(14, Math.min(36, stripW / aspect));
  const stripY = (vbH - stripH) / 2;
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
    -0.15,
    Math.min(1.15, pastLandingThrM / Math.max(1, touch.lengthM)),
  );
  // Facing the landing direction: flip lateral when the strip is mirrored.
  const lateralSigned = landingIsReciprocal ? -touch.lateralM : touch.lateralM;
  const latFrac = Math.max(
    -1.5,
    Math.min(1.5, lateralSigned / Math.max(1, touch.widthM / 2)),
  );
  const tdX = stripX + alongFrac * stripW;
  const tdY = stripY + stripH / 2 + latFrac * (stripH / 2);

  const on = touch.onPavement;

  return (
    <div
      className={`debrief-runway ${on ? 'debrief-runway-on' : 'debrief-runway-off'}`}
      aria-label="Touchdown on runway"
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
          rx={2}
          className="debrief-runway-pavement"
        />
        <line
          x1={stripX + stripW / 2}
          y1={stripY + 2}
          x2={stripX + stripW / 2}
          y2={stripY + stripH - 2}
          className="debrief-runway-center"
        />
        <text
          x={stripX + 6}
          y={stripY + stripH / 2 + 4}
          className="debrief-runway-ident"
        >
          {leftIdent}
        </text>
        {rightIdent ? (
          <text
            x={stripX + stripW - 6}
            y={stripY + stripH / 2 + 4}
            textAnchor="end"
            className="debrief-runway-ident"
          >
            {rightIdent}
          </text>
        ) : null}
        <circle
          cx={tdX}
          cy={tdY}
          r={5}
          className={
            on ? 'debrief-runway-td debrief-runway-td-on' : 'debrief-runway-td debrief-runway-td-off'
          }
        />
      </svg>
    </div>
  );
}
