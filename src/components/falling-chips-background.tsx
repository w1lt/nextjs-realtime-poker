"use client";

import React, { useState, useEffect } from "react";
import styles from "./falling-chips.module.css"; // We'll create this CSS module next

// Simple representation of chip colors
const chipColors = [
  "#E53E3E",
  "#DD6B20",
  "#38A169",
  "#3182CE",
  "#805AD5",
  "#D53F8C",
];

const FallingChipsBackground = () => {
  const [chips, setChips] = useState<React.ReactNode[]>([]);
  const numberOfChips = 15; // Adjust number of chips

  useEffect(() => {
    // Generate chip elements only on the client after mount
    const generatedChips = Array.from({ length: numberOfChips }).map(
      (_, index) => {
        const style = {
          left: `${Math.random() * 100}%`, // Random horizontal start position
          animationDelay: `${Math.random() * 10}s`, // Random start delay
          animationDuration: `${5 + Math.random() * 5}s`, // Random duration
          backgroundColor:
            chipColors[Math.floor(Math.random() * chipColors.length)], // Random color
        };
        return (
          <div key={index} className={styles.chip} style={style}>
            IP
          </div>
        );
      }
    );
    setChips(generatedChips); // Update state with the generated chips
  }, []); // Empty dependency array ensures this runs only once on the client after mount

  // Render chips from state
  return <div className={styles.container}>{chips}</div>;
};

export default FallingChipsBackground;
