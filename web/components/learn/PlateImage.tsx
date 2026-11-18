"use client";

import { useEffect, useRef, useState } from "react";
import styles from "@/components/learn/learn.module.css";

/**
 * A group's illustration on its plate. If the file can't be loaded the picture is hidden and the
 * plate's own surface stands in, with no broken-image mark; the box is the same either way.
 */
export function PlateImage({ base, eager }: { base: string; eager: boolean }) {
  const image = useRef<HTMLImageElement>(null);
  const [missing, setMissing] = useState(false);
  // An error that fired before this code loaded left no event behind, only a finished, empty image.
  useEffect(() => {
    const element = image.current;
    if (element?.complete && element.naturalWidth === 0) setMissing(true);
  }, []);
  return (
    // A fixed-size picture in two static sizes; next/image would add a loader it doesn't need.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={image}
      className={styles.plateImage}
      data-missing={missing || undefined}
      src={`${base}-480.webp`}
      srcSet={`${base}-480.webp 480w, ${base}-960.webp 960w`}
      sizes="(min-width: 720px) 264px, 100vw"
      width={480}
      height={320}
      alt=""
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      onError={() => setMissing(true)}
    />
  );
}
