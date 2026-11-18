"use client";

import { useEffect, useState } from "react";
import styles from "@/components/learn/learn.module.css";

// Whether the catalog has already opened once in this visit to the site.
let opened = false;

/**
 * The catalog's rows arrive in order the first time it opens, and are simply there on every
 * return to it. This renders a marker before the groups once the catalog has been seen, and
 * the stylesheet turns the stagger off after it. It must sit before the groups, as their sibling.
 */
export function StaggerOnce() {
  const [seen] = useState(() => opened);
  useEffect(() => {
    opened = true;
  }, []);
  return seen ? <span className={styles.arrived} hidden /> : null;
}
