"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { toast } from "sonner";
import { startNextHand } from "@/lib/poker"; // Action to start the next hand
import { GameSnapshot } from "@/lib/poker/types"; // Import necessary types
// Import Recharts components
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

// Define a color palette for player bars using hex codes
const COLORS = [
  "#1f77b4", // Blue
  "#ff7f0e", // Orange
  "#2ca02c", // Green
  "#d62728", // Red
  "#9467bd", // Purple
  "#8c564b", // Brown
  "#e377c2", // Pink
  "#7f7f7f", // Gray
  "#bcbd22", // Olive
  "#17becf", // Cyan
];

interface HandSummaryProps {
  game: GameSnapshot; // Pass the full game snapshot
}

export function HandSummary({ game }: HandSummaryProps) {
  const [isStartingNext, setIsStartingNext] = useState(false);

  // Extract winner info from the last action
  const lastAction = game.lastAction;
  const winnerId = lastAction?.type === "WIN" ? lastAction.playerId : null;
  const potWon = lastAction?.type === "WIN" ? lastAction.amount : 0;
  const winner = winnerId ? game.players.find((p) => p.id === winnerId) : null;

  // Prepare data for the chart, sorting by seat for consistent order
  const chartData = game.players
    .map((player) => ({
      name: player.name,
      chips: player.chipCount,
      seat: player.seat,
    }))
    .sort((a, b) => a.seat - b.seat);

  const handleStartNextHand = async () => {
    setIsStartingNext(true);
    try {
      const result = await startNextHand(game.id);
      if (!result.success) {
        throw new Error(result.message || "Failed to start next hand");
      }
      toast.info("Starting next hand...");
      // No need to do anything else, Supabase subscription will update the state
    } catch (error) {
      console.error("Failed to start next hand:", error);
      toast.error(
        error instanceof Error ? error.message : "Could not start next hand"
      );
      setIsStartingNext(false); // Only reset if there was an error
    }
    // Don't reset isStartingNext on success, as the component will unmount
  };

  // Log the data being passed to the chart
  console.log("HandSummary rendering chart with data:", chartData);

  return (
    <div className="flex flex-col gap-4 items-center">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Hand Over</CardTitle>
          {winner && potWon ? (
            <CardDescription>
              {winner.name} won the pot of ${potWon}!
            </CardDescription>
          ) : (
            <CardDescription>The hand has concluded.</CardDescription>
          )}
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4">
          {winner && (
            <div className="mb-2 text-center">
              <div className="w-16 h-16 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-2xl font-bold mx-auto mb-2">
                {winner.name.charAt(0).toUpperCase()}
              </div>
              <h3 className="text-lg font-semibold">{winner.name}</h3>
              <p className="text-sm text-muted-foreground">
                Current Chips: ${winner.chipCount}
              </p>
            </div>
          )}

          {/* Chip Count Bar Chart */}
          <div className="w-full h-60 mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                margin={{
                  top: 5,
                  right: 10,
                  left: -10, // Adjust for Y-axis label room
                  bottom: 5,
                }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip
                  formatter={(value: number) => [`$${value}`, "Chips"]}
                />
                {/* <Legend /> */}
                {/* Optional Legend */}
                <Bar dataKey="chips" radius={[4, 4, 0, 0]}>
                  {/* Map data points to Cells with colors */}
                  {chartData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={COLORS[index % COLORS.length]}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <Button
            onClick={handleStartNextHand}
            disabled={isStartingNext}
            size="lg"
            className="w-full"
          >
            {isStartingNext ? "Starting..." : "Start Next Hand"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
