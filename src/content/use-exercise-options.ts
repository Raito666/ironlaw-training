import { useEffect, useMemo, useState } from "react";
import type { Exercise } from "../domain/types";
import {
  loadOpenGymCatalogue,
  materializeOpenGym,
  type OpenGymCatalogue,
} from "./opengym-catalogue";

/** Browse-only directory. Opening a picker never writes thousands of exercises into a backup. */
export function useExerciseOptions(saved: Exercise[]) {
  const [catalogue, setCatalogue] = useState<OpenGymCatalogue | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    setError("");
    void loadOpenGymCatalogue()
      .then((value) => {
        if (alive) setCatalogue(value);
      })
      .catch(() => {
        if (alive)
          setError("扩展动作目录暂未载入，已有动作仍可使用。联网后可重试。");
      });
    return () => {
      alive = false;
    };
  }, [attempt]);
  const exercises = useMemo(() => {
    const ids = new Set(saved.map((exercise) => exercise.id));
    return [
      ...saved,
      ...(catalogue?.entries
        .filter((entry) => !ids.has(entry.id))
        .map(materializeOpenGym) ?? []),
    ];
  }, [saved, catalogue]);
  return {
    exercises,
    catalogue,
    loading: !catalogue && !error,
    error,
    retry: () => setAttempt((value) => value + 1),
  };
}
