import { commodityIconUrl } from './commodityIcons';

/** Inline commodity sticker (transparent PNG). */
export function CommodityIcon(props: {
  commodityId: string | null | undefined;
  className?: string;
  size?: number;
  title?: string;
}) {
  const url = commodityIconUrl(props.commodityId);
  if (!url) return null;
  const size = props.size ?? 40;
  return (
    <img
      className={props.className ?? 'commodity-icon'}
      src={url}
      alt=""
      width={size}
      height={size}
      draggable={false}
      title={props.title}
      aria-hidden="true"
    />
  );
}
